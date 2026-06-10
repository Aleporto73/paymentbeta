import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  buildEntitlementPayload,
  ENTITLEMENT_EVENT_VERSION,
} from "../_shared/buildEntitlementPayload.ts";
import { buildAuditableHeaders, signWebhookRequest } from "../_shared/webhookSignature.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
};

const requireAdmin = async (req: Request, supabaseClient: ReturnType<typeof createClient>) => {
  const token = getBearerToken(req);

  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: roles, error: rolesError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (rolesError) {
    console.error('Error checking admin role:', rolesError);
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (!roles?.some(({ role }) => role === 'admin')) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const adminError = await requireAdmin(req, supabaseClient);
    if (adminError) return adminError;

    const { transactionId } = await req.json();

    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    console.log('Processing manual webhook for transaction:', transactionId);

    // Get the transaction with full details
    const { data: transaction, error: txError } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      console.error('Transaction not found:', txError);
      throw new Error('Transaction not found');
    }

    if (!transaction.product_id) {
      throw new Error('Transaction has no product associated');
    }

    // Load product (entitlement source of truth)
    const { data: product, error: productError } = await supabaseClient
      .from('products')
      .select('id, unique_code, entitlement_code, product_type')
      .eq('id', transaction.product_id)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
      throw new Error('Product not found for this transaction');
    }

    if (!product.entitlement_code || !String(product.entitlement_code).trim()) {
      throw new Error(
        'Product has no entitlement_code configured; entitlement webhook cannot be sent',
      );
    }

    // Get price details
    let price = null;
    if (transaction.price_id) {
      const { data: priceData } = await supabaseClient
        .from('product_prices')
        .select('id, unique_code, subscription_period')
        .eq('id', transaction.price_id)
        .single();
      price = priceData ?? null;
    }

    // Get active webhooks for this product
    const { data: webhooks, error: webhooksError } = await supabaseClient
      .from('product_webhooks')
      .select('*')
      .eq('product_id', transaction.product_id)
      .eq('is_active', true);

    if (webhooksError) {
      console.error('Error fetching webhooks:', webhooksError);
      throw new Error('Error fetching webhooks configuration');
    }

    if (!webhooks || webhooks.length === 0) {
      throw new Error('No active webhooks configured for this product');
    }

    const event = 'sale.confirmed';

    const results: Array<{
      webhookUrl: string;
      success: boolean;
      status?: number;
      response?: string;
      error?: string;
    }> = [];

    // Send to all active webhooks (manual resend: fresh delivery_id per send)
    for (const webhook of webhooks) {
      const deliveryId = crypto.randomUUID();
      const payload = buildEntitlementPayload({
        event,
        deliveryId,
        transaction,
        product,
        price,
      });

      try {
        // Explicit, auditable failure when no signing secret is configured.
        const secret = typeof webhook.webhook_secret === 'string' && webhook.webhook_secret.length > 0
          ? webhook.webhook_secret
          : null;

        if (!secret) {
          const errorMessage = 'missing webhook_secret: configure a secret for this webhook before delivery';
          console.error(`Webhook not sent to ${webhook.webhook_url}: ${errorMessage}`);

          await supabaseClient.from('webhook_logs').insert({
            product_id: transaction.product_id,
            webhook_url: webhook.webhook_url,
            payload,
            response_status: null,
            response_body: errorMessage,
            success: false,
            delivery_id: deliveryId,
            event,
            event_version: ENTITLEMENT_EVENT_VERSION,
          });

          results.push({
            webhookUrl: webhook.webhook_url,
            success: false,
            error: errorMessage,
          });
          continue;
        }

        console.log('Sending webhook to:', webhook.webhook_url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        // Sign the exact raw body sent in the request.
        const rawBody = JSON.stringify(payload);
        const signed = await signWebhookRequest({
          secret,
          event,
          eventVersion: ENTITLEMENT_EVENT_VERSION,
          deliveryId,
          rawBody,
        });

        const response = await fetch(webhook.webhook_url, {
          method: 'POST',
          headers: signed.headers,
          body: rawBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();

        // Log the webhook delivery (public headers only, signature truncated)
        await supabaseClient.from('webhook_logs').insert({
          product_id: transaction.product_id,
          webhook_url: webhook.webhook_url,
          payload,
          response_status: response.status,
          response_body: responseText.substring(0, 1000),
          success: response.ok,
          delivery_id: deliveryId,
          event,
          event_version: ENTITLEMENT_EVENT_VERSION,
          request_headers: buildAuditableHeaders(signed, event, ENTITLEMENT_EVENT_VERSION, deliveryId),
        });

        results.push({
          webhookUrl: webhook.webhook_url,
          success: response.ok,
          status: response.status,
          response: responseText.substring(0, 500),
        });

        console.log('Webhook sent:', webhook.webhook_url, 'Status:', response.status);
      } catch (webhookError) {
        const errorMessage = webhookError instanceof Error ? webhookError.message : 'Unknown error';
        console.error('Error sending webhook:', errorMessage);

        // Log the failed attempt
        await supabaseClient.from('webhook_logs').insert({
          product_id: transaction.product_id,
          webhook_url: webhook.webhook_url,
          payload,
          response_status: null,
          response_body: errorMessage,
          success: false,
          delivery_id: deliveryId,
          event,
          event_version: ENTITLEMENT_EVENT_VERSION,
        });

        results.push({
          webhookUrl: webhook.webhook_url,
          success: false,
          error: errorMessage,
        });
      }
    }

    const allSuccess = results.every(r => r.success);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        message: allSuccess 
          ? `Webhook enviado para ${results.length} URL(s)` 
          : 'Alguns webhooks falharam',
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing manual webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
