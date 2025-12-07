import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

async function queueWebhooks(supabaseAdmin: any, transaction: any) {
  try {
    if (!transaction.product_id) {
      console.log('No product_id in transaction, skipping webhook queue');
      return;
    }

    // Get active webhooks for this product
    const { data: webhooks, error: webhooksError } = await supabaseAdmin
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

    const { error: queueError } = await supabaseAdmin
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
    console.error('Error in queueWebhooks:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const webhookData = await req.json();
    console.log('Received webhook:', webhookData.event, 'for payment:', webhookData.payment?.id);

    // Handle payment events
    if (webhookData.event && webhookData.event.startsWith('PAYMENT_')) {
      const payment = webhookData.payment;
      
      if (!payment || !payment.id) {
        console.error('Invalid payment data in webhook');
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find the transaction by asaas_payment_id
      const { data: existingTransaction, error: findError } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('asaas_payment_id', payment.id)
        .single();

      if (findError && findError.code !== 'PGRST116') {
        console.error('Error finding transaction:', findError);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update or create transaction
      const transactionData: any = {
        status: payment.status,
        net_value: payment.netValue,
        payment_date: payment.paymentDate,
        confirmed_date: payment.confirmedDate,
        credit_date: payment.creditDate,
        updated_at: new Date().toISOString(),
      };

      if (existingTransaction) {
        // Update existing transaction
        const { error: updateError } = await supabaseAdmin
          .from('transactions')
          .update(transactionData)
          .eq('asaas_payment_id', payment.id);

        if (updateError) {
          console.error('Error updating transaction:', updateError);
        } else {
          console.log('Transaction updated:', payment.id, 'Status:', payment.status);
          
          // If payment is confirmed/received, process sale data
          if (payment.status === 'RECEIVED' || payment.status === 'CONFIRMED') {
            console.log('Payment confirmed/received, processing sale data and webhooks');
            
            // Fetch the complete updated transaction to ensure we have all fields
            const { data: fullTransaction, error: fetchFullError } = await supabaseAdmin
              .from('transactions')
              .select('*')
              .eq('asaas_payment_id', payment.id)
              .single();
            
            if (fetchFullError || !fullTransaction) {
              console.error('Error fetching full transaction:', fetchFullError);
            } else {
              console.log('Full transaction fetched:', fullTransaction.id, 'Product ID:', fullTransaction.product_id);
              
              // Create product_sales entry
              if (fullTransaction.product_id) {
                // Check if sale already exists to avoid duplicates
                const { data: existingSale } = await supabaseAdmin
                  .from('product_sales')
                  .select('id')
                  .eq('product_id', fullTransaction.product_id)
                  .eq('customer_email', fullTransaction.customer_email)
                  .eq('sale_amount', fullTransaction.value)
                  .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Within last minute
                  .maybeSingle();
                
                if (!existingSale) {
                  const { error: salesError } = await supabaseAdmin
                    .from('product_sales')
                    .insert({
                      product_id: fullTransaction.product_id,
                      product_price_id: fullTransaction.price_id,
                      customer_name: fullTransaction.customer_name,
                      customer_email: fullTransaction.customer_email,
                      sale_amount: fullTransaction.value,
                      sale_date: payment.confirmedDate || payment.paymentDate || new Date().toISOString(),
                      status: 'completed',
                      affiliate_link_id: null,
                      commission_amount: 0,
                    });

                  if (salesError) {
                    console.error('Error creating product sale:', salesError);
                  } else {
                    console.log('Product sale created for transaction:', payment.id);
                  }
                } else {
                  console.log('Sale already exists, skipping duplicate creation');
                }
              }

              // Create order bump analytics
              if (fullTransaction.order_bumps_selected && fullTransaction.order_bumps_selected.length > 0) {
                for (const bumpId of fullTransaction.order_bumps_selected) {
                  const { data: bumpData } = await supabaseAdmin
                    .from('product_order_bumps')
                    .select('price')
                    .eq('id', bumpId)
                    .single();

                  if (bumpData) {
                    await supabaseAdmin
                      .from('product_order_bump_analytics')
                      .insert({
                        product_id: fullTransaction.product_id,
                        order_bump_id: bumpId,
                        event_type: 'conversion',
                        revenue_generated: bumpData.price,
                      });
                  }
                }
              }
              
              // Queue webhooks with full transaction data
              console.log('Queueing webhooks for product:', fullTransaction.product_id);
              await queueWebhooks(supabaseAdmin, fullTransaction);
            }
          }
        }
      } else {
        // Create new transaction if it doesn't exist
        // This can happen if webhook arrives before the create-payment response
        console.log('Transaction not found, creating from webhook data');
        
        // We need to find the user_id from the customer
        const { data: customerData } = await supabaseAdmin
          .from('asaas_customers')
          .select('user_id')
          .eq('asaas_customer_id', payment.customer)
          .single();

        if (customerData) {
          const { error: insertError } = await supabaseAdmin
            .from('transactions')
            .insert({
              user_id: customerData.user_id,
              asaas_payment_id: payment.id,
              asaas_customer_id: payment.customer,
              customer_name: '', // Will be filled from customer data if needed
              customer_email: '', // Will be filled from customer data if needed
              payment_method: payment.billingType,
              status: payment.status,
              value: payment.value,
              net_value: payment.netValue,
              due_date: payment.dueDate,
              payment_date: payment.paymentDate,
              confirmed_date: payment.confirmedDate,
              credit_date: payment.creditDate,
              billing_type: payment.billingType,
              description: payment.description,
              external_reference: payment.externalReference,
              installment_count: payment.installmentCount || 1,
              ...transactionData,
            });

          if (insertError) {
            console.error('Error inserting transaction:', insertError);
          }
        }
      }
    }

    // Handle subscription events
    if (webhookData.event && webhookData.event.startsWith('SUBSCRIPTION_')) {
      const subscription = webhookData.subscription;
      
      if (!subscription || !subscription.id) {
        console.error('Invalid subscription data in webhook');
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find user_id from customer
      const { data: customerData } = await supabaseAdmin
        .from('asaas_customers')
        .select('user_id')
        .eq('asaas_customer_id', subscription.customer)
        .single();

      if (!customerData) {
        console.error('Customer not found for subscription:', subscription.customer);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const subscriptionData: any = {
        user_id: customerData.user_id,
        asaas_subscription_id: subscription.id,
        asaas_customer_id: subscription.customer,
        status: subscription.status,
        value: subscription.value,
        next_due_date: subscription.nextDueDate,
        cycle: subscription.cycle,
        description: subscription.description,
        billing_type: subscription.billingType,
        updated_at: new Date().toISOString(),
      };

      if (webhookData.event === 'SUBSCRIPTION_CREATED') {
        await supabaseAdmin.from('subscriptions').insert(subscriptionData);
        console.log('Subscription created:', subscription.id);
      } else {
        await supabaseAdmin
          .from('subscriptions')
          .update(subscriptionData)
          .eq('asaas_subscription_id', subscription.id);
        console.log('Subscription updated:', subscription.id);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, received: true }),
      { 
        status: 200, // Return 200 to prevent Asaas from retrying
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
