// P3/P4/P5 — os tres eventos financeiros de assinatura.
//
// subscriptionEventRules.ts nao importa deno.land: as regras que definem quanto
// acesso alguem tem -- e se o evento deve existir -- sao testadas de VERDADE.
// As afirmacoes sobre o wiring em asaas-webhook seguem estruturais.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GRACE_DAYS,
  PENDING_WINDOW_DAYS,
  REVOCATION_EVENTS,
  classifyRevocation,
  decidePaymentFailed,
  failedCycleFrom,
  failedExpiresAt,
  pendingExpiresAt,
  shouldEmitPending,
} from "../supabase/functions/_shared/subscriptionEventRules.ts";

import {
  paymentFailedKey,
  pendingKey,
  revokedChargebackKey,
  revokedRefundKey,
} from "../supabase/functions/_shared/entitlementIdempotency.ts";

const webhook = await readFile(
  new URL("../supabase/functions/asaas-webhook/index.ts", import.meta.url),
  "utf8",
);
const rulesSource = await readFile(
  new URL("../supabase/functions/_shared/subscriptionEventRules.ts", import.meta.url),
  "utf8",
);
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = stripComments(webhook);

const CREATED_AT = "2026-07-19T10:00:00.000Z";
const DUE_DATE = "2026-08-19";

// ---------------------------------------------------------------------
// 1-4. pending
// ---------------------------------------------------------------------

test("1. primeira cobranca pendente gera pending", () => {
  assert.equal(shouldEmitPending(0), true);
  assert.ok(code.includes("event: 'subscription.pending'"));
});

test("2. pending usa created_at + 7 dias, nunca now()", () => {
  assert.equal(PENDING_WINDOW_DAYS, 7);
  assert.equal(pendingExpiresAt(CREATED_AT), "2026-07-26T10:00:00.000Z");

  // Determinismo: chamar de novo, "dias depois", da o MESMO valor.
  assert.equal(pendingExpiresAt(CREATED_AT), pendingExpiresAt(CREATED_AT));

  // Sem created_at usavel, nao inventa data.
  for (const ruim of [null, undefined, "", "   ", "nao-e-data", 42]) {
    assert.equal(pendingExpiresAt(ruim), null, `${JSON.stringify(ruim)} nao pode virar prazo`);
  }
});

test("3. pending duplicado mantem a MESMA chave", () => {
  assert.equal(pendingKey("sub-1"), "pending:sub-1");
  assert.equal(pendingKey("sub-1"), pendingKey("sub-1"));
  // A chave nao depende da transacao: duas cobrancas da mesma assinatura
  // colapsam, e a janela de 7 dias nao e concedida duas vezes.
  assert.equal(pendingKey.length, 1);
  assert.ok(code.includes("pendingKey(subscriptionForUpdate.id)"));
});

test("4. renovacao pendente NAO gera pending", () => {
  assert.equal(shouldEmitPending(1), false);
  assert.equal(shouldEmitPending(7), false);
  assert.ok(
    code.includes("shouldEmitPending(ledger.totalApplications)"),
    "a decisao vem do ledger, nao de datas proximas",
  );
});

// ---------------------------------------------------------------------
// 5-11. payment_failed
// ---------------------------------------------------------------------

const failedArgs = (extra = {}) => ({
  ledgerCount: 1,
  currentPaymentInLedger: false,
  dueDate: DUE_DATE,
  ...extra,
});

test("5. primeira cobranca overdue NAO gera failed", () => {
  const d = decidePaymentFailed(failedArgs({ ledgerCount: 0 }));
  assert.equal(d.emit, false);
  assert.equal(d.reason, "first_charge");
  // Sem isto, o primeiro ciclo teria 7 dias provisorios + 3 de carencia.
});

test("6. renovacao overdue gera failed", () => {
  const d = decidePaymentFailed(failedArgs());
  assert.equal(d.emit, true);
  assert.ok(code.includes("event: 'subscription.payment_failed'"));
});

test("6b. OVERDUE de pagamento ja aplicado nao gera failed", () => {
  const d = decidePaymentFailed(failedArgs({ currentPaymentInLedger: true }));
  assert.equal(d.emit, false);
  assert.equal(d.reason, "already_applied");
});

