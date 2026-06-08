// Edge function: generate-subscription-token
//
// Generates a high-entropy raw token tied to a subscription for self-service
// customer management (cancellation, support, etc.) and stores ONLY the
// SHA-256 hash of that token in public.subscription_tokens.
//
// IMPORTANT security contract:
//   * The raw token is returned in the JSON response of THIS function and
//     NOWHERE ELSE. It is NEVER persisted by name, plaintext or otherwise.
//   * Database holds only `token_hash`. Future verification functions must
//     hash the incoming candidate with the same algorithm and compare.
//   * If the caller (admin/support tooling, e-mail sender) loses this single
//     response, the only recovery path is to rotate (generate a new token);
//     it is not possible to recover the raw token from the database.
//
// This function is admin-only. Customer-facing endpoints (cancel, manage)
// will live in separate edge functions and validate the token using the
// service role to read subscription_tokens; this function does NOT create a
// customer auth path.

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

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

const ALLOWED_PURPOSES = new Set([
  'customer_manage',
  'customer_cancel',
  'support',
]);

const DEFAULT_EXPIRES_IN_DAYS = 365;
const MIN_EXPIRES_IN_DAYS = 1;
// Defensive ceiling. The CHECK constraint on `purpose` already bounds usage,
// but we also want to keep TTLs sane (no "1000-year" tokens by accident).
const MAX_EXPIRES_IN_DAYS = 3650;
// 32 random bytes -> ~43 base64url characters -> 256 bits of entropy.
const TOKEN_RANDOM_BYTES = 32;

interface GenerateTokenRequest {
  subscription_id?: unknown;
  purpose?: unknown;
  expires_in_days?: unknown;
}

// Convert raw bytes to base64url (RFC 4648 section 5): URL-safe, no padding.
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

// SHA-256 of a utf-8 string, hex-encoded. Hex is chosen over base64 here
// because future verification code reads more obviously when comparing
// fixed-width strings and Postgres indexes pure-ASCII deterministically.
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

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase env not configured');
      return jsonResponse({ error: 'Server misconfigured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Authentication: extract Bearer JWT from the caller.
    const token = getBearerToken(req);

    if (!token) {
      return jsonResponse({ error: 'Nao autorizado' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return jsonResponse({ error: 'Nao autorizado' }, 401);
    }

    // 2) Authorization: caller must hold the `admin` role. Same pattern as
    //    `cancel-subscription` / other admin-only functions in this project.
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Error checking admin role:', rolesError);
      return jsonResponse({ error: 'Acesso negado' }, 403);
    }

    if (!roles?.some(({ role }) => role === 'admin')) {
      return jsonResponse({ error: 'Acesso negado' }, 403);
    }

    // 3) Parse + validate input.
    let body: GenerateTokenRequest;
    try {
      body = (await req.json()) as GenerateTokenRequest;
    } catch (_parseError) {
      return jsonResponse({ error: 'JSON invalido' }, 400);
    }

    const subscriptionIdRaw = typeof body.subscription_id === 'string'
      ? body.subscription_id.trim()
      : '';

    if (!subscriptionIdRaw) {
      return jsonResponse({ error: 'subscription_id e obrigatorio' }, 400);
    }

    if (!isUuidLike(subscriptionIdRaw)) {
      return jsonResponse({ error: 'subscription_id invalido' }, 400);
    }

    let purpose = 'customer_manage';
    if (body.purpose !== undefined && body.purpose !== null) {
      if (typeof body.purpose !== 'string' || !ALLOWED_PURPOSES.has(body.purpose)) {
        return jsonResponse({ error: 'purpose invalido' }, 400);
      }
      purpose = body.purpose;
    }

    // Decision: tokens MUST expire in this phase. A literal null or undefined
    // falls back to DEFAULT_EXPIRES_IN_DAYS; non-numeric, non-integer, or
    // out-of-range values are rejected so callers never get a stale or
    // "forever" token by accident.
    let expiresInDays = DEFAULT_EXPIRES_IN_DAYS;
    if (body.expires_in_days !== undefined && body.expires_in_days !== null) {
      const parsed = Number(body.expires_in_days);

      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        return jsonResponse({ error: 'expires_in_days invalido' }, 400);
      }

      if (parsed < MIN_EXPIRES_IN_DAYS || parsed > MAX_EXPIRES_IN_DAYS) {
        return jsonResponse({
          error: `expires_in_days fora do intervalo permitido (${MIN_EXPIRES_IN_DAYS}-${MAX_EXPIRES_IN_DAYS})`,
        }, 400);
      }

      expiresInDays = parsed;
    }

    // 4) Verify the subscription exists. We do not (yet) restrict by product
    //    ownership: this function is admin-only and is the trusted source.
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', subscriptionIdRaw)
      .maybeSingle();

    if (subscriptionError) {
      console.error('Error fetching subscription:', subscriptionError);
      return jsonResponse({ error: 'Erro ao consultar assinatura' }, 500);
    }

    if (!subscription) {
      return jsonResponse({ error: 'Assinatura nao encontrada' }, 404);
    }

    // 5) Generate the raw token. Web Crypto's getRandomValues is the same CSPRNG
    //    backing Deno's `crypto.randomUUID` / `crypto.subtle`.
    //    *** RAW TOKEN IS NEVER PERSISTED. It exists only in this response. ***
    const rawBytes = new Uint8Array(TOKEN_RANDOM_BYTES);
    crypto.getRandomValues(rawBytes);
    const rawToken = bytesToBase64Url(rawBytes);

    // 6) Hash the raw token. Only the hash hits the database.
    const tokenHash = await sha256Hex(rawToken);

    // 7) Compute expires_at server-side (caller cannot inject a date).
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // 8) Resolve `created_by`: prefer admin e-mail for human auditability, fall
    //    back to user id when e-mail is not present on the JWT.
    const createdBy = (typeof user.email === 'string' && user.email.trim().length > 0)
      ? user.email.trim()
      : user.id;

    // 9) Persist ONLY the hash + metadata. The raw token never goes in.
    const { data: tokenRow, error: insertError } = await supabase
      .from('subscription_tokens')
      .insert({
        subscription_id: subscriptionIdRaw,
        token_hash: tokenHash,
        purpose,
        expires_at: expiresAt.toISOString(),
        created_by: createdBy,
        metadata: {
          source: 'generate-subscription-token',
          expires_in_days: expiresInDays,
        },
      })
      .select('id, subscription_id, purpose, expires_at, created_at')
      .single();

    if (insertError) {
      console.error('Error inserting subscription token:', insertError);
      return jsonResponse({ error: 'Erro ao salvar token' }, 500);
    }

    // 10) Return the raw token. This is THE ONLY moment it is exposed.
    //     Subsequent reads of the row will only ever yield the hash.
    return jsonResponse({
      success: true,
      token: rawToken,
      token_id: tokenRow.id,
      subscription_id: tokenRow.subscription_id,
      purpose: tokenRow.purpose,
      expires_at: tokenRow.expires_at,
      created_at: tokenRow.created_at,
    }, 200);
  } catch (error) {
    console.error('Unexpected error in generate-subscription-token:', error);
    return jsonResponse({ error: 'Erro interno do servidor' }, 500);
  }
});
