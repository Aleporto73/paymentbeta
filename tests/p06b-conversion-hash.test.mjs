// P0.6B — o navegador para de chamar send-conversion-events, a Edge Function
// passa a fazer SHA-256 de verdade, e get-upsell-data para de logar PII.
//
// O `hashEmail` anterior devolvia o e-mail em TEXTO PURO. Enquanto a chamada do
// checkout retornava 401 isso nunca vazou; corrigir a autorizacao sem corrigir o
// hash teria comecado a exportar e-mails de compradores para Meta e TikTok.
// Por isso o hash e o pre-requisito, e a chamada anonima sai antes.
//
// O teste do SHA-256 e de COMPORTAMENTO: reimplementa a mesma normalizacao com
// node:crypto e compara com vetores conhecidos. As afirmacoes sobre as Edge
// Functions e sobre o Checkout sao estruturais, como nos blocos anteriores.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relative) =>
  readFile(new URL(relative, import.meta.url), "utf8");

const checkout = await readSource("../src/pages/Checkout.tsx");
const sendConversionEvents = await readSource(
  "../supabase/functions/send-conversion-events/index.ts",
);
const getUpsellData = await readSource(
  "../supabase/functions/get-upsell-data/index.ts",
);

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const checkoutCode = stripComments(checkout);
const conversionCode = stripComments(sendConversionEvents);
const upsellCode = stripComments(getUpsellData);

// ---------------------------------------------------------------------
// 1-4. o navegador nao chama mais a Edge Function
// ---------------------------------------------------------------------

test("1. o frontend nao chama send-conversion-events", () => {
  assert.ok(
    !checkoutCode.includes("send-conversion-events"),
    "a invocacao da Edge Function deve ter sumido do Checkout",
  );
  assert.ok(
    !checkoutCode.includes("sendConversionEvent"),
    "nenhuma chamada remanescente",
  );
  assert.ok(
    !checkoutCode.includes("useConversionTracking"),
    "o hook morto nao pode continuar importado",
  );
});

test("2. InitiateCheckout continua disparando pixel client-side", () => {
  assert.ok(
    checkoutCode.includes('fireClientSideEvent("InitiateCheckout", totalPrice)'),
    "o pixel de InitiateCheckout deve ser preservado",
  );
});

test("3. Purchase continua disparando pixel client-side", () => {
  const ocorrencias = checkoutCode.match(
    /fireClientSideEvent\("Purchase", totalPrice, [^)]+\)/g,
  ) ?? [];

  // Dois caminhos: PIX (onSuccess) e cartao.
  assert.equal(
    ocorrencias.length,
    2,
    `esperados 2 disparos de Purchase, encontrados ${ocorrencias.length}`,
  );
});

test("3b. as quatro plataformas client-side seguem intactas", () => {
  for (const plataforma of ["meta", "google", "tiktok", "taboola"]) {
    assert.ok(
      checkoutCode.includes(`case "${plataforma}":`),
      `a plataforma ${plataforma} deve continuar no fireClientSideEvent`,
    );
  }
  for (const global of ["fbq", "gtag", "ttq", "_tfa"]) {
    assert.ok(checkoutCode.includes(global), `o pixel ${global} deve permanecer`);
  }
});

test("4. o checkout nao envia payload de conversao nem credencial", () => {
  for (const proibido of [
    "customerEmail:",
    "customerName:",
    "SERVICE_ROLE",
    "service_role",
    "serviceRole",
  ]) {
    assert.ok(
      !checkoutCode.includes(proibido),
      `${proibido} nao pode aparecer no Checkout`,
    );
  }
});

// ---------------------------------------------------------------------
// 5-8. SHA-256 real
// ---------------------------------------------------------------------

/** Mesma normalizacao da Edge Function, para gerar vetores esperados. */
const sha256Email = (email) =>
  createHash("sha256").update(email.toLowerCase().trim()).digest("hex");

