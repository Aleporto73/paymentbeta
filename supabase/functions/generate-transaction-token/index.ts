import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Credentials": "true",
});

serve(async (req) => {
  const origin = req.headers.get("Origin") || req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { transactionId } = await req.json();

    console.log("[generate-transaction-token] Request:", { transactionId });

    if (!transactionId) {
      throw new Error("Missing transactionId");
    }

    // Get transaction details
    const { data: transaction, error: transactionError } = await supabaseClient
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (transactionError || !transaction) {
      console.error("[generate-transaction-token] Transaction not found:", transactionError);
      throw new Error("Transação não encontrada");
    }

    // Generate unique token
    const token = crypto.randomUUID();
    
    // Token expires in 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Save token
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from("transaction_tokens")
      .insert({
        token,
        transaction_id: transactionId,
        customer_email: transaction.customer_email,
        customer_name: transaction.customer_name,
        asaas_customer_id: transaction.asaas_customer_id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (tokenError) {
      console.error("[generate-transaction-token] Token save error:", tokenError);
      throw new Error("Erro ao gerar token");
    }

    console.log("[generate-transaction-token] Token generated successfully");

    return new Response(
      JSON.stringify({
        token: tokenData.token,
        expires_at: tokenData.expires_at,
      }),
      {
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[generate-transaction-token] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      status: 400,
    });
  }
});
