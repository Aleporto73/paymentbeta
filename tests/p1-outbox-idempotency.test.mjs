// P1 — fundacao da outbox: idempotencia por fato financeiro, builder aditivo e
// subscription_id nos eventos que JA existem.
//
// Nenhum evento novo e emitido neste bloco. As chaves de pending/failed/revoked
// existem e sao testadas, mas nenhum emissor as chama.
//
// entitlementIdempotency.ts, buildEntitlementPayload.ts e queueEntitlementEvent.ts
// nao importam de deno.land, entao rodam de verdade sob `node --test`: a maior
// parte daqui e teste de COMPORTAMENTO, com um supabase falso. As afirmacoes
// sobre asaas-webhook (que importa deno.land) seguem estruturais.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// queueEntitlementEvent toca Deno.env e fetch apenas no "cutucao" pos-insercao.
// Stub antes de importar para que o modulo rode fora do Deno sem rede.
globalThis.Deno ??= { env: { get: () => "http://localhost" } };
const fetchCalls = [];
globalThis.fetch = async (url) => {
  fetchCalls.push(url);
  return { ok: true, status: 200, text: async () => "" };
};

const {
  buildEntitlementPayload,
  ENTITLEMENT_EVENT_VERSION,
} = await import("../supabase/functions/_shared/buildEntitlementPayload.ts");

const {
  IdempotencyKeyError,
  cancelledKey,
  confirmedSubscriptionKey,
  confirmedTransactionKey,
  paymentFailedKey,
  pendingKey,
  revokedChargebackKey,
  revokedRefundKey,
} = await import("../supabase/functions/_shared/entitlementIdempotency.ts");

const { queueEntitlementEvent, isExpectedDuplicate } = await import(
  "../supabase/functions/_shared/queueEntitlementEvent.ts"
);

const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const asaasWebhook = await readSource("../supabase/functions/asaas-webhook/index.ts");
const cancellation = await readSource(
  "../supabase/functions/_shared/queueCancellationWebhooks.ts",
);
const migration = await readSource(
  "../supabase/migrations/20260719220000_add_entitlement_outbox_idempotency.sql",
);
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const transaction = {
  id: "11111111-1111-1111-1111-111111111111",
  asaas_payment_id: "pay_001",
  customer_name: "Comprador",
  customer_email: "comprador@exemplo.com",
  status: "RECEIVED",
  billing_type: "CREDIT_CARD",
  value: 75,
  payment_date: "2026-07-19T12:00:00.000Z",
  confirmed_date: "2026-07-19T12:00:00.000Z",
  product_id: "prod-1",
};

const product = {
  id: "prod-1",
  unique_code: "ABC123",
  entitlement_code: "abaminds-solo",
  product_type: "recorrente",
};

const subscription = {
  cycle: "MONTHLY",
  current_period_end: "2026-08-19T12:00:00.000Z",
  access_until: "2026-08-19T12:00:00.000Z",
};

const build = (extra = {}) =>
  buildEntitlementPayload({
    event: "sale.confirmed",
    deliveryId: "d-1",
    transaction,
    product,
    subscription,
    ...extra,
  });

// ---------------------------------------------------------------------
// 1-7. builder
// ---------------------------------------------------------------------

test("1. sem subscription_id o payload legado e preservado", () => {
  const p = build();

  assert.equal(p.entitlement.subscription_id, undefined);
  assert.equal(p.entitlement.cycle_from, undefined);
  assert.equal(p.reason, undefined);
  assert.ok(!("subscription_id" in p.entitlement), "campo ausente, nao null");
  assert.ok(!("cycle_from" in p.entitlement));
  assert.ok(!("reason" in p));

  // Campos historicos intactos.
  assert.equal(p.transaction_id, transaction.id);
  assert.equal(p.asaas_payment_id, "pay_001");
  assert.equal(p.entitlement.code, "abaminds-solo");
  assert.equal(p.entitlement.period, "monthly");
  assert.equal(p.customer.email, "comprador@exemplo.com");
  assert.equal(p.payment.status, "RECEIVED");
  assert.equal(p.payment.billing_type, "CREDIT_CARD");
  assert.equal(p.payment.value, 75);
});

