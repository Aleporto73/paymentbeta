import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ENTITLEMENT_EVENT_VERSION } from "../_shared/buildEntitlementPayload.ts";
import { buildAuditableHeaders, signWebhookRequest } from "../_shared/webhookSignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Batch processing configuration
const BATCH_SIZE = 10; // Process 10 webhooks at a time
const PROCESSING_DELAY = 100; // 100ms delay between batches
const REQUEST_TIMEOUT = 10000; // 10 second timeout per webhook

const unauthorizedResponse = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const forbiddenResponse = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
};

const isServiceRoleToken = (token: string) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  return serviceRoleKey.length > 0 && token === serviceRoleKey;
};

const authorizeRequest = async (req: Request, supabaseClient: ReturnType<typeof createClient>) => {
  const token = getBearerToken(req);

  if (!token) {
    return unauthorizedResponse();
  }

  if (isServiceRoleToken(token)) {
    return null;
  }

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return unauthorizedResponse();
  }

  const { data: roles, error: rolesError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    console.error("Error checking admin role:", rolesError);
    return forbiddenResponse();
  }

  if (!roles?.some(({ role }) => role === "admin")) {
    return forbiddenResponse();
  }

  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authorizationError = await authorizeRequest(req, supabaseClient);
    if (authorizationError) return authorizationError;

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

// Resolve the signing secret for a queue row. Prefers the explicit
// product_webhook_id link; falls back to (product_id, webhook_url) for
// legacy rows queued before the link existed. Never logs the secret.
async function resolveWebhookSecret(webhook: any, supabaseClient: any): Promise<string | null> {
  if (webhook.product_webhook_id) {
    const { data } = await supabaseClient
      .from("product_webhooks")
      .select("webhook_secret")
      .eq("id", webhook.product_webhook_id)
      .maybeSingle();
    const secret = data?.webhook_secret;
    if (typeof secret === "string" && secret.length > 0) return secret;
  }

  const { data: fallback } = await supabaseClient
    .from("product_webhooks")
    .select("webhook_secret")
    .eq("product_id", webhook.product_id)
    .eq("webhook_url", webhook.webhook_url)
    .limit(1)
    .maybeSingle();

  const secret = fallback?.webhook_secret;
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}

async function processWebhook(webhook: any, supabaseClient: any) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const event = webhook.event ?? "sale.confirmed";
  const eventVersion = webhook.event_version ?? ENTITLEMENT_EVENT_VERSION;
  const deliveryId = webhook.delivery_id;

  try {
    console.log(`Sending webhook to ${webhook.webhook_url}...`);

    // Explicit, auditable failure when no signing secret is configured.
    // Unsigned entitlement webhooks must never be sent.
    const secret = await resolveWebhookSecret(webhook, supabaseClient);
    if (!secret) {
      clearTimeout(timeoutId);
      const errorMessage = "missing webhook_secret: configure a secret for this webhook before delivery";
      console.error(`Webhook ${webhook.id} not sent: ${errorMessage}`);

      await supabaseClient
        .from("webhook_queue")
        .update({
          status: "failed",
          last_attempt_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq("id", webhook.id);

      await supabaseClient.from("webhook_logs").insert({
        product_id: webhook.product_id,
        webhook_url: webhook.webhook_url,
        payload: webhook.payload,
        response_status: null,
        response_body: errorMessage,
        success: false,
        delivery_id: deliveryId,
        event,
        event_version: eventVersion,
      });
      return;
    }

    // Update status to processing
    await supabaseClient
      .from("webhook_queue")
      .update({
        status: "processing",
        last_attempt_at: new Date().toISOString(),
        attempts: webhook.attempts + 1,
      })
      .eq("id", webhook.id);

    // Sign at SEND time (fresh timestamp per attempt, current secret).
    // rawBody is serialized exactly once and the same string is signed
    // and sent as the request body.
    const rawBody = JSON.stringify(webhook.payload);
    const signed = await signWebhookRequest({
      secret,
      event,
      eventVersion,
      deliveryId,
      rawBody,
    });

    // Send webhook
    const response = await fetch(webhook.webhook_url, {
      method: "POST",
      headers: signed.headers,
      body: rawBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => "");
    const success = response.ok;

    // Log webhook delivery (public headers only, signature truncated)
    await supabaseClient.from("webhook_logs").insert({
      product_id: webhook.product_id,
      webhook_url: webhook.webhook_url,
      payload: webhook.payload,
      response_status: response.status,
      response_body: responseBody.substring(0, 1000), // Limit to 1000 chars
      success,
      delivery_id: deliveryId,
      event,
      event_version: eventVersion,
      request_headers: buildAuditableHeaders(signed, event, eventVersion, deliveryId),
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
      delivery_id: deliveryId,
      event,
      event_version: eventVersion,
    });

    throw error;
  }
}
