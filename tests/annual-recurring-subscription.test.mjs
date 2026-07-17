import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildEntitlementPayload } from "../supabase/functions/_shared/buildEntitlementPayload.ts";
import {
  CUSTOMER_CANCELLATION_SUBSCRIPTION_SELECT,
  isCancellationSubscriptionRow,
  queueCancellationWebhooks,
} from "../supabase/functions/_shared/queueCancellationWebhooks.ts";
import { computeSubscriptionPeriodEnd } from "../supabase/functions/_shared/subscriptionPeriod.ts";
import {
  classifyWebhookQueueInsertError,
  failedQueueResult,
  shouldRetryEntitlementQueue,
  WEBHOOK_QUEUE_DEDUP_CONSTRAINT,
} from "../supabase/functions/_shared/webhookQueueResult.ts";
import {
  buildCheckoutInstallmentData,
  getCheckoutCapabilities,
} from "../src/lib/checkoutRules.ts";

const effectiveDate = new Date("2026-01-15T12:00:00.000Z");
const migrationUrl = new URL(
  "../supabase/migrations/20260717120000_add_subscription_payment_applications.sql",
  import.meta.url,
);

// This is an in-memory behavioral model of the migration contract. It does
// not prove PostgreSQL row locking or rollback; the migration is audited
// separately below and still requires integration tests after staging apply.
const createLedgerModel = (cycle = "YEARLY") => {
  let state = {
    cycle,
    last_payment_id: null,
    current_period_start: null,
    current_period_end: null,
    access_until: null,
  };
  const ledger = new Map();
  let serialized = Promise.resolve();

  const apply = ({
    paymentId,
    eventType,
    at = effectiveDate,
    failBeforeCommit = false,
  }) => {
    const existing = ledger.get(paymentId);
    if (existing) {
      return { result: "duplicate", state: { ...state }, application: existing };
    }

    const candidates = [at, state.current_period_end, state.access_until]
      .filter(Boolean)
      .map((value) => new Date(value));
    const periodStart = new Date(Math.max(...candidates.map((value) => value.getTime())));
    const periodEnd = computeSubscriptionPeriodEnd(periodStart, state.cycle);
    if (!periodEnd) throw new Error("invalid cycle");

    const application = {
      paymentId,
      eventType,
      applied_period_start: periodStart.toISOString(),
      applied_period_end: periodEnd.toISOString(),
    };
    const nextState = {
      ...state,
      last_payment_id: paymentId,
      current_period_start: application.applied_period_start,
      current_period_end: application.applied_period_end,
      access_until: application.applied_period_end,
    };

    if (failBeforeCommit) throw new Error("simulated transactional rollback");

    ledger.set(paymentId, application);
    state = nextState;
    return { result: "applied", state: { ...state }, application };
  };

  return {
    apply,
    applyConcurrent(input) {
      const operation = serialized.then(() => apply(input));
      serialized = operation.catch(() => undefined);
      return operation;
    },
    getState: () => ({ ...state }),
    hasLedger: (paymentId) => ledger.has(paymentId),
    ledgerSize: () => ledger.size,
  };
};

const entitlementArgs = ({ productType = "recorrente", pricePeriod = null, subscription = null } = {}) => ({
  deliveryId: "delivery-test",
  occurredAt: effectiveDate.toISOString(),
  transaction: {
    id: "transaction-test",
    asaas_payment_id: "pay-test",
    customer_name: "Cliente",
    customer_email: "cliente@example.com",
    status: "CONFIRMED",
    billing_type: "CREDIT_CARD",
    value: 120,
    confirmed_date: effectiveDate.toISOString(),
  },
  product: {
    id: "product-test",
    unique_code: "product-code",
    entitlement_code: "premium-access",
    product_type: productType,
  },
  price: pricePeriod
    ? { id: "price-test", unique_code: "price-code", subscription_period: pricePeriod }
    : null,
  subscription,
});

const cancellationSubscription = {
  id: "subscription-test",
  product_id: "product-test",
  product_price_id: "price-test",
  cycle: "YEARLY",
  access_until: "2027-01-15T12:00:00.000Z",
  current_period_end: "2027-01-15T12:00:00.000Z",
  last_payment_id: "pay-test",
};

test("1. CONFIRMED seguido de RECEIVED concede um ciclo", () => {
  const model = createLedgerModel();
  const confirmed = model.apply({ paymentId: "pay-1", eventType: "PAYMENT_CONFIRMED" });
  const received = model.apply({ paymentId: "pay-1", eventType: "PAYMENT_RECEIVED" });

  assert.equal(confirmed.result, "applied");
  assert.equal(received.result, "duplicate");
  assert.equal(model.getState().access_until, "2027-01-15T12:00:00.000Z");
});