test("2. subscription_id fica ANINHADO em entitlement", () => {
  const p = build({ subscriptionId: "sub-uuid-1" });

  assert.equal(p.entitlement.subscription_id, "sub-uuid-1");
  assert.equal(p.subscription_id, undefined, "nunca no topo");
});

test("3. cycle_from fica ANINHADO em entitlement", () => {
  const p = build({ cycleFrom: "2026-08-19" });

  assert.equal(p.entitlement.cycle_from, "2026-08-19");
  assert.equal(p.cycle_from, undefined, "nunca no topo");
});

test("4. payment.status fica no TOPO, irmao de entitlement", () => {
  const p = build({ paymentStatus: "CHARGEBACK_REQUESTED" });

  assert.equal(p.payment.status, "CHARGEBACK_REQUESTED");
  assert.equal(p.entitlement.payment, undefined, "payment nao entra em entitlement");
  // Sem override, mantem o status da transacao local.
  assert.equal(build().payment.status, "RECEIVED");
});

test("5. reason e opcional e some quando ausente ou vazio", () => {
  assert.equal(build({ reason: "chargeback" }).reason, "chargeback");
  assert.ok(!("reason" in build({ reason: "   " })), "string em branco nao vira campo");
  assert.ok(!("reason" in build({ reason: null })));
  assert.ok(!("reason" in build()));
});

test("6. event_version permanece 2026-06-10", () => {
  assert.equal(ENTITLEMENT_EVENT_VERSION, "2026-06-10");
  assert.equal(build({ subscriptionId: "s" }).event_version, "2026-06-10");
});

test("7. entitlement.type permanece o literal 'subscription'", () => {
  assert.equal(build().entitlement.type, "subscription");
  assert.ok(build().entitlement.expires_at, "expires_at continua obrigatorio");

  // Pagamento unico continua lifetime, sem regressao.
  const lifetime = buildEntitlementPayload({
    deliveryId: "d",
    transaction,
    product: { ...product, product_type: "pagamento_unico" },
  });
  assert.equal(lifetime.entitlement.type, "lifetime");
  assert.equal(lifetime.entitlement.expires_at, null);
});

test("7b. nenhum campo proibido entrou no payload", () => {
  const p = build({ subscriptionId: "s", cycleFrom: "2026-08-19", reason: "refund" });

  for (const proibido of ["metadata", "applied_period_start", "applied_period_end"]) {
    assert.ok(!(proibido in p), `${proibido} nao pode existir`);
    assert.ok(!(proibido in p.entitlement), `${proibido} nao pode existir em entitlement`);
  }
  // PII permitida e apenas a que o contrato exige.
  assert.deepEqual(Object.keys(p.customer).sort(), ["email", "name"]);
});

// ---------------------------------------------------------------------
// 8-13. chaves de idempotencia
// ---------------------------------------------------------------------

test("8. chave confirmed de assinatura", () => {
  assert.equal(confirmedSubscriptionKey("sub-1", "pay_001"), "confirmed:sub-1:pay_001");
  // Renovacao = pagamento novo = chave nova.
  assert.notEqual(
    confirmedSubscriptionKey("sub-1", "pay_001"),
    confirmedSubscriptionKey("sub-1", "pay_002"),
  );
  assert.throws(() => confirmedSubscriptionKey(null, "pay_001"), IdempotencyKeyError);
  assert.throws(() => confirmedSubscriptionKey("sub-1", ""), IdempotencyKeyError);
});

test("9. chave confirmed avulsa/legada", () => {
  assert.equal(confirmedTransactionKey("tx-1"), "confirmed:tx:tx-1");
  assert.notEqual(confirmedTransactionKey("tx-1"), confirmedSubscriptionKey("tx-1", "p"));
  assert.throws(() => confirmedTransactionKey(undefined), IdempotencyKeyError);
});

