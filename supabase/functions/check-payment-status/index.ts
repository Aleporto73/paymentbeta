import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  // Clean up expired entries periodically
  if (rateLimitMap.size > 1000) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (value.resetTime < now) {
        rateLimitMap.delete(key);
      }
    }
  }

  if (!userLimit || userLimit.resetTime < now) {
    // Create new window
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  userLimit.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - userLimit.count };
}

async function queueWebhooksForTransaction(supabaseClient: any, transaction: any) {
  try {
    if (!transaction.product_id) {
      console.log('No product_id in transaction, skipping webhook queue');
      return;
    }

    // Get active webhooks for this product
    const { data: webhooks, error: webhooksError } = await supabaseClient
      .from('product_webhooks')
      .select('*')
      .eq('product_id', transaction.product_id)
      .eq('is_active', true);

    if (webhooksError) {
      console.error('Error fetching product webhooks:', webhooksError);
      return;
    }

    if (!webhooks || webhooks.length === 0) {
      console.log('No active webhooks configured for product:', transaction.product_id);
      return;
    }

    // Prepare comprehensive webhook payload
    const payload = {
      event: 'sale.confirmed',
      transaction_id: transaction.id,
      asaas_payment_id: transaction.asaas_payment_id,
      product_id: transaction.product_id,
      price_id: transaction.price_id,
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

    // Queue webhook for each active URL
    const queueEntries = webhooks.map((webhook: any) => ({
      product_id: transaction.product_id,
      webhook_url: webhook.webhook_url,
      payload,
      status: 'pending',
    }));

    const { error: queueError } = await supabaseClient
      .from('webhook_queue')
      .insert(queueEntries);

    if (queueError) {
      console.error('Error queuing webhooks:', queueError);
      return;
    }

    console.log(`Queued ${webhooks.length} webhooks for product ${transaction.product_id}`);

    // Trigger webhook processor
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-webhook-queue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
    }).catch(console.error);

  } catch (error) {
    console.error('Error in queueWebhooksForTransaction:', error);
  }
}

