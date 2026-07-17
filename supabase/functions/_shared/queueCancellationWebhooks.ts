// Shared queueing for the outbound `subscription.cancelled` entitlement webhook.
//
// Used by BOTH cancellation paths, which must emit an identical contract:
//   * cancel-subscription           (admin)
//   * customer-cancel-subscription  (customer self-service)
//
// Mirrors asaas-webhook's sale.confirmed queueing. Contract rules:
// - `entitlement.code` comes EXCLUSIVELY from products.entitlement_code. Without
//   it nothing is sent and a sanitized skip is logged (no secret, no PII).
// - The queue row writes event/event_version/delivery_id/transaction_id/
//   product_webhook_id EXPLICITLY. process-webhook-queue reads the event from
//   the column to build the signed `X-PaymentBeta-Event` header, so omitting it
//   would silently label a cancellation as the column default 'sale.confirmed'.
// - Cancelling stops the next renewal; it never revokes on the spot.
//   `entitlement.expires_at` is the end of the period already paid for, so the
//   receiver keeps access alive while expires_at is in the future.

import {
  buildEntitlementPayload,
  ENTITLEMENT_EVENT_VERSION,
  toIsoOrNull,
} from "./buildEntitlementPayload.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

export const CANCELLATION_EVENT = "subscription.cancelled";

export const CUSTOMER_CANCELLATION_SUBSCRIPTION_SELECT =
  "id, asaas_subscription_id, status, access_until, cancel_at_period_end, cancelled_at, ended_at, product_id, product_price_id, cycle, current_period_end, last_payment_id";

// Only the subscription fields this flow reads. Both callers already select
// `*` or an explicit superset of these.
export interface CancellationSubscriptionRow {
  id: string;
  product_id: string | null;
  product_price_id: string | null;
  cycle: string | null;
  access_until: string | null;
  current_period_end: string | null;
  last_payment_id: string | null;
}

const isNullableString = (value: unknown) => value === null || typeof value === "string";

export const isCancellationSubscriptionRow = (
  value: unknown,
): value is CancellationSubscriptionRow => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;

  return typeof row.id === "string" &&
    isNullableString(row.product_id) &&
    isNullableString(row.product_price_id) &&
    isNullableString(row.cycle) &&
    isNullableString(row.access_until) &&
    isNullableString(row.current_period_end) &&
    isNullableString(row.last_payment_id) &&
    "cycle" in row &&
    "access_until" in row &&
    "current_period_end" in row;
};

export interface QueueCancellationResult {
  queued: number;
  /** Human-readable reason when nothing was queued; null on the happy path. */
  skipped: string | null;
}

/**
 * Queue one signed `subscription.cancelled` entitlement webhook per active
 * destination of the subscription's product.
 *
 * Never throws: by the time it runs, Asaas is already cancelled and the local
 * row is updated. A webhook problem must not turn a successful cancellation
 * into an error for the caller.
 */
