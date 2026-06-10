// Shared HMAC SHA-256 signing for outbound PaymentBeta webhooks.
//
// Signing rule (must match the future Psico2 receiver):
//   signed_payload = `${timestamp}.${delivery_id}.${raw_body}`
//   signature      = hex(hmac_sha256(webhook_secret, signed_payload))
//   header         = X-PaymentBeta-Signature: sha256=<hex>
//
// CRITICAL: the exact `rawBody` string passed here MUST be the exact string
// sent as the fetch body. Never re-serialize the JSON after signing.
// The receiver must validate against the raw request body it receives.

export const PAYMENTBETA_WEBHOOK_USER_AGENT = "PaymentBeta-Webhook/1.0";

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface SignedWebhookRequest {
  timestamp: string;
  signature: string; // hex, without the sha256= prefix
  headers: Record<string, string>;
}

export async function signWebhookRequest(args: {
  secret: string;
  event: string;
  eventVersion: string;
  deliveryId: string;
  rawBody: string;
  extraHeaders?: Record<string, string>;
}): Promise<SignedWebhookRequest> {
  const { secret, event, eventVersion, deliveryId, rawBody, extraHeaders } = args;

  if (!secret) {
    throw new Error("webhook_secret is required to sign webhook request");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${timestamp}.${deliveryId}.${rawBody}`;
  const signature = await hmacSha256Hex(secret, signedPayload);

  return {
    timestamp,
    signature,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": PAYMENTBETA_WEBHOOK_USER_AGENT,
      "X-PaymentBeta-Event": event,
      "X-PaymentBeta-Delivery": deliveryId,
      "X-PaymentBeta-Timestamp": timestamp,
      "X-PaymentBeta-Signature": `sha256=${signature}`,
      "X-PaymentBeta-Version": eventVersion,
      ...(extraHeaders ?? {}),
    },
  };
}

// Public headers safe to persist in webhook_logs.request_headers.
// The signature is truncated so logs cannot be replayed; the secret is never
// part of any header.
export function buildAuditableHeaders(sent: SignedWebhookRequest, event: string, eventVersion: string, deliveryId: string): Record<string, string> {
  return {
    "X-PaymentBeta-Event": event,
    "X-PaymentBeta-Delivery": deliveryId,
    "X-PaymentBeta-Timestamp": sent.timestamp,
    "X-PaymentBeta-Signature": `sha256=${sent.signature.slice(0, 12)}...`,
    "X-PaymentBeta-Version": eventVersion,
  };
}
