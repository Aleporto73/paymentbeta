import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Batch processing configuration
const BATCH_SIZE = 10; // Process 10 webhooks at a time
const PROCESSING_DELAY = 100; // 100ms delay between batches
const REQUEST_TIMEOUT = 10000; // 10 second timeout per webhook

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting webhook queue processing...");

    // Get pending webhooks in batches
    const { data: pendingWebhooks, error: fetchError } = await supabaseClient
      .from("webhook_queue")
      .select("*")
      .eq("status", "pending")
      .lt("attempts", 5) // Max 5 attempts
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("Error fetching pending webhooks:", fetchError);
      throw fetchError;
    }

    if (!pendingWebhooks || pendingWebhooks.length === 0) {
      console.log("No pending webhooks to process");
      return new Response(
        JSON.stringify({ message: "No pending webhooks", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${pendingWebhooks.length} webhooks...`);

    // Process webhooks in parallel with controlled concurrency
    const results = await Promise.allSettled(
      pendingWebhooks.map((webhook) => processWebhook(webhook, supabaseClient))
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(`Webhook processing complete: ${successful} successful, ${failed} failed`);

    // Schedule next batch processing if there are more webhooks
    if (pendingWebhooks.length === BATCH_SIZE) {
      // Trigger next batch processing in background
      setTimeout(() => {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-webhook-queue`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
        }).catch(console.error);
      }, PROCESSING_DELAY);
    }

    return new Response(
      JSON.stringify({
        message: "Webhooks processed",
        processed: pendingWebhooks.length,
        successful,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in webhook queue processor:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processWebhook(webhook: any, supabaseClient: any) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    console.log(`Sending webhook to ${webhook.webhook_url}...`);

    // Update status to processing
    await supabaseClient
      .from("webhook_queue")
      .update({
        status: "processing",
        last_attempt_at: new Date().toISOString(),
        attempts: webhook.attempts + 1,
      })
      .eq("id", webhook.id);

    // Send webhook
    const response = await fetch(webhook.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PaymentApp-Webhook/1.0",
      },
      body: JSON.stringify(webhook.payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => "");
    const success = response.ok;

    // Log webhook delivery
    await supabaseClient.from("webhook_logs").insert({
      product_id: webhook.product_id,
      webhook_url: webhook.webhook_url,
      payload: webhook.payload,
      response_status: response.status,
      response_body: responseBody.substring(0, 1000), // Limit to 1000 chars
      success,
    });

    if (success) {
      // Mark as sent
      await supabaseClient
        .from("webhook_queue")
        .update({ status: "sent" })
        .eq("id", webhook.id);

      console.log(`Webhook sent successfully to ${webhook.webhook_url}`);
    } else {
      // Mark as failed or retry
      const shouldRetry = webhook.attempts + 1 < webhook.max_attempts;
      await supabaseClient
        .from("webhook_queue")
        .update({
          status: shouldRetry ? "pending" : "failed",
          error_message: `HTTP ${response.status}: ${responseBody.substring(0, 500)}`,
        })
        .eq("id", webhook.id);

      console.error(
        `Webhook failed for ${webhook.webhook_url}: HTTP ${response.status}`
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`Error sending webhook to ${webhook.webhook_url}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const shouldRetry = webhook.attempts + 1 < webhook.max_attempts;
    await supabaseClient
      .from("webhook_queue")
      .update({
        status: shouldRetry ? "pending" : "failed",
        error_message: errorMessage,
      })
      .eq("id", webhook.id);

    // Log failed webhook
    await supabaseClient.from("webhook_logs").insert({
      product_id: webhook.product_id,
      webhook_url: webhook.webhook_url,
      payload: webhook.payload,
      response_status: null,
      response_body: errorMessage,
      success: false,
    });

    throw error;
  }
}
