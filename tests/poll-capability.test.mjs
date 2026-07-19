// P0.5 — capacidade de polling do checkout PIX publico.
//
// _shared/pollCapability.ts nao importa nada de deno.land e nao chama serve(),
// entao roda de verdade sob `node --test`: estes sao testes de COMPORTAMENTO,
// nao de texto-fonte. As afirmacoes sobre as Edge Functions (que sao
// importaveis apenas no Deno) continuam sendo estruturais, como no P0.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  POLL_TOKEN_BYTES,
  POLL_TOKEN_TTL_MS,
  generatePollCapability,
  isPollTokenFormatValid,
  sha256Hex,
  timingSafeEqualHex,
  verifyPollCapability,
} from "../supabase/functions/_shared/pollCapability.ts";

const readSource = (relative) =>
  readFile(new URL(relative, import.meta.url), "utf8");

const createPayment = await readSource(
  "../supabase/functions/create-payment/index.ts",
);
const checkPaymentStatus = await readSource(
  "../supabase/functions/check-payment-status/index.ts",
);
const asaasWebhook = await readSource(
  "../supabase/functions/asaas-webhook/index.ts",
);
const migration = await readSource(
  "../supabase/migrations/20260719120000_add_payment_poll_capability.sql",
);
const pollingHook = await readSource("../src/hooks/usePixPaymentPolling.ts");
const checkoutPage = await readSource("../src/pages/Checkout.tsx");

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------
// 1-2. aleatoriedade
// ---------------------------------------------------------------------

test("1. o token carrega 32 bytes de aleatoriedade criptografica", async () => {
  assert.equal(POLL_TOKEN_BYTES, 32);

  const { token } = await generatePollCapability();
  assert.ok(isPollTokenFormatValid(token), "token deve ser base64url de 43 chars");
  // 32 bytes -> ceil(32/3)*4 = 44, menos o padding '=' -> 43.
  assert.equal(token.length, 43);
});

test("2. dois pagamentos recebem tokens diferentes", async () => {
  const tokens = new Set();
  const hashes = new Set();

  for (let i = 0; i < 200; i++) {
    const { token, tokenHash } = await generatePollCapability();
    tokens.add(token);
    hashes.add(tokenHash);
  }

  assert.equal(tokens.size, 200, "nenhum token pode se repetir");
  assert.equal(hashes.size, 200, "nenhum hash pode se repetir");
});

test("2b. o token nao deriva de nenhum dado do pagamento", () => {
  const code = stripComments(createPayment);
  const generation = code.slice(
    code.indexOf("generatePollCapability()"),
    code.indexOf("generatePollCapability()") + 200,
  );
  // A geracao nao recebe argumento algum: nem paymentId, nem userId, nem e-mail.
  assert.ok(
    /generatePollCapability\(\)/.test(generation),
    "generatePollCapability nao deve receber dados do pagamento",
  );
});

// ---------------------------------------------------------------------
// 3-5. armazenamento e expiracao
// ---------------------------------------------------------------------

test("3. somente o hash vai para o banco", () => {
  const code = stripComments(createPayment);

  assert.ok(
    code.includes("payment_poll_token_hash: pollCapability?.tokenHash"),
    "a coluna deve receber o hash",
  );
  assert.ok(
    !/payment_poll_token_hash:\s*pollCapability\?\.token\b/.test(code),
    "o token bruto nunca pode ser persistido",
  );
});

test("3b. o hash persistido e o SHA-256 do token", async () => {
  const { token, tokenHash } = await generatePollCapability();
  assert.equal(tokenHash, await sha256Hex(token));
  assert.match(tokenHash, /^[0-9a-f]{64}$/, "SHA-256 em hex minusculo");
});

test("4. a resposta recebe somente o token bruto", () => {
  const code = stripComments(createPayment);

  assert.ok(
    code.includes("pollingToken: pollCapability?.token ?? null"),
    "a resposta deve devolver o token bruto",
  );
  assert.ok(
    !code.includes("pollingTokenHash"),
    "o hash nunca pode ser devolvido ao cliente",
  );
});

test("5. a capacidade expira em 30 minutos", async () => {
  assert.equal(POLL_TOKEN_TTL_MS, 30 * 60 * 1000);

  const now = Date.UTC(2026, 6, 19, 12, 0, 0);
  const { expiresAt } = await generatePollCapability(now);

  assert.equal(new Date(expiresAt).getTime() - now, 30 * 60 * 1000);
});

// ---------------------------------------------------------------------
// 6-11. autorizacao
// ---------------------------------------------------------------------

