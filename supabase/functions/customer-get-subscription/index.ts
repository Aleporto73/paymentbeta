// Edge function: customer-get-subscription
//
// Read-only customer self-service endpoint. The caller presents a raw
// management token previously issued by `generate-subscription-token`. We
// hash the token with SHA-256, find the matching row in
// `subscription_tokens`, and return safe-for-display subscription details
// plus product/plan metadata.
//
// Scope of this function:
//   * NO Asaas call.
//   * NO mutation of `subscriptions`.
//   * The ONLY write is `last_used_at` on the token row (audit only).
//
// SECURITY:
//   * Raw token is never logged or echoed.
//   * SHA-256 hash of the token is never logged.
//   * All token-failure paths return the same generic 401 so callers cannot
//     distinguish unknown / revoked / expired / wrong purpose.
//   * Asaas-internal fields (asaas_subscription_id, asaas_customer_id, raw
//     payloads, card data) are NEVER returned to the caller.
//   * Internal UUIDs (subscription.id, product_id, product_price_id) are
//     intentionally omitted from the response.
//   * Runs with verify_jwt = false; authority comes from the token-hash
//     check against the RLS-protected subscription_tokens table.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Single canonical response for any token failure. Mirrors the language used
// in customer-cancel-subscription so the two endpoints feel consistent and
// reveal zero detail about why validation failed.
const tokenInvalidResponse = () =>
  jsonResponse({ success: false, error: 'Token invalido ou expirado' }, 401);

// Read tokens accept all three purposes. Cancellation is gated separately
// by customer-cancel-subscription, which only accepts customer_manage and
// customer_cancel.
const ALLOWED_TOKEN_PURPOSES = ['customer_manage', 'customer_cancel', 'support'];

// Both spellings just in case upstream emits either; defensive for Asaas
// drift on the status field.
const CANCELLED_OR_INACTIVE_STATUSES = new Set([
  'CANCELED',
  'CANCELLED',
  'INACTIVE',
  'EXPIRED',
  'DELETED',
]);

// SHA-256 hex of a utf-8 string. MUST match the algorithm used in
// `generate-subscription-token/index.ts` and `customer-cancel-subscription`
// so hashes line up across functions.
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

const isSubscriptionCancelled = (sub: any) => {
  if (sub?.cancel_at_period_end === true) return true;
  if (sub?.cancelled_at) return true;
  if (sub?.ended_at) return true;
  if (
    typeof sub?.status === 'string' &&
    CANCELLED_OR_INACTIVE_STATUSES.has(sub.status)
  ) {
    return true;
  }
  return false;
};

// Embedded PostgREST resources can come back as either a single object or an
// array depending on the relationship metadata. Normalize to a single object
// (or null) for both products and product_prices, which are 1:1 from a
// subscription row's perspective.
const extractRelated = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined) ?? null;
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
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
      console.error('Supabase env not configured for customer-get-subscription');
      return jsonResponse({ success: false, error: 'Server misconfigured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Parse + validate body. The only required input is `token`.
    let body: { token?: unknown };
    try {
      body = await req.json();
    } catch (_parseError) {
      return jsonResponse({ success: false, error: 'JSON invalido' }, 400);
    }

    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    if (!rawToken) {
      return jsonResponse({ success: false, error: 'Token obrigatorio' }, 400);
    }

    // 2) Hash the raw token. From here on we operate only on the hash. The
    //    raw token and the hash are NEVER logged.
    const tokenHash = await sha256Hex(rawToken);
    const nowIso = new Date().toISOString();

    // 3) Look up the token row. All failure modes (missing / unknown /
    //    revoked / expired / wrong purpose) collapse to the same 401.
    const { data: tokenRow, error: tokenLookupError } = await supabase
      .from('subscription_tokens')
      .select('id, subscription_id, purpose')
      .eq('token_hash', tokenHash)
      .in('purpose', ALLOWED_TOKEN_PURPOSES)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .maybeSingle();

    if (tokenLookupError) {
      // Log only the error envelope; no token, no hash.
      console.error('Error looking up subscription token:', tokenLookupError);
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    if (!tokenRow) {
      return tokenInvalidResponse();
    }

    // 4) Stamp last_used_at. Non-fatal on failure: read still proceeds.
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

    // 5) Load the subscription together with safe product/plan metadata via
    //    PostgREST embedded resources. We deliberately do NOT select
    //    asaas_subscription_id, asaas_customer_id, or any payload field.
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select(
        'status, access_until, current_period_start, current_period_end, '
          + 'cancel_at_period_end, cancellation_requested_at, cancelled_at, ended_at, '
          + 'next_due_date, cycle, value, billing_type, '
          + 'products ( name ), '
          + 'product_prices ( name, subscription_period, price )',
      )
      .eq('id', tokenRow.subscription_id)
      .maybeSingle();

    if (subscriptionError) {
      console.error('Error loading subscription:', subscriptionError);
      return jsonResponse({ success: false, error: 'Erro interno' }, 500);
    }

    if (!subscription) {
      // Token pointed to a subscription that no longer exists. From the
      // caller's perspective this is indistinguishable from a bad token.
      return tokenInvalidResponse();
    }

    // 6) Compute display flags. is_cancelled and can_cancel are derived
    //    from the same predicate so the two booleans cannot disagree.
    //    The supabase-js client narrows the success value of `.maybeSingle()`
    //    with embedded resources to a shape that Deno's TS check rejects when
    //    we read joined fields. Cast once to a permissive record so every
    //    subsequent read goes through the same well-typed handle.
    const subscriptionRow = subscription as unknown as Record<string, any>;

    const cancelled = isSubscriptionCancelled(subscriptionRow);

    const productRow = extractRelated(subscriptionRow.products);
    const priceRow = extractRelated(subscriptionRow.product_prices);

    return jsonResponse(
      {
        success: true,
        subscription: {
          status: subscriptionRow.status ?? null,
          access_until: subscriptionRow.access_until ?? null,
          current_period_start: subscriptionRow.current_period_start ?? null,
          current_period_end: subscriptionRow.current_period_end ?? null,
          cancel_at_period_end: subscriptionRow.cancel_at_period_end === true,
          cancellation_requested_at: subscriptionRow.cancellation_requested_at ?? null,
          cancelled_at: subscriptionRow.cancelled_at ?? null,
          ended_at: subscriptionRow.ended_at ?? null,
          next_due_date: subscriptionRow.next_due_date ?? null,
          cycle: subscriptionRow.cycle ?? null,
          value: subscriptionRow.value ?? null,
          billing_type: subscriptionRow.billing_type ?? null,
          is_cancelled: cancelled,
          can_cancel: !cancelled,
        },
        product: {
          name: typeof productRow?.name === 'string' ? productRow.name : null,
          price_name: typeof priceRow?.name === 'string' ? priceRow.name : null,
          subscription_period:
            typeof priceRow?.subscription_period === 'string'
              ? priceRow.subscription_period
              : null,
          price_value:
            typeof priceRow?.price === 'number' ? priceRow.price : null,
        },
      },
      200,
    );
  } catch (error) {
    // Final generic catch. Stack trace never leaves the function.
    console.error('Unexpected error in customer-get-subscription:', error);
    return jsonResponse(
      { success: false, error: 'Erro interno do servidor' },
      500,
    );
  }
});
