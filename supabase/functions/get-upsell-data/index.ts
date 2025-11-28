import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { upsellCode, transactionToken } = await req.json();

    console.log("[get-upsell-data] ========== REQUEST START ==========");
    console.log("[get-upsell-data] Request:", { 
      upsellCode, 
      transactionToken: transactionToken ? `${transactionToken.substring(0, 10)}...` : null 
    });

    if (!upsellCode) {
      console.error("[get-upsell-data] Missing upsellCode");
      throw new Error("Missing upsellCode");
    }

    if (!transactionToken) {
      console.error("[get-upsell-data] Missing transactionToken");
      throw new Error("Missing transactionToken");
    }

    // Validate transaction token
    console.log("[get-upsell-data] Validating transaction token...");
    const currentTime = new Date().toISOString();
    console.log("[get-upsell-data] Current time:", currentTime);

    const { data: tokenData, error: tokenError } = await supabaseClient
      .from("transaction_tokens")
      .select("*")
      .eq("token", transactionToken)
      .gt("expires_at", currentTime)
      .eq("used", false)
      .single();

    if (tokenError) {
      console.error("[get-upsell-data] Token query error:", tokenError);
      console.error("[get-upsell-data] Error details:", {
        code: tokenError.code,
        message: tokenError.message,
        details: tokenError.details,
        hint: tokenError.hint
      });
    }

    if (!tokenData) {
      console.error("[get-upsell-data] Token not found in database");
      console.log("[get-upsell-data] Searching for any token with this value...");
      
      const { data: anyToken, error: anyTokenError } = await supabaseClient
        .from("transaction_tokens")
        .select("*, expires_at, used")
        .eq("token", transactionToken)
        .single();
      
      if (anyToken) {
        console.log("[get-upsell-data] Token found but invalid:");
        console.log("[get-upsell-data] - Expires at:", anyToken.expires_at);
        console.log("[get-upsell-data] - Already used:", anyToken.used);
        console.log("[get-upsell-data] - Is expired:", new Date(anyToken.expires_at) < new Date());
      } else {
        console.error("[get-upsell-data] Token not found at all in database");
      }
    }

    if (tokenError || !tokenData) {
      console.error("[get-upsell-data] Token validation failed");
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[get-upsell-data] Token validated:", tokenData);

    // Get original transaction to check payment method
    const { data: originalTransaction, error: transactionError } = await supabaseClient
      .from("transactions")
      .select("billing_type, credit_card_token")
      .eq("id", tokenData.transaction_id)
      .single();

    if (transactionError || !originalTransaction) {
      console.error("[get-upsell-data] Transaction not found:", transactionError);
      throw new Error("Transação original não encontrada");
    }

    // Check if one-click payment is available (credit card + token)
    const oneClickAvailable = 
      originalTransaction.billing_type === "CREDIT_CARD" && 
      !!originalTransaction.credit_card_token;

    console.log("[get-upsell-data] One-click available:", oneClickAvailable);

    // Get upsell data
    const { data: upsellData, error: upsellError } = await supabaseClient
      .from("product_upsells")
      .select(`
        *,
        product:products!product_upsells_upsell_product_id_fkey(
          id,
          name,
          description,
          image_url
        )
      `)
      .eq("unique_code", upsellCode)
      .eq("is_active", true)
      .single();

    if (upsellError || !upsellData) {
      console.error("[get-upsell-data] Upsell not found:", upsellError);
      throw new Error("Upsell não encontrado ou inativo");
    }

    console.log("[get-upsell-data] Upsell found:", upsellData);

    // Return upsell data with customer info and one-click availability
    return new Response(
      JSON.stringify({
        upsell: upsellData,
        customer: {
          email: tokenData.customer_email,
          name: tokenData.customer_name,
        },
        oneClickAvailable,
        paymentMethod: originalTransaction.billing_type,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[get-upsell-data] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