test("10. chave cancelled", () => {
  assert.equal(cancelledKey("sub-1"), "cancelled:sub-1");
  // Um por assinatura: admin e cliente cancelando colapsam.
  assert.equal(cancelledKey("sub-1"), cancelledKey("sub-1"));
  assert.throws(() => cancelledKey(""), IdempotencyKeyError);
});

test("11. pending nao depende de transaction_id", () => {
  assert.equal(pendingKey("sub-1"), "pending:sub-1");
  // Duas transacoes da MESMA assinatura produzem a MESMA chave -- e o que
  // impede a janela provisoria de 7 dias de ser concedida duas vezes.
  assert.equal(pendingKey("sub-1"), pendingKey("sub-1"));
  assert.equal(pendingKey.length, 1, "assinatura de 1 argumento: nada de transaction_id");
});

test("12. failed muda por cycle_from", () => {
  assert.equal(paymentFailedKey("sub-1", "2026-08-19"), "failed:sub-1:2026-08-19");
  // Mesma falha do mesmo ciclo colapsa.
  assert.equal(
    paymentFailedKey("sub-1", "2026-08-19"),
    paymentFailedKey("sub-1", "2026-08-19"),
  );
  // Ciclo seguinte ganha carencia propria.
  assert.notEqual(
    paymentFailedKey("sub-1", "2026-08-19"),
    paymentFailedKey("sub-1", "2026-09-19"),
  );
  assert.throws(() => paymentFailedKey("sub-1", null), IdempotencyKeyError);
});

test("13. refund e chargeback do MESMO pagamento tem chaves diferentes", () => {
  // Regressao critica: o indice legado (transaction_id, event, webhook_url)
  // descartaria o chargeback como duplicata do refund, por compartilharem o
  // mesmo `event`. Sao fatos distintos: finito x infinity no consumidor.
  assert.notEqual(revokedRefundKey("pay_001"), revokedChargebackKey("pay_001"));
  assert.equal(revokedRefundKey("pay_001"), "revoked:refund:pay_001");
  assert.equal(revokedChargebackKey("pay_001"), "revoked:chargeback:pay_001");
});

test("13b. nenhuma chave carrega PII, occurred_at ou event id do Asaas", () => {
  const chaves = [
    confirmedSubscriptionKey("sub-1", "pay_001"),
    confirmedTransactionKey("tx-1"),
    cancelledKey("sub-1"),
    pendingKey("sub-1"),
    paymentFailedKey("sub-1", "2026-08-19"),
    revokedRefundKey("pay_001"),
    revokedChargebackKey("pay_001"),
  ];
  for (const chave of chaves) {
    assert.ok(!chave.includes("@"), `chave nao pode conter e-mail: ${chave}`);
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(chave), `chave nao pode conter timestamp: ${chave}`);
  }
});

// ---------------------------------------------------------------------
// 14-15. comportamento do enfileiramento
// ---------------------------------------------------------------------

/** Supabase falso: registra inserts e simula erros por constraint. */
const fakeSupabase = ({ webhooks, insertError = null }) => {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table === "product_webhooks") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ data: webhooks, error: null }) }) }),
        };
      }
      if (table === "webhook_queue") {
        return {
          insert: (row) => {
            const err = typeof insertError === "function" ? insertError(row) : insertError;
            if (!err) inserted.push(row);
            return { error: err };
          },
        };
      }
      return { insert: () => ({ error: null }) };
    },
  };
};

const queueArgs = (extra = {}) => ({
  event: "sale.confirmed",
  idempotencyKey: confirmedSubscriptionKey("sub-1", "pay_001"),
  transaction,
  product,
  subscription,
  subscriptionId: "sub-1",
  ...extra,
});