test("7. cycle_from e o due_date", () => {
  assert.equal(failedCycleFrom(DUE_DATE), "2026-08-19T00:00:00.000Z");
  const d = decidePaymentFailed(failedArgs());
  assert.equal(d.cycleFrom, "2026-08-19T00:00:00.000Z");
  // NAO e current_period_end, que se move a cada pagamento.
  assert.ok(!code.includes("cycleFrom: subscriptionForUpdate.current_period_end"));
});

test("8. a carencia e due_date + 3 dias, nunca now() + 3", () => {
  assert.equal(GRACE_DAYS, 3);
  assert.equal(failedExpiresAt(DUE_DATE), "2026-08-22T00:00:00.000Z");
  const d = decidePaymentFailed(failedArgs());
  assert.equal(d.expiresAt, "2026-08-22T00:00:00.000Z");
  assert.equal(failedExpiresAt(DUE_DATE), failedExpiresAt(DUE_DATE), "deterministico");
});

test("9. mesma falha do mesmo ciclo nao cria chave nova", () => {
  const a = decidePaymentFailed(failedArgs());
  const b = decidePaymentFailed(failedArgs());
  assert.equal(
    paymentFailedKey("sub-1", a.cycleFrom),
    paymentFailedKey("sub-1", b.cycleFrom),
  );
});

test("10. ciclo seguinte cria chave nova", () => {
  const c1 = decidePaymentFailed(failedArgs({ dueDate: "2026-08-19" }));
  const c2 = decidePaymentFailed(failedArgs({ dueDate: "2026-09-19" }));
  assert.notEqual(
    paymentFailedKey("sub-1", c1.cycleFrom),
    paymentFailedKey("sub-1", c2.cycleFrom),
  );
});

test("11. due_date ausente NAO fabrica data", () => {
  for (const ruim of [null, undefined, "", "invalida"]) {
    const d = decidePaymentFailed(failedArgs({ dueDate: ruim }));
    assert.equal(d.emit, false, `${JSON.stringify(ruim)} nao pode gerar evento`);
    assert.equal(d.reason, "missing_due_date");
  }
  assert.ok(code.includes("needs_action: OVERDUE without due_date"), "deve registrar");
});

// ---------------------------------------------------------------------
// 12-16. access_revoked
// ---------------------------------------------------------------------

test("12. refund usa applied_period_end do ledger", () => {
  assert.ok(
    code.includes("expiresAt: ledger.currentApplication.applied_period_end"),
    "o periodo vem do ledger real, nao de estimativa",
  );
  assert.ok(!code.includes("expiresAt: new Date()"), "nunca now()");
});

test("13. refund sem ledger NAO emite", () => {
  assert.ok(
    code.includes("!ledger.currentApplication?.applied_period_end"),
    "sem linha no ledger, aquele pagamento nunca concedeu acesso",
  );
  assert.ok(code.includes("never granted access"));
});

test("14. chargeback usa o payment.status correto", () => {
  assert.equal(classifyRevocation("CHARGEBACK_REQUESTED"), "chargeback");
  assert.equal(classifyRevocation("REFUNDED"), "refund");
  // O status real do Asaas e repassado: o consumidor decide pelo prefixo.
  assert.ok(code.includes("paymentStatus,"), "status verbatim vai no payload");
  assert.deepEqual([...REVOCATION_EVENTS], [
    "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED",
  ]);
});

test("15. refund e chargeback do MESMO pagamento tem chaves diferentes", () => {
  assert.notEqual(revokedRefundKey("pay_1"), revokedChargebackKey("pay_1"));
  assert.ok(code.includes("revokedRefundKey(paymentId)"));
  assert.ok(code.includes("revokedChargebackKey(paymentId)"));
});

test("16. disputa, reversao e deleted NAO revogam", () => {
  for (const status of [
    "CHARGEBACK_DISPUTE",
    "AWAITING_CHARGEBACK_REVERSAL",
    "DELETED",
    "CANCELLED",
    "REFUND_REQUESTED",
    "REFUND_IN_PROGRESS",
    "PENDING",
    "CONFIRMED",
  ]) {
    assert.equal(classifyRevocation(status), null, `${status} nao pode revogar`);
  }
  for (const ruim of [null, undefined, 42, {}]) {
    assert.equal(classifyRevocation(ruim), null);
  }
});

