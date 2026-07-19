import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  buildEntitlementPayload,
  ENTITLEMENT_EVENT_VERSION,
} from "../_shared/buildEntitlementPayload.ts";
import type {
  EntitlementSubscriptionInput,
  EntitlementTransactionInput,
} from "../_shared/buildEntitlementPayload.ts";
import {
  classifyWebhookQueueInsertError,
  failedQueueResult,
  queuedResult,
  shouldRetryEntitlementQueue,
  skippedQueueResult,
  type EntitlementQueueResult,
} from "../_shared/webhookQueueResult.ts";
import {
  confirmedSubscriptionKey,
  confirmedTransactionKey,
  paymentFailedKey,
  pendingKey,
  revokedChargebackKey,
  revokedRefundKey,
} from "../_shared/entitlementIdempotency.ts";
import { queueEntitlementEvent } from "../_shared/queueEntitlementEvent.ts";
import {
  classifyRevocation,
  decidePaymentFailed,
  pendingExpiresAt,
  shouldEmitPending,
} from "../_shared/subscriptionEventRules.ts";

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

const getTextValue = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const getAsaasEventId = (webhookData: any) =>
  getTextValue(webhookData?.id)
    ?? getTextValue(webhookData?.eventId)
    ?? getTextValue(webhookData?.event_id);

const isUniqueViolation = (error: any) => error?.code === '23505';

const SUBSCRIPTION_MANAGEMENT_EMAIL_TEMPLATE_KEY = 'subscription_management_link';
const TOKEN_RANDOM_BYTES = 32;
const MANAGEMENT_TOKEN_EXPIRES_IN_DAYS = 365;
const RESEND_API_URL = 'https://api.resend.com/emails';
const EMAIL_PENDING_STALE_AFTER_MS = 15 * 60 * 1000;

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

const sanitizeForLog = (value: unknown) => {
  let message = 'Unknown error';

  if (value instanceof Error) {
    message = value.message;
  } else if (typeof value === 'string') {
    message = value;
  } else {
    try {
      message = JSON.stringify(value ?? 'Unknown error');
    } catch (_error) {
      message = 'Unserializable error';
    }
  }

  return message
    .replace(/token=[^&\s"']+/gi, 'token=[redacted]')
    .replace(/\/minha-assinatura\?[^"'\s]+/gi, '/minha-assinatura?[redacted]')
    .slice(0, 500);
};

const isUsableRecipientEmail = (email: unknown) => {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.endsWith('@subscription.local')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
};

const normalizeEmail = (email: unknown) =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

const pickRecipientEmail = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    if (isUsableRecipientEmail(candidate)) {
      return normalizeEmail(candidate);
    }
  }

  const fallback = normalizeEmail(candidates.find((candidate) =>
    typeof candidate === 'string' && candidate.trim().length > 0,
  ));

  return fallback || 'missing-recipient';
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizePublicBaseUrl = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch (_error) {
    return null;
  }
};

const formatResendFrom = (productName: string, fromEmail: string) => {
  const cleanProductName = productName.replace(/[<>\r\n]/g, '').trim() || 'Produto';
  const cleanFromEmail = fromEmail.replace(/[<>\r\n]/g, '').trim();

  return `${cleanProductName} <${cleanFromEmail}>`;
};

const isEmailEventPendingStale = (updatedAt: unknown) => {
  if (typeof updatedAt !== 'string' || !updatedAt.trim()) return true;
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return true;
  return Date.now() - parsed.getTime() >= EMAIL_PENDING_STALE_AFTER_MS;
};

async function registerAsaasWebhookEvent(
  supabaseAdmin: any,
  webhookData: any,
  eventType: string,
  paymentId: string,
) {
  const asaasEventId = getAsaasEventId(webhookData);

  const { data, error } = await supabaseAdmin
    .from('asaas_webhook_events')
    .insert({
      asaas_payment_id: paymentId,
      event_type: eventType,
      asaas_event_id: asaasEventId,
      status: 'received',
      raw_payload: webhookData,
    })
    .select('id')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return resolveExistingAsaasWebhookEvent(
        supabaseAdmin,
        webhookData,
        eventType,
        paymentId,
        asaasEventId,
      );
    }

    console.error('Error registering Asaas webhook event:', error);
    return {
      eventRowId: null,
      duplicate: false,
      error,
    };
  }

  return {
    eventRowId: data?.id ?? null,
    duplicate: false,
    error: null,
  };
}

// On a 23505 unique violation, the event already exists. Decide whether it is a
// real (final) duplicate or a row that can be reused to continue processing.
async function resolveExistingAsaasWebhookEvent(
  supabaseAdmin: any,
  webhookData: any,
  eventType: string,
  paymentId: string,
  asaasEventId: string | null,
) {
  let existingEvent: any = null;
  let lookupError: any = null;

  // Prefer lookup by (asaas_payment_id, event_type).
  const byPair = await supabaseAdmin
    .from('asaas_webhook_events')
    .select('id, status')
    .eq('asaas_payment_id', paymentId)
    .eq('event_type', eventType)
    .maybeSingle();

  existingEvent = byPair.data ?? null;
  lookupError = byPair.error ?? null;

  // Fall back to lookup by asaas_event_id when available.
  if (!existingEvent && asaasEventId) {
    const byEventId = await supabaseAdmin
      .from('asaas_webhook_events')
      .select('id, status')
      .eq('asaas_event_id', asaasEventId)
      .maybeSingle();

    existingEvent = byEventId.data ?? null;
    lookupError = byEventId.error ?? lookupError;
  }

  // Could not resolve the existing row: stay safe and treat as duplicate so we
  // do not reprocess without context.
  if (!existingEvent) {
    console.error(
      'Asaas webhook unique violation but existing event not found:',
      lookupError,
    );
    return {
      eventRowId: null,
      duplicate: true,
      error: null,
    };
  }

  // Already finalized -> real duplicate, do not reprocess.
  if (existingEvent.status === 'processed' || existingEvent.status === 'ignored') {
    return {
      eventRowId: existingEvent.id ?? null,
      duplicate: true,
      error: null,
    };
  }

  // failed or received -> reuse the row, reset to received and continue.
  const { error: resetError } = await supabaseAdmin
    .from('asaas_webhook_events')
    .update({
      status: 'received',
      raw_payload: webhookData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingEvent.id);

  if (resetError) {
    console.error('Error resetting Asaas webhook event for reprocessing:', resetError);
    return {
      eventRowId: null,
      duplicate: false,
      error: resetError,
    };
  }

  return {
    eventRowId: existingEvent.id ?? null,
    duplicate: false,
    error: null,
  };
}

async function updateAsaasWebhookEventStatus(
  supabaseAdmin: any,
  eventRowId: string | null,
  status: 'processed' | 'ignored' | 'failed',
) {
  if (!eventRowId) {
    return;
  }

  try {
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: now,
    };

    if (status === 'processed') {
      updatePayload.processed_at = now;
    }

    const { error } = await supabaseAdmin
      .from('asaas_webhook_events')
      .update(updatePayload)
      .eq('id', eventRowId);

    if (error) {
      console.error(`Error marking Asaas webhook event as ${status}:`, error);
    }
  } catch (error) {
    console.error(`Unexpected error marking Asaas webhook event as ${status}:`, error);
  }
}

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

