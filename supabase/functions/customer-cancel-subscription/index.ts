// Edge function: customer-cancel-subscription
//
// Customer self-service cancellation flow. The caller presents a raw
// management token previously issued by `generate-subscription-token`. We
// hash the raw token with SHA-256, look up the matching row in
// `subscription_tokens`, and only then act on the linked subscription:
// cancel the recurring charge at Asaas and mark cancellation locally.
//
// IMPORTANT semantics:
//   * access_until is NEVER touched here. The customer keeps access until
//     the period they already paid for ends.
//   * ended_at is only set when access_until is missing or already in the
//     past; otherwise it stays null so downstream consumers continue to
//     honor the paid period.
//   * The flow is idempotent: a subscription that is already cancelled
//     locally returns success without re-calling Asaas.
//
// SECURITY notes:
//   * Raw token is never logged. The SHA-256 hash is never logged either.
//   * All token-failure paths (missing / unknown / revoked / expired /
//     wrong purpose) return the same generic 401 message so callers cannot
//     distinguish failure modes.
//   * The function runs with `verify_jwt = false`. Authority comes entirely
//     from the token-hash check against subscription_tokens. The table is
//     RLS-protected (admin-only) and unreachable from the frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';
import {
  CUSTOMER_CANCELLATION_SUBSCRIPTION_SELECT,
  type CancellationSubscriptionRow,
  isCancellationSubscriptionRow,
  queueCancellationWebhooks,
} from '../_shared/queueCancellationWebhooks.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Single canonical response for any token failure. Mirrors the pattern of
// other admin-only flows while exposing zero detail about why validation
// failed (unknown vs revoked vs expired vs wrong purpose).
const tokenInvalidResponse = () =>
  jsonResponse({ success: false, error: 'Token invalido ou expirado' }, 401);

const ALLOWED_TOKEN_PURPOSES = ['customer_manage', 'customer_cancel'];

// Both spellings just in case upstream emits either; defensive for Asaas
// drift on the status field of subscriptions.
const CANCELLED_OR_INACTIVE_STATUSES = new Set([
  'CANCELED',
  'CANCELLED',
  'INACTIVE',
  'EXPIRED',
  'DELETED',
]);

interface CustomerCancellationSubscriptionRow extends CancellationSubscriptionRow {
  asaas_subscription_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean | null;
  cancelled_at: string | null;
  ended_at: string | null;
}

const isCustomerCancellationSubscriptionRow = (
  value: unknown,
): value is CustomerCancellationSubscriptionRow => {
  if (!isCancellationSubscriptionRow(value)) return false;
  const row = value as Record<string, unknown>;

  return (row.asaas_subscription_id === null || typeof row.asaas_subscription_id === 'string') &&
    (row.status === null || typeof row.status === 'string') &&
    (row.cancel_at_period_end === null || typeof row.cancel_at_period_end === 'boolean') &&
    (row.cancelled_at === null || typeof row.cancelled_at === 'string') &&
    (row.ended_at === null || typeof row.ended_at === 'string');
};

// SHA-256 hex of a utf-8 string. MUST match the algorithm used in
// `generate-subscription-token/index.ts` exactly, otherwise hashes will
// never line up.
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

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isAccessUntilInFuture = (accessUntil: unknown) => {
  const parsed = parseDate(accessUntil);
  return parsed !== null && parsed.getTime() > Date.now();
};

