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
}

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

  let entitlementPeriod: string | null = null;
  let expiresAt: string | null = null;

  if (!isLifetime) {
    const rawPeriod = price?.subscription_period ?? null;
    entitlementPeriod = rawPeriod ? PERIOD_MAP[rawPeriod] ?? rawPeriod : null;

    if (args.expiresAtOverride !== undefined) {
      // The caller knows the authoritative end of access; never widen it.
      expiresAt = toIsoOrNull(args.expiresAtOverride);
    } else {
      // Prefer the explicit access window when available, otherwise derive
      // expires_at from the paid period.
      const computedExpiry = rawPeriod && PERIOD_MONTHS[rawPeriod]
        ? addMonths(new Date(startsAt), PERIOD_MONTHS[rawPeriod]).toISOString()
        : null;
      const subscriptionExpiry =
        toIsoOrNull(subscription?.access_until) ??
        toIsoOrNull(subscription?.current_period_end);

      // Use whichever is later so a renewal never shortens already-granted access.
      if (computedExpiry && subscriptionExpiry) {
        expiresAt = subscriptionExpiry > computedExpiry ? subscriptionExpiry : computedExpiry;
      } else {
        expiresAt = subscriptionExpiry ?? computedExpiry;
      }
    }
  }

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
    },
    customer: {
      email: transaction.customer_email,
      name: transaction.customer_name,
    },
    payment: {
      status: transaction.status,
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