async function queueWebhooks(
  supabaseAdmin: ReturnType<typeof createClient>,
  transaction: EntitlementTransactionInput & {
    product_id: string | null;
    price_id?: string | null;
  },
  subscription: EntitlementSubscriptionInput | null = null,
  // `subscriptions.id` local. Presente => o consumidor chaveia o escopo por
  // assinatura; ausente => cai em legacy_tx, chaveado pela transacao. Como cada
  // renovacao cria uma transacao nova, omitir isto numa assinatura abriria um
  // escopo novo por mes. Nunca fabricar.
  subscriptionId: string | null = null,
): Promise<EntitlementQueueResult> {
  const recordRetryableFailure = async (
    webhookUrl: string | null,
    reason: unknown,
  ) => {
    const sanitizedReason = sanitizeForLog(reason);
    console.error('Retryable entitlement queue failure:', sanitizedReason);

    if (!transaction.product_id || !webhookUrl) return;

    try {
      const { error: logError } = await supabaseAdmin.from('webhook_logs').insert({
        product_id: transaction.product_id,
        webhook_url: webhookUrl,
        payload: { event: 'sale.confirmed', transaction_id: transaction.id },
        response_status: null,
        response_body: `retryable: ${sanitizedReason}`,
        success: false,
        event: 'sale.confirmed',
        event_version: ENTITLEMENT_EVENT_VERSION,
      });

      if (!logError) return;
      console.error(
        'Error recording retryable entitlement queue failure:',
        sanitizeForLog(logError),
      );
    } catch (logError) {
      console.error(
        'Unexpected error recording retryable entitlement queue failure:',
        sanitizeForLog(logError),
      );
    }
  };

  try {
    if (!transaction.product_id) {
      console.log('No product_id in transaction, skipping webhook queue');
      return skippedQueueResult('transaction has no product_id');
    }

    // Get active webhooks for this product
    const { data: webhooks, error: webhooksError } = await supabaseAdmin
      .from('product_webhooks')
      .select('*')
      .eq('product_id', transaction.product_id)
      .eq('is_active', true);

    if (webhooksError) {
      await recordRetryableFailure(null, webhooksError);
      return failedQueueResult('error fetching product webhooks');
    }

    if (!webhooks || webhooks.length === 0) {
      console.log('No active webhooks configured for product:', transaction.product_id);
      return skippedQueueResult('no active product webhooks');
    }

    // Load product (entitlement source of truth) and price details.
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, unique_code, entitlement_code, product_type')
      .eq('id', transaction.product_id)
      .single();

    if (productError || !product) {
      for (const webhook of webhooks) {
        await recordRetryableFailure(
          webhook.webhook_url,
          productError ?? 'product not found for entitlement webhook',
        );
      }
      return failedQueueResult('error fetching product');
    }

    // Safety rule: without an explicit entitlement_code there is no reliable
    // entitlement to grant. Skip sending and leave an auditable trail.
    if (!product.entitlement_code || !String(product.entitlement_code).trim()) {
      console.error(
        `Skipping entitlement webhook: product ${product.id} has no entitlement_code configured`,
      );
      const skipLogs = webhooks.map((webhook: any) => ({
        product_id: transaction.product_id,
        webhook_url: webhook.webhook_url,
        payload: { event: 'sale.confirmed', transaction_id: transaction.id },
        response_status: null,
        response_body: 'skipped: product has no entitlement_code configured',
        success: false,
        event: 'sale.confirmed',
        event_version: ENTITLEMENT_EVENT_VERSION,
      }));
      const { error: skipLogError } = await supabaseAdmin.from('webhook_logs').insert(skipLogs);
      if (skipLogError) {
        console.error('Error recording skipped entitlement webhook:', sanitizeForLog(skipLogError));
      }
      return skippedQueueResult('product has no entitlement_code configured');
    }

    let price: any = null;
    if (transaction.price_id) {
      const { data: priceData, error: priceError } = await supabaseAdmin
        .from('product_prices')
        .select('id, unique_code, subscription_period')
        .eq('id', transaction.price_id)
        .maybeSingle();

      if (priceError || !priceData) {
        for (const webhook of webhooks) {
          await recordRetryableFailure(
            webhook.webhook_url,
            priceError ?? 'price not found for entitlement webhook',
          );
        }
        return failedQueueResult('error fetching product price');
      }

      price = priceData;
    }

    // Queue one sanitized entitlement payload per active URL, each with its
    // own delivery_id. Inserted one by one so the partial unique index
    // (transaction_id, event, webhook_url) can deduplicate without aborting
    // the other destinations.
    let queuedCount = 0;
    let deduplicatedCount = 0;
    let retryableFailureCount = 0;
    for (const webhook of webhooks) {
      const deliveryId = crypto.randomUUID();

      let payload;
      try {
        payload = buildEntitlementPayload({
          event: 'sale.confirmed',
          deliveryId,
          transaction,
          product,
          price,
          subscription,
          subscriptionId,
        });
      } catch (error) {
        const reason = 'skipped: invalid recurring entitlement period or expiration';
        await recordRetryableFailure(
          webhook.webhook_url,
          `${reason}: ${sanitizeForLog(error)}`,
        );
        retryableFailureCount += 1;
        continue;
      }

      const { error: queueError } = await supabaseAdmin
        .from('webhook_queue')
        .insert({
          product_id: transaction.product_id,
          product_webhook_id: webhook.id,
          webhook_url: webhook.webhook_url,
          payload,
          status: 'pending',
          delivery_id: deliveryId,
          event: 'sale.confirmed',
          event_version: ENTITLEMENT_EVENT_VERSION,
          transaction_id: transaction.id,
          subscription_id: subscriptionId,
          // Assinatura: chave por (assinatura, pagamento) -- renovacao tem
          // pagamento novo, logo chave nova. Avulsa/legado: chave pela
          // transacao. Nunca fabricar subscription_id para caber na primeira.
          idempotency_key: subscriptionId
            ? confirmedSubscriptionKey(subscriptionId, transaction.asaas_payment_id)
            : confirmedTransactionKey(transaction.id),
          next_retry_at: new Date().toISOString(),
        });

      if (queueError) {
        const classification = classifyWebhookQueueInsertError(queueError);
        if (classification === 'deduplicated') {
          console.log(
            `Webhook already queued for transaction ${transaction.id} -> ${webhook.webhook_url}, skipping duplicate`,
          );
          deduplicatedCount += 1;
        } else {
          await recordRetryableFailure(webhook.webhook_url, queueError);
          retryableFailureCount += 1;
        }
        continue;
      }

      queuedCount++;
    }

    if (retryableFailureCount > 0) {
      return failedQueueResult(
        'one or more entitlement destinations failed',
        queuedCount,
        deduplicatedCount,
      );
    }

    if (queuedCount === 0) {
      console.log('All entitlement webhooks were already queued for product:', transaction.product_id);
      return queuedResult(0, deduplicatedCount);
    }

    console.log(`Queued ${queuedCount} webhooks for product ${transaction.product_id}`);

    // Trigger webhook processor
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-webhook-queue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
    }).catch(console.error);

    return queuedResult(queuedCount, deduplicatedCount);
  } catch (error) {
    await recordRetryableFailure(null, error);
    return failedQueueResult('unexpected entitlement queue failure');
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

// ---------------------------------------------------------------------------
// Recurring subscription helpers (PAYMENT_* events with payment.subscription).
// ---------------------------------------------------------------------------

const parseAsaasDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getPaymentEffectiveDate = (payment: any): Date => {
  const candidates = [
    payment?.confirmedDate,
    payment?.paymentDate,
    payment?.clientPaymentDate,
    payment?.dateCreated,
  ];
  for (const candidate of candidates) {
    const parsed = parseAsaasDate(candidate);
    if (parsed) return parsed;
  }
  return new Date();
};

const REFUND_OR_CANCEL_STATUSES = new Set([
  'REFUNDED',
  'REFUND_REQUESTED',
  'REFUND_IN_PROGRESS',
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE',
  'AWAITING_CHARGEBACK_REVERSAL',
  'DELETED',
  'CANCELLED',
]);

async function loadSubscriptionByAsaasId(
  supabaseAdmin: any,
  asaasSubscriptionId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('asaas_subscription_id', asaasSubscriptionId)
    .maybeSingle();

  if (error) {
    console.error('Error loading subscription by asaas_subscription_id:', error);
    return null;
  }

  return data ?? null;
}

async function loadAsaasCustomerByAsaasId(
  supabaseAdmin: any,
  asaasCustomerId: string | null | undefined,
) {
  if (!asaasCustomerId) return null;

  const { data, error } = await supabaseAdmin
    .from('asaas_customers')
    .select('user_id, name, email, cpf_cnpj, mobile_phone, phone, state')
    .eq('asaas_customer_id', asaasCustomerId)
    .maybeSingle();

  if (error) {
    console.error('Error loading asaas_customers for subscription payment:', error);
    return null;
  }

  return data ?? null;
}

async function createTransactionForSubscriptionPayment(
  supabaseAdmin: any,
  subscription: any,
  customer: any,
  payment: any,
) {
  const asaasFeeAmount = getAsaasFeeAmount(payment);
  const paymentNetValue = getValidNumber(payment?.netValue);
  const isConfirmed = isConfirmedPaymentStatus(payment?.status);

  const insertPayload: Record<string, unknown> = {
    user_id: subscription.user_id,
    asaas_payment_id: payment.id,
    asaas_customer_id: payment.customer ?? subscription.asaas_customer_id,
    product_id: subscription.product_id ?? null,
    price_id: subscription.product_price_id ?? null,
    customer_name: customer?.name ?? 'Assinatura recorrente',
    customer_email: customer?.email ?? 'recorrencia@subscription.local',
    customer_cpf_cnpj: customer?.cpf_cnpj ?? null,
    customer_phone: customer?.mobile_phone ?? customer?.phone ?? null,
    customer_state: customer?.state ?? null,
    payment_method: payment.billingType ?? subscription.billing_type,
    status: payment.status,
    value: getValidNumber(payment?.value) ?? subscription.value,
    net_value: paymentNetValue,
    due_date: payment.dueDate ?? null,
    billing_type: payment.billingType ?? subscription.billing_type,
    description: payment.description ?? subscription.description ?? null,
    external_reference: payment.externalReference ?? null,
    affiliate_code: subscription.affiliate_code ?? null,
    payment_date: payment.paymentDate ?? null,
    confirmed_date: payment.confirmedDate ?? null,
    credit_date: payment.creditDate ?? null,
    asaas_raw_payload: payment,
    reconciliation_status: isConfirmed ? 'partial' : 'pending',
    reconciliation_notes: 'Auto-created from subscription recurring payment',
  };

  if (asaasFeeAmount !== null) {
    insertPayload.asaas_fee_amount = asaasFeeAmount;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('transactions')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      // Race condition: another concurrent webhook already inserted; fetch it.
      const { data: existing } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('asaas_payment_id', payment.id)
        .maybeSingle();
      return existing ?? null;
    }

    console.error('Error inserting subscription recurring transaction:', insertError);
    return null;
  }

  return inserted;
}