test("16b. nenhuma reativacao automatica apos reversao de chargeback", () => {
  assert.ok(!/reactivat|reativa/i.test(code.replace(/subscription\.reactivated/g, "")));
});

// ---------------------------------------------------------------------
// 17-21. invariantes do payload
// ---------------------------------------------------------------------

test("17. subscription_id esta presente nos tres eventos", () => {
  const emissoes = code.match(/subscriptionId: subscriptionForUpdate\.id/g) ?? [];
  assert.equal(emissoes.length, 3, "pending, payment_failed e access_revoked");
});

test("18. transaction_id e sempre a transacao local real", () => {
  const emissoes = code.match(/transaction: existingTransaction/g) ?? [];
  assert.equal(emissoes.length, 3);
  // Nunca o payload do Asaas nem um id inventado.
  assert.ok(!code.includes("transaction: payment"));
});

test("19. nenhum prazo dos eventos novos usa now()", () => {
  // As tres datas vem de funcoes puras ancoradas em campos imutaveis.
  assert.ok(code.includes("pendingExpiresAt(subscriptionForUpdate.created_at)"));
  assert.ok(code.includes("expiresAt: decision.expiresAt"));
  assert.ok(code.includes("expiresAt: ledger.currentApplication.applied_period_end"));

  // E as funcoes puras nao leem o relogio.
  const rules = stripComments(rulesSource);
  assert.ok(!rules.includes("Date.now()"), "as regras nao podem ler o relogio");
  assert.ok(!/new Date\(\)/.test(rules), "nem construir data do instante atual");
});

test("20. occurred_at nao decide ordem financeira", () => {
  // Nenhuma emissao passa occurredAt; o builder usa o instante so como auditoria.
  const bloco = code.slice(code.indexOf("async function queueSubscriptionEvent"));
  assert.ok(!bloco.includes("occurredAt"), "occurred_at nao entra nas decisoes");
});

test("21. nenhum dado pessoal novo no payload", () => {
  const bloco = code.slice(
    code.indexOf("async function queueSubscriptionEvent"),
    code.indexOf("async function applySubscriptionPaymentOverdue"),
  );
  for (const proibido of ["cpf", "customer_phone", "customer_state", "ip_address", "user_agent"]) {
    assert.ok(!bloco.includes(proibido), `${proibido} nao pode entrar`);
  }
});

// ---------------------------------------------------------------------
// 22. eventos existentes preservados
// ---------------------------------------------------------------------

test("22. sale.confirmed e cancelled continuam funcionando", () => {
  assert.ok(code.includes("event: 'sale.confirmed'"));
  assert.ok(code.includes("confirmedSubscriptionKey(subscriptionId, transaction.asaas_payment_id)"));
  assert.ok(code.includes("confirmedTransactionKey(transaction.id)"));
  // O cancelamento vive em queueCancellationWebhooks e nao foi tocado.
  assert.ok(!code.includes("subscription.cancelled"));
});

test("22b. os tres eventos usam a outbox canonica, sem envio sincrono", () => {
  assert.ok(code.includes("queueEntitlementEvent(supabaseAdmin,"), "mesma fila");
  const bloco = code.slice(
    code.indexOf("async function queueSubscriptionEvent"),
    code.indexOf("async function applySubscriptionPaymentOverdue"),
  );
  assert.ok(!bloco.includes("fetch("), "nada de envio sincrono");
  assert.ok(!bloco.includes("signWebhookRequest"), "quem assina e o processador");
});

test("22c. falha ao ler o ledger mantem o evento reprocessavel", () => {
  // Decidir sem o ledger poderia dar carencia a quem so tem janela provisoria.
  const ocorrencias = code.match(/ledger\.failed/g) ?? [];
  assert.equal(ocorrencias.length, 3, "os tres caminhos verificam");
  assert.ok(
    code.includes("subscriptionPaymentApplicationFailed = true"),
    "falha de ledger deve manter o 500 retryable ja existente",
  );
});