const buildRow = async (overrides = {}) => {
  const { token, tokenHash, expiresAt } = await generatePollCapability();
  return {
    token,
    row: {
      payment_poll_token_hash: tokenHash,
      payment_poll_token_expires_at: expiresAt,
      ...overrides,
    },
  };
};

test("6. sem token, a autorizacao falha", async () => {
  const { row } = await buildRow();

  for (const missing of [undefined, null, ""]) {
    assert.equal(await verifyPollCapability(missing, row), false);
  }
});

test("7. token malformado falha antes de qualquer hash", async () => {
  const { row } = await buildRow();

  for (const malformed of [
    "curto",
    "a".repeat(42),
    "a".repeat(44),
    "!".repeat(43),
    "a".repeat(40) + "==+",
    42,
    {},
    [],
    true,
  ]) {
    assert.equal(
      await verifyPollCapability(malformed, row),
      false,
      `token malformado aceito: ${String(malformed)}`,
    );
  }
});

test("8. token incorreto, porem bem formado, falha", async () => {
  const { row } = await buildRow();
  const { token: outro } = await generatePollCapability();

  assert.ok(isPollTokenFormatValid(outro));
  assert.equal(await verifyPollCapability(outro, row), false);
});

test("9. token expirado falha", async () => {
  const now = Date.UTC(2026, 6, 19, 12, 0, 0);
  const { token, tokenHash, expiresAt } = await generatePollCapability(now);
  const row = {
    payment_poll_token_hash: tokenHash,
    payment_poll_token_expires_at: expiresAt,
  };

  // Um instante antes de expirar: vale.
  assert.equal(await verifyPollCapability(token, row, now + POLL_TOKEN_TTL_MS - 1), true);
  // Exatamente no vencimento: nao vale.
  assert.equal(await verifyPollCapability(token, row, now + POLL_TOKEN_TTL_MS), false);
  // Depois: nao vale.
  assert.equal(await verifyPollCapability(token, row, now + POLL_TOKEN_TTL_MS + 1), false);
});

test("10. token do pagamento A nao serve no pagamento B", async () => {
  const a = await buildRow();
  const b = await buildRow();

  assert.equal(await verifyPollCapability(a.token, a.row), true);
  assert.equal(await verifyPollCapability(b.token, b.row), true);

  assert.equal(await verifyPollCapability(a.token, b.row), false);
  assert.equal(await verifyPollCapability(b.token, a.row), false);
});

test("10b. transacao sem capacidade registrada nunca autoriza", async () => {
  const { token } = await generatePollCapability();

  // Linha legada: colunas nulas.
  assert.equal(
    await verifyPollCapability(token, {
      payment_poll_token_hash: null,
      payment_poll_token_expires_at: null,
    }),
    false,
  );
  // Hash presente, expiracao ausente.
  assert.equal(
    await verifyPollCapability(token, {
      payment_poll_token_hash: await sha256Hex(token),
      payment_poll_token_expires_at: null,
    }),
    false,
  );
  // Pagamento inexistente.
  assert.equal(await verifyPollCapability(token, null), false);
  assert.equal(await verifyPollCapability(token, undefined), false);
});

test("11. o token correto autoriza a consulta", async () => {
  const { token, row } = await buildRow();
  assert.equal(await verifyPollCapability(token, row), true);
});

test("11b. a comparacao de hash e em tempo constante e correta", () => {
  assert.equal(timingSafeEqualHex("abc", "abc"), true);
  assert.equal(timingSafeEqualHex("abc", "abd"), false);
  assert.equal(timingSafeEqualHex("abc", "ab"), false);
  assert.equal(timingSafeEqualHex("", ""), true);
  assert.equal(timingSafeEqualHex(null, "abc"), false);
});

// ---------------------------------------------------------------------
// 12-13. falha de autorizacao nao produz efeito
// ---------------------------------------------------------------------

test("12/13. o gate roda antes do Asaas e antes de qualquer escrita", () => {
  const code = stripComments(checkPaymentStatus);

  // Recortar o CORPO do handler: as funcoes auxiliares definidas acima de
  // serve() contem .update()/.insert(), mas sao definicoes, nao execucoes.
  const handler = code.slice(code.indexOf("serve(async (req)"));

  const gate = handler.indexOf("verifyPollCapability(pollingToken, authorizedTransaction)");
  assert.ok(gate > -1, "o gate de capacidade deve existir");

  // Nada que produza efeito colateral pode ser executado antes do gate.
  const before = handler.slice(0, gate);
  for (const forbidden of [
    "asaasBaseUrl",
    "/payments/",
    "product_sales",
    "reconciliation_status",
    ".update(",
    ".insert(",
  ]) {
    assert.ok(
      !before.includes(forbidden),
      `${forbidden} nao pode ocorrer antes da autorizacao`,
    );
  }
});

