// Autenticacao do agendador da webhook_queue.
//
// O cron rodou 21 vezes seguidas com `succeeded` e as 21 respostas HTTP foram
// 401: o segredo guardado no Vault e uma service-role key VALIDA (o PostgREST
// aceitou), mas nao a MESMA string que a plataforma injeta em
// SUPABASE_SERVICE_ROLE_KEY dentro da funcao, e a comparacao e por igualdade
// exata. A correcao e um token dedicado ao cron.
//
// A logica de comparacao e pura e esta replicada aqui a partir do fonte: o
// index.ts importa deno.land e chama serve(), entao nao e importavel sob
// `node --test`. As afirmacoes sobre o fluxo seguem estruturais.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../supabase/functions/process-webhook-queue/index.ts", import.meta.url),
  "utf8",
);
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = stripComments(source);

/** Mesma implementacao de secretMatches, para testar o COMPORTAMENTO. */
const secretMatches = (candidate, expected) => {
  if (!expected || expected.length === 0) return false;
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
};

const TOKEN = "cron-token-sintetico-para-teste-0123456789";

// ---------------------------------------------------------------------
// aceitacao e recusa
// ---------------------------------------------------------------------

test("1. token customizado correto e aceito", () => {
  assert.equal(secretMatches(TOKEN, TOKEN), true);
  assert.ok(
    code.includes('Deno.env.get("WEBHOOK_QUEUE_CRON_TOKEN")'),
    "a funcao deve ler a variavel dedicada",
  );
  assert.ok(code.includes("isCronToken(token) || isServiceRoleToken(token)"));
});

test("2. token incorreto e rejeitado", () => {
  assert.equal(secretMatches("token-completamente-diferente", TOKEN), false);
  assert.equal(secretMatches("", TOKEN), false);
});

test("3. segredo vazio ou ausente NAO autentica", () => {
  // Deploy sem a variavel configurada nao pode virar porta aberta.
  assert.equal(secretMatches("", ""), false, "vazio contra vazio nao autentica");
  assert.equal(secretMatches(TOKEN, ""), false);
  assert.equal(secretMatches("", undefined ?? ""), false);
  assert.ok(
    code.includes("if (!expected || expected.length === 0) return false;"),
    "a guarda de segredo ausente deve existir",
  );
});

test("4. diferenca de UM caractere e rejeitada", () => {
  // Primeiro, ultimo e meio.
  assert.equal(secretMatches("X" + TOKEN.slice(1), TOKEN), false);
  assert.equal(secretMatches(TOKEN.slice(0, -1) + "X", TOKEN), false);
  const meio = Math.floor(TOKEN.length / 2);
  assert.equal(
    secretMatches(TOKEN.slice(0, meio) + "X" + TOKEN.slice(meio + 1), TOKEN),
    false,
  );
  // Prefixo correto tambem nao passa.
  assert.equal(secretMatches(TOKEN.slice(0, -1), TOKEN), false);
  assert.equal(secretMatches(TOKEN + "x", TOKEN), false);
});

test("5. claim service_role forjada NAO e suficiente", () => {
  // Um JWT com role=service_role, mas assinatura invalida, nao casa por
  // igualdade com nenhum segredo e cai no fluxo administrativo, onde o
  // Supabase Auth valida a assinatura.
  const forjado =
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura-invalida";
  assert.equal(secretMatches(forjado, TOKEN), false);

  // O codigo nunca decide por claim.
  assert.ok(!code.includes("service_role'"), "nenhuma comparacao com a claim");
  assert.ok(!/decodeJwt|atob\(|jwtDecode/i.test(code), "o token nao e decodificado");
  assert.ok(
    code.includes("supabaseClient.auth.getUser(token)"),
    "JWT so e aceito pelo fluxo que valida assinatura",
  );
  // E o papel vem do banco, nao do token.
  assert.ok(code.includes('.from("user_roles")'));
  assert.ok(code.includes('roles?.some(({ role }) => role === "admin")'));
});

test("6. service-role e admin existentes continuam aceitos", () => {
  assert.ok(
    code.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'),
    "a autorizacao por service-role nao pode ter sido removida",
  );
  assert.ok(code.includes("isServiceRoleToken"), "continua existindo");
  assert.ok(code.includes("forbiddenResponse()"), "o 403 do fluxo admin permanece");
  // Nenhuma autorizacao foi retirada: as tres rotas seguem no mesmo gate.
  assert.ok(code.includes("if (!token) {"), "ausencia de token continua barrada");
});

test("7. nenhuma credencial aparece em log ou resposta", () => {
  const logs = code.match(/console\.(log|warn|error)\([\s\S]{0,200}?\);/g) ?? [];
  for (const linha of logs) {
    for (const proibido of [
      "WEBHOOK_QUEUE_CRON_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "token",
      "secret",
      "Authorization",
    ]) {
      assert.ok(
        !linha.includes(proibido),
        `log nao pode citar ${proibido}: ${linha.slice(0, 90)}`,
      );
    }
  }

  // Nem tamanho, prefixo ou hash do segredo de AUTENTICACAO. A assinatura HMAC
  // dos webhooks e outra coisa: e o contrato de entrega, nao credencial de
  // entrada, e por isso nao entra nesta verificacao.
  const gate = code.slice(
    code.indexOf("const secretMatches"),
    code.indexOf("serve(async (req)"),
  );
  assert.ok(!/\.slice\(0,\s*\d+\)/.test(gate), "nenhum prefixo de token no gate");
  assert.ok(!/sha|hash/i.test(gate), "o segredo de auth nao e hasheado nem logado");

  // O gate tem UM unico log, e ele carrega o erro de papel -- nunca credencial.
  const logsDoGate = gate.match(/console\.\w+\(/g) ?? [];
  assert.equal(logsDoGate.length, 1, "apenas um log no caminho de autorizacao");
  assert.ok(gate.includes('console.error("Error checking admin role:", rolesError)'));

  // A resposta de falha continua generica.
  assert.ok(
    code.includes(`JSON.stringify({ error: "Unauthorized" })`),
    "corpo generico preservado",
  );
});

// ---------------------------------------------------------------------
// propriedades da comparacao
// ---------------------------------------------------------------------

test("8. a comparacao e em tempo constante e exata", () => {
  assert.ok(
    code.includes("diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i)"),
    "XOR acumulado, sem saida antecipada por conteudo",
  );
  assert.ok(
    !/token === serviceRoleKey|token === expected/.test(code),
    "a comparacao ingenua por === deve ter sumido",
  );
  // Exatidao: nenhuma normalizacao que afrouxe a comparacao.
  assert.ok(!/toLowerCase\(\)|trim\(\).*expected/.test(code));
});

test("9. verify_jwt nao foi alterado e a funcao nao virou publica", async () => {
  const config = await readFile(
    new URL("../supabase/config.toml", import.meta.url),
    "utf8",
  );
  assert.match(config, /\[functions\.process-webhook-queue\]\s*\nverify_jwt = false/);
  assert.ok(!code.includes("verify_jwt"));
  // O gate continua sendo a primeira coisa do handler.
  const gate = code.indexOf("await authorizeRequest(req, supabaseClient)");
  const fila = code.indexOf('.from("webhook_queue")');
  assert.ok(gate > -1 && gate < fila, "autorizar antes de tocar a fila");
});
