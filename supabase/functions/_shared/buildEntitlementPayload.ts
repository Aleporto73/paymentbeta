// Shared builder for the outbound entitlement webhook payload.
// Single source of truth used by: asaas-webhook (queue), send-sale-webhook
// (manual resend) and test-webhook (signed test payload).
//
// Contract rules:
// - `entitlement.code` comes EXCLUSIVELY from products.entitlement_code.
//   If it is missing, no entitlement webhook must be sent (caller must skip
//   and log a sanitized error).
// - The payload is sanitized: no CPF/CNPJ, phone, state, IP, user-agent,
//   affiliate_code or net_value. Only what the receiver needs to grant access.
// - `product.id` is included for auditing only. Receivers must decide access
//   by `entitlement.code`, never by PaymentBeta internal ids.

import { SUBSCRIPTION_CYCLE_MONTHS } from "./subscriptionPeriod.ts";

export const ENTITLEMENT_EVENT_VERSION = "2026-06-10";

export interface EntitlementProductInput {
  id: string;
  unique_code: string | null;
  entitlement_code: string | null;
  product_type: string | null; // 'pagamento_unico' | 'recorrente'
}

export interface EntitlementPriceInput {
  id: string;
  unique_code: string | null;
  subscription_period: string | null; // 'mensal' | 'trimestral' | 'semestral' | 'anual'
}

export interface EntitlementTransactionInput {
  id: string;
  asaas_payment_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  status: string | null;
  billing_type: string | null;
  value: number | null;
  payment_date?: string | null;
  confirmed_date?: string | null;
}

export interface EntitlementSubscriptionInput {
  cycle?: string | null;
  current_period_end?: string | null;
  access_until?: string | null;
}

export interface BuildEntitlementPayloadArgs {
  event?: string;
  deliveryId: string;
  occurredAt?: string;
  transaction: EntitlementTransactionInput;
  product: EntitlementProductInput;
  price?: EntitlementPriceInput | null;
  subscription?: EntitlementSubscriptionInput | null;
  /**
   * When set, `entitlement.expires_at` is used verbatim instead of being
   * derived from the paid period.
   *
   * Cancellation passes the authoritative end of the already-paid window
   * (subscriptions.access_until). The period-based estimate below takes the
   * LATER of computed/subscription expiry so a renewal never shortens access —
   * correct for sale.confirmed, but wrong for a cancellation, where it could
   * extend access past what was actually paid for.
   */
  expiresAtOverride?: string | null;
  /**
   * PaymentBeta's own `subscriptions.id`, nested under `entitlement`.
   *
   * Additive within event_version 2026-06-10 — the receiver treats it as
   * optional. Omitting it is NOT neutral: the consumer then keys the billing
   * scope by transaction_id (`legacy_tx`), and since every renewal creates a new
   * transaction, every renewal would open a NEW independent scope. Send it
   * whenever the subscription is genuinely known; never fabricate it.
   */
  subscriptionId?: string | null;
  /**
   * Immutable cycle anchor (`transactions.due_date`), nested under
   * `entitlement`. Only meaningful for the renewal-failure event.
   */
  cycleFrom?: string | null;
  /**
   * Asaas payment status, verbatim, emitted as top-level `payment.status`.
   * The consumer reads it only for access_revoked, to tell a refund from a
   * chargeback by prefix. Pass the value straight from the webhook, not from a
   * possibly stale local row.
   */
  paymentStatus?: string | null;
  /** Short audit label (e.g. "refund", "chargeback"). Never PII. */
  reason?: string | null;
}

/** Trims to a non-empty string, or null. Keeps blanks out of the payload. */
const cleanText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const PERIOD_MAP: Record<string, string> = {
  mensal: "monthly",
  trimestral: "quarterly",
  semestral: "semiannual",
  anual: "yearly",
};

const PERIOD_MONTHS: Record<string, number> = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

const CYCLE_PERIOD_MAP: Record<string, string> = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  SEMIANNUALLY: "semiannual",
  YEARLY: "yearly",
};