test("12b. toda NEGATIVA de autorizacao responde 403 generico", () => {
  const code = stripComments(checkPaymentStatus);

  assert.match(
    code,
    /const forbiddenResponse = \(\) =>[\s\S]{0,220}status: 403/,
    "deve existir uma resposta 403 unica",
  );
  assert.ok(
    /JSON\.stringify\(\{ error: 'Forbidden' \}\)/.test(code),
    "o corpo do 403 nao pode revelar a causa",
  );

  // Formato invalido, pagamento inexistente e token invalido usam a MESMA resposta.
  const occurrences = code.match(/return forbiddenResponse\(\);/g) ?? [];
  assert.ok(
    occurrences.length >= 4,
    `esperado ao menos 4 usos do 403 generico, obtido ${occurrences.length}`,
  );
});

// ---------------------------------------------------------------------
// Microcorrecao: negativa (403) x falha tecnica (500 retryable)
// ---------------------------------------------------------------------

/** Corpo do handler, para nao confundir definicoes de helper com execucao. */
const checkPaymentStatusHandler = stripComments(checkPaymentStatus).slice(
  stripComments(checkPaymentStatus).indexOf("serve(async (req)"),
);

test("21. transaction inexistente e NEGATIVA: 403, nao 500", () => {
  const marker = checkPaymentStatusHandler.indexOf("if (!authorizedTransaction) {");
  assert.ok(marker > -1, "zero linhas deve ter ramo proprio");

  const tail = checkPaymentStatusHandler.slice(marker, marker + 220);
  assert.ok(
    tail.includes("return forbiddenResponse();"),
    "pagamento inexistente deve responder 403",
  );
  assert.ok(
    !tail.includes("internalErrorResponse"),
    "zero linhas nunca pode virar 500",
  );
});

test("22. erro real do Supabase no lookup e FALHA TECNICA: 500 retryable", () => {
  const marker = checkPaymentStatusHandler.indexOf("if (lookup.error) {");
  assert.ok(marker > -1, "o erro do lookup deve ter ramo proprio");

  const tail = checkPaymentStatusHandler.slice(marker, marker + 320);
  assert.ok(
    tail.includes("return internalErrorResponse();"),
    "erro do banco deve responder 500",
  );
  assert.ok(
    !tail.includes("forbiddenResponse"),
    "erro do banco nunca pode virar 403",
  );
});

test("23. excecao inesperada no lookup e no hash: 500 retryable", () => {
  // catch do lookup
  assert.match(
    checkPaymentStatusHandler,
    /Unexpected error during polling authorization lookup[\s\S]{0,160}return internalErrorResponse\(\);/,
    "excecao no lookup deve responder 500",
  );
  // catch da verificacao criptografica
  assert.match(
    checkPaymentStatusHandler,
    /Polling capability verification failed technically[\s\S]{0,160}return internalErrorResponse\(\);/,
    "falha criptografica deve responder 500",
  );
});

test("24. o 500 e retryable e nao revela detalhes internos", () => {
  const code = stripComments(checkPaymentStatus);

  assert.match(
    code,
    /const internalErrorResponse = \(\) =>[\s\S]{0,260}status: 500/,
    "deve existir uma resposta 500 unica",
  );
  assert.ok(
    code.includes(`JSON.stringify({ error: 'Internal server error', retryable: true })`),
    "o corpo do 500 deve ser opaco e retryable",
  );

  // O corpo nunca interpola o erro.
  assert.ok(
    !/internalErrorResponse\s*=\s*\([^)]*\w+[^)]*\)/.test(code),
    "internalErrorResponse nao pode receber o erro para ecoar",
  );
});

test("25. nem a negativa nem a falha tecnica tocam Asaas ou banco", () => {
  // Ambas as saidas ocorrem antes do primeiro efeito colateral. O ponto mais
  // tardio dos dois ramos e a verificacao da capacidade.
  const gate = checkPaymentStatusHandler.indexOf("if (!capabilityAccepted) {");
  assert.ok(gate > -1);

  const before = checkPaymentStatusHandler.slice(0, gate);
  for (const forbidden of [
    "asaasBaseUrl",
    "/payments/",
    "product_sales",
    "reconciliation_status",
    ".update(",
    ".insert(",
    "integration_settings",
  ]) {
    assert.ok(
      !before.includes(forbidden),
      `${forbidden} nao pode ocorrer antes das duas saidas do gate`,
    );
  }
});