async function getAffiliateSaleData(supabaseClient: any, fullTransaction: any) {
  const emptyAffiliateData = {
    affiliate_link_id: null,
    commission_amount: 0,
  };

  if (!fullTransaction.affiliate_code) {
    return emptyAffiliateData;
  }

  const { data: affiliateLink, error } = await supabaseClient
    .from('product_affiliate_links')
    .select('id, product_id, commission_type, commission_value, is_active')
    .eq('id', fullTransaction.affiliate_code)
    .eq('product_id', fullTransaction.product_id)
    .maybeSingle();

  if (error) {
    console.warn('Error fetching affiliate link for commission:', error);
    return emptyAffiliateData;
  }

  if (!affiliateLink || affiliateLink.is_active !== true) {
    console.warn('Affiliate link not found or inactive for transaction:', fullTransaction.id);
    return emptyAffiliateData;
  }

  const saleAmount = Number(fullTransaction.value || 0);
  const commissionValue = Number(affiliateLink.commission_value || 0);

  if (affiliateLink.commission_type === 'percentage') {
    return {
      affiliate_link_id: affiliateLink.id,
      commission_amount: (saleAmount * commissionValue) / 100,
    };
  }

  if (affiliateLink.commission_type === 'fixed') {
    return {
      affiliate_link_id: affiliateLink.id,
      commission_amount: commissionValue,
    };
  }

  console.warn('Invalid affiliate commission type for transaction:', fullTransaction.id);
  return emptyAffiliateData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { paymentId, userId } = await req.json();

    if (!paymentId || !userId) {
      throw new Error('Payment ID and User ID are required');
    }

    // Apply rate limiting
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      console.warn(`Rate limit exceeded for user ${userId}`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
        }),
        { 
          status: 429,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000))
          } 
        }
      );
    }

    // Get integration settings to fetch API key
    // Single-account architecture: fetch any active Asaas configuration
    const { data: integrationSettings, error: settingsError } = await supabaseClient
      .from('integration_settings')
      .select('*')
      .eq('integration_name', 'asaas')
      .eq('is_active', true)
      .maybeSingle();

    if (settingsError || !integrationSettings) {
      throw new Error('Asaas integration not configured');
    }

    const apiKey = integrationSettings.is_sandbox 
      ? integrationSettings.sandbox_api_key 
      : integrationSettings.production_api_key;

    if (!apiKey) {
      throw new Error('Asaas API key not found');
    }

    const asaasBaseUrl = integrationSettings.is_sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://www.asaas.com/api/v3';

    // Get current transaction status to check if webhooks should be triggered
    const { data: existingTransaction } = await supabaseClient
      .from('transactions')
      .select('status')
      .eq('asaas_payment_id', paymentId)
      .single();

    const previousStatus = existingTransaction?.status;

    // Check payment status in Asaas
    const paymentResponse = await fetch(`${asaasBaseUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
    });

    if (!paymentResponse.ok) {
      throw new Error('Failed to fetch payment status');
    }

    const paymentData = await paymentResponse.json();

    // Update local transaction if needed
    if (paymentData.status === 'CONFIRMED' || paymentData.status === 'RECEIVED') {
      await supabaseClient
        .from('transactions')
        .update({
          status: paymentData.status,
          payment_date: paymentData.paymentDate,
          confirmed_date: paymentData.confirmedDate,
          updated_at: new Date().toISOString(),
        })
        .eq('asaas_payment_id', paymentId);

      // If status changed to confirmed/received, trigger webhooks
      if (previousStatus !== 'CONFIRMED' && previousStatus !== 'RECEIVED') {
        console.log('Status changed to confirmed/received via polling, processing webhooks');
        
        // Fetch the complete updated transaction
        const { data: fullTransaction, error: fetchError } = await supabaseClient
          .from('transactions')
          .select('*')
          .eq('asaas_payment_id', paymentId)
          .single();

        if (!fetchError && fullTransaction) {
          // Create product_sales entry if not exists
          if (fullTransaction.product_id) {
            const { data: existingSale } = await supabaseClient
              .from('product_sales')
              .select('id, affiliate_link_id')
              .eq('product_id', fullTransaction.product_id)
              .eq('customer_email', fullTransaction.customer_email)
              .eq('sale_amount', fullTransaction.value)
              .gte('created_at', new Date(Date.now() - 60000).toISOString())
              .maybeSingle();

            const affiliateSaleData = await getAffiliateSaleData(supabaseClient, fullTransaction);

            if (!existingSale) {
              await supabaseClient.from('product_sales').insert({
                product_id: fullTransaction.product_id,
                product_price_id: fullTransaction.price_id,
                customer_name: fullTransaction.customer_name,
                customer_email: fullTransaction.customer_email,
                sale_amount: fullTransaction.value,
                sale_date: paymentData.confirmedDate || paymentData.paymentDate || new Date().toISOString(),
                status: 'completed',
                affiliate_link_id: affiliateSaleData.affiliate_link_id,
                commission_amount: affiliateSaleData.commission_amount,
              });
              console.log('Product sale created via polling');
            } else if (!existingSale.affiliate_link_id && fullTransaction.affiliate_code && affiliateSaleData.affiliate_link_id) {
              const { error: updateSaleError } = await supabaseClient
                .from('product_sales')
                .update({
                  affiliate_link_id: affiliateSaleData.affiliate_link_id,
                  commission_amount: affiliateSaleData.commission_amount,
                })
                .eq('id', existingSale.id);

              if (updateSaleError) {
                console.error('Error updating existing product sale affiliate commission via polling:', updateSaleError);
              } else {
                console.log('Existing product sale affiliate commission updated via polling:', existingSale.id);
              }
            }
          }

          // Queue webhooks
          await queueWebhooksForTransaction(supabaseClient, fullTransaction);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: paymentData.status,
        payment: paymentData,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
          'X-RateLimit-Remaining': String(rateLimit.remaining)
        } 
      }
    );

  } catch (error) {
    console.error('Error checking payment status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