export const toIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const addMonths = (start: Date, months: number): Date => {
  const result = new Date(start.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

export function buildEntitlementPayload(args: BuildEntitlementPayloadArgs) {
  const {
    event = "sale.confirmed",
    deliveryId,
    transaction,
    product,
    price = null,
    subscription = null,
  } = args;

  const entitlementCode = product.entitlement_code?.trim() ?? "";
  if (!entitlementCode) {
    throw new Error(
      `Product ${product.id} has no entitlement_code; entitlement webhook must be skipped`,
    );
  }

  const occurredAt = args.occurredAt ?? new Date().toISOString();
  const startsAt =
    toIsoOrNull(transaction.confirmed_date) ??
    toIsoOrNull(transaction.payment_date) ??
    occurredAt;

  const isLifetime = product.product_type === "pagamento_unico";
  const isRecurring = product.product_type === "recorrente";

  if (!isLifetime && !isRecurring) {
    throw new Error("Unsupported entitlement product type");
  }

  let entitlementPeriod: string | null = null;
  let expiresAt: string | null = null;

  if (isRecurring) {
    const rawPeriod = price?.subscription_period ?? null;
    const subscriptionCycle = subscription?.cycle ?? null;
    entitlementPeriod = subscription
      ? CYCLE_PERIOD_MAP[subscriptionCycle ?? ""] ?? null
      : rawPeriod
        ? PERIOD_MAP[rawPeriod] ?? null
        : null;

    const periodMonths = subscription
      ? SUBSCRIPTION_CYCLE_MONTHS[subscriptionCycle ?? ""] ?? null
      : rawPeriod
        ? PERIOD_MONTHS[rawPeriod] ?? null
        : null;

    if (args.expiresAtOverride !== undefined) {
      // The caller knows the authoritative end of access; never widen it.
      expiresAt = toIsoOrNull(args.expiresAtOverride);
    } else {
      // A persisted subscription window is authoritative and freezes the
      // entitlement independently from later product_prices edits. Prepaid
      // payments (such as annual PIX) have no subscription row and derive the
      // expiration from the immutable transaction start plus the price period.
      const computedExpiry = periodMonths
        ? addMonths(new Date(startsAt), periodMonths).toISOString()
        : null;
      const subscriptionExpiry =
        toIsoOrNull(subscription?.access_until) ??
        toIsoOrNull(subscription?.current_period_end);

      expiresAt = subscriptionExpiry ?? computedExpiry;
    }

    if (!entitlementPeriod) {
      throw new Error("Recurring entitlement requires a valid period");
    }

    if (!expiresAt) {
      throw new Error("Recurring entitlement requires a valid expiration");
    }
  }

  // Campos aditivos dentro da MESMA event_version. So entram no payload quando
  // ha valor real: enviar `undefined` some na serializacao, mas enviar `null`
  // sem necessidade obriga o receptor a distinguir "ausente" de "nulo" sem
  // motivo.
  const subscriptionId = cleanText(args.subscriptionId);
  const cycleFrom = cleanText(args.cycleFrom);
  const paymentStatus = cleanText(args.paymentStatus);
  const reason = cleanText(args.reason);

  return {
    event,
    event_version: ENTITLEMENT_EVENT_VERSION,
    delivery_id: deliveryId,
    occurred_at: occurredAt,
    transaction_id: transaction.id,
    asaas_payment_id: transaction.asaas_payment_id,
    entitlement: {
      code: entitlementCode,
      type: isLifetime ? "lifetime" : "subscription",
      period: isLifetime ? null : entitlementPeriod,
      starts_at: startsAt,
      expires_at: isLifetime ? null : expiresAt,
      ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
      ...(cycleFrom ? { cycle_from: cycleFrom } : {}),
    },
    customer: {
      email: transaction.customer_email,
      name: transaction.customer_name,
    },
    ...(reason ? { reason } : {}),
    payment: {
      // O status do webhook vence o da linha local, que pode estar defasada na
      // corrida. Sem override, mantem-se o comportamento anterior.
      status: paymentStatus ?? transaction.status,
      billing_type: transaction.billing_type,
      value: transaction.value,
    },
    product: {
      id: product.id,
      unique_code: product.unique_code,
      entitlement_code: entitlementCode,
    },
    price: price
      ? {
        id: price.id,
        code: price.unique_code,
        subscription_period: price.subscription_period,
      }
      : null,
  };
}
