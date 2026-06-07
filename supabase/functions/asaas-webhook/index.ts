import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const validateWebhookToken = (req: Request) => {
  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');

  if (!expectedToken) {
    return jsonResponse({ error: 'Webhook not configured' }, 500);
  }

  const receivedToken = req.headers.get('asaas-access-token');

  if (!receivedToken || receivedToken !== expectedToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  return null;
};

const CONFIRMED_PAYMENT_STATUSES = new Set(['RECEIVED', 'CONFIRMED']);

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getValidNumber = (value: unknown) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const isConfirmedPaymentStatus = (status: unknown) =>
  typeof status === 'string' && CONFIRMED_PAYMENT_STATUSES.has(status);

const getAsaasFeeAmount = (payment: any) => {
  const paymentValue = getValidNumber(payment?.value);
  const netValue = getValidNumber(payment?.netValue);

  if (paymentValue === null || netValue === null) {
    return null;
  }

  const feeAmount = roundMoney(paymentValue - netValue);

  return feeAmount >= 0 ? feeAmount : null;
};

const getWebhookSplits = (webhookData: any, payment: any) => {
  const splitCandidates = [
    payment?.splits,
    payment?.split,
    webhookData?.splits,
    webhookData?.split,
  ];

  for (const candidate of splitCandidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === 'object') {
      return [candidate];
    }
  }

  return [];
};

const getSplitWalletId = (split: Record<string, unknown>) => {
  const walletId = split.walletId ?? split.wallet_id ?? split.wallet;

  return typeof walletId === 'string' && walletId.trim() ? walletId.trim() : null;
};

const getSplitReceivedAmount = (split: Record<string, unknown>) => {
  const amount = getValidNumber(
    split.receivedAmount
      ?? split.received_amount
      ?? split.receivedValue
      ?? split.received_value
      ?? split.netValue
      ?? split.net_value,
  );

  return amount !== null && amount >= 0 ? roundMoney(amount) : null;
};

const combineReconciliationNotes = (...notes: Array<string | null | undefined>) => {
  const validNotes = notes.filter((note): note is string => typeof note === 'string' && note.trim().length > 0);

  return validNotes.length > 0 ? validNotes.join(' | ') : null;
};

async function updateTransactionReconciliation(
  supabaseAdmin: any,
  transactionId: string,
  reconciliationStatus: string,
  reconciliationNotes: string | null,
) {
  const updatePayload: Record<string, unknown> = {
    reconciliation_status: reconciliationStatus,
  };

  if (reconciliationNotes) {
    updatePayload.reconciliation_notes = reconciliationNotes;
  }

  const { error } = await supabaseAdmin
    .from('transactions')
    .update(updatePayload)
    .eq('id', transactionId);

  if (error) {
    console.error('Error updating transaction reconciliation fields:', error);
  }
}

async function getPlannedSplitContext(supabaseAdmin: any, transaction: any, payment: any) {
  const affiliateSplitTotal = getValidNumber(transaction?.affiliate_split_total);

  if (affiliateSplitTotal !== null && affiliateSplitTotal > 0) {
    return {
      hasPlannedSplit: true,
      verificationFailed: false,
      notes: null,
    };
  }

  if (typeof transaction?.affiliate_code === 'string' && transaction.affiliate_code.trim()) {
    return {
      hasPlannedSplit: true,
      verificationFailed: false,
      notes: null,
    };
  }

  const { data: existingSplits, error } = await supabaseAdmin
    .from('transaction_splits')
    .select('id')
    .or(`transaction_id.eq.${transaction.id},asaas_payment_id.eq.${payment.id}`)
    .limit(1);

  if (error) {
    console.error('Error checking planned transaction splits:', error);
    return {
      hasPlannedSplit: false,
      verificationFailed: true,
      notes: 'Failed to verify planned transaction splits during asaas-webhook',
    };
  }

  return {
    hasPlannedSplit: Boolean(existingSplits && existingSplits.length > 0),
    verificationFailed: false,
    notes: null,
  };
}