export async function queueCancellationWebhooks(
  supabase: SupabaseClient,
  subscription: CancellationSubscriptionRow,
  cancelledAt: string,
): Promise<QueueCancellationResult> {
  try {
    if (!subscription.product_id) {
      return { queued: 0, skipped: "subscription has no product_id" };
    }

    const { data: webhooks, error: webhooksError } = await supabase
      .from("product_webhooks")
      .select("id, webhook_url")
      .eq("product_id", subscription.product_id)
      .eq("is_active", true);

    if (webhooksError) {
      console.error("Error fetching product webhooks for cancellation:", webhooksError);
      return { queued: 0, skipped: "error fetching product webhooks" };
    }

    if (!webhooks || webhooks.length === 0) {
      return { queued: 0, skipped: null };
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, unique_code, entitlement_code, product_type")
      .eq("id", subscription.product_id)
      .single();

    if (productError || !product) {
      console.error("Error fetching product for cancellation webhook:", productError);
      return { queued: 0, skipped: "error fetching product" };
    }

    // Safety rule: without an explicit entitlement_code there is no reliable
    // entitlement to revoke. Skip and leave an auditable trail. The log carries
    // the event and the internal subscription id only -- no customer data.
    if (!product.entitlement_code || !String(product.entitlement_code).trim()) {
      const reason = "skipped: product has no entitlement_code configured";
      console.error(
        `Skipping cancellation webhook: product ${product.id} has no entitlement_code configured`,
      );

      await supabase.from("webhook_logs").insert(
        webhooks.map((webhook) => ({
          product_id: subscription.product_id,
          webhook_url: webhook.webhook_url,
          payload: { event: CANCELLATION_EVENT, subscription_id: subscription.id },
          response_status: null,
          response_body: reason,
          success: false,
          event: CANCELLATION_EVENT,
          event_version: ENTITLEMENT_EVENT_VERSION,
        })),
      );

      return { queued: 0, skipped: reason };
    }

    // The paid transaction that granted the access being cancelled.
    // subscriptions.last_payment_id holds the Asaas payment id; there is no
    // transactions.subscription_id column, so this is the only bridge. It also
    // supplies customer identity and the queue dedup key.
    const { data: transaction, error: transactionError } = subscription.last_payment_id
      ? await supabase
        .from("transactions")
        .select(
          "id, asaas_payment_id, customer_name, customer_email, status, billing_type, value, payment_date, confirmed_date, price_id",
        )
        .eq("asaas_payment_id", subscription.last_payment_id)
        .maybeSingle()
      : { data: null, error: null };

    // A lookup failure is NOT "nothing to revoke": the transaction may well
    // exist. Bail out loudly instead of silently skipping the revocation.
    // Logs the error envelope and the internal subscription id only.
    if (transactionError) {
      console.error(
        `Error fetching paid transaction for subscription ${subscription.id}:`,
        transactionError,
      );
      return { queued: 0, skipped: "error fetching paid transaction" };
    }

    if (!transaction) {
      // No paid transaction means no sale.confirmed was ever delivered, so the
      // receiver never granted access and there is nothing to revoke.
      const reason = "skipped: subscription has no paid transaction to revoke";
      console.log(`${reason} (subscription ${subscription.id})`);
      return { queued: 0, skipped: reason };
    }

    let price = null;
    const priceId = subscription.product_price_id ?? transaction.price_id ?? null;
    if (priceId) {
      const { data: priceData } = await supabase
        .from("product_prices")
        .select("id, unique_code, subscription_period")
        .eq("id", priceId)
        .maybeSingle();
      price = priceData ?? null;
    }

    // Authoritative end of the paid window. Falls back to current_period_end and
    // finally to the cancellation instant, which means "access ends now".
    // Deliberately never null: a null expires_at reads as "never expires" on the
    // receiver, which on a cancellation would grant access instead of ending it.
    const expiresAt = toIsoOrNull(subscription.access_until) ??
      toIsoOrNull(subscription.current_period_end) ??
      cancelledAt;

    let queued = 0;
    let skippedReason: string | null = null;
    for (const webhook of webhooks) {
      const deliveryId = crypto.randomUUID();

      let payload;
      try {
        payload = buildEntitlementPayload({
          event: CANCELLATION_EVENT,
          deliveryId,
          occurredAt: cancelledAt,
          transaction,
          product,
          price,
          subscription,
          expiresAtOverride: expiresAt,
        });
      } catch {
        skippedReason = "skipped: invalid recurring entitlement period or expiration";
        console.error(
          `Skipping cancellation entitlement for subscription ${subscription.id}: ${skippedReason}`,
        );
        await supabase.from("webhook_logs").insert({
          product_id: subscription.product_id,
          webhook_url: webhook.webhook_url,
          payload: { event: CANCELLATION_EVENT, subscription_id: subscription.id },
          response_status: null,
          response_body: skippedReason,
          success: false,
          event: CANCELLATION_EVENT,
          event_version: ENTITLEMENT_EVENT_VERSION,
        });
        continue;
      }

      const { error: queueError } = await supabase.from("webhook_queue").insert({
        product_id: subscription.product_id,
        product_webhook_id: webhook.id,
        webhook_url: webhook.webhook_url,
        payload,
        status: "pending",
        delivery_id: deliveryId,
        event: CANCELLATION_EVENT,
        event_version: ENTITLEMENT_EVENT_VERSION,
        transaction_id: transaction.id,
      });

      if (queueError) {
        // 23505 = unique violation on (transaction_id, event, webhook_url):
        // this cancellation is already queued for this destination. Benign and
        // expected -- an admin and the customer can cancel the same subscription,
        // and a retried cancellation must not enqueue a second revocation.
        if (queueError.code === "23505") {
          console.log(
            `Cancellation already queued for subscription ${subscription.id} -> ${webhook.webhook_url}, skipping duplicate`,
          );
        } else {
          console.error("Error queuing cancellation webhook:", queueError);
        }
        continue;
      }

      queued++;
    }

    if (queued > 0) {
      // Fire and forget: the queue row is the source of truth, and the processor
      // picks up anything this nudge misses.
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-webhook-queue`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
      }).catch(console.error);
    }

    return { queued, skipped: queued === 0 ? skippedReason : null };
  } catch (error) {
    console.error("Unexpected error queuing cancellation webhooks:", error);
    return { queued: 0, skipped: "unexpected error queuing cancellation webhooks" };
  }
}
