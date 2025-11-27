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

    console.log("[process-upsell-payment] Request:", { upsellCode, transactionToken });

    if (!upsellCode || !transactionToken) {
      throw new Error("Missing upsellCode or transactionToken");
    }

    // Validate and mark token as used
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from("transaction_tokens")
      .select("*")
      .eq("token", transactionToken)
      .gt("expires_at", new Date().toISOString())
      .eq("used", false)
      .single();

    if (tokenError || !tokenData) {
      console.error("[process-upsell-payment] Invalid token:", tokenError);
      throw new Error("Token inválido ou expirado");
    }

    // Get upsell data
    const { data: upsellData, error: upsellError } = await supabaseClient
      .from("product_upsells")
      .select("*")
      .eq("unique_code", upsellCode)
      .eq("is_active", true)
      .single();

    if (upsellError || !upsellData) {
      console.error("[process-upsell-payment] Upsell not found:", upsellError);
      throw new Error("Upsell não encontrado");
    }

    // Get original transaction
    const { data: originalTransaction, error: originalTransactionError } = await supabaseClient
      .from("transactions")
      .select("*")
      .eq("id", tokenData.transaction_id)
      .single();

    if (originalTransactionError || !originalTransaction) {
      console.error("[process-upsell-payment] Original transaction not found:", originalTransactionError);
      throw new Error("Transação original não encontrada");
    }

    // Verify payment was made with credit card for one-click payment
    if (originalTransaction.billing_type !== "CREDIT_CARD") {
      console.error("[process-upsell-payment] Original payment was not with credit card");
      throw new Error("Pagamento one-click disponível apenas para compras com cartão de crédito");
    }

    // Verify we have a credit card token
    if (!originalTransaction.credit_card_token) {
      console.error("[process-upsell-payment] Credit card token not found");
      throw new Error("Token de cartão não encontrado. Não é possível processar pagamento one-click");
    }

    // Get user integration settings
    const { data: integrationSettings, error: integrationError } = await supabaseClient
      .from("integration_settings")
      .select("*")
      .eq("user_id", originalTransaction.user_id)
      .eq("integration_name", "asaas")
      .eq("is_active", true)
      .single();

    if (integrationError || !integrationSettings) {
      console.error("[process-upsell-payment] Integration not found:", integrationError);
      throw new Error("Integração Asaas não configurada");
    }

    const asaasApiKey = integrationSettings.is_sandbox
      ? integrationSettings.sandbox_api_key
      : integrationSettings.production_api_key;
    const asaasUrl = integrationSettings.is_sandbox
      ? "https://sandbox.asaas.com/api/v3"
      : "https://api.asaas.com/v3";

    console.log("[process-upsell-payment] Creating one-click payment with Asaas using saved card token");

    // Create payment in Asaas using saved customer and credit card token
    const paymentData = {
      customer: tokenData.asaas_customer_id,
      billingType: "CREDIT_CARD",
      value: upsellData.price,
      dueDate: new Date().toISOString().split("T")[0],
      description: `Upsell: ${upsellData.title}`,
      externalReference: `upsell-${upsellData.id}`,
      creditCardToken: originalTransaction.credit_card_token,
    };

    const asaasResponse = await fetch(`${asaasUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": asaasApiKey,
      },
      body: JSON.stringify(paymentData),
    });

    if (!asaasResponse.ok) {
      const errorData = await asaasResponse.json();
      console.error("[process-upsell-payment] Asaas error:", errorData);
      throw new Error("Erro ao processar pagamento no Asaas");
    }

    const asaasPayment = await asaasResponse.json();
    console.log("[process-upsell-payment] Asaas payment created:", asaasPayment);

    // Save transaction
    const { data: newTransaction, error: transactionError } = await supabaseClient
      .from("transactions")
      .insert({
        user_id: originalTransaction.user_id,
        product_id: upsellData.upsell_product_id,
        asaas_payment_id: asaasPayment.id,
        asaas_customer_id: tokenData.asaas_customer_id,
        customer_name: tokenData.customer_name,
        customer_email: tokenData.customer_email,
        customer_cpf_cnpj: originalTransaction.customer_cpf_cnpj,
        customer_phone: originalTransaction.customer_phone,
        billing_type: originalTransaction.billing_type,
        payment_method: originalTransaction.payment_method,
        value: upsellData.price,
        status: asaasPayment.status,
        description: paymentData.description,
        external_reference: paymentData.externalReference,
      })
      .select()
      .single();

    if (transactionError) {
      console.error("[process-upsell-payment] Transaction save error:", transactionError);
      throw new Error("Erro ao salvar transação");
    }

    // Mark token as used
    await supabaseClient
      .from("transaction_tokens")
      .update({ used: true })
      .eq("token", transactionToken);

    // Save upsell transaction record
    await supabaseClient
      .from("upsell_transactions")
      .insert({
        original_transaction_id: tokenData.transaction_id,
        upsell_id: upsellData.id,
        transaction_id: newTransaction.id,
        token_used: transactionToken,
      });

    console.log("[process-upsell-payment] Upsell payment completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        payment: asaasPayment,
        transaction: newTransaction,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[process-upsell-payment] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