async function updateTransactionSplitsFromWebhook(
  supabaseAdmin: any,
  transaction: any,
  payment: any,
  webhookData: any,
) {
  try {
    const webhookSplits = getWebhookSplits(webhookData, payment);

    if (webhookSplits.length === 0) {
      return {
        status: 'partial',
        notes: 'Asaas webhook did not include detailed split data; planned split remains sent',
      };
    }

    const { data: existingSplits, error: splitFetchError } = await supabaseAdmin
      .from('transaction_splits')
      .select('id, wallet_id')
      .or(`transaction_id.eq.${transaction.id},asaas_payment_id.eq.${payment.id}`);

    if (splitFetchError) {
      console.error('Error fetching transaction splits for reconciliation:', splitFetchError);
      return {
        status: 'divergent',
        notes: 'Failed to fetch planned transaction splits during asaas-webhook',
      };
    }

    if (!existingSplits || existingSplits.length === 0) {
      console.error('Asaas webhook included split data, but no planned transaction_splits rows were found');
      return {
        status: 'divergent',
        notes: 'Asaas webhook included split data, but no planned transaction_splits rows were found',
      };
    }

    let updatedCount = 0;
    let receivedCount = 0;
    let missingCount = 0;
    let updateErrorCount = 0;

    for (const [index, split] of webhookSplits.entries()) {
      const splitRecord = split as Record<string, unknown>;
      const walletId = getSplitWalletId(splitRecord);
      const receivedAmount = getSplitReceivedAmount(splitRecord);
      const splitRow = walletId
        ? existingSplits.find((row: any) => row.wallet_id === walletId)
        : existingSplits.length === webhookSplits.length
          ? existingSplits[index]
          : existingSplits.length === 1 && webhookSplits.length === 1
            ? existingSplits[0]
            : null;

      if (!splitRow) {
        missingCount += 1;
        continue;
      }

      const splitUpdatePayload: Record<string, unknown> = {
        status: receivedAmount !== null ? 'received' : 'partial',
        raw_payload: {
          asaas_split: splitRecord,
          source: 'asaas-webhook',
          event: webhookData.event,
          payment_id: payment.id,
        },
      };

      if (receivedAmount !== null) {
        splitUpdatePayload.received_amount = receivedAmount;
      }

      const { error: splitUpdateError } = await supabaseAdmin
        .from('transaction_splits')
        .update(splitUpdatePayload)
        .eq('id', splitRow.id);

      if (splitUpdateError) {
        updateErrorCount += 1;
        console.error('Error updating transaction split from Asaas webhook:', splitUpdateError);
        continue;
      }

      updatedCount += 1;

      if (receivedAmount !== null) {
        receivedCount += 1;
      }
    }

    if (updateErrorCount > 0 || missingCount > 0) {
      return {
        status: 'divergent',
        notes: 'Failed to match or update all webhook split details during asaas-webhook',
      };
    }

    if (updatedCount === webhookSplits.length && receivedCount === webhookSplits.length) {
      return {
        status: 'reconciled',
        notes: null,
      };
    }

    return {
      status: 'partial',
      notes: 'Asaas webhook included split details without received split amounts',
    };
  } catch (error) {
    console.error('Unexpected error reconciling transaction splits from webhook:', error);
    return {
      status: 'divergent',
      notes: 'Unexpected error reconciling transaction splits during asaas-webhook',
    };
  }
}

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