test("2. RECEIVED seguido de CONFIRMED concede um ciclo", () => {
  const model = createLedgerModel("MONTHLY");
  model.apply({ paymentId: "pay-1", eventType: "PAYMENT_RECEIVED" });
  const confirmed = model.apply({ paymentId: "pay-1", eventType: "PAYMENT_CONFIRMED" });

  assert.equal(confirmed.result, "duplicate");
  assert.equal(model.getState().access_until, "2026-02-15T12:00:00.000Z");
});

test("3. dois workers concorrentes simulados concedem um ciclo", async () => {
  const model = createLedgerModel();
  const results = await Promise.all([
    model.applyConcurrent({ paymentId: "pay-race", eventType: "PAYMENT_CONFIRMED" }),
    model.applyConcurrent({ paymentId: "pay-race", eventType: "PAYMENT_RECEIVED" }),
  ]);

  assert.deepEqual(results.map(({ result }) => result), ["applied", "duplicate"]);
  assert.equal(model.ledgerSize(), 1);
  assert.equal(model.getState().access_until, "2027-01-15T12:00:00.000Z");
});

test("4. pay1 cria uma aplicação durável", () => {
  const model = createLedgerModel();
  const result = model.apply({ paymentId: "pay-1", eventType: "PAYMENT_CONFIRMED" });

  assert.equal(result.result, "applied");
  assert.equal(model.hasLedger("pay-1"), true);
  assert.equal(result.application.applied_period_end, "2027-01-15T12:00:00.000Z");
});

test("5. pay2 aplicado depois concede um novo ciclo", () => {
  const model = createLedgerModel();
  model.apply({ paymentId: "pay-1", eventType: "PAYMENT_CONFIRMED" });
  const renewal = model.apply({ paymentId: "pay-2", eventType: "PAYMENT_CONFIRMED" });

  assert.equal(renewal.result, "applied");
  assert.equal(model.getState().access_until, "2028-01-15T12:00:00.000Z");
  assert.equal(model.ledgerSize(), 2);
});

test("6. retry de pay1 após pay2 não altera nem regride last_payment_id", () => {
  const model = createLedgerModel();
  model.apply({ paymentId: "pay-1", eventType: "PAYMENT_CONFIRMED" });
  model.apply({ paymentId: "pay-2", eventType: "PAYMENT_CONFIRMED" });
  const before = model.getState();
  const delayed = model.apply({ paymentId: "pay-1", eventType: "PAYMENT_RECEIVED" });

  assert.equal(delayed.result, "duplicate");
  assert.deepEqual(model.getState(), before);
  assert.equal(model.getState().last_payment_id, "pay-2");
});

test("7. falha antes do commit não deixa ledger ou período parcial", () => {
  const model = createLedgerModel();

  assert.throws(
    () => model.apply({
      paymentId: "pay-fail",
      eventType: "PAYMENT_CONFIRMED",
      failBeforeCommit: true,
    }),
    /rollback/,
  );
  assert.equal(model.hasLedger("pay-fail"), false);
  assert.equal(model.getState().last_payment_id, null);
  assert.equal(model.getState().access_until, null);
});

test("8. retry após rollback aplica normalmente", () => {
  const model = createLedgerModel();
  assert.throws(() => model.apply({
    paymentId: "pay-retry",
    eventType: "PAYMENT_CONFIRMED",
    failBeforeCommit: true,
  }));

  const retry = model.apply({ paymentId: "pay-retry", eventType: "PAYMENT_CONFIRMED" });
  assert.equal(retry.result, "applied");
  assert.equal(model.hasLedger("pay-retry"), true);
});

test("9. ledger duplicado não amplia o período", () => {
  const model = createLedgerModel();
  model.apply({ paymentId: "pay-duplicate", eventType: "PAYMENT_CONFIRMED" });
  const before = model.getState().access_until;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(
      model.apply({ paymentId: "pay-duplicate", eventType: "PAYMENT_RECEIVED" }).result,
      "duplicate",
    );
  }
  assert.equal(model.getState().access_until, before);
  assert.equal(model.ledgerSize(), 1);
});