test("5. hashEmail nao devolve mais o e-mail normalizado", () => {
  assert.ok(
    !conversionCode.includes("return normalized;"),
    "o retorno em texto puro deve ter sido eliminado",
  );
  // A chamada e multilinha; tolerar quebras entre o parenteses e o algoritmo.
  assert.match(
    conversionCode,
    /crypto\.subtle\.digest\(\s*"SHA-256"/,
    "deve usar SHA-256 de verdade",
  );
  assert.ok(
    /async function hashEmail\(email: string\): Promise<string>/.test(conversionCode),
    "hashEmail deve ser assincrona e tipada como Promise<string>",
  );
});

test("6. SHA-256 conhecido gera hexadecimal de 64 caracteres", () => {
  // Vetor canonico: SHA-256 de "" (string vazia).
  assert.equal(
    createHash("sha256").update("").digest("hex"),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );

  const hash = sha256Email("  Comprador@Exemplo.COM  ");
  assert.match(hash, /^[0-9a-f]{64}$/, "hex minusculo de 64 chars");

  // A normalizacao precisa colapsar caixa e espacos.
  assert.equal(hash, sha256Email("comprador@exemplo.com"));
  // E nao pode, em hipotese alguma, coincidir com o texto puro.
  assert.notEqual(hash, "comprador@exemplo.com");
});

test("7. Meta recebe o e-mail em SHA-256, com await", () => {
  assert.ok(
    conversionCode.includes("const hashedEmail = customerEmail ? await hashEmail(customerEmail) : undefined;"),
    "o hash deve ser aguardado antes de montar o payload",
  );
  assert.ok(
    conversionCode.includes("em: hashedEmail,"),
    "o campo em da Meta deve receber o hash",
  );
  assert.ok(
    !conversionCode.includes("em: customerEmail"),
    "o campo em nunca pode receber o e-mail cru",
  );
});

test("8. TikTok recebe o e-mail em SHA-256, com await", () => {
  assert.ok(
    conversionCode.includes("email: hashedEmail,"),
    "o campo email do TikTok deve receber o hash",
  );
  assert.ok(
    !conversionCode.includes("email: customerEmail"),
    "o campo email nunca pode receber o e-mail cru",
  );
  // Nenhuma chamada a hashEmail pode ter ficado sem await.
  const semAwait = conversionCode.match(/(?<!await )hashEmail\(/g) ?? [];
  const declaracao = conversionCode.match(/function hashEmail\(/g) ?? [];
  assert.equal(
    semAwait.length,
    declaracao.length,
    "toda chamada a hashEmail deve usar await",
  );
});

test("9. transactionId continua sendo o event_id", () => {
  const ocorrencias = conversionCode.match(
    /event_id: transactionId \|\| `\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\}`/g,
  ) ?? [];
  assert.equal(ocorrencias.length, 2, "Meta e TikTok mantem a idempotencia");
});

test("9b. autorizacao e providers da Edge Function seguem inalterados", () => {
  for (const preservado of [
    "requireAdmin",
    "user_roles",
    "sendMetaPixelEvent",
    "sendGoogleAdsEvent",
    "sendTikTokPixelEvent",
    "sendTaboolaPixelEvent",
    "product_ads_configs",
  ]) {
    assert.ok(
      conversionCode.includes(preservado),
      `${preservado} nao pode ter sido alterado neste bloco`,
    );
  }
});

// ---------------------------------------------------------------------
// 10-11. logs sem PII
// ---------------------------------------------------------------------

test("10. get-upsell-data nao registra mais tokenData", () => {
  assert.ok(
    !upsellCode.includes('console.log("[get-upsell-data] Token validated:", tokenData)'),
    "a linha completa do token nao pode ir para log",
  );
  assert.ok(
    upsellCode.includes('console.log("[get-upsell-data] Token validated")'),
    "o log tecnico sanitizado deve permanecer",
  );
});

test("11. nenhum log expoe token completo, nome, e-mail ou id de cliente", () => {
  const logs = upsellCode.match(/console\.(log|warn|error)\([\s\S]{0,200}?\);/g) ?? [];
  assert.ok(logs.length > 0);

  for (const linha of logs) {
    for (const proibido of [
      "tokenData)",
      "tokenData,",
      "customer_email",
      "customer_name",
      "asaas_customer_id",
    ]) {
      assert.ok(
        !linha.includes(proibido),
        `log nao pode conter ${proibido}: ${linha.slice(0, 80)}`,
      );
    }
  }

  // O token so pode aparecer truncado, nunca inteiro. Interpolar o valor cru
  // (`${transactionToken}`) e o que precisa ser impedido -- a CHAVE
  // `transactionToken:` num objeto de log e apenas um rotulo.
  assert.ok(
    !/\$\{transactionToken\}/.test(upsellCode),
    "o token nunca pode ser interpolado inteiro",
  );
  assert.ok(
    upsellCode.includes("transactionToken.substring(0, 10)"),
    "o log de correlacao deve usar o token truncado",
  );
});

// ---------------------------------------------------------------------
// 13-14. blocos anteriores intactos
// ---------------------------------------------------------------------

test("13. o polling PIX do P0.5 permanece intacto", () => {
  assert.ok(
    checkoutCode.includes("pollingToken: paymentResult?.pollingToken || null"),
    "a capacidade de polling deve continuar sendo repassada",
  );
  assert.ok(checkoutCode.includes("usePixPaymentPolling"));
});

test("14. o P0.6A continua valendo: sem transaction_token", () => {
  assert.ok(!checkoutCode.includes("transaction_token"));
  assert.ok(!checkoutCode.includes("localStorage"));
  assert.ok(!checkoutCode.includes("generate-transaction-token"));
});