async function applySubscriptionPaymentConfirmed(
  supabaseAdmin: any,
  subscription: any,
  payment: any,
  eventType: string,
) {
  const effectiveDate = getPaymentEffectiveDate(payment);
  const { data, error } = await supabaseAdmin
    .rpc('apply_subscription_payment', {
      p_subscription_id: subscription.id,
      p_asaas_payment_id: payment.id,
      p_event_type: eventType,
      p_effective_date: effectiveDate.toISOString(),
      p_payment_status: payment.status,
    })
    .single();

  if (error) {
    console.error('Transactional subscription payment application failed:', sanitizeForLog(error));
    return null;
  }

  if (
    !data ||
    (data.application_result !== 'applied' && data.application_result !== 'duplicate') ||
    !data.subscription ||
    !data.application?.applied_period_end
  ) {
    console.error('Subscription payment RPC returned an invalid result');
    return null;
  }

  if (data.application_result === 'duplicate') {
    console.log('Subscription payment already present in durable ledger:', payment.id);
  }

  return {
    result: data.application_result as 'applied' | 'duplicate',
    subscription: data.subscription,
    entitlementSubscription: {
      cycle: data.subscription.cycle ?? null,
      current_period_end: data.application.applied_period_end,
      access_until: data.application.applied_period_end,
    } satisfies EntitlementSubscriptionInput,
  };
}