test("migration define ledger único e RPC com bloqueio e escrita atômica", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const lockPosition = sql.indexOf("FOR UPDATE");
  const ledgerInsertPosition = sql.indexOf(
    "INSERT INTO public.subscription_payment_applications",
    lockPosition,
  );
  const subscriptionUpdatePosition = sql.indexOf("UPDATE public.subscriptions AS s");

  assert.match(sql, /UNIQUE \(subscription_id, asaas_payment_id\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.apply_subscription_payment/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.ok(lockPosition > 0);
  assert.ok(ledgerInsertPosition > lockPosition);
  assert.ok(subscriptionUpdatePosition > ledgerInsertPosition);
  assert.match(sql, /application_result := 'duplicate'/);
  assert.match(sql, /application_result := 'applied'/);
});

test("backfill inclui somente pagamentos CONFIRMED ou RECEIVED", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const backfillStart = sql.indexOf(
    "INSERT INTO public.subscription_payment_applications",
  );
  const backfillEnd = sql.indexOf("ON CONFLICT", backfillStart);
  const backfillSql = sql.slice(backfillStart, backfillEnd);
  const statusFilter = backfillSql.match(/s\.last_payment_status IN \(([^)]+)\)/);

  assert.match(backfillSql, /s\.last_payment_id IS NOT NULL/);
  assert.match(backfillSql, /s\.current_period_start IS NOT NULL/);
  assert.match(backfillSql, /s\.current_period_end IS NOT NULL/);
  assert.ok(statusFilter);

  const acceptedStatuses = new Set(
    [...statusFilter[1].matchAll(/'([^']+)'/g)].map((match) => match[1]),
  );
  const isEligibleBackfillStatus = (status) =>
    typeof status === "string" && acceptedStatuses.has(status);

  assert.deepEqual([...acceptedStatuses].sort(), ["CONFIRMED", "RECEIVED"]);
  assert.equal(isEligibleBackfillStatus("CONFIRMED"), true);
  assert.equal(isEligibleBackfillStatus("RECEIVED"), true);
  for (const rejectedStatus of ["PENDING", "OVERDUE", "REFUNDED", "CANCELLED"]) {
    assert.equal(isEligibleBackfillStatus(rejectedStatus), false);
  }
  assert.equal(isEligibleBackfillStatus(null), false);
});

test("10. linha self-service exige e seleciona cycle e datas de acesso", () => {
  assert.match(CUSTOMER_CANCELLATION_SUBSCRIPTION_SELECT, /\bcycle\b/);
  assert.match(CUSTOMER_CANCELLATION_SUBSCRIPTION_SELECT, /\baccess_until\b/);
  assert.match(CUSTOMER_CANCELLATION_SUBSCRIPTION_SELECT, /\bcurrent_period_end\b/);
  assert.equal(isCancellationSubscriptionRow(cancellationSubscription), true);
  assert.equal(
    isCancellationSubscriptionRow(({ ...cancellationSubscription, cycle: undefined })),
    false,
  );
});

test("11. cancelamento self-service enfileira subscription.cancelled", async () => {
  const insertedQueueRows = [];
  const resultFor = (result) => {
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => result,
      maybeSingle: async () => result,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return query;
  };
  const supabase = {
    from(table) {
      if (table === "product_webhooks") {
        return resultFor({
          data: [{ id: "webhook-test", webhook_url: "https://receiver.test/entitlement" }],
          error: null,
        });
      }
      if (table === "products") {
        return resultFor({
          data: {
            id: "product-test",
            unique_code: "product-code",
            entitlement_code: "premium-access",
            product_type: "recorrente",
          },
          error: null,
        });
      }
      if (table === "transactions") {
        return resultFor({
          data: entitlementArgs().transaction,
          error: null,
        });
      }
      if (table === "product_prices") {
        return resultFor({
          data: { id: "price-test", unique_code: "price-code", subscription_period: "anual" },
          error: null,
        });
      }
      if (table === "webhook_queue") {
        return {
          insert: async (row) => {
            insertedQueueRows.push(row);
            return { error: null };
          },
        };
      }
      if (table === "webhook_logs") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  globalThis.Deno = { env: { get: () => "https://staging.test" } };
  globalThis.fetch = async () => new Response(null, { status: 202 });
  try {
    const result = await queueCancellationWebhooks(
      supabase,
      cancellationSubscription,
      effectiveDate.toISOString(),
    );
    assert.equal(result.queued, 1);
    assert.equal(insertedQueueRows[0].event, "subscription.cancelled");
    assert.equal(insertedQueueRows[0].payload.entitlement.period, "yearly");
    assert.equal(
      insertedQueueRows[0].payload.entitlement.expires_at,
      cancellationSubscription.access_until,
    );
  } finally {
    globalThis.Deno = originalDeno;
    globalThis.fetch = originalFetch;
  }
});

test("12. 23505 da constraint esperada é deduplicação", () => {
  assert.equal(
    classifyWebhookQueueInsertError({
      code: "23505",
      message: `duplicate key value violates unique constraint \"${WEBHOOK_QUEUE_DEDUP_CONSTRAINT}\"`,
    }),
    "deduplicated",
  );
});

test("13. erro diferente ou 23505 de outra constraint é retryable", () => {
  assert.equal(
    classifyWebhookQueueInsertError({ code: "08006", message: "connection failure" }),
    "failed_retryable",
  );
  assert.equal(
    classifyWebhookQueueInsertError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "another_constraint"',
    }),
    "failed_retryable",
  );
  assert.equal(
    shouldRetryEntitlementQueue(failedQueueResult("database connection failed")),
    true,
  );
});

