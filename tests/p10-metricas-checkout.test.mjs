// P1 — correcao das metricas do checkout.
//
// O que estava errado, medido em producao (2026-08-04, somente leitura):
//
//   - `abandon` vinha de `beforeunload`: 390 eventos, e 166 das 223 sessoes que
//     criaram cobranca tambem gravaram um. Era "alguem saiu da pagina",
//     inclusive depois de comprar.
//   - o session_id nascia a cada montagem, entao todo reload virava acesso novo.
//   - `conversion` era gravado quando a COBRANCA nascia (223 sessoes), nao
//     quando havia venda (211 transacoes pagas no mesmo periodo).
//   - a policy de INSERT em checkout_events tinha `WITH CHECK (true)`, e a chave
//     publica esta no bundle do site.
//
// Agora: navegador registra `view` e `payment_attempt` por RPC validada;
// cobranca e venda saem de `transactions` (262 linhas, 262 asaas_payment_id
// distintos — uma linha por cobranca real).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getOrCreateCheckoutSessionId,
  markSessionEventOnce,
} from "../src/lib/checkoutSession.ts";
import {
  CHECKOUT_EVENT,
  countChargesCreated,
  countConfirmedSales,
  countSessions,
} from "../src/lib/checkoutMetrics.ts";

const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const hookCode = stripComments(await readSource("../src/hooks/useCheckoutTracking.ts"));
const trackCheckoutCode = stripComments(
  await readSource("../supabase/functions/track-checkout/index.ts"),
);
const rpcMigration = await readSource(
  "../supabase/migrations/20260804130000_public_checkout_event_rpc.sql",
);
const revokeMigration = await readSource(
  "../supabase/migrations/20260804140000_revoke_direct_checkout_event_insert.sql",
);

/** sessionStorage falso: uma instancia = uma aba. */
function makeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

// ---------------------------------------------------------------------
// 1. reload mantem a sessao
// ---------------------------------------------------------------------

test("1. reload mantem a sessao; outra aba comeca outra", () => {
  const aba = makeStorage();

  const primeiro = getOrCreateCheckoutSessionId(aba);
  assert.equal(getOrCreateCheckoutSessionId(aba), primeiro, "reload nao pode criar sessao nova");
  assert.match(primeiro, /^cs_[0-9a-z]+$/);
  // Sem dado pessoal no identificador.
  assert.doesNotMatch(primeiro, /@|\d{11}/);

  assert.notEqual(getOrCreateCheckoutSessionId(makeStorage()), primeiro);
  // Sem storage o checkout ainda recebe um id valido, em vez de quebrar.
  assert.match(getOrCreateCheckoutSessionId(null), /^cs_[0-9a-z]+$/);
});

test("1b. o mesmo evento nao repete no reload, mas outro produto registra o seu", () => {
  const aba = makeStorage();
  const sessao = getOrCreateCheckoutSessionId(aba);
  const marcar = (produto) => markSessionEventOnce(aba, sessao, "view", produto, "preco-1");

  assert.equal(marcar("produto-A"), true);
  assert.equal(marcar("produto-A"), false, "reload duplicou o acesso");
  assert.equal(marcar("produto-B"), true, "produto novo precisa do proprio acesso");
});

// ---------------------------------------------------------------------
// 2. `abandon` acabou
// ---------------------------------------------------------------------