// ---------------------------------------------------------------------
// Eventos financeiros de assinatura (pending, payment_failed, access_revoked).
//
// O ledger subscription_payment_applications e a fonte de verdade sobre "esta
// assinatura ja teve pagamento aplicado?". Nao usamos datas proximas nem
// last_payment_id: este ultimo continua nulo tanto na primeira cobranca pendente
// quanto na primeira que vence sem pagar, e por isso nao distingue os dois.
// ---------------------------------------------------------------------

interface LedgerContext {
  /** Quantos pagamentos desta assinatura ja foram aplicados, alguma vez. */
  totalApplications: number;
  /** Linha deste pagamento especifico, se ja aplicado. */
  currentApplication: { applied_period_end: string | null } | null;
  /** Falha de leitura: o chamador NAO pode decidir sem esta informacao. */
  failed: boolean;
}

/** Linha do ledger, limitada ao que estes eventos leem. */
interface LedgerRow {
  asaas_payment_id: string | null;
  applied_period_end: string | null;
}

/** Cliente Supabase, mesmo tipo que o restante do arquivo ja usa. */
type AdminClient = ReturnType<typeof createClient>;

async function loadLedgerContext(
  supabaseAdmin: AdminClient,
  subscriptionId: string,
  asaasPaymentId: string | null,
): Promise<LedgerContext> {
  const { data, error } = await supabaseAdmin
    .from('subscription_payment_applications')
    .select('asaas_payment_id, applied_period_end')
    .eq('subscription_id', subscriptionId);

  if (error) {
    console.error('Error loading subscription payment ledger:', sanitizeForLog(error));
    return { totalApplications: 0, currentApplication: null, failed: true };
  }

  const rows = data ?? [];
  return {
    totalApplications: rows.length,
    currentApplication:
      rows.find((row: LedgerRow) => row.asaas_payment_id === asaasPaymentId) ?? null,
    failed: false,
  };
}

/**
 * Enfileira um evento de assinatura pela outbox canonica.
 *
 * Carrega produto e preco e delega a queueEntitlementEvent -- mesmo builder,
 * mesma fila, mesma idempotencia do sale.confirmed. Produto sem
 * entitlement_code falha fechado la dentro, com trilha em webhook_logs.
 */