test("14. evento aplicado repete apenas a tentativa de entitlement", () => {
  const model = createLedgerModel();
  let entitlementAttempts = 0;

  const first = model.apply({ paymentId: "pay-entitlement", eventType: "PAYMENT_CONFIRMED" });
  entitlementAttempts += 1; // simulated failed_retryable queue result
  const periodAfterFirstAttempt = model.getState().access_until;

  const retry = model.apply({ paymentId: "pay-entitlement", eventType: "PAYMENT_CONFIRMED" });
  entitlementAttempts += 1; // retry only the outbound queue step

  assert.equal(first.result, "applied");
  assert.equal(retry.result, "duplicate");
  assert.equal(model.getState().access_until, periodAfterFirstAttempt);
  assert.equal(entitlementAttempts, 2);
});

test("15. anual PIX sem subscription continua yearly", () => {
  const payload = buildEntitlementPayload(entitlementArgs({ pricePeriod: "anual" }));

  assert.equal(payload.entitlement.period, "yearly");
  assert.equal(payload.entitlement.expires_at, "2027-01-15T12:00:00.000Z");
});

test("16. pagamento único continua lifetime, parcelável e com complementos", () => {
  const payload = buildEntitlementPayload(entitlementArgs({ productType: "pagamento_unico" }));
  const capabilities = getCheckoutCapabilities("pagamento_unico");

  assert.equal(payload.entitlement.type, "lifetime");
  assert.equal(payload.entitlement.period, null);
  assert.equal(payload.entitlement.expires_at, null);
  assert.equal(capabilities.allowCoupon, true);
  assert.equal(capabilities.allowOrderBumps, true);
  assert.equal(capabilities.allowInstallments, true);
  assert.deepEqual(
    buildCheckoutInstallmentData(false, 6, 20),
    { installmentCount: 6, installmentValue: 20 },
  );
});

test("assinatura usa ciclo congelado mesmo se o preço atual mudar", () => {
  const payload = buildEntitlementPayload(entitlementArgs({
    pricePeriod: "anual",
    subscription: {
      cycle: "MONTHLY",
      access_until: "2026-02-15T12:00:00.000Z",
    },
  }));

  assert.equal(payload.entitlement.period, "monthly");
  assert.equal(payload.entitlement.expires_at, "2026-02-15T12:00:00.000Z");
});

test("recorrência sem período ou expiração falha de forma segura", () => {
  assert.throws(() => buildEntitlementPayload(entitlementArgs()), /valid period/);
  assert.throws(
    () => buildEntitlementPayload({
      ...entitlementArgs({ pricePeriod: "mensal" }),
      expiresAtOverride: null,
    }),
    /valid expiration/,
  );
});

test("recorrência continua limitada a uma parcela", () => {
  const capabilities = getCheckoutCapabilities("recorrente");

  assert.equal(capabilities.allowCoupon, false);
  assert.equal(capabilities.allowOrderBumps, false);
  assert.equal(capabilities.allowInstallments, false);
  assert.deepEqual(buildCheckoutInstallmentData(true, 12, 10), { installmentCount: 1 });
});

test("setUTCMonth atual mantém overflow de fim de mês", () => {
  assert.equal(
    computeSubscriptionPeriodEnd(new Date("2026-01-31T12:00:00.000Z"), "MONTHLY")?.toISOString(),
    "2026-03-03T12:00:00.000Z",
  );
  assert.equal(
    computeSubscriptionPeriodEnd(new Date("2024-02-29T12:00:00.000Z"), "YEARLY")?.toISOString(),
    "2025-03-01T12:00:00.000Z",
  );
});