test("26. os logs do gate nao carregam token, hash nem PII", () => {
  const code = stripComments(checkPaymentStatus);

  // Token, hash e PII sao invariantes do ARQUIVO inteiro.
  const logs = code.match(/console\.(log|warn|error)\([\s\S]{0,220}?\);/g) ?? [];
  assert.ok(logs.length > 0, "deve haver logs para inspecionar");

  for (const line of logs) {
    for (const forbidden of [
      "pollingToken",
      "payment_poll_token_hash",
      "tokenHash",
      "customer_email",
      "customer_name",
      "cpf",
    ]) {
      assert.ok(
        !line.includes(forbidden),
        `log nao pode conter ${forbidden}: ${line.slice(0, 90)}`,
      );
    }
  }

  // Ja a sanitizacao do erro cru e afirmada apenas sobre o GATE: os helpers de
  // reconciliacao acima dele logam o envelope de erro desde antes desta
  // microcorrecao, e limpa-los seria mudanca fora deste escopo.
  const gateStart = checkPaymentStatusHandler.indexOf("const { paymentId, pollingToken }");
  const gateEnd = checkPaymentStatusHandler.indexOf("if (!capabilityAccepted) {");
  assert.ok(gateStart > -1 && gateEnd > gateStart, "gate deve ser localizavel");

  const gate = checkPaymentStatusHandler.slice(gateStart, gateEnd);

  assert.ok(
    !/console\.error\([^)]*,\s*(lookup\.error|error)\s*\)/.test(gate),
    "no gate, erros devem ser sanitizados antes do log",
  );
  assert.equal(
    (gate.match(/sanitizeErrorForLog\(/g) ?? []).length,
    3,
    "os tres caminhos tecnicos do gate devem sanitizar",
  );
});

test("27. a ordem do gate e formato, lookup, linha, capacidade", () => {
  const h = checkPaymentStatusHandler;

  const shape = h.indexOf("isPollTokenFormatValid(pollingToken)");
  const lookup = h.indexOf(".eq('asaas_payment_id', paymentId)");
  const dbError = h.indexOf("if (lookup.error) {");
  const noRow = h.indexOf("if (!authorizedTransaction) {");
  const verify = h.indexOf("verifyPollCapability(pollingToken, authorizedTransaction)");

  assert.ok(shape > -1 && lookup > -1 && dbError > -1 && noRow > -1 && verify > -1);
  assert.ok(shape < lookup, "formato antes do lookup");
  assert.ok(lookup < dbError, "lookup antes da checagem de erro tecnico");
  assert.ok(dbError < noRow, "erro tecnico antes de zero linhas");
  assert.ok(noRow < verify, "zero linhas antes de validar hash/expiracao/token");
});

// ---------------------------------------------------------------------
// 14-15. userId e PII
// ---------------------------------------------------------------------

test("14. userId nao e mais enviado nem utilizado", () => {
  assert.ok(
    !stripComments(pollingHook).includes("userId"),
    "o hook nao pode mais enviar userId",
  );
  assert.ok(
    !stripComments(checkoutPage).includes("productOwnerId"),
    "Checkout nao pode mais manter o id do vendedor para autorizacao",
  );

  const code = stripComments(checkPaymentStatus);
  assert.ok(
    !/const \{[^}]*\buserId\b[^}]*\} = await req\.json\(\)/.test(code),
    "check-payment-status nao pode desestruturar userId do corpo",
  );
  assert.ok(
    !code.includes("checkRateLimit(userId)"),
    "o rate limit nao pode usar userId do corpo",
  );
  assert.ok(
    code.includes("checkRateLimit(authorizedTransaction.id)"),
    "o rate limit deve usar a transacao ja autorizada",
  );
});

test("15. a resposta nao contem payment bruto nem PII", () => {
  const code = stripComments(checkPaymentStatus);

  assert.ok(!code.includes("payment: paymentData"), "sem objeto payment cru");
  assert.ok(code.includes("status: paymentData.status"), "status preservado");

  for (const field of ["cpf_cnpj", "customer_phone", "customer_state", "ip_address", "user_agent"]) {
    assert.ok(!code.includes(field), `campo pessoal ${field} nao pode aparecer`);
  }
});

// ---------------------------------------------------------------------
// 16-17. P0 preservado
// ---------------------------------------------------------------------

test("16. o endpoint continua sem enfileirar sale.confirmed", () => {
  const code = stripComments(checkPaymentStatus);
  assert.ok(!code.includes("webhook_queue"));
  assert.ok(!code.includes("sale.confirmed"));
  assert.ok(!code.includes("queueWebhooksForTransaction"));
});