async function queueSubscriptionEvent(
  supabaseAdmin: AdminClient,
  args: {
    event: string;
    idempotencyKey: string;
    transaction: EntitlementTransactionInput & {
      product_id?: string | null;
      price_id?: string | null;
      due_date?: string | null;
    };
    subscription: {
      id: string;
      cycle?: string | null;
      created_at?: string | null;
      product_id?: string | null;
      product_price_id?: string | null;
    };
    subscriptionId: string;
    expiresAt: string;
    cycleFrom?: string | null;
    paymentStatus?: string | null;
    reason?: string | null;
  },
) {
  const productId = args.transaction?.product_id ?? args.subscription?.product_id ?? null;
  if (!productId) {
    console.error(`Skipping ${args.event}: no product_id for subscription ${args.subscriptionId}`);
    return;
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, unique_code, entitlement_code, product_type')
    .eq('id', productId)
    .single();

  if (productError || !product) {
    console.error(`Skipping ${args.event}: product not found`, sanitizeForLog(productError));
    return;
  }

  const priceId = args.transaction?.price_id ?? args.subscription?.product_price_id ?? null;
  let price = null;
  if (priceId) {
    const { data: priceData } = await supabaseAdmin
      .from('product_prices')
      .select('id, unique_code, subscription_period')
      .eq('id', priceId)
      .maybeSingle();
    price = priceData ?? null;
  }

  const result = await queueEntitlementEvent(supabaseAdmin, {
    event: args.event,
    idempotencyKey: args.idempotencyKey,
    transaction: { ...args.transaction, product_id: productId },
    product,
    price,
    // O ciclo da assinatura define entitlement.period; expiresAtOverride define
    // a data. Sem o ciclo, o builder falharia fechado.
    subscription: { cycle: args.subscription?.cycle ?? null },
    subscriptionId: args.subscriptionId,
    expiresAtOverride: args.expiresAt,
    cycleFrom: args.cycleFrom,
    paymentStatus: args.paymentStatus,
    reason: args.reason,
  });

  console.log(
    `${args.event} queued=${result.queued} duplicate=${result.duplicate} ` +
      `skipped=${result.skipped} failed=${result.failed} key=${args.idempotencyKey}`,
  );
}

async function applySubscriptionPaymentOverdue(
  supabaseAdmin: any,
  subscription: any,
  payment: any,
) {
  const updatePayload: Record<string, unknown> = {
    last_payment_status: payment.status,
    updated_at: new Date().toISOString(),
  };

  if (!subscription.overdue_since) {
    updatePayload.overdue_since = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(updatePayload)
    .eq('id', subscription.id);

  if (error) {
    console.error('Error updating subscription after overdue payment:', error);
  }
}

async function applySubscriptionPaymentRefundOrCancel(
  supabaseAdmin: any,
  subscription: any,
  payment: any,
  eventType: string,
) {
  const updatePayload: Record<string, unknown> = {
    last_payment_status: payment.status,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(updatePayload)
    .eq('id', subscription.id);

  if (error) {
    console.error(`Error updating subscription after ${eventType}:`, error);
  }
}

async function loadSubscriptionEmailContext(
  supabaseAdmin: any,
  subscription: any,
  transaction: any,
) {
  const productId = transaction?.product_id ?? subscription?.product_id ?? null;
  const priceId = transaction?.price_id ?? subscription?.product_price_id ?? null;
  const customer = await loadAsaasCustomerByAsaasId(
    supabaseAdmin,
    transaction?.asaas_customer_id ?? subscription?.asaas_customer_id,
  );

  let productName = typeof subscription?.description === 'string'
    ? subscription.description.trim()
    : '';
  let priceName = '';

  if (productId) {
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      console.error('Error loading product for subscription email:', productError);
    } else if (typeof product?.name === 'string' && product.name.trim()) {
      productName = product.name.trim();
    }
  }

  if (priceId) {
    const { data: price, error: priceError } = await supabaseAdmin
      .from('product_prices')
      .select('name')
      .eq('id', priceId)
      .maybeSingle();

    if (priceError) {
      console.error('Error loading price for subscription email:', priceError);
    } else if (typeof price?.name === 'string' && price.name.trim()) {
      priceName = price.name.trim();
    }
  }

  const recipientEmail = pickRecipientEmail(
    transaction?.customer_email,
    customer?.email,
  );

  return {
    recipientEmail,
    customerName:
      (typeof transaction?.customer_name === 'string' && transaction.customer_name.trim())
        || (typeof customer?.name === 'string' && customer.name.trim())
        || 'cliente',
    productName: productName || 'sua assinatura',
    priceName,
  };
}

async function createSubscriptionManagementToken(
  supabaseAdmin: any,
  subscriptionId: string,
  asaasPaymentId: string,
) {
  const rawBytes = new Uint8Array(TOKEN_RANDOM_BYTES);
  crypto.getRandomValues(rawBytes);
  const rawToken = bytesToBase64Url(rawBytes);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(
    Date.now() + MANAGEMENT_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error } = await supabaseAdmin
    .from('subscription_tokens')
    .insert({
      subscription_id: subscriptionId,
      token_hash: tokenHash,
      purpose: 'customer_manage',
      expires_at: expiresAt.toISOString(),
      created_by: 'asaas-webhook',
      metadata: {
        source: 'asaas-webhook',
        template_key: SUBSCRIPTION_MANAGEMENT_EMAIL_TEMPLATE_KEY,
        asaas_payment_id: asaasPaymentId,
        expires_in_days: MANAGEMENT_TOKEN_EXPIRES_IN_DAYS,
      },
    });

  if (error) {
    throw new Error(`Could not persist subscription token hash: ${sanitizeForLog(error)}`);
  }

  return rawToken;
}

async function registerSubscriptionEmailEvent(
  supabaseAdmin: any,
  subscription: any,
  transaction: any,
  recipientEmail: string,
  asaasPaymentId: string,
) {
  const payload = {
    subscription_id: subscription.id,
    transaction_id: transaction?.id ?? null,
    asaas_payment_id: asaasPaymentId,
    template_key: SUBSCRIPTION_MANAGEMENT_EMAIL_TEMPLATE_KEY,
    recipient_email: recipientEmail,
    status: 'pending',
    error_message: null,
    resend_message_id: null,
    sent_at: null,
  };

  const { data, error } = await supabaseAdmin
    .from('subscription_email_events')
    .insert(payload)
    .select('id, status, updated_at')
    .single();

  if (!error) {
    return { row: data, shouldSend: true };
  }

  if (!isUniqueViolation(error)) {
    console.error('Error registering subscription email event:', error);
    return { row: null, shouldSend: false };
  }

  const { data: existingEvent, error: existingError } = await supabaseAdmin
    .from('subscription_email_events')
    .select('id, status, updated_at')
    .eq('subscription_id', subscription.id)
    .eq('template_key', SUBSCRIPTION_MANAGEMENT_EMAIL_TEMPLATE_KEY)
    .eq('asaas_payment_id', asaasPaymentId)
    .maybeSingle();

  if (existingError || !existingEvent) {
    console.error('Error resolving existing subscription email event:', existingError);
    return { row: null, shouldSend: false };
  }

  if (existingEvent.status === 'sent') {
    console.log(
      'Subscription management email already sent:',
      existingEvent.id,
    );
    return { row: existingEvent, shouldSend: false };
  }

  if (
    existingEvent.status === 'pending' &&
    !isEmailEventPendingStale(existingEvent.updated_at)
  ) {
    console.log(
      'Subscription management email already pending:',
      existingEvent.id,
    );
    return { row: existingEvent, shouldSend: false };
  }

  const { data: resetEvent, error: resetError } = await supabaseAdmin
    .from('subscription_email_events')
    .update({
      transaction_id: transaction?.id ?? null,
      recipient_email: recipientEmail,
      status: 'pending',
      error_message: null,
      resend_message_id: null,
      sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingEvent.id)
    .select('id, status, updated_at')
    .single();

  if (resetError) {
    console.error('Error resetting subscription email event for retry:', resetError);
    return { row: existingEvent, shouldSend: false };
  }

  return { row: resetEvent, shouldSend: true };
}

async function updateSubscriptionEmailEvent(
  supabaseAdmin: any,
  eventId: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin
    .from('subscription_email_events')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    console.error('Error updating subscription email event:', error);
  }
}

async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
  text,
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const responseBody = await response.json().catch(async () => ({
    message: await response.text().catch(() => ''),
  }));

  if (!response.ok) {
    throw new Error(`Resend HTTP ${response.status}: ${sanitizeForLog(responseBody)}`);
  }

  return typeof responseBody?.id === 'string' ? responseBody.id : null;
}

async function sendSubscriptionManagementEmail(
  supabaseAdmin: any,
  subscription: any,
  transaction: any,
  payment: any,
) {
  let emailEventId: string | null = null;

  try {
    const asaasPaymentId = getTextValue(payment?.id);

    if (!subscription?.id || !asaasPaymentId) {
      console.error('Subscription email skipped: missing subscription id or payment id');
      return;
    }

    const emailContext = await loadSubscriptionEmailContext(
      supabaseAdmin,
      subscription,
      transaction,
    );

    const eventRegistration = await registerSubscriptionEmailEvent(
      supabaseAdmin,
      subscription,
      transaction,
      emailContext.recipientEmail,
      asaasPaymentId,
    );

    if (!eventRegistration.shouldSend || !eventRegistration.row?.id) {
      return;
    }

    const eventId = eventRegistration.row.id;
    emailEventId = eventId;

    if (!isUsableRecipientEmail(emailContext.recipientEmail)) {
      await updateSubscriptionEmailEvent(supabaseAdmin, eventId, {
        status: 'skipped',
        error_message: 'Missing or invalid customer email for subscription management link',
      });
      return;
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL')?.trim();
    const appPublicUrl = normalizePublicBaseUrl(Deno.env.get('APP_PUBLIC_URL'));

    if (!resendApiKey || !resendFromEmail || !appPublicUrl) {
      await updateSubscriptionEmailEvent(supabaseAdmin, eventId, {
        status: 'failed',
        error_message: 'Missing RESEND_API_KEY, RESEND_FROM_EMAIL, or APP_PUBLIC_URL',
      });
      return;
    }

    if (!isUsableRecipientEmail(resendFromEmail)) {
      await updateSubscriptionEmailEvent(supabaseAdmin, eventId, {
        status: 'failed',
        error_message: 'Invalid RESEND_FROM_EMAIL',
      });
      return;
    }

    const rawToken = await createSubscriptionManagementToken(
      supabaseAdmin,
      subscription.id,
      asaasPaymentId,
    );
    const managementUrl = `${appPublicUrl}/minha-assinatura?token=${encodeURIComponent(rawToken)}`;
    const productName = emailContext.productName;
    const customerName = emailContext.customerName;
    const supportEmail = resendFromEmail;
    const subject = `Gerencie sua assinatura - ${productName}`;
    const text = [
      `Ola, ${customerName}.`,
      '',
      `Sua assinatura de ${productName} foi confirmada.`,
      '',
      'Use o link abaixo para consultar ou cancelar sua assinatura:',
      '',
      managementUrl,
      '',
      'Por seguranca, nao compartilhe este link.',
      '',
      `Suporte: ${supportEmail}`,
    ].join('\n');
    const html = `
      <p>Ola, ${escapeHtml(customerName)}.</p>
      <p>Sua assinatura de ${escapeHtml(productName)} foi confirmada.</p>
      <p>Use o link abaixo para consultar ou cancelar sua assinatura:</p>
      <p><a href="${escapeHtml(managementUrl)}">Gerenciar minha assinatura</a></p>
      <p>Por seguranca, nao compartilhe este link.</p>
      <p>Suporte: ${escapeHtml(supportEmail)}</p>
    `;

    const resendMessageId = await sendResendEmail({
      apiKey: resendApiKey,
      from: formatResendFrom(productName, resendFromEmail),
      to: emailContext.recipientEmail,
      subject,
      html,
      text,
    });

    await updateSubscriptionEmailEvent(supabaseAdmin, eventId, {
      status: 'sent',
      resend_message_id: resendMessageId,
      error_message: null,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    const sanitizedError = sanitizeForLog(error);

    if (emailEventId) {
      await updateSubscriptionEmailEvent(supabaseAdmin, emailEventId, {
        status: 'failed',
        error_message: sanitizedError,
      });
    }

    console.error('Subscription management email failed non-fatally:', sanitizedError);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const tokenError = validateWebhookToken(req);
  if (tokenError) return tokenError;

  let supabaseAdmin: any = null;
  let webhookEventRowId: string | null = null;

  try {
    supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const webhookData = await req.json();
    const eventType = getTextValue(webhookData?.event);
    const payment = webhookData?.payment;
    const paymentId = getTextValue(payment?.id);

    console.log('Received webhook:', eventType, 'for payment:', paymentId);

    if (eventType && paymentId && !eventType.startsWith('PAYMENT_') && !eventType.startsWith('SUBSCRIPTION_')) {
      const registration = await registerAsaasWebhookEvent(supabaseAdmin, webhookData, eventType, paymentId);

      if (registration.duplicate) {
        console.warn('Duplicate Asaas webhook event ignored:', eventType, paymentId);
        return jsonResponse({ success: true, duplicate: true });
      }

      if (registration.error) {
        return jsonResponse({ error: 'Webhook event registration failed' }, 500);
      }

      webhookEventRowId = registration.eventRowId;
      console.warn('Ignoring unsupported Asaas webhook event:', eventType, paymentId);
      await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'ignored');
      return jsonResponse({ received: true, ignored: true });
    }

    // Handle payment events
    if (eventType && eventType.startsWith('PAYMENT_')) {
      if (!payment || !paymentId) {
        console.error('Invalid payment data in webhook');
        return jsonResponse({ received: true, ignored: true });
      }

      const registration = await registerAsaasWebhookEvent(supabaseAdmin, webhookData, eventType, paymentId);

      if (registration.duplicate) {
        console.warn('Duplicate Asaas webhook event ignored:', eventType, paymentId);
        return jsonResponse({ success: true, duplicate: true });
      }

      if (registration.error) {
        return jsonResponse({ error: 'Webhook event registration failed' }, 500);
      }

      webhookEventRowId = registration.eventRowId;

      // Find the transaction by asaas_payment_id
      // Note: declared with `let` so we can reassign when auto-creating from a
      // subscription recurring payment below.
      const transactionLookup = await supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('asaas_payment_id', paymentId)
        .single();
      let existingTransaction = transactionLookup.data;
      const findError = transactionLookup.error;

      if (findError && findError.code !== 'PGRST116') {
        console.error('Error finding transaction:', findError);
        await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed');
        return jsonResponse({ received: true });
      }

      // If transaction was not found AND this PAYMENT_* event belongs to a known
      // Asaas subscription, auto-create the transaction from subscription context.
      // After that, the existing flow (sales, splits, outbound webhooks) keeps
      // working as if the transaction had been created by create-payment.
      const recurringSubscriptionAsaasId = getTextValue(payment?.subscription);
      let recurringSubscription: any = null;
      let recurringTransactionForEmail: any = null;
      let transactionForWebhooks: typeof existingTransaction = null;
      let subscriptionForEntitlement: EntitlementSubscriptionInput | null = null;
      let subscriptionIdForEntitlement: string | null = null;
      let subscriptionPaymentApplicationFailed = false;

      if (recurringSubscriptionAsaasId) {
        recurringSubscription = await loadSubscriptionByAsaasId(
          supabaseAdmin,
          recurringSubscriptionAsaasId,
        );
      }

      if (!existingTransaction && recurringSubscriptionAsaasId) {
        if (recurringSubscription) {
          const recurringCustomer = await loadAsaasCustomerByAsaasId(
            supabaseAdmin,
            recurringSubscription.asaas_customer_id,
          );
          existingTransaction = await createTransactionForSubscriptionPayment(
            supabaseAdmin,
            recurringSubscription,
            recurringCustomer,
            payment,
          );

          if (existingTransaction) {
            console.log(
              'Auto-created transaction for subscription payment:',
              existingTransaction.id,
              'subscription:',
              recurringSubscriptionAsaasId,
            );
          } else {
            console.error(
              'Failed to auto-create transaction for subscription payment:',
              paymentId,
              'subscription:',
              recurringSubscriptionAsaasId,
            );
          }
        } else {
          console.warn(
            'PAYMENT_* received with payment.subscription but no local subscription found:',
            recurringSubscriptionAsaasId,
            'payment:',
            paymentId,
          );
        }
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
          .eq('asaas_payment_id', paymentId);

        if (updateError) {
          console.error('Error updating transaction:', updateError);
          await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed');
          return jsonResponse({ received: true });
        } else {
          console.log('Transaction updated:', paymentId, 'Status:', payment.status);
          
          // If payment is confirmed/received, process sale data
          if (payment.status === 'RECEIVED' || payment.status === 'CONFIRMED') {
            console.log('Payment confirmed/received, processing sale data and webhooks');
            
            // Fetch the complete updated transaction to ensure we have all fields
            const { data: fullTransaction, error: fetchFullError } = await supabaseAdmin
              .from('transactions')
              .select('*')
              .eq('asaas_payment_id', paymentId)
              .single();
            
            if (fetchFullError || !fullTransaction) {
              console.error('Error fetching full transaction:', fetchFullError);
              await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed');
              return jsonResponse({ received: true });
            } else {
              console.log('Full transaction fetched:', fullTransaction.id, 'Product ID:', fullTransaction.product_id);
              recurringTransactionForEmail = fullTransaction;
              
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
                    if (isUniqueViolation(salesError)) {
                      console.warn('Product sale already exists by unique constraint, skipping duplicate creation:', salesError);
                    } else {
                      console.error('Error creating product sale:', salesError);
                    }
                  } else {
                    console.log('Product sale created for transaction:', paymentId);
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
              
              // Queue only after subscription side-effects below. This ensures
              // entitlement uses the persisted cycle and paid access window.
              transactionForWebhooks = fullTransaction;
            }
          }
        }
      } else {
        await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed');

        // A payment carrying payment.subscription belongs to a subscription this
        // system created, so its transaction either exists or should have just
        // been auto-created. Reaching here means reconciliation of data that
        // MUST exist locally failed. Answering 200 would tell Asaas the event was
        // handled and the only delivery would be lost, so fail closed and let
        // Asaas retry. The inbox row is already marked failed, which lets
        // resolveExistingAsaasWebhookEvent reuse it instead of treating the
        // retry as a duplicate.
        if (recurringSubscriptionAsaasId) {
          console.error(
            'Reconciliation failed: no transaction for subscription payment',
            paymentId,
            'subscription:',
            recurringSubscriptionAsaasId,
          );
          return jsonResponse(
            { error: 'Subscription transaction reconciliation failed', received: true, retryable: true },
            500,
          );
        }

        // No subscription context: this payment was never ours (created outside
        // PaymentBeta, or already purged). Genuinely irrelevant, so retrying it
        // forever would be noise, not recovery.
        console.warn('Transaction not found for Asaas webhook payment', paymentId);
        return jsonResponse({ received: true, ignored: true });
      }

      // Subscription side-effects for recurring payments. Only runs on the
      // success path (the else-branch above already returns when there is no
      // transaction). Looks up the subscription if it was not auto-loaded.
      if (recurringSubscriptionAsaasId) {
        const subscriptionForUpdate = recurringSubscription
          ?? (await loadSubscriptionByAsaasId(
            supabaseAdmin,
            recurringSubscriptionAsaasId,
          ));

        if (subscriptionForUpdate) {
          // A assinatura local existe: o id e um fato, nao uma suposicao. Sem
          // ele o consumidor abriria um escopo legacy_tx novo a cada renovacao.
          subscriptionIdForEntitlement = subscriptionForUpdate.id ?? null;

          const paymentStatus = typeof payment?.status === 'string' ? payment.status : '';

          if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED') {
            const application = await applySubscriptionPaymentConfirmed(
              supabaseAdmin,
              subscriptionForUpdate,
              payment,
              eventType ?? '',
            );
            subscriptionForEntitlement = application?.entitlementSubscription ?? null;
            subscriptionPaymentApplicationFailed = !application;
            if (application) {
              await sendSubscriptionManagementEmail(
                supabaseAdmin,
                subscriptionForUpdate,
                recurringTransactionForEmail ?? existingTransaction,
                payment,
              );
            }
          } else if (paymentStatus === 'OVERDUE') {
            await applySubscriptionPaymentOverdue(
              supabaseAdmin,
              subscriptionForUpdate,
              payment,
            );

            // P4 — subscription.payment_failed. SOMENTE renovacao.
            const ledger = await loadLedgerContext(
              supabaseAdmin,
              subscriptionForUpdate.id,
              paymentId,
            );

            if (ledger.failed) {
              // Sem o ledger nao da para saber se e primeira compra ou
              // renovacao. Decidir no escuro poderia dar 3 dias extras a quem
              // so tem a janela provisoria. Falha fechada e reprocessavel.
              subscriptionPaymentApplicationFailed = true;
              console.error('Cannot classify OVERDUE without the payment ledger:', paymentId);
            } else {
              const decision = decidePaymentFailed({
                ledgerCount: ledger.totalApplications,
                currentPaymentInLedger: Boolean(ledger.currentApplication),
                dueDate: existingTransaction?.due_date ?? payment?.dueDate,
              });

              if (decision.emit) {
                await queueSubscriptionEvent(supabaseAdmin, {
                  event: 'subscription.payment_failed',
                  idempotencyKey: paymentFailedKey(
                    subscriptionForUpdate.id,
                    decision.cycleFrom,
                  ),
                  transaction: existingTransaction,
                  subscription: subscriptionForUpdate,
                  subscriptionId: subscriptionForUpdate.id,
                  expiresAt: decision.expiresAt,
                  cycleFrom: decision.cycleFrom,
                  paymentStatus,
                  reason: 'payment_failed',
                });
              } else if (decision.reason === 'missing_due_date') {
                // Nao fabricar data. Sem due_date nao ha ancora de ciclo.
                console.error(
                  `needs_action: OVERDUE without due_date for subscription ${subscriptionForUpdate.id}, payment ${paymentId}`,
                );
              } else {
                console.log(`payment_failed skipped (${decision.reason}) for payment ${paymentId}`);
              }
            }
          } else if (REFUND_OR_CANCEL_STATUSES.has(paymentStatus)) {
            await applySubscriptionPaymentRefundOrCancel(
              supabaseAdmin,
              subscriptionForUpdate,
              payment,
              eventType ?? '',
            );

            // P5 — subscription.access_revoked. So estados TERMINAIS:
            // REFUNDED e CHARGEBACK_REQUESTED. Pedido de estorno em curso,
            // disputa, reversao em analise e cobranca removida nao revogam.
            const revocation = classifyRevocation(paymentStatus);

            if (revocation) {
              const ledger = await loadLedgerContext(
                supabaseAdmin,
                subscriptionForUpdate.id,
                paymentId,
              );

              if (ledger.failed) {
                subscriptionPaymentApplicationFailed = true;
                console.error('Cannot revoke without the payment ledger:', paymentId);
              } else if (!ledger.currentApplication?.applied_period_end) {
                // Sem linha no ledger, este pagamento nunca concedeu acesso --
                // nao ha periodo a revogar, e inventar um com now() tiraria
                // acesso que veio de outro pagamento.
                console.log(
                  `access_revoked skipped: payment ${paymentId} never granted access`,
                );
              } else {
                await queueSubscriptionEvent(supabaseAdmin, {
                  event: 'subscription.access_revoked',
                  idempotencyKey: revocation === 'refund'
                    ? revokedRefundKey(paymentId)
                    : revokedChargebackKey(paymentId),
                  transaction: existingTransaction,
                  subscription: subscriptionForUpdate,
                  subscriptionId: subscriptionForUpdate.id,
                  // Periodo REAL aplicado, vindo do ledger.
                  expiresAt: ledger.currentApplication.applied_period_end,
                  // O consumidor distingue refund de chargeback por este
                  // prefixo: CHARGEBACK* vira revogacao absorvente (infinity).
                  paymentStatus,
                  reason: revocation,
                });
              }
            }
          } else {
            // Other statuses (PENDING, AWAITING_RISK_ANALYSIS, etc.): keep
            // status audit data in sync. last_payment_id is deliberately
            // reserved for a confirmed payment whose cycle was applied.
            const { error: trackError } = await supabaseAdmin
              .from('subscriptions')
              .update({
                last_payment_status: paymentStatus,
                updated_at: new Date().toISOString(),
              })
              .eq('id', subscriptionForUpdate.id);

            if (trackError) {
              console.error(
                'Error tracking last_payment_status on subscription:',
                trackError,
              );
            }

            // P3 — subscription.pending. Primeira cobranca ainda nao paga.
            // Emitido aqui, e nao em SUBSCRIPTION_CREATED, porque so neste
            // ponto a transaction local ja existe: transaction_id e um UUID
            // obrigatorio no contrato do consumidor.
            const ledger = await loadLedgerContext(
              supabaseAdmin,
              subscriptionForUpdate.id,
              paymentId,
            );

            if (ledger.failed) {
              subscriptionPaymentApplicationFailed = true;
              console.error('Cannot classify pending charge without the ledger:', paymentId);
            } else if (shouldEmitPending(ledger.totalApplications) && existingTransaction) {
              const expiresAt = pendingExpiresAt(subscriptionForUpdate.created_at);

              if (!expiresAt) {
                console.error(
                  `needs_action: subscription ${subscriptionForUpdate.id} has no usable created_at for the provisional window`,
                );
              } else {
                await queueSubscriptionEvent(supabaseAdmin, {
                  event: 'subscription.pending',
                  // Uma chave por assinatura, para sempre: a janela provisoria
                  // nasce uma unica vez e repeticao nao a prorroga.
                  idempotencyKey: pendingKey(subscriptionForUpdate.id),
                  transaction: existingTransaction,
                  subscription: subscriptionForUpdate,
                  subscriptionId: subscriptionForUpdate.id,
                  expiresAt,
                  paymentStatus,
                  reason: 'first_charge_pending',
                });
              }
            }
          }
        } else if (payment?.status === 'CONFIRMED' || payment?.status === 'RECEIVED') {
          subscriptionPaymentApplicationFailed = true;
          console.error(
            'Cannot apply confirmed subscription payment because the subscription row was not found:',
            recurringSubscriptionAsaasId,
          );
        }
      }

      // Either the subscription row behind a confirmed payment was not found, or
      // apply_subscription_payment did not return a usable result. In both cases
      // the paid period was NOT advanced, so any entitlement queued from here on
      // would carry a stale access window. Fail closed: 500 keeps the event
      // reprocessable at Asaas instead of silently dropping a confirmed payment.
      // Replaying is safe -- the ledger is unique per (subscription, payment) and
      // returns `duplicate` for work already applied.
      if (subscriptionPaymentApplicationFailed) {
        await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed');
        return jsonResponse(
          { error: 'Subscription payment application failed', received: true, retryable: true },
          500,
        );
      }

      if (transactionForWebhooks) {
        console.log('Queueing webhooks for product:', transactionForWebhooks.product_id);
        // A payment carrying payment.subscription must never fall back to the
        // mutable product price. An empty authoritative object intentionally
        // makes the entitlement builder fail closed and record a sanitized
        // skip when the subscription row could not be loaded or updated.
        const authoritativeSubscription = recurringSubscriptionAsaasId
          ? subscriptionForEntitlement ?? {}
          : null;
        const queueResult = await queueWebhooks(
          supabaseAdmin,
          transactionForWebhooks,
          authoritativeSubscription,
          subscriptionIdForEntitlement,
        );

        if (shouldRetryEntitlementQueue(queueResult)) {
          console.error(
            'Entitlement queue failed; keeping Asaas event reprocessable:',
            queueResult.reason,
          );
          await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed');
          return jsonResponse(
            { error: 'Entitlement queue failed', received: true, retryable: true },
            500,
          );
        }
      }

      await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'processed');
      return jsonResponse({ received: true });
    }

    // Handle subscription events
    if (eventType && eventType.startsWith('SUBSCRIPTION_')) {
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

      if (eventType === 'SUBSCRIPTION_CREATED') {
        // Avoid blind upsert: even though the upsert payload only carries the
        // webhook fields, a future change to subscriptionData (or an upsert
        // semantics change) could wipe out the recurrence-specific columns that
        // create-payment wrote (product_id, product_price_id, affiliate_code,
        // current_period_*, access_until, last_payment_*, etc.). Look up first;
        // if the row exists, only patch the safe webhook-sourced fields. If it
        // does not exist, fall back to a plain insert (subscription created
        // outside create-payment).
        const { data: existingSub, error: existingSubError } = await supabaseAdmin
          .from('subscriptions')
          .select('id')
          .eq('asaas_subscription_id', subscription.id)
          .maybeSingle();

        if (existingSubError) {
          console.error(
            'Error looking up existing subscription for SUBSCRIPTION_CREATED:',
            existingSubError,
          );
        } else if (existingSub) {
          const safeUpdate: Record<string, unknown> = {
            status: subscription.status,
            value: subscription.value,
            next_due_date: subscription.nextDueDate,
            cycle: subscription.cycle,
            description: subscription.description,
            billing_type: subscription.billingType,
            updated_at: new Date().toISOString(),
          };

          const { error: safeUpdateError } = await supabaseAdmin
            .from('subscriptions')
            .update(safeUpdate)
            .eq('id', existingSub.id);

          if (safeUpdateError) {
            console.error(
              'Error updating existing subscription from SUBSCRIPTION_CREATED:',
              safeUpdateError,
            );
          } else {
            console.log(
              'Existing subscription patched from SUBSCRIPTION_CREATED:',
              subscription.id,
            );
          }
        } else {
          const { error: fallbackInsertError } = await supabaseAdmin
            .from('subscriptions')
            .insert(subscriptionData);

          if (fallbackInsertError) {
            console.error(
              'Error inserting subscription from SUBSCRIPTION_CREATED fallback:',
              fallbackInsertError,
            );
          } else {
            console.log(
              'Subscription inserted from SUBSCRIPTION_CREATED fallback:',
              subscription.id,
            );
          }
        }
      } else {
        await supabaseAdmin
          .from('subscriptions')
          .update(subscriptionData)
          .eq('asaas_subscription_id', subscription.id);
        console.log('Subscription updated:', subscription.id);
      }
    }

    return jsonResponse({ received: true });

  } catch (error) {
    console.error('Error processing webhook:', error);

    if (supabaseAdmin && webhookEventRowId) {
      await updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed');
    }

    return jsonResponse({ error: 'Webhook processing failed', received: true });
  }
});