async function getAffiliateSaleData(supabaseAdmin: any, fullTransaction: any) {
  const emptyAffiliateData = {
    affiliate_link_id: null,
    commission_amount: 0,
  };

  if (!fullTransaction.affiliate_code) {
    return emptyAffiliateData;
  }

  const { data: affiliateLink, error } = await supabaseAdmin
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

  const tokenError = validateWebhookToken(req);
  if (tokenError) return tokenError;

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
        payment_date: payment.paymentDate,
        confirmed_date: payment.confirmedDate,
        credit_date: payment.creditDate,
        asaas_raw_payload: webhookData,
        reconciliation_status: isConfirmedPaymentStatus(payment.status) ? 'partial' : 'pending',
        updated_at: new Date().toISOString(),
      };
      const paymentNetValue = getValidNumber(payment.netValue);
      const asaasFeeAmount = getAsaasFeeAmount(payment);
      const asaasFeeNote = asaasFeeAmount !== null
        ? 'Asaas fee estimated from webhook payment.value - payment.netValue'
        : null;

      if (paymentNetValue !== null) {
        transactionData.net_value = paymentNetValue;
      }

      if (asaasFeeAmount !== null) {
        transactionData.asaas_fee_amount = asaasFeeAmount;
        transactionData.reconciliation_notes = asaasFeeNote;
      }

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
                const { data: existingSaleByTransaction } = await supabaseAdmin
                  .from('product_sales')
                  .select('id, affiliate_link_id, transaction_id, asaas_payment_id')
                  .or(`transaction_id.eq.${fullTransaction.id},asaas_payment_id.eq.${fullTransaction.asaas_payment_id}`)
                  .maybeSingle();

                const { data: existingRecentSale } = await supabaseAdmin
                  .from('product_sales')
                  .select('id, affiliate_link_id, transaction_id, asaas_payment_id')
                  .eq('product_id', fullTransaction.product_id)
                  .eq('customer_email', fullTransaction.customer_email)
                  .eq('sale_amount', fullTransaction.value)
                  .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Within last minute
                  .maybeSingle();
                const existingSale = existingSaleByTransaction ?? existingRecentSale;

                const affiliateSaleData = await getAffiliateSaleData(supabaseAdmin, fullTransaction);
                
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
                      affiliate_link_id: affiliateSaleData.affiliate_link_id,
                      commission_amount: affiliateSaleData.commission_amount,
                      transaction_id: fullTransaction.id,
                      asaas_payment_id: fullTransaction.asaas_payment_id,
                    });

                  if (salesError) {
                    console.error('Error creating product sale:', salesError);
                  } else {
                    console.log('Product sale created for transaction:', payment.id);
                  }
                } else {
                  console.log('Sale already exists, skipping duplicate creation');
                  const saleUpdateData: Record<string, unknown> = {};

                  if (!existingSale.transaction_id) {
                    saleUpdateData.transaction_id = fullTransaction.id;
                  }

                  if (!existingSale.asaas_payment_id) {
                    saleUpdateData.asaas_payment_id = fullTransaction.asaas_payment_id;
                  }

                  if (!existingSale.affiliate_link_id && fullTransaction.affiliate_code && affiliateSaleData.affiliate_link_id) {
                    saleUpdateData.affiliate_link_id = affiliateSaleData.affiliate_link_id;
                    saleUpdateData.commission_amount = affiliateSaleData.commission_amount;
                  }

                  if (Object.keys(saleUpdateData).length > 0) {
                    const { error: updateSaleError } = await supabaseAdmin
                      .from('product_sales')
                      .update(saleUpdateData)
                      .eq('id', existingSale.id);

                    if (updateSaleError) {
                      console.error('Error updating existing product sale reconciliation fields:', updateSaleError);
                    } else {
                      console.log('Existing product sale reconciliation fields updated:', existingSale.id);
                    }
                  }
                }
              }

              const plannedSplitContext = await getPlannedSplitContext(supabaseAdmin, fullTransaction, payment);

              if (plannedSplitContext.verificationFailed) {
                await updateTransactionReconciliation(
                  supabaseAdmin,
                  fullTransaction.id,
                  'divergent',
                  combineReconciliationNotes(asaasFeeNote, plannedSplitContext.notes),
                );
              } else if (!plannedSplitContext.hasPlannedSplit) {
                await updateTransactionReconciliation(
                  supabaseAdmin,
                  fullTransaction.id,
                  'not_applicable',
                  asaasFeeNote,
                );
              } else {
                const reconciliationResult = await updateTransactionSplitsFromWebhook(
                  supabaseAdmin,
                  fullTransaction,
                  payment,
                  webhookData,
                );
                await updateTransactionReconciliation(
                  supabaseAdmin,
                  fullTransaction.id,
                  reconciliationResult.status,
                  combineReconciliationNotes(asaasFeeNote, reconciliationResult.notes),
                );
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
        console.warn('Ignoring Asaas payment webhook for unknown transaction:', payment.id);
        return jsonResponse({ received: true, ignored: true });
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
