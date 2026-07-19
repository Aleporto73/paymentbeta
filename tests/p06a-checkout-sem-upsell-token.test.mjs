// P0.6A — o Checkout deixa de emitir o transaction_token do upsell one-click.
//
// Contexto que justifica a remocao (auditoria somente-leitura em 19/07/2026):
// product_upsells, transaction_tokens, upsell_transactions e
// product_upsell_analytics estao TODAS vazias desde 2025-11-25. A chamada
// removida sempre retornou 401 -- generate-transaction-token exige service-role,
// que o navegador nunca teve. Nao ha perda funcional a proteger, e o token
// removido era portador de autorizacao de cobranca em cartao salvo.
//
// Checkout.tsx e um componente React com JSX e imports por alias '@/', entao nao
// e importavel sob `node --test`. Seguindo o padrao ja usado em
// p0-single-producer-fail-closed.test.mjs, as afirmacoes sao sobre o texto-fonte.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relative) =>
  readFile(new URL(relative, import.meta.url), "utf8");

const checkout = await readSource("../src/pages/Checkout.tsx");
const pollingHook = await readSource("../src/hooks/usePixPaymentPolling.ts");
const generateTransactionToken = await readSource(
  "../supabase/functions/generate-transaction-token/index.ts",
);
const getUpsellData = await readSource(
  "../supabase/functions/get-upsell-data/index.ts",
);
const processUpsellPayment = await readSource(
  "../supabase/functions/process-upsell-payment/index.ts",
);
const sendConversionEvents = await readSource(
  "../supabase/functions/send-conversion-events/index.ts",
);

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const checkoutCode = stripComments(checkout);

// ---------------------------------------------------------------------
// 1-4. o token sumiu do Checkout
// ---------------------------------------------------------------------

test("1. Checkout nao chama generate-transaction-token", () => {
  assert.ok(
    !checkoutCode.includes("generate-transaction-token"),
    "a invocacao da Edge Function deve ter sido removida",
  );
  assert.ok(
    !checkoutCode.includes("generateAndRedirectWithToken"),
    "a funcao auxiliar deve ter sido removida, inclusive suas chamadas",
  );
});

test("2. transaction_token nao aparece no codigo do Checkout", () => {
  assert.ok(
    !checkoutCode.includes("transaction_token"),
    "nenhuma referencia ao token pode restar em codigo",
  );
});

test("3. o Checkout nao escreve nada em localStorage", () => {
  assert.ok(
    !checkoutCode.includes("localStorage"),
    "a persistencia do token no navegador deve ter sumido",
  );
});

test("4. nenhum token e adicionado a query string do redirecionamento", () => {
  assert.ok(
    !checkoutCode.includes("searchParams.set"),
    "nada deve ser anexado a URL de destino",
  );
  assert.ok(
    !checkoutCode.includes("urlWithToken"),
    "a construcao de URL com token deve ter sumido",
  );
  // `new URL(...)` so existia para montar a URL com token.
  assert.ok(
    !/new URL\(/.test(checkoutCode),
    "nao deve restar montagem manual de URL de redirecionamento",
  );
});

// ---------------------------------------------------------------------
// 5-6. o redirecionamento continua correto
// ---------------------------------------------------------------------

test("5. pagamento confirmado redireciona para approved_payment_redirect_url", () => {
  const ocorrencias = checkoutCode.match(
    /const redirectUrl = product\??\.approved_payment_redirect_url \|\| "\/pagamento-aprovado";/g,
  ) ?? [];

  // Dois caminhos de sucesso: PIX (onSuccess do polling) e cartao.
  assert.equal(
    ocorrencias.length,
    2,
    `esperados 2 caminhos de sucesso, encontrados ${ocorrencias.length}`,
  );

  // Cada um deve redirecionar direto na linha seguinte.
  for (const trecho of ocorrencias) {
    const idx = checkoutCode.indexOf(trecho);
    const depois = checkoutCode.slice(idx, idx + 200);
    assert.ok(
      depois.includes("window.location.href = redirectUrl;"),
      "o redirecionamento deve ser direto, sem intermediario",
    );
  }
});

test("6. sem URL configurada, cai em /pagamento-aprovado", () => {
  // O fallback e o proprio `||` do teste 5; aqui garantimos que ele nao mudou
  // e que a pagina de destino padrao continua existindo na aplicacao.
  assert.ok(
    checkoutCode.includes('|| "/pagamento-aprovado"'),
    "o fallback padrao deve ser preservado",
  );
  assert.ok(
    checkoutCode.includes('|| "/pagamento-recusado"'),
    "o caminho de recusa nao pode ter sido afetado",
  );
});

// ---------------------------------------------------------------------
// 7-8. nada do P0.5 regrediu
// ---------------------------------------------------------------------

test("7. o polling PIX do P0.5 permanece intacto", () => {
  assert.ok(
    checkoutCode.includes("pollingToken: paymentResult?.pollingToken || null"),
    "o Checkout deve continuar repassando a capacidade ao hook",
  );
  assert.ok(
    checkoutCode.includes("usePixPaymentPolling"),
    "o hook de polling deve continuar em uso",
  );

  const hook = stripComments(pollingHook);
  assert.ok(
    hook.includes("body: { paymentId, pollingToken }"),
    "o hook deve continuar enviando paymentId + pollingToken",
  );
  assert.ok(!hook.includes("userId"), "userId nao pode voltar ao polling");
});

test("7b. o pollingToken NAO foi reaproveitado para o redirecionamento", () => {
  // Seu escopo autoriza consultar um pagamento, nao identificar uma compra.
  const idx = checkoutCode.indexOf("window.location.href = redirectUrl;");
  assert.ok(idx > -1);

  for (const proibido of ["pollingToken", "paymentId", "payment.id"]) {
    const janela = checkoutCode.slice(Math.max(0, idx - 400), idx + 100);
    assert.ok(
      !janela.includes(proibido),
      `${proibido} nao pode virar parametro de redirecionamento`,
    );
  }
});

test("8. o frontend nao recebe nem usa service-role", () => {
  for (const proibido of [
    "SERVICE_ROLE",
    "service_role",
    "serviceRole",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert.ok(
      !checkout.includes(proibido),
      `${proibido} jamais pode aparecer no frontend`,
    );
  }
});

// ---------------------------------------------------------------------
// 9. nenhuma Edge Function foi alterada neste bloco
// ---------------------------------------------------------------------

test("9. as Edge Functions do fluxo de upsell seguem intocadas", () => {
  // generate-transaction-token mantem a exigencia de service-role.
  assert.ok(
    generateTransactionToken.includes("isServiceRoleRequest"),
    "a guarda de service-role deve continuar existindo",
  );
  assert.ok(
    generateTransactionToken.includes("transaction_tokens"),
    "a function nao foi esvaziada",
  );
  // get-upsell-data e process-upsell-payment continuam validando o token.
  assert.ok(getUpsellData.includes("transaction_tokens"));
  assert.ok(processUpsellPayment.includes("transaction_tokens"));
  // send-conversion-events mantem sua guarda de admin (o P0.6B corrigiu o
  // hash de e-mail, nao o modelo de autorizacao).
  assert.ok(
    sendConversionEvents.includes("requireAdmin"),
    "a guarda de admin deve permanecer",
  );
});