test("14. mesma chave e mesmo destino deduplicam", async () => {
  const db = fakeSupabase({
    webhooks: [{ id: "wh-1", webhook_url: "https://a.example/hook" }],
    insertError: {
      code: "23505",
      message: 'duplicate key value violates unique constraint "webhook_queue_idempotency_uidx"',
    },
  });

  const r = await queueEntitlementEvent(db, queueArgs());

  assert.equal(r.duplicate, 1, "deve contar como duplicata");
  assert.equal(r.queued, 0);
  assert.equal(r.failed, 0, "duplicata esperada NAO e falha");
  assert.equal(db.inserted.length, 0);
});

test("14b. 23505 de outra constraint continua sendo falha retryable", async () => {
  const db = fakeSupabase({
    webhooks: [{ id: "wh-1", webhook_url: "https://a.example/hook" }],
    insertError: { code: "23505", message: 'violates unique constraint "outra_coisa"' },
  });

  const r = await queueEntitlementEvent(db, queueArgs());

  assert.equal(r.failed, 1, "constraint desconhecida nao pode virar duplicata benigna");
  assert.equal(r.duplicate, 0);

  assert.equal(isExpectedDuplicate({ code: "23505", message: "webhook_queue_idempotency_uidx" }), true);
  assert.equal(isExpectedDuplicate({ code: "23505", message: "outra" }), false);
  assert.equal(isExpectedDuplicate({ code: "23503", message: "webhook_queue_idempotency_uidx" }), false);
});

test("15. destinos diferentes recebem linhas distintas", async () => {
  const db = fakeSupabase({
    webhooks: [
      { id: "wh-1", webhook_url: "https://a.example/hook" },
      { id: "wh-2", webhook_url: "https://b.example/hook" },
    ],
  });

  const r = await queueEntitlementEvent(db, queueArgs());

  assert.equal(r.queued, 2);
  assert.equal(db.inserted.length, 2);

  // Mesmo FATO -> mesma idempotency_key.
  assert.equal(db.inserted[0].idempotency_key, db.inserted[1].idempotency_key);
  // Tentativas de ENTREGA distintas -> delivery_id distintos.
  assert.notEqual(db.inserted[0].delivery_id, db.inserted[1].delivery_id);
  assert.notEqual(db.inserted[0].product_webhook_id, db.inserted[1].product_webhook_id);
});

test("15b. a linha carrega subscription_id, chave e next_retry_at", async () => {
  const db = fakeSupabase({ webhooks: [{ id: "wh-1", webhook_url: "https://a.example/hook" }] });
  await queueEntitlementEvent(db, queueArgs());

  const row = db.inserted[0];
  assert.equal(row.subscription_id, "sub-1");
  assert.equal(row.idempotency_key, "confirmed:sub-1:pay_001");
  assert.equal(row.transaction_id, transaction.id);
  assert.equal(row.event, "sale.confirmed");
  assert.equal(row.event_version, "2026-06-10");
  assert.equal(row.status, "pending");
  assert.ok(row.next_retry_at, "next_retry_at preenchido na insercao");
  assert.equal(row.payload.entitlement.subscription_id, "sub-1");
});

test("15c. produto sem entitlement_code nao enfileira nada", async () => {
  const db = fakeSupabase({ webhooks: [{ id: "wh-1", webhook_url: "https://a.example/hook" }] });

  const r = await queueEntitlementEvent(db, queueArgs({
    product: { ...product, entitlement_code: null },
  }));

  assert.equal(r.queued, 0);
  assert.equal(r.skipped, 1);
  assert.equal(db.inserted.length, 0);
});

// ---------------------------------------------------------------------
// 16-20. emissores existentes
// ---------------------------------------------------------------------

test("16. sale.confirmed recorrente envia subscription_id", () => {
  const code = stripComments(asaasWebhook);

  assert.ok(
    code.includes("subscriptionIdForEntitlement = subscriptionForUpdate.id ?? null"),
    "o id da assinatura local deve ser capturado",
  );
  assert.ok(
    /queueWebhooks\(\s*supabaseAdmin,\s*transactionForWebhooks,\s*authoritativeSubscription,\s*subscriptionIdForEntitlement,\s*\)/.test(code),
    "o id deve ser repassado ao enfileiramento",
  );
  assert.ok(code.includes("subscription_id: subscriptionId"), "a linha da fila deve carrega-lo");
  assert.ok(code.includes("subscriptionId,"), "o builder deve receber o id");
});

