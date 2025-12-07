const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { webhook_url, product_id } = await req.json();

    if (!webhook_url) {
      return new Response(
        JSON.stringify({ error: "webhook_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Testing webhook: ${webhook_url}`);

    // Create test payload with sample data
    const testPayload = {
      event: "sale.confirmed",
      test: true,
      timestamp: new Date().toISOString(),
      transaction_id: "test-transaction-" + Date.now(),
      asaas_payment_id: "pay_test_" + Date.now(),
      product_id: product_id || "test-product-id",
      price_id: "test-price-id",
      price_code: "PLAN1234",
      customer: {
        name: "Cliente Teste",
        email: "cliente.teste@email.com",
        cpf_cnpj: "123.456.789-00",
        phone: "(11) 99999-9999",
        state: "SP",
      },
      payment: {
        status: "CONFIRMED",
        payment_method: "credit_card",
        billing_type: "CREDIT_CARD",
        value: 97.00,
        net_value: 93.12,
        installment_count: 1,
        installment_value: 97.00,
        payment_date: new Date().toISOString(),
        confirmed_date: new Date().toISOString(),
        credit_date: new Date().toISOString().split('T')[0],
        due_date: new Date().toISOString().split('T')[0],
      },
      order_bumps: {
        selected: ["test-order-bump-id"],
        amount: 27.00,
      },
      affiliate_code: "AFILIADO123",
      metadata: {
        ip_address: "192.168.1.1",
        user_agent: "Mozilla/5.0 (Test)",
        device_type: "desktop",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log(`Sending test payload to: ${webhook_url}`);

    // Send test webhook
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PaymentApp-Webhook-Test/1.0",
          "X-Webhook-Test": "true",
        },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text().catch(() => "");

      console.log(`Webhook test response: ${response.status} - ${responseText.substring(0, 200)}`);

      return new Response(
        JSON.stringify({
          success: response.ok,
          status_code: response.status,
          response_body: responseText.substring(0, 500),
          payload_sent: testPayload,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      
      const errorMessage = fetchError instanceof Error && fetchError.name === "AbortError" 
        ? "Timeout: a requisição excedeu 10 segundos"
        : fetchError instanceof Error ? fetchError.message : "Erro desconhecido";

      console.error(`Webhook test failed: ${errorMessage}`);

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          payload_sent: testPayload,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error in test-webhook:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