test("17. os retornos 500 do P0 continuam presentes", () => {
  const code = stripComments(asaasWebhook);

  for (const sentinel of [
    "Subscription transaction reconciliation failed",
    "Subscription payment application failed",
  ]) {
    const marker = code.indexOf(`error: '${sentinel}'`);
    assert.ok(marker > -1, `${sentinel} deve continuar existindo`);
    const tail = code.slice(marker, marker + 200);
    assert.match(tail, /500/);
    assert.match(tail, /retryable: true/);
  }
});

// ---------------------------------------------------------------------
// 18-20. fluxo, logs e modulos intocados
// ---------------------------------------------------------------------

test("18. o fluxo PIX valido continua alimentando a tela", () => {
  const hook = stripComments(pollingHook);

  assert.ok(hook.includes("body: { paymentId, pollingToken }"), "envia os dois campos");
  assert.ok(hook.includes("data.status === 'CONFIRMED'"), "estado terminal preservado");
  assert.ok(hook.includes("data.status === 'RECEIVED'"), "estado terminal preservado");
  assert.ok(
    stripComments(checkoutPage).includes("pollingToken: paymentResult?.pollingToken || null"),
    "Checkout repassa a capacidade ao hook",
  );

  // A capacidade so pode existir depois da transacao persistida: create-payment
  // insere a linha e devolve o token na MESMA resposta que o Checkout consome.
  const code = stripComments(createPayment);
  assert.ok(
    code.indexOf("generatePollCapability()") < code.indexOf('.from("transactions")'),
    "a capacidade e escrita junto com a transacao",
  );
});

test("19. o token bruto nao aparece em log, URL nem storage", () => {
  for (const [name, source] of [
    ["create-payment", createPayment],
    ["check-payment-status", checkPaymentStatus],
    ["usePixPaymentPolling", pollingHook],
    ["Checkout", checkoutPage],
  ]) {
    const code = stripComments(source);

    assert.ok(
      !/console\.(log|warn|error)\([^)]*\bpollingToken\b/.test(code),
      `${name} nao pode registrar o token em log`,
    );
    assert.ok(
      !/console\.(log|warn|error)\([^)]*pollCapability\??\.token\b/.test(code),
      `${name} nao pode registrar o token gerado em log`,
    );
    assert.ok(
      !/localStorage[\s\S]{0,60}pollingToken/.test(code),
      `${name} nao pode persistir o token em localStorage`,
    );
    assert.ok(
      !/sessionStorage[\s\S]{0,60}pollingToken/.test(code),
      `${name} nao pode persistir o token em sessionStorage`,
    );
    assert.ok(
      !/[?&]pollingToken=/.test(code),
      `${name} nao pode colocar o token em URL`,
    );
  }
});

test("20. modulos fora do escopo continuam intocados", () => {
  // O builder de entitlement nao pode ter sido arrastado para esta mudanca.
  assert.ok(
    !stripComments(checkPaymentStatus).includes("buildEntitlementPayload"),
    "check-payment-status nao deve importar o builder",
  );
  assert.ok(
    !stripComments(createPayment).includes("buildEntitlementPayload"),
    "create-payment nao deve importar o builder",
  );
});

// ---------------------------------------------------------------------
// migration
// ---------------------------------------------------------------------

test("migration adiciona as colunas sem default e sem indice do token", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS payment_poll_token_hash text/);
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS payment_poll_token_expires_at timestamptz/,
  );
  assert.match(migration, /COMMENT ON COLUMN public\.transactions\.payment_poll_token_hash/);

  // Afirmar sobre SQL EXECUTAVEL: os comentarios do arquivo falam sobre default,
  // indice e RLS justamente para explicar por que nao existem.
  const sql = migration
    .replace(/--.*$/gm, "")
    .replace(/'(?:[^']|'')*'/g, "''");

  assert.ok(!/\bDEFAULT\b/i.test(sql), "as colunas nao podem ter default");
  assert.ok(!/\bNOT NULL\b/i.test(sql), "as colunas precisam ser nullable");
  assert.ok(!/CREATE\s+(UNIQUE\s+)?INDEX/i.test(sql), "nenhuma consulta justifica indice");
  assert.ok(
    !/DROP POLICY|CREATE POLICY|ENABLE ROW LEVEL SECURITY|\bREVOKE\b|\bGRANT\b/i.test(sql),
    "RLS e grants existentes devem ser preservados",
  );
});