test("17. sale.confirmed avulso NAO fabrica subscription_id", () => {
  const code = stripComments(asaasWebhook);

  assert.ok(
    code.includes("? confirmedSubscriptionKey(subscriptionId, transaction.asaas_payment_id)") &&
      code.includes(": confirmedTransactionKey(transaction.id)"),
    "sem assinatura, a chave deve ser a da transacao",
  );
  // O parametro nasce nulo: nada o inventa.
  assert.ok(
    code.includes("subscriptionId: string | null = null"),
    "o default deve ser null",
  );
});

test("18. cancelled envia subscription_id e usa a chave de cancelamento", () => {
  const code = stripComments(cancellation);

  assert.ok(code.includes("idempotencyKey: cancelledKey(subscription.id)"));
  assert.ok(code.includes("subscriptionId: subscription.id"));
  assert.ok(code.includes("queueEntitlementEvent("), "deve delegar ao helper canonico");
  // Comportamento financeiro preservado.
  assert.ok(code.includes("expiresAtOverride: expiresAt"), "expires_at do periodo pago");
  assert.ok(!code.includes("access_revoked"), "cancelamento nao vira revogacao");
});

test("19. transaction_id continua presente em ambos os emissores", () => {
  assert.ok(stripComments(asaasWebhook).includes("transaction_id: transaction.id"));
  // No cancelamento o transaction_id vai pelo helper, a partir da transacao paga.
  assert.ok(stripComments(cancellation).includes("transaction: { ...transaction,"));
});

test("20. NENHUM evento novo e emitido neste bloco", () => {
  for (const [nome, code] of [
    ["asaas-webhook", stripComments(asaasWebhook)],
    ["queueCancellationWebhooks", stripComments(cancellation)],
  ]) {
    for (const evento of [
      "subscription.pending",
      "subscription.payment_failed",
      "subscription.access_revoked",
    ]) {
      assert.ok(!code.includes(evento), `${nome} nao pode emitir ${evento} no P1`);
    }
  }

  // As chaves existem, mas nenhum emissor as chama.
  for (const chave of ["pendingKey", "paymentFailedKey", "revokedRefundKey", "revokedChargebackKey"]) {
    assert.ok(
      !stripComments(asaasWebhook).includes(chave),
      `${chave} nao pode estar em uso ainda`,
    );
  }
});

// ---------------------------------------------------------------------
// migration
// ---------------------------------------------------------------------

test("migration cria colunas, indice unico parcial e preserva o legado", () => {
  const sql = migration.replace(/--.*$/gm, "");

  for (const col of [
    "idempotency_key text",
    "next_retry_at   timestamptz",
    "response_status integer",
    "response_body   text",
    "subscription_id uuid REFERENCES public.subscriptions(id)",
  ]) {
    assert.ok(sql.includes(col), `coluna ausente: ${col}`);
  }

  // last_error NAO deve existir: error_message ja cumpre o papel.
  assert.ok(!/\blast_error\b/.test(sql), "last_error seria duplicata de error_message");

  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS webhook_queue_idempotency_uidx[\s\S]*?\(idempotency_key, product_webhook_id\)[\s\S]*?WHERE idempotency_key IS NOT NULL/,
  );
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS webhook_queue_pending_retry_idx[\s\S]*?\(status, next_retry_at\)[\s\S]*?WHERE status = 'pending'/,
  );

  // O indice legado nao pode ser derrubado neste bloco.
  assert.ok(!/DROP INDEX/i.test(sql), "nenhum indice pode ser removido");
  // Sem cron, sem mexer em RLS/grants.
  assert.ok(!/cron|GRANT|REVOKE|POLICY/i.test(sql));
});
