import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildEntitlementPayload,
  ENTITLEMENT_EVENT_VERSION,
} from "../_shared/buildEntitlementPayload.ts";
import { signWebhookRequest } from "../_shared/webhookSignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
};

const requireAdmin = async (req: Request, supabaseClient: ReturnType<typeof createClient>) => {
  const token = getBearerToken(req);

  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: roles, error: rolesError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    console.error("Error checking admin role:", rolesError);
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (!roles?.some(({ role }) => role === "admin")) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return null;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const adminError = await requireAdmin(req, supabaseClient);
    if (adminError) return adminError;

    const { webhook_url, product_id } = await req.json();
    const webhookUrl = typeof webhook_url === "string" ? webhook_url.trim() : "";

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "webhook_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isHttpUrl(webhookUrl)) {
      return jsonResponse({ error: "webhook_url must be http:// or https://" }, 400);
    }

    console.log(`Testing webhook: ${webhookUrl}`);

    // Resolve the signing secret for this destination. Test webhooks are
    // signed exactly like real deliveries so the receiver can be validated
    // end to end. Without a secret we fail explicitly (never send unsigned).
    let secretQuery = supabaseClient
      .from("product_webhooks")
      .select("webhook_secret, product_id")
      .eq("webhook_url", webhookUrl)
      .limit(1);

    if (product_id) {
      secretQuery = supabaseClient
        .from("product_webhooks")
        .select("webhook_secret, product_id")
        .eq("webhook_url", webhookUrl)
        .eq("product_id", product_id)
        .limit(1);
    }

    const { data: webhookConfig } = await secretQuery.maybeSingle();
    const secret = typeof webhookConfig?.webhook_secret === "string" && webhookConfig.webhook_secret.length > 0
      ? webhookConfig.webhook_secret
      : null;

    if (!secret) {
      return jsonResponse({
        success: false,
        error: "missing webhook_secret: cadastre um secret para este webhook antes de testar (webhooks de entitlement nunca são enviados sem assinatura)",
      }, 400);
    }

    // Build the test payload with the SAME shared builder used in production.
    const deliveryId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const testPayload = {
      ...buildEntitlementPayload({
        event: "sale.confirmed",
        deliveryId,
        occurredAt: nowIso,
        transaction: {
          id: crypto.randomUUID(),
          asaas_payment_id: "pay_test_" + Date.now(),
          customer_name: "Cliente Teste",
          customer_email: "cliente.teste@email.com",
          status: "CONFIRMED",
          billing_type: "CREDIT_CARD",
          value: 97.00,
          confirmed_date: nowIso,
        },
        product: {
          id: product_id || "test-product-id",
          unique_code: "TESTCODE",
          entitlement_code: "test-entitlement",
          product_type: "pagamento_unico",
        },
        price: {
          id: "test-price-id",
          unique_code: "PLAN1234",
          subscription_period: null,
        },
      }),
      test: true,
    };

    console.log(`Sending signed test payload to: ${webhookUrl}`);

    // Send test webhook
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      // Sign the exact raw body sent in the request.
      const rawBody = JSON.stringify(testPayload);
      const signed = await signWebhookRequest({
        secret,
        event: "sale.confirmed",
        eventVersion: ENTITLEMENT_EVENT_VERSION,
        deliveryId,
        rawBody,
        extraHeaders: { "X-Webhook-Test": "true" },
      });

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: signed.headers,
        body: rawBody,
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