test("2. nao existe mais abandono nem saida de pagina", () => {
  assert.doesNotMatch(hookCode, /beforeunload|pagehide|sendBeacon/);
  assert.ok(!hookCode.includes("abandon"));

  // track-checkout perdeu o service role e nao grava mais nada: responde 410.
  assert.doesNotMatch(trackCheckoutCode, /SERVICE_ROLE|createClient|\.insert\(|req\.json\(\)/);
  assert.match(trackCheckoutCode, /status:\s*410/);
});

// ---------------------------------------------------------------------
// 3-5. allowlist da RPC
// ---------------------------------------------------------------------

const EVENTOS_ACEITOS = ["view", "payment_attempt"];

/** Modelo da allowlist da RPC; o SQL real e conferido logo abaixo. */
const rpcAceita = (eventType) => EVENTOS_ACEITOS.includes(eventType);

test("3-4. a RPC aceita view e payment_attempt", () => {
  assert.equal(rpcAceita("view"), true);
  assert.equal(rpcAceita("payment_attempt"), true);
  assert.equal(CHECKOUT_EVENT.view, "view");
  assert.equal(CHECKOUT_EVENT.paymentAttempt, "payment_attempt");
});

test("5. a RPC rejeita qualquer outro evento", () => {
  for (const tipo of [
    "payment_created",
    "payment_confirmed",
    "conversion",
    "abandon",
    "sale",
    "VIEW",
    "view; drop table",
    "",
  ]) {
    assert.equal(rpcAceita(tipo), false, `${tipo} nao pode ser aceito`);
  }

  // A allowlist do SQL e exatamente esta, e nenhum evento financeiro aparece.
  assert.match(rpcMigration, /NOT IN \('view', 'payment_attempt'\)/);
  for (const proibido of ["'payment_created'", "'payment_confirmed'", "'conversion'", "'abandon'"]) {
    assert.ok(!rpcMigration.includes(proibido), `${proibido} nao pode estar na migration`);
  }

  // E o frontend nao envia mais evento financeiro nenhum.
  assert.ok(!hookCode.includes("payment_created"));
  assert.ok(!hookCode.includes("total_amount"));
});

test("5b. o INSERT direto anonimo e removido pela migration restritiva", () => {
  assert.match(
    revokeMigration,
    /DROP POLICY IF EXISTS "Public can insert checkout events for analytics"/,
  );
  assert.match(revokeMigration, /REVOKE INSERT ON public\.checkout_events FROM authenticated/);
  assert.match(revokeMigration, /FROM anon/);
  // A leitura administrativa continua de pe.
  assert.doesNotMatch(revokeMigration, /REVOKE SELECT ON public\.checkout_events FROM authenticated/);
  // E nada de historico e apagado. (`TRUNCATE` aparece so como PRIVILEGIO
  // revogado de anon — nunca como comando.)
  for (const sql of [rpcMigration, revokeMigration]) {
    assert.doesNotMatch(sql, /\bDELETE FROM\b|\bTRUNCATE\s+(TABLE\s+)?public\.|\bDROP TABLE\b/i);
  }
});

test("5c. o frontend grava pela RPC, nunca por INSERT direto", () => {
  assert.match(hookCode, /\.rpc\("track_public_checkout_event"/);
  assert.doesNotMatch(hookCode, /\.from\("checkout_events"\)|\.insert\(/);
});

// ---------------------------------------------------------------------
// 6-8. cobrancas e vendas vem de transactions
// ---------------------------------------------------------------------

const TRANSACOES = [
  { asaas_payment_id: "pay_1", product_id: "p1", status: "PENDING" },
  { asaas_payment_id: "pay_2", product_id: "p1", status: "CONFIRMED" },
  { asaas_payment_id: "pay_3", product_id: "p1", status: "OVERDUE" },
  { asaas_payment_id: "pay_4", product_id: "p2", status: "RECEIVED" },
];

test("6. cobrancas criadas vem de transactions, em qualquer status", () => {
  // PENDING e OVERDUE sao cobrancas criadas: existiram no gateway.
  assert.equal(countChargesCreated(TRANSACOES), 4);
  // Linha sem cobranca Asaas nao conta.
  assert.equal(countChargesCreated([{ asaas_payment_id: null, product_id: "p1" }]), 0);
  assert.equal(countChargesCreated([{ asaas_payment_id: "  ", product_id: "p1" }]), 0);
});

test("6b. evento forjado no navegador nao aumenta cobrancas", () => {
  // Mil eventos falsos de qualquer tipo: o numero nao le eventos, le transacoes.
  const forjados = Array.from({ length: 1000 }, (_, i) => ({
    event_type: i % 2 ? "payment_created" : "conversion",
    session_id: `cs_forjada${i}`,
    product_id: "p1",
  }));

  assert.equal(countChargesCreated(TRANSACOES), 4);
  assert.equal(countSessions(forjados, [CHECKOUT_EVENT.view]), 0);
  assert.equal(countSessions(forjados, [CHECKOUT_EVENT.paymentAttempt]), 0);
});

test("7. vendas confirmadas sao o subconjunto aprovado das cobrancas", () => {
  const cobrancas = countChargesCreated(TRANSACOES);
  const vendas = countConfirmedSales(TRANSACOES);

  assert.equal(vendas, 2); // CONFIRMED e RECEIVED
  assert.ok(vendas <= cobrancas, "venda nunca passa de cobranca criada");
  // PIX pendente e cobranca vencida sao cobranca, nunca venda.
  assert.equal(countConfirmedSales([TRANSACOES[0], TRANSACOES[2]]), 0);
});

test("8. filtro de produto e periodo valem para os quatro degraus", () => {
  const eventos = [
    { event_type: "view", session_id: "s1", product_id: "p1" },
    { event_type: "view", session_id: "s1", product_id: "p1" }, // reload
    { event_type: "payment_attempt", session_id: "s1", product_id: "p1" },
    { event_type: "view", session_id: "s2", product_id: "p2" },
  ];

  // Produto: cada degrau usa o mesmo product_id, e p1 nao herda nada de p2.
  assert.equal(countSessions(eventos, [CHECKOUT_EVENT.view], "p1"), 1);
  assert.equal(countSessions(eventos, [CHECKOUT_EVENT.paymentAttempt], "p1"), 1);
  assert.equal(countChargesCreated(TRANSACOES, "p1"), 3);
  assert.equal(countConfirmedSales(TRANSACOES, "p1"), 1);

  assert.equal(countSessions(eventos, [CHECKOUT_EVENT.view], "p2"), 1);
  assert.equal(countChargesCreated(TRANSACOES, "p2"), 1);

  // Sem filtro os produtos somam e nunca se misturam.
  assert.equal(countSessions(eventos, [CHECKOUT_EVENT.view]), 2);
  assert.equal(
    countChargesCreated(TRANSACOES),
    countChargesCreated(TRANSACOES, "p1") + countChargesCreated(TRANSACOES, "p2"),
  );
});

test("8b. as telas usam a mesma janela de tempo nos quatro degraus", async () => {
  const relatorios = stripComments(await readSource("../src/pages/Relatorios.tsx"));
  const dashboard = stripComments(await readSource("../src/pages/Dashboard.tsx"));

  // Relatorios: cobrancas saem da lista de transacoes ja filtrada pelo mesmo
  // startDate/endDate dos eventos.
  assert.match(relatorios, /const chargesCreated = countChargesCreated\(transactionList\)/);

  // Dashboard: mesmo dia comercial dos acessos, pela data de CRIACAO da cobranca.
  assert.match(dashboard, /businessDay\(transaction\.created_at\) === todayStr/);

  // Nenhuma tela le mais evento financeiro nem abandono.
  for (const [nome, codigo] of [["Dashboard", dashboard], ["Relatorios", relatorios]]) {
    assert.ok(!codigo.includes('"abandon"'), `${nome} ainda le abandon`);
    assert.ok(!codigo.includes('"payment_created"'), `${nome} ainda le payment_created`);
    assert.ok(!/abandonRate|totalAbandons|abandonsToday/.test(codigo), `${nome} tem taxa de abandono`);
  }
});

// ---------------------------------------------------------------------
// 9. falha de tracking nao afeta o pagamento
// ---------------------------------------------------------------------

test("9. erro no tracking nao quebra o checkout e nao vaza dado pessoal", () => {
  // A chamada e disparada sem await e o erro morre num catch.
  assert.match(hookCode, /void \(async \(\) => \{/);
  assert.match(hookCode, /\} catch \(error\) \{/);
  assert.match(hookCode, /error instanceof Error \? error\.message : "unknown error"/);

  // Sem toast de erro para o cliente e sem PII no log.
  assert.ok(!hookCode.includes("toast"));
  for (const proibido of ["cpf", "email", "phone", "JSON.stringify"]) {
    assert.ok(!hookCode.toLowerCase().includes(proibido.toLowerCase()), `${proibido} no tracking`);
  }
});