const isAlreadyCancelled = (subscription: {
  cancel_at_period_end?: boolean | null;
  cancelled_at?: string | null;
  status?: string | null;
}) => {
  if (subscription?.cancel_at_period_end === true) return true;
  if (subscription?.cancelled_at) return true;
  if (
    typeof subscription?.status === 'string' &&
    CANCELLED_OR_INACTIVE_STATUSES.has(subscription.status)
  ) {
    return true;
  }
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase env not configured for customer-cancel-subscription');
      return jsonResponse({ success: false, error: 'Server misconfigured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Parse + validate body.
    let body: { token?: unknown; confirm?: unknown };
    try {
      body = await req.json();
    } catch (_parseError) {
      return jsonResponse({ success: false, error: 'JSON invalido' }, 400);
    }

    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    if (!rawToken) {
      return jsonResponse({ success: false, error: 'Token obrigatorio' }, 400);
    }

    if (body.confirm !== true) {
      return jsonResponse(
        { success: false, error: 'Confirmacao obrigatoria' },
        400,
      );
    }

    // 2) Hash the raw token. From here on we operate only on the hash. The
    //    raw token is NEVER persisted, logged, or echoed back. The hash is
    //    also never logged.
    const tokenHash = await sha256Hex(rawToken);

    // 3) Look up the token. All failure modes map to the same generic 401.
    //    Filters: hash matches, purpose is one we accept for customer-driven
    //    cancellation, not revoked, not expired.
    const nowIso = new Date().toISOString();

    const { data: tokenRow, error: tokenLookupError } = await supabase
      .from('subscription_tokens')
      .select('id, subscription_id, purpose, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .in('purpose', ALLOWED_TOKEN_PURPOSES)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .maybeSingle();

    if (tokenLookupError) {
      // Log only the error envelope (no token, no hash).
      console.error('Error looking up subscription token:', tokenLookupError);
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    if (!tokenRow) {
      return tokenInvalidResponse();
    }

    // 4) Stamp last_used_at. Failure here is non-fatal; log only.
    {
      const { error: usageError } = await supabase
        .from('subscription_tokens')
        .update({ last_used_at: nowIso })
        .eq('id', tokenRow.id);

      if (usageError) {
        console.error(
          'Error stamping last_used_at on subscription token:',
          usageError,
        );
      }
    }

    // 5) Load the subscription this token unlocks.
    const { data: subscriptionData, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select(CUSTOMER_CANCELLATION_SUBSCRIPTION_SELECT)
      .eq('id', tokenRow.subscription_id)
      .maybeSingle();

    if (subscriptionError) {
      console.error('Error loading subscription:', subscriptionError);
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    if (!subscriptionData) {
      // Token pointed to a subscription that no longer exists. From the
      // caller's perspective this is indistinguishable from a bad token.
      return tokenInvalidResponse();
    }

    if (!isCustomerCancellationSubscriptionRow(subscriptionData)) {
      console.error(
        'Subscription query returned an incomplete cancellation row:',
        tokenRow.subscription_id,
      );
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    const subscription = subscriptionData;

    // 6) Idempotency. If the subscription is already in a cancelled or
    //    inactive state, do NOT call Asaas again. Return success with a
    //    clear `already_cancelled: true` flag and keep access_until intact.
    if (isAlreadyCancelled(subscription)) {
      return jsonResponse(
        {
          success: true,
          already_cancelled: true,
          message:
            'Assinatura ja estava cancelada. Acesso permanece ativo ate o fim do periodo pago.',
          access_until: subscription.access_until ?? null,
        },
        200,
      );
    }

    if (!subscription.asaas_subscription_id) {
      // Defensive: a subscription row without an Asaas id cannot be cancelled
      // upstream. Treat as an internal error rather than silently succeeding.
      console.error(
        'Subscription has no asaas_subscription_id; cannot cancel upstream:',
        subscription.id,
      );
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    // 7) Fetch Asaas integration credentials. Single-account architecture,
    //    same pattern used by the admin `cancel-subscription` flow.
    const { data: integration, error: integrationError } = await supabase
      .from('integration_settings')
      .select('production_api_key, sandbox_api_key, is_sandbox')
      .eq('integration_name', 'asaas')
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      console.error(
        'Asaas integration not configured for cancellation:',
        integrationError,
      );
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    const apiKey = integration.is_sandbox
      ? integration.sandbox_api_key
      : integration.production_api_key;

    if (!apiKey) {
      console.error('Missing Asaas API key for cancellation');
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    const asaasBaseUrl = integration.is_sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';

    // 8) Cancel at Asaas via DELETE /subscriptions/{id} -- same call the admin
    //    flow performs.
    const asaasResponse = await fetch(
      `${asaasBaseUrl}/subscriptions/${subscription.asaas_subscription_id}`,
      {
        method: 'DELETE',
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!asaasResponse.ok) {
      // Read the body for server-side logs only; do NOT echo it back to the
      // caller to avoid leaking Asaas internals.
      const responseText = await asaasResponse.text();
      console.error(
        'Asaas cancellation failed:',
        asaasResponse.status,
        responseText,
      );
      return jsonResponse(
        {
          success: false,
          error:
            'Nao foi possivel cancelar a assinatura agora. Tente novamente em instantes.',
        },
        502,
      );
    }

    // 9) Persist local cancellation. We deliberately do NOT touch:
    //      access_until
    //      current_period_start
    //      current_period_end
    //      last_payment_id
    //      last_payment_status
    //      last_paid_at
    //    These remain valid records of the paid period the customer keeps.
    const cancellationStampIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      cancel_at_period_end: true,
      cancellation_requested_at: cancellationStampIso,
      status: 'CANCELED',
      cancelled_at: cancellationStampIso,
      updated_at: cancellationStampIso,
    };

    // `ended_at` only triggers immediately when access_until is missing or in
    // the past. If access_until is in the future, we leave ended_at null so
    // downstream consumers keep honoring the paid period.
    if (!isAccessUntilInFuture(subscription.access_until)) {
      updatePayload.ended_at = cancellationStampIso;
    }

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update(updatePayload)
      .eq('id', subscription.id);

    if (updateError) {
      // Asaas already cancelled but local update failed. Surface a non-fatal
      // error so support can reconcile manually. Do not retry blindly.
      console.error(
        'Asaas cancelled but local update failed; manual reconciliation may be needed:',
        updateError,
      );
      return jsonResponse(
        {
          success: false,
          error:
            'Cancelamento processado, mas houve falha ao atualizar o sistema. Suporte foi notificado.',
        },
        500,
      );
    }

    // 10) Notify the entitlement receiver. `subscription` still holds the
    //     pre-update row, which is exactly what we want: the update above
    //     deliberately leaves access_until untouched, so it remains the
    //     authoritative end of the paid window. Never throws, and a queueing
    //     problem must not turn a successful cancellation into an error.
    await queueCancellationWebhooks(
      supabase,
      subscription,
      cancellationStampIso,
    );

    return jsonResponse(
      {
        success: true,
        message:
          'Assinatura cancelada. Acesso permanece ativo ate o fim do periodo pago.',
        access_until: subscription.access_until ?? null,
        cancel_at_period_end: true,
      },
      200,
    );
  } catch (error) {
    // Final generic catch. Stack trace is never sent back to the caller.
    console.error('Unexpected error in customer-cancel-subscription:', error);
    return jsonResponse(
      { success: false, error: 'Erro interno do servidor' },
      500,
    );
  }
});
