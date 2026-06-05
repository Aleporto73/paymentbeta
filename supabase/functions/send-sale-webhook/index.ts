import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

    // Get price details to include plan code
    let priceCode = null;
    if (transaction.price_id) {
      const { data: priceData } = await supabaseClient
        .from('product_prices')
        .select('unique_code, name')
        .eq('id', transaction.price_id)
        .single();
      
      if (priceData) {
        priceCode = priceData.unique_code;
        console.log('Price code found:', priceCode);
      }
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

    const payload = {
      event: 'sale.confirmed',
      transaction_id: transaction.id,
      asaas_payment_id: transaction.asaas_payment_id,
      product_id: transaction.product_id,
      price_id: transaction.price_id,
      price_code: priceCode,
      customer: {
        name: transaction.customer_name,
        email: transaction.customer_email,
        cpf_cnpj: transaction.customer_cpf_cnpj,
        phone: transaction.customer_phone,
        state: transaction.customer_state,
      },
      payment: {
        status: transaction.status,
        payment_method: transaction.payment_method,
        billing_type: transaction.billing_type,
        value: transaction.value,
        net_value: transaction.net_value,
        installment_count: transaction.installment_count,
        installment_value: transaction.installment_value,
        payment_date: transaction.payment_date,
        confirmed_date: transaction.confirmed_date,
        credit_date: transaction.credit_date,
        due_date: transaction.due_date,
      },
      order_bumps: {
        selected: transaction.order_bumps_selected,
        amount: transaction.order_bumps_amount,
      },
      affiliate_code: transaction.affiliate_code,
      metadata: {
        ip_address: transaction.ip_address,
        user_agent: transaction.user_agent,
        device_type: transaction.device_type,
      },
      created_at: transaction.created_at,
      updated_at: transaction.updated_at,
    };

    const results: Array<{
      webhookUrl: string;
      success: boolean;
      status?: number;
      response?: string;
      error?: string;
    }> = [];

    // Send to all active webhooks
    for (const webhook of webhooks) {
      try {
        console.log('Sending webhook to:', webhook.webhook_url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(webhook.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();

        // Log the webhook delivery
        await supabaseClient.from('webhook_logs').insert({
          product_id: transaction.product_id,
          webhook_url: webhook.webhook_url,
          payload,
          response_status: response.status,
          response_body: responseText.substring(0, 1000),
          success: response.ok,
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
