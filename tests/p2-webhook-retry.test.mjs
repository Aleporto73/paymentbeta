// P2 — retry real, resposta remota e elegibilidade da outbox.
//
// _shared/webhookRetryPolicy.ts nao importa deno.land: todas as decisoes que
// governam entrega -- quando esperar, quando desistir, o que conta como
// entregue -- sao testadas de VERDADE aqui. As afirmacoes sobre
// process-webhook-queue (que importa deno.land e chama serve()) seguem
// estruturais, como nos blocos anteriores.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACCEPTED_STATUSES,
  MAX_RESPONSE_BODY_BYTES,
  MAX_RETRY_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  STALE_PROCESSING_MS,
  UNSUPPORTED_STATUSES,
  interpretReceiverBody,
  isEligibleNow,
  isStaleProcessing,
  nextRetryAt,
  nextStatusAfterFailure,
  retryDelayMs,
  sanitizeErrorMessage,
  truncateResponseBody,
} from "../supabase/functions/_shared/webhookRetryPolicy.ts";

const processor = await readFile(
  new URL("../supabase/functions/process-webhook-queue/index.ts", import.meta.url),
  "utf8",
);
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = stripComments(processor);

const NOW = Date.UTC(2026, 6, 19, 12, 0, 0);
const row = (extra = {}) => ({
  status: "pending",
  attempts: 0,
  max_attempts: 3,
  next_retry_at: null,
  ...extra,
});

// ---------------------------------------------------------------------
// 1-3. selecao
// ---------------------------------------------------------------------

test("1. pending vencido e selecionado", () => {
  assert.equal(isEligibleNow(row(), NOW), true, "next_retry_at nulo = agora");
  assert.equal(
    isEligibleNow(row({ next_retry_at: new Date(NOW - 1000).toISOString() }), NOW),
    true,
  );
  // Exatamente no horario tambem vale.
  assert.equal(
    isEligibleNow(row({ next_retry_at: new Date(NOW).toISOString() }), NOW),
    true,
  );
});

test("2. pending com next_retry_at futuro NAO e selecionado", () => {
  assert.equal(
    isEligibleNow(row({ next_retry_at: new Date(NOW + 1).toISOString() }), NOW),
    false,
  );
  assert.equal(
    isEligibleNow(row({ next_retry_at: new Date(NOW + 15 * 60_000).toISOString() }), NOW),
    false,
  );
});

test("2b. so status pending e elegivel", () => {
  for (const status of ["sent", "failed", "processing"]) {
    assert.equal(isEligibleNow(row({ status }), NOW), false, `${status} nao e elegivel`);
  }
});

test("3. o corte usa max_attempts da linha, sem numero fixo", () => {
  // max_attempts pequeno corta antes.
  assert.equal(isEligibleNow(row({ attempts: 3, max_attempts: 3 }), NOW), false);
  assert.equal(isEligibleNow(row({ attempts: 2, max_attempts: 3 }), NOW), true);
  // max_attempts maior permite mais -- o antigo `< 5` fixo teria barrado aqui.
  assert.equal(isEligibleNow(row({ attempts: 5, max_attempts: 8 }), NOW), true);
  assert.equal(isEligibleNow(row({ attempts: 8, max_attempts: 8 }), NOW), false);
});

