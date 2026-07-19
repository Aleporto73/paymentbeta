import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  isPollTokenFormatValid,
  verifyPollCapability,
} from "../_shared/pollCapability.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// One shape for every authorization DENIAL. The body never says which check
// failed, so this endpoint cannot be used to probe which payment ids exist.
// Reserved for answers the database actually gave us: no such payment, no
// capability, wrong token, expired token.
const forbiddenResponse = () =>
  new Response(
    JSON.stringify({ error: 'Forbidden' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

// A technical failure is NOT a denial. Answering 403 when the database errored
// would tell an honest caller "you are not allowed" for what is really our
// outage, and would make the client stop retrying something that might succeed
// a second later. The body stays opaque; the detail goes to the log, sanitized.
const internalErrorResponse = () =>
  new Response(
    JSON.stringify({ error: 'Internal server error', retryable: true }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

// Logs carry a short technical message and nothing else: never the polling
// token, never the stored hash, never customer data.
const sanitizeErrorForLog = (value: unknown) => {
  let message = 'Unknown error';

  if (value instanceof Error) {
    message = value.message;
  } else if (typeof value === 'string') {
    message = value;
  } else if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; code?: unknown };
    if (typeof candidate.message === 'string') {
      message = candidate.message;
    } else if (typeof candidate.code === 'string') {
      message = `code ${candidate.code}`;
    }
  }

  return message.slice(0, 200);
};

// Rate limiting configuration.
// The key is the authorized transaction id, never a value taken from the request
// body -- otherwise the caller just rotates the key to reset their own budget.
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per transaction
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(rateLimitKey: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userLimit = rateLimitMap.get(rateLimitKey);

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
    rateLimitMap.set(rateLimitKey, {
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

// NOTE: this function used to build and queue its own `sale.confirmed` payload.
// It was removed deliberately. asaas-webhook is the SINGLE authority that emits
// entitlement, through _shared/buildEntitlementPayload.ts. The payload built
// here diverged from that contract in every way that matters:
//   * no `entitlement` object at all -- receivers decide access by
//     entitlement.code, so the event could never grant anything;
//   * carried CPF/CNPJ, phone, state, IP and user-agent, which the canonical
//     payload sanitizes away;
//   * left webhook_queue.transaction_id null, so the partial unique index
//     (transaction_id, event, webhook_url) could not deduplicate it against the
//     row asaas-webhook queues for the same payment;
//   * never called apply_subscription_payment, so the paid period was not
//     advanced and the entitlement window was not authoritative.
// This endpoint reconciles the local transaction against Asaas and nothing more.

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

const getPaymentSplits = (payment: any) => {
  const splitCandidates = [
    payment?.splits,
    payment?.split,
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
  supabaseClient: any,
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

  const { error } = await supabaseClient
    .from('transactions')
    .update(updatePayload)
    .eq('id', transactionId);

  if (error) {
    console.error('Error updating transaction reconciliation fields via polling:', error);
  }
}

async function getPlannedSplitContext(supabaseClient: any, transaction: any, payment: any) {
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

  const { data: existingSplits, error } = await supabaseClient
    .from('transaction_splits')
    .select('id')
    .or(`transaction_id.eq.${transaction.id},asaas_payment_id.eq.${payment.id}`)
    .limit(1);

  if (error) {
    console.error('Error checking planned transaction splits via polling:', error);
    return {
      hasPlannedSplit: false,
      verificationFailed: true,
      notes: 'Failed to verify planned transaction splits during check-payment-status',
    };
  }

  return {
    hasPlannedSplit: Boolean(existingSplits && existingSplits.length > 0),
    verificationFailed: false,
    notes: null,
  };
}

async function updateTransactionSplitsFromPaymentStatus(
  supabaseClient: any,
  transaction: any,
  payment: any,
) {
  try {
    const paymentSplits = getPaymentSplits(payment);

    if (paymentSplits.length === 0) {
      return {
        status: 'partial',
        notes: 'Asaas payment status did not include detailed split data; planned split remains sent',
      };
    }

    const { data: existingSplits, error: splitFetchError } = await supabaseClient
      .from('transaction_splits')
      .select('id, wallet_id')
      .or(`transaction_id.eq.${transaction.id},asaas_payment_id.eq.${payment.id}`);

    if (splitFetchError) {
      console.error('Error fetching transaction splits for polling reconciliation:', splitFetchError);
      return {
        status: 'divergent',
        notes: 'Failed to fetch planned transaction splits during check-payment-status',
      };
    }

    if (!existingSplits || existingSplits.length === 0) {
      console.error('Asaas payment status included split data, but no planned transaction_splits rows were found');
      return {
        status: 'divergent',
        notes: 'Asaas payment status included split data, but no planned transaction_splits rows were found',
      };
    }

    let updatedCount = 0;
    let receivedCount = 0;
    let missingCount = 0;
    let updateErrorCount = 0;

    for (const [index, split] of paymentSplits.entries()) {
      const splitRecord = split as Record<string, unknown>;
      const walletId = getSplitWalletId(splitRecord);
      const receivedAmount = getSplitReceivedAmount(splitRecord);
      const splitRow = walletId
        ? existingSplits.find((row: any) => row.wallet_id === walletId)
        : existingSplits.length === paymentSplits.length
          ? existingSplits[index]
          : existingSplits.length === 1 && paymentSplits.length === 1
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
          source: 'check-payment-status',
          payment_id: payment.id,
        },
      };

      if (receivedAmount !== null) {
        splitUpdatePayload.received_amount = receivedAmount;
      }

      const { error: splitUpdateError } = await supabaseClient
        .from('transaction_splits')
        .update(splitUpdatePayload)
        .eq('id', splitRow.id);

      if (splitUpdateError) {
        updateErrorCount += 1;
        console.error('Error updating transaction split from polling:', splitUpdateError);
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
        notes: 'Failed to match or update all payment split details during check-payment-status',
      };
    }

    if (updatedCount === paymentSplits.length && receivedCount === paymentSplits.length) {
      return {
        status: 'reconciled',
        notes: null,
      };
    }

    return {
      status: 'partial',
      notes: 'Asaas payment status included split details without received split amounts',
    };
  } catch (error) {
    console.error('Unexpected error reconciling transaction splits from polling:', error);
    return {
      status: 'divergent',
      notes: 'Unexpected error reconciling transaction splits during check-payment-status',
    };
  }
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

    // `userId` is deliberately NOT destructured. Older clients still send it and
    // it is simply ignored: it was always attacker-chosen and never proved
    // anything. Authorization now comes from the polling capability alone.
    const { paymentId, pollingToken } = await req.json();

    // Shape check before any lookup. Nothing about the failure is echoed back.
    if (typeof paymentId !== 'string' || paymentId.length === 0 || paymentId.length > 128) {
      return forbiddenResponse();
    }

    if (!isPollTokenFormatValid(pollingToken)) {
      return forbiddenResponse();
    }

    // Authorization: the caller must hold the capability minted by create-payment
    // for THIS payment. Only the hash is stored, the comparison is constant-time,
    // and an expired capability is as good as none.
    //
    // Nothing below this gate touches Asaas or writes anything: no transaction
    // update, no product_sales, no split reconciliation, no entitlement. That
    // holds for BOTH exits below -- a denial and an outage are equally inert.
    let authorizedTransaction: {
      id: string;
      payment_poll_token_hash: string | null;
      payment_poll_token_expires_at: string | null;
    } | null = null;

    try {
      const lookup = await supabaseClient
        .from('transactions')
        .select('id, payment_poll_token_hash, payment_poll_token_expires_at')
        .eq('asaas_payment_id', paymentId)
        .maybeSingle();

      // A database error is an outage, not an answer. We do not know whether the
      // caller is authorized, so we must not claim they are not.
      if (lookup.error) {
        console.error(
          'Polling authorization lookup failed:',
          sanitizeErrorForLog(lookup.error),
        );
        return internalErrorResponse();
      }

      authorizedTransaction = lookup.data ?? null;
    } catch (error) {
      console.error(
        'Unexpected error during polling authorization lookup:',
        sanitizeErrorForLog(error),
      );
      return internalErrorResponse();
    }

    // Zero rows IS an answer: this payment does not exist here. Denial, not error.
    if (!authorizedTransaction) {
      console.warn('Polling capability rejected: unknown payment');
      return forbiddenResponse();
    }

    let capabilityAccepted = false;
    try {
      capabilityAccepted = await verifyPollCapability(pollingToken, authorizedTransaction);
    } catch (error) {
      // Crypto or runtime failure while hashing. Again: we do not know, so we
      // cannot deny.
      console.error(
        'Polling capability verification failed technically:',
        sanitizeErrorForLog(error),
      );
      return internalErrorResponse();
    }

    if (!capabilityAccepted) {
      // One generic answer for every cause the database did answer: missing
      // capability, wrong token, expired token, token belonging to another
      // payment. Telling them apart would turn this into a payment-id oracle.
      console.warn('Polling capability rejected for payment:', paymentId);
      return forbiddenResponse();
    }

    // Rate limit keyed on the authorized transaction id, which the caller cannot
    // choose: it is reached only by holding a valid capability. The previous key
    // was the request-supplied userId, so an attacker simply rotated it.
    const rateLimit = checkRateLimit(authorizedTransaction.id);
    if (!rateLimit.allowed) {
      console.warn('Rate limit exceeded for transaction:', authorizedTransaction.id);
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
      .select('*')
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
    const paymentNetValue = getValidNumber(paymentData.netValue);
    const asaasFeeAmount = getAsaasFeeAmount(paymentData);
    const asaasFeeNote = asaasFeeAmount !== null
      ? 'Asaas fee estimated from polling payment.value - payment.netValue'
      : null;
    const transactionUpdateData: Record<string, unknown> = {
      status: paymentData.status,
      payment_date: paymentData.paymentDate,
      confirmed_date: paymentData.confirmedDate,
      credit_date: paymentData.creditDate,
      asaas_raw_payload: paymentData,
      reconciliation_status: isConfirmedPaymentStatus(paymentData.status) ? 'partial' : 'pending',
      updated_at: new Date().toISOString(),
    };

    if (paymentNetValue !== null) {
      transactionUpdateData.net_value = paymentNetValue;
    }

    if (asaasFeeAmount !== null) {
      transactionUpdateData.asaas_fee_amount = asaasFeeAmount;
      transactionUpdateData.reconciliation_notes = asaasFeeNote;
    }

    const { error: transactionUpdateError } = await supabaseClient
      .from('transactions')
      .update(transactionUpdateData)
      .eq('asaas_payment_id', paymentId);

    if (transactionUpdateError) {
      console.error('Error updating transaction from polling:', transactionUpdateError);
    }

    // Update local transaction if needed
    if (isConfirmedPaymentStatus(paymentData.status)) {
      // Fetch the complete updated transaction
      const { data: fullTransaction, error: fetchError } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('asaas_payment_id', paymentId)
        .single();

      if (!fetchError && fullTransaction) {
        // Create product_sales entry if not exists
        if (fullTransaction.product_id) {
          const { data: existingSaleByTransaction } = await supabaseClient
            .from('product_sales')
            .select('id, affiliate_link_id, transaction_id, asaas_payment_id')
            .or(`transaction_id.eq.${fullTransaction.id},asaas_payment_id.eq.${fullTransaction.asaas_payment_id}`)
            .maybeSingle();

          const { data: existingRecentSale } = await supabaseClient
            .from('product_sales')
            .select('id, affiliate_link_id, transaction_id, asaas_payment_id')
            .eq('product_id', fullTransaction.product_id)
            .eq('customer_email', fullTransaction.customer_email)
            .eq('sale_amount', fullTransaction.value)
            .gte('created_at', new Date(Date.now() - 60000).toISOString())
            .maybeSingle();
          const existingSale = existingSaleByTransaction ?? existingRecentSale;

          const affiliateSaleData = await getAffiliateSaleData(supabaseClient, fullTransaction);

          if (!existingSale) {
            const { error: salesError } = await supabaseClient.from('product_sales').insert({
              product_id: fullTransaction.product_id,
              product_price_id: fullTransaction.price_id,
              customer_name: fullTransaction.customer_name,
              customer_email: fullTransaction.customer_email,
              sale_amount: fullTransaction.value,
              sale_date: paymentData.confirmedDate || paymentData.paymentDate || new Date().toISOString(),
              status: 'completed',
              affiliate_link_id: affiliateSaleData.affiliate_link_id,
              commission_amount: affiliateSaleData.commission_amount,
              transaction_id: fullTransaction.id,
              asaas_payment_id: fullTransaction.asaas_payment_id,
            });

            if (salesError) {
              console.error('Error creating product sale via polling:', salesError);
            } else {
              console.log('Product sale created via polling');
            }
          } else {
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
              const { error: updateSaleError } = await supabaseClient
                .from('product_sales')
                .update(saleUpdateData)
                .eq('id', existingSale.id);

              if (updateSaleError) {
                console.error('Error updating existing product sale reconciliation fields via polling:', updateSaleError);
              } else {
                console.log('Existing product sale reconciliation fields updated via polling:', existingSale.id);
              }
            }
          }
        }

        const plannedSplitContext = await getPlannedSplitContext(supabaseClient, fullTransaction, paymentData);

        if (plannedSplitContext.verificationFailed) {
          await updateTransactionReconciliation(
            supabaseClient,
            fullTransaction.id,
            'divergent',
            combineReconciliationNotes(asaasFeeNote, plannedSplitContext.notes),
          );
        } else if (!plannedSplitContext.hasPlannedSplit) {
          await updateTransactionReconciliation(
            supabaseClient,
            fullTransaction.id,
            'not_applicable',
            asaasFeeNote,
          );
        } else {
          const reconciliationResult = await updateTransactionSplitsFromPaymentStatus(
            supabaseClient,
            fullTransaction,
            paymentData,
          );
          await updateTransactionReconciliation(
            supabaseClient,
            fullTransaction.id,
            reconciliationResult.status,
            combineReconciliationNotes(asaasFeeNote, reconciliationResult.notes),
          );
        }

        // Entitlement is NOT emitted here. The Asaas webhook owns that decision
        // and is the only path that advances the paid period before queueing.
        if (!isConfirmedPaymentStatus(previousStatus)) {
          console.log(
            'Status changed to confirmed/received via polling; entitlement left to asaas-webhook for payment:',
            paymentId,
          );
        }
      } else {
        console.error('Error fetching full transaction after polling update:', fetchError);
      }
    }

    // Only the payment status leaves this function. This endpoint is reachable
    // without an authenticated session (see supabase/config.toml: verify_jwt =
    // false) because the buyer polling it on /checkout is anonymous, so echoing
    // the raw Asaas payment object here disclosed customer and billing detail to
    // anyone who could guess a payment id. The polling hook only reads
    // `success` and `status`.
    return new Response(
      JSON.stringify({
        success: true,
        status: paymentData.status,
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