test("3b. o processador nao contem mais o limite fixo de 5", () => {
  assert.ok(!/\.lt\(\s*["']attempts["']\s*,\s*5\s*\)/.test(code), "o `attempts < 5` deve ter sumido");
  assert.ok(code.includes("isEligibleNow"), "a elegibilidade vem da politica");
  assert.ok(code.includes("max_attempts"), "max_attempts e a fonte real");
});

// ---------------------------------------------------------------------
// 4-8. leitura do 2xx
// ---------------------------------------------------------------------

test("4. 200 accepted e sucesso sem alerta", () => {
  const v = interpretReceiverBody('{"status":"accepted"}');
  assert.equal(v.outcome, "accepted");
  assert.equal(v.needsAlert, false);
});

test("5. 200 duplicate e sucesso sem alerta", () => {
  const v = interpretReceiverBody('{"status":"duplicate"}');
  assert.equal(v.outcome, "duplicate");
  assert.equal(v.needsAlert, false);
  assert.deepEqual([...ACCEPTED_STATUSES], ["accepted", "duplicate"]);
});

test("6/7/8. os tres unsupported_* pedem alerta", () => {
  for (const status of UNSUPPORTED_STATUSES) {
    const v = interpretReceiverBody(JSON.stringify({ status }));
    assert.equal(v.outcome, "unsupported", `${status} deve ser unsupported`);
    assert.equal(v.needsAlert, true, `${status} deve alertar`);
    assert.equal(v.receiverStatus, status, "o motivo fica auditavel");
  }
  assert.deepEqual(
    [...UNSUPPORTED_STATUSES],
    ["unsupported_version", "unsupported_event", "unsupported_entitlement"],
  );
});

test("8b. corpo vazio ou nao-JSON conta como entregue e nao alarma", () => {
  for (const body of ["", "   ", "OK", "<html>ok</html>", null, undefined, 42]) {
    const v = interpretReceiverBody(body);
    assert.equal(v.outcome, "unknown", `corpo ${JSON.stringify(body)} nao pode alarmar`);
    assert.equal(v.needsAlert, false);
  }
});

test("8c. unsupported_* vira sent com alerta, nao pending infinito", () => {
  const success = code.slice(code.indexOf("if (success) {"), code.indexOf("} else {"));
  assert.ok(success.includes('status: "sent"'), "2xx sempre encerra a entrega");
  assert.ok(success.includes("next_retry_at: null"), "nada de retry apos 2xx");
  assert.ok(
    success.includes("receiver rejected by contract"),
    "o motivo deve ficar em error_message",
  );
  assert.ok(
    success.includes("success: success && !verdict.needsAlert") ||
      code.includes("success: success && !verdict.needsAlert"),
    "webhook_logs deve marcar o unsupported_* como nao-sucesso, para alertar",
  );
});

// ---------------------------------------------------------------------
// 9-14. falha e backoff
// ---------------------------------------------------------------------

test("9/10. 4xx e 5xx voltam para pending enquanto ha tentativa", () => {
  assert.equal(nextStatusAfterFailure(1, 3), "pending");
  assert.equal(nextStatusAfterFailure(2, 3), "pending");
});

test("11/12. timeout e erro de rede usam a MESMA politica", () => {
  // Nao ha ramo separado: o catch aplica nextStatusAfterFailure igual ao 5xx.
  const cat = code.slice(code.indexOf("} catch (error) {"));
  assert.ok(cat.includes("nextStatusAfterFailure(attempts, maxAttempts)"));
  assert.ok(cat.includes("nextRetryAt(attempts, maxAttempts)"));
  assert.ok(cat.includes("response_status: null"), "sem resposta remota");
  assert.ok(cat.includes("response_body: null"));
});

test("13. a ultima tentativa vira failed, sem novo retry", () => {
  assert.equal(nextStatusAfterFailure(3, 3), "failed");
  assert.equal(nextStatusAfterFailure(4, 3), "failed");
  assert.equal(nextRetryAt(3, 3, NOW), null, "failed nao agenda retry");
});

test("14. backoff segue 1min, 5min, 15min, com teto de 60min", () => {
  assert.deepEqual(RETRY_DELAYS_MS, [60_000, 5 * 60_000, 15 * 60_000]);
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 5 * 60_000);
  assert.equal(retryDelayMs(3), 15 * 60_000);
  assert.equal(retryDelayMs(9), 15 * 60_000, "estabiliza no ultimo degrau");
  assert.ok(retryDelayMs(99) <= MAX_RETRY_DELAY_MS, "nunca ultrapassa o teto");

  // Nunca retry imediato.
  for (let a = 1; a <= 10; a++) assert.ok(retryDelayMs(a) >= 60_000);

  assert.equal(nextRetryAt(1, 3, NOW), new Date(NOW + 60_000).toISOString());
  assert.equal(nextRetryAt(2, 3, NOW), new Date(NOW + 5 * 60_000).toISOString());
});

test("14b. o timeout continua em 10 segundos", () => {
  assert.equal(REQUEST_TIMEOUT_MS, 10_000);
  assert.ok(code.includes("REQUEST_TIMEOUT_MS"));
});

// ---------------------------------------------------------------------
// 15-17. persistencia da resposta
// ---------------------------------------------------------------------

test("15. response_status e persistido na fila", () => {
  const ocorrencias = code.match(/response_status: response\.status/g) ?? [];
  assert.ok(ocorrencias.length >= 2, "gravado no sucesso e na falha HTTP");
});

test("16. response_body e truncado em ate 4 KB", () => {
  assert.equal(MAX_RESPONSE_BODY_BYTES, 4096);

  const curto = '{"status":"accepted"}';
  assert.equal(truncateResponseBody(curto), curto, "corpo pequeno passa inteiro");

  const grande = "x".repeat(10_000);
  const cortado = truncateResponseBody(grande);
  assert.equal(new TextEncoder().encode(cortado).length, 4096);

  // Multibyte: o corte respeita BYTES, nao caracteres, e nao deixa lixo.
  const multibyte = "áéíóú".repeat(2000);
  const cortadoMb = truncateResponseBody(multibyte);
  assert.ok(new TextEncoder().encode(cortadoMb).length <= 4096);
  assert.ok(!cortadoMb.endsWith("�"), "sem caractere partido ao meio");

  assert.equal(truncateResponseBody(""), null);
  assert.equal(truncateResponseBody(null), null);
});

test("17. error_message nao carrega segredo", () => {
  const casos = [
    ["Bearer eyJhbGciOiJIUzI1NiJ9.abc.def falhou", "eyJhbGciOiJIUzI1NiJ9"],
    ["X-PaymentBeta-Signature: sha256=deadbeefcafe1234", "deadbeefcafe1234"],
    ['{"webhook_secret":"s3cr3t-do-cliente"}', "s3cr3t-do-cliente"],
    ['api_key=AKIAIOSFODNN7EXAMPLE', "AKIAIOSFODNN7EXAMPLE"],
  ];

  for (const [entrada, vazamento] of casos) {
    const saida = sanitizeErrorMessage(entrada);
    assert.ok(!saida.includes(vazamento), `vazou ${vazamento} em: ${saida}`);
  }

  assert.ok(sanitizeErrorMessage("x".repeat(9999)).length <= 500, "truncada");
  assert.equal(sanitizeErrorMessage(new Error("boom")), "boom");
  assert.equal(sanitizeErrorMessage(undefined), "Unknown error");
});

// ---------------------------------------------------------------------
// 18-22. identidade, concorrencia e encadeamento
// ---------------------------------------------------------------------

test("18. o retry preserva o delivery_id", () => {
  // O claim atualiza status/attempts/last_attempt_at e mais nada.
  const claim = code.slice(code.indexOf("async function claimWebhook"), code.indexOf("async function hasImmediateWork"));
  assert.ok(!claim.includes("delivery_id"), "o claim nao pode tocar delivery_id");
  assert.ok(!claim.includes("randomUUID"), "nenhum delivery_id novo em retry");
  assert.ok(!code.includes("crypto.randomUUID"), "o processador nunca gera delivery_id");
});

test("19. nenhum retry cria linha nova", () => {
  assert.ok(
    !/from\("webhook_queue"\)\s*\.insert/.test(code),
    "o processador so atualiza a fila, nunca insere",
  );
});

test("20. dois workers nao enviam a mesma linha", () => {
  const claim = code.slice(code.indexOf("async function claimWebhook"), code.indexOf("async function hasImmediateWork"));
  // O UPDATE condicional e a trava: quem perde nao encontra o status esperado.
  assert.ok(claim.includes('.eq("id", row.id)'));
  assert.ok(claim.includes('.eq("status", row.status)'), "condicao de corrida resolvida no WHERE");
  assert.ok(claim.includes('.select("id")'), "precisa saber se pegou a linha");
  assert.ok(claim.includes("data.length > 0"), "zero linhas = outro worker levou");
  // E o claim acontece ANTES de qualquer envio.
  assert.ok(
    code.indexOf("claimWebhook(row, supabaseClient)") < code.indexOf("Promise.allSettled"),
    "claim antes do processamento",
  );
});

test("21. a linha nao fica presa em processing", () => {
  // Todo caminho de erro reescreve o status.
  const cat = code.slice(code.indexOf("} catch (error) {"));
  assert.ok(cat.includes("status,"), "o catch grava status pending ou failed");

  // E existe rede de seguranca para worker que morre sem chegar ao catch.
  assert.equal(STALE_PROCESSING_MS, 5 * 60_000);
  assert.equal(
    isStaleProcessing({ status: "processing", last_attempt_at: new Date(NOW - 5 * 60_000).toISOString() }, NOW),
    true,
  );
  assert.equal(
    isStaleProcessing({ status: "processing", last_attempt_at: new Date(NOW - 1000).toISOString() }, NOW),
    false,
    "linha em voo nao pode ser roubada",
  );
  assert.equal(isStaleProcessing({ status: "pending", last_attempt_at: null }, NOW), false);
  assert.ok(code.includes("isStaleProcessing"), "o processador recupera linhas travadas");
});

test("22. o autoencadeamento ignora itens com retry futuro", () => {
  assert.ok(code.includes("hasImmediateWork"), "deve existir a checagem");
  const chain = code.slice(code.indexOf("claimed.length === BATCH_SIZE"));
  assert.ok(
    chain.includes("await hasImmediateWork(supabaseClient)"),
    "encadear so com trabalho elegivel AGORA",
  );

  const fn = code.slice(code.indexOf("async function hasImmediateWork"), code.indexOf("// Resolve the signing secret"));
  assert.ok(fn.includes("next_retry_at.lte."), "filtra por horario de retry");
  assert.ok(fn.includes("isEligibleNow"), "e reconfere pela politica");
  assert.ok(!fn.includes("status.eq.processing"), "nao encadeia por linha travada");
});

// ---------------------------------------------------------------------
// 25. nenhum evento novo
// ---------------------------------------------------------------------

test("25. nenhum evento pending/failed/revoked e emitido", () => {
  for (const evento of [
    "subscription.pending",
    "subscription.payment_failed",
    "subscription.access_revoked",
  ]) {
    assert.ok(!code.includes(evento), `o processador nao pode citar ${evento}`);
  }
  // O processador entrega o que estiver na fila; nao decide evento.
  assert.ok(!code.includes("buildEntitlementPayload("), "nao monta payload");
});
