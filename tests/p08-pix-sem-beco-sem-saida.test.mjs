// P0.8 — o fluxo PIX nao pode virar beco sem saida.
//
// Quatro defeitos corrigidos em 04/08/2026:
//   1. Modal do PIX fechado nao tinha como ser reaberto e o CTA voltava a
//      oferecer "Gerar PIX" como se nenhuma cobranca existisse.
//   2. create-payment podia criar a cobranca, falhar no /pixQrCode e devolver
//      success: true com pixData: null — modal em branco, CPF preso no guard.
//   3. Timeout do polling redirecionava para /pagamento-recusado sem existir
//      recusa financeira.
//   4. Retentativa dentro da janela de 30 min recebia so um bloqueio generico
//      em vez de recuperar a cobranca PIX ja criada.
//
// Checkout.tsx e o hook sao React/TSX com alias '@/' e a Edge Function e
// Deno — nenhum importavel sob `node --test`. Seguindo o padrao de
// p06a/p07, as afirmacoes sao sobre o texto-fonte.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const checkoutCode = stripComments(await readSource("../src/pages/Checkout.tsx"));
const pollingCode = stripComments(await readSource("../src/hooks/usePixPaymentPolling.ts"));
const createPaymentCode = stripComments(
  await readSource("../supabase/functions/create-payment/index.ts"),
);
const recoveryModuleCode = stripComments(
  await readSource("../supabase/functions/_shared/vitalicioPixRecovery.ts"),
);

// ---------------------------------------------------------------------
// Cenario 1 — PIX criado: modal fecha e o mesmo QR pode ser reaberto
// ---------------------------------------------------------------------

test("1a. existe um CTA 'Ver PIX novamente' que reabre o modal sem submit", () => {
  assert.ok(
    checkoutCode.includes("Ver PIX novamente"),
    "o botao de reabertura deve existir",
  );

  // O CTA de reabertura e type="button" com onClick que so reabre o modal.
  const reopenIdx = checkoutCode.indexOf("hasOpenPixCharge ? (");
  assert.ok(reopenIdx >= 0, "mainCta deve ser condicional em hasOpenPixCharge");
  const reopenEnd = checkoutCode.indexOf(") : (", reopenIdx);
  assert.ok(reopenEnd > reopenIdx, "o ternario do mainCta deve ter os dois ramos");
  const reopenBranch = checkoutCode.slice(reopenIdx, reopenEnd);
  assert.match(reopenBranch, /type="button"/);
  assert.match(reopenBranch, /setShowPixModal\(true\)/);
  assert.doesNotMatch(reopenBranch, /type="submit"/);
});

test("1b. com cobranca PIX aberta o CTA nao volta a oferecer 'Gerar PIX'", () => {
  assert.match(
    checkoutCode,
    /const hasOpenPixCharge =\s*\n?\s*selectedPaymentMethod === "pix" && Boolean\(paymentResult\?\.payment\?\.id\)/,
  );
  // O texto "Gerar PIX" vive apenas no ramo sem cobranca aberta (o else do
  // ternario de mainCta) e no aviso informativo do PIX.
  const submitIdx = checkoutCode.indexOf('selectedPaymentMethod === "pix" ? "Gerar PIX"');
  assert.ok(submitIdx > checkoutCode.indexOf("hasOpenPixCharge ? ("));
});

test("1c. um novo submit com cobranca PIX aberta reabre o modal e NAO invoca create-payment", () => {
  const guardIdx = checkoutCode.indexOf(
    'if (paymentMethod === "pix" && paymentResult?.payment?.id)',
  );
  assert.ok(guardIdx >= 0, "handleSubmit deve ter a guarda de ressubmissao");
  const guardBlock = checkoutCode.slice(guardIdx, guardIdx + 200);
  assert.match(guardBlock, /setShowPixModal\(true\);\s*\n?\s*return;/);
  // A guarda vem antes da chamada da edge function.
  assert.ok(guardIdx < checkoutCode.indexOf('supabase.functions.invoke("create-payment"'));
});

test("1d. fechar o modal nao apaga paymentResult", () => {
  // onOpenChange apenas alterna o estado do modal.
  assert.match(checkoutCode, /<Dialog open={showPixModal} onOpenChange={setShowPixModal}>/);
  // Nenhum caminho de fechamento zera o resultado: setPaymentResult(null) so
  // existe no tratamento de bloqueio do guard vitalicio.
  const clears = checkoutCode.match(/setPaymentResult\(null\)/g) ?? [];
  assert.equal(clears.length, 1, "paymentResult so pode ser limpo no bloqueio do guard");
});

test("1e. nunca ha dois CTAs concorrentes", () => {
  // A barra fixa mobile some com o modal aberto e reusa o MESMO mainCta.
  assert.match(
    checkoutCode,
    /\{!showPixModal && \(hasOpenPixCharge \|\| !paymentResult\) && \(/,
  );
  const mainCtaUses = checkoutCode.match(/\{mainCta\}/g) ?? [];
  assert.equal(mainCtaUses.length, 2, "desktop e barra mobile devem reusar o mesmo mainCta");
});

// ---------------------------------------------------------------------
// Cenario 2 — falha ao buscar o QR Code nao retorna sucesso vazio
// ---------------------------------------------------------------------

test("2a. create-payment devolve resposta estruturada quando o QR nao vem", () => {
  assert.ok(createPaymentCode.includes('result: "pix_qr_unavailable"'));

  // O bloco do fluxo principal (nao o do helper de recuperacao, que aparece
  // antes no arquivo): e o que loga a falha por status HTTP.
  const pixBlockIdx = createPaymentCode.indexOf("PIX QR Code fetch failed with HTTP");
  assert.ok(pixBlockIdx >= 0, "bloco principal do pixQrCode deve existir");
  const pixBlock = createPaymentCode.slice(pixBlockIdx, pixBlockIdx + 2500);

  // O caminho de falha nao devolve sucesso normal…
  assert.match(pixBlock, /success: false/);
  // …mas preserva a evidencia da cobranca criada e os meios de pagar/confirmar.
  assert.match(pixBlock, /payment: \{/);
  assert.match(pixBlock, /transaction: transactionData/);
  assert.match(pixBlock, /pollingToken: pollCapability\?\.token \?\? null/);
  assert.match(pixBlock, /invoiceUrl: paymentResult\.invoiceUrl \?\? null/);
});

test("2b. a falha do QR nao dispara segunda cobranca nem apaga o guard", () => {
  const pixBlockIdx = createPaymentCode.indexOf("PIX QR Code fetch failed with HTTP");
  const pixBlock = createPaymentCode.slice(pixBlockIdx, pixBlockIdx + 2500);
  // Nenhum POST novo em /payments e nenhuma liberacao de guard dentro do bloco.
  assert.doesNotMatch(pixBlock, /method: "POST"/);
  assert.doesNotMatch(pixBlock, /markVitalicioGuardFailed/);
});

test("2c. o log da falha do QR contem apenas dados tecnicos", () => {
  const pixBlockIdx = createPaymentCode.indexOf("PIX QR Code fetch failed with HTTP");
  const pixBlock = createPaymentCode.slice(pixBlockIdx, pixBlockIdx + 2500);
  for (const sensivel of ["cpfCnpj", "customerData.email", "customerData.name", "pollingToken:"]) {
    const logLines = pixBlock
      .split("\n")
      .filter((line) => line.includes("console.error"));
    for (const line of logLines) {
      assert.ok(!line.includes(sensivel), `log nao pode conter ${sensivel}`);
    }
  }
});

test("2d. o frontend trata pix_qr_unavailable sem acusar recusa", () => {
  const handlerIdx = checkoutCode.indexOf('data?.result === "pix_qr_unavailable"');
  assert.ok(handlerIdx >= 0, "Checkout deve tratar pix_qr_unavailable");
  const handler = checkoutCode.slice(handlerIdx, handlerIdx + 600);
  assert.match(handler, /setPaymentResult\(data\)/);
  assert.doesNotMatch(handler, /pagamento-recusado|recusado|toast\.error/i);

  // Fallback visivel: pagina do PIX via invoiceUrl.
  assert.ok(checkoutCode.includes("Abrir página do PIX"));
  assert.match(checkoutCode, /window\.open\(paymentResult\.invoiceUrl/);
});

// ---------------------------------------------------------------------
// Cenario 3 — timeout do polling nao e recusa
// ---------------------------------------------------------------------

test("3a. o hook separa onTimeout de onRefused e o timeout nao redireciona", () => {
  assert.match(pollingCode, /onRefused: \(status: string\) => void/);
  assert.match(pollingCode, /onTimeout: \(\) => void/);

  const timeoutIdx = pollingCode.indexOf("elapsed >= DEFAULT_CONFIG.maxDuration");
  const timeoutBlock = pollingCode.slice(timeoutIdx, timeoutIdx + 300);
  assert.match(timeoutBlock, /onTimeout\(\)/);
  assert.doesNotMatch(timeoutBlock, /onRefused|recusad/i);
  assert.doesNotMatch(pollingCode, /pagamento-recusado/);
});

test("3b. no Checkout o timeout mantem o PIX acessivel e permite verificar de novo", () => {
  const timeoutHandlerIdx = checkoutCode.indexOf("onTimeout: () => {");
  assert.ok(timeoutHandlerIdx >= 0);
  const timeoutHandler = checkoutCode.slice(timeoutHandlerIdx, timeoutHandlerIdx + 400);
  assert.match(timeoutHandler, /setPixPollingTimedOut\(true\)/);
  assert.match(timeoutHandler, /Ainda não recebemos a confirmação do pagamento/);
  assert.doesNotMatch(timeoutHandler, /window\.location|pagamento-recusado|toast\.error/);

  // Orientacao curta + reinicio somente por acao explicita.
  assert.ok(checkoutCode.includes("O PIX continua disponível. A confirmação pode levar alguns instantes."));
  const retryIdx = checkoutCode.indexOf("Já paguei — verificar novamente");
  assert.ok(retryIdx >= 0, "botao de reverificacao deve existir");
  const retryBlock = checkoutCode.slice(retryIdx - 600, retryIdx);
  assert.match(retryBlock, /setPixPollingTimedOut\(false\)/);
  assert.match(retryBlock, /startPolling\(\)/);
});

test("3c. o reinicio do polling nao e automatico", () => {
  // startPolling so aparece: na definicao/exposicao do hook e no clique do
  // botao de reverificacao do Checkout. O effect do hook so dispara na
  // transicao de `enabled`.
  const checkoutStarts = checkoutCode.match(/startPolling\(\)/g) ?? [];
  assert.equal(checkoutStarts.length, 1, "startPolling deve ser chamado apenas pelo clique");
});

// ---------------------------------------------------------------------
// Cenario 4 — recusa real continua no fluxo de recusa
// ---------------------------------------------------------------------

test("4a. o hook detecta recusa financeira definitiva e para o polling", () => {
  for (const status of ["REFUSED", "DECLINED", "FAILED", "REJECTED", "CANCELLED", "DELETED"]) {
    assert.ok(pollingCode.includes(`'${status}'`), `status ${status} deve ser terminal`);
  }
  const refusedIdx = pollingCode.indexOf("REFUSED_STATUSES.has(data.status)");
  assert.ok(refusedIdx >= 0);
  const refusedBlock = pollingCode.slice(refusedIdx, refusedIdx + 250);
  assert.match(refusedBlock, /onRefused\(data\.status\)/);
  assert.match(refusedBlock, /return true/);
});

test("4b. o Checkout redireciona para recusa somente em onRefused", () => {
  const refusedHandlerIdx = checkoutCode.indexOf("onRefused: () => {");
  assert.ok(refusedHandlerIdx >= 0);
  const refusedHandler = checkoutCode.slice(refusedHandlerIdx, refusedHandlerIdx + 500);
  assert.match(refusedHandler, /rejected_payment_redirect_url \|\| "\/pagamento-recusado"/);
  assert.match(refusedHandler, /window\.location\.href = redirectUrl/);
});

// ---------------------------------------------------------------------
// Cenario 5 — cobranca recente existente e recuperada, nao duplicada
// ---------------------------------------------------------------------

test("5a. purchase_processing com PIX tenta recuperar a cobranca existente", () => {
  const processingIdx = createPaymentCode.indexOf(
    'reservation?.result === "purchase_processing"',
  );
  assert.ok(processingIdx >= 0);
  const processingBlock = createPaymentCode.slice(processingIdx, processingIdx + 1600);
  assert.match(processingBlock, /billingType === "PIX"/);
  assert.match(processingBlock, /recoverVitalicioPendingPix\(/);
  // A tentativa atual leva o price_id, a COMPOSICAO validada pelo servidor
  // (bumps, cupom, desconto) e o total CALCULADO PELO SERVIDOR.
  assert.match(processingBlock, /priceId: price\.id/);
  assert.match(processingBlock, /orderBumpIds: selectedOrderBumpIds/);
  assert.match(processingBlock, /couponCode: validatedCoupon\?\.code \?\? null/);
  assert.match(processingBlock, /expectedDiscountTotal: serverDiscount/);
  assert.match(processingBlock, /expectedChargeTotal: serverChargeTotal/);
  assert.match(processingBlock, /recovered: true/);
  assert.match(processingBlock, /Você já possui um PIX disponível\. Continue com o pagamento abaixo\./);
  // Sem recuperacao possivel, o comportamento anterior permanece.
  assert.match(processingBlock, /vitalicioGuardResponse\("purchase_processing", 202\)/);
});

test("5b. a recuperacao nunca cria cobranca nova nem afrouxa o que bloqueia", () => {
  // A logica agora vive em _shared/vitalicioPixRecovery.ts (importavel pelo
  // node, entao tambem coberta por testes COMPORTAMENTAIS no p09).
  const helper = recoveryModuleCode;

  // Somente leitura no Asaas: nenhum POST.
  assert.doesNotMatch(helper, /method: "POST"/);
  // So recupera PIX PENDING do MESMO preco; status e valor ao vivo revalidam.
  assert.match(helper, /\.eq\("billing_type", "PIX"\)/);
  assert.match(helper, /\.eq\("status", "PENDING"\)/);
  assert.match(helper, /\.eq\("price_id", attempt\.priceId\)/);
  assert.match(helper, /matchesCurrentAttempt\(candidate, attempt\)/);
  assert.match(helper, /isLiveChargeRecoverable\(livePayment, attempt\)/);
  // Composicao: conjunto canonico de bumps e cupom canonico fazem parte da
  // decisao — o total sozinho nunca prova a compra.
  assert.match(helper, /normalizeOrderBumpIds\(row\.order_bumps_selected\)/);
  assert.match(helper, /normalizeCouponCode\(row\.coupon_code\)/);
  // Dinheiro comparado em centavos inteiros, nunca em float.
  assert.match(helper, /Math\.round\(parsed \* 100\)/);
  // Nao mexe no guard nem nas regras de bloqueio.
  assert.doesNotMatch(helper, /vitalicio_purchase_guards/);
  // A unica escrita e a rotacao da capacidade de polling na MESMA linha.
  const updates = helper.match(/\.update\(/g) ?? [];
  assert.equal(updates.length, 1, "a unica escrita permitida e a rotacao do poll token");
  assert.match(helper, /payment_poll_token_hash: capability\.tokenHash/);
});

test("5c. o frontend exibe a cobranca recuperada sem contar conversao nova", () => {
  const recoveredIdx = checkoutCode.indexOf("data?.recovered");
  assert.ok(recoveredIdx >= 0);
  const recoveredBlock = checkoutCode.slice(recoveredIdx, recoveredIdx + 600);
  assert.match(recoveredBlock, /setPaymentResult\(data\)/);
  assert.doesNotMatch(recoveredBlock, /trackConversion/);
});

// ---------------------------------------------------------------------
// Cenario 6 — compra realmente paga continua bloqueada
// ---------------------------------------------------------------------

test("6. purchase_blocked nao passa pela recuperacao", () => {
  const blockedIdx = createPaymentCode.indexOf('reservation?.result === "purchase_blocked"');
  assert.ok(blockedIdx >= 0);
  const blockedBlock = createPaymentCode.slice(
    blockedIdx,
    createPaymentCode.indexOf('reservation?.result === "purchase_processing"'),
  );
  assert.match(blockedBlock, /vitalicioGuardResponse\("purchase_blocked", 200\)/);
  assert.doesNotMatch(blockedBlock, /recoverVitalicioPendingPix/);
});

// ---------------------------------------------------------------------
// Cenario 7 — description curta no PIX, completa na transacao local
// ---------------------------------------------------------------------

test("7a. o payload do Asaas usa a descricao curta somente no PIX", () => {
  assert.match(
    createPaymentCode,
    /const pixShortDescription =\s*\n?\s*String\(product\.name\)\.split\(" - "\)\[0\]\.trim\(\)/,
  );
  assert.match(
    createPaymentCode,
    /const chargeDescription =\s*\n?\s*billingType === "PIX" \? pixShortDescription : serverDescription/,
  );

  // O payload enviado ao Asaas usa a descricao condicional…
  const payloadIdx = createPaymentCode.indexOf("const paymentPayload: any = {");
  const payloadBlock = createPaymentCode.slice(payloadIdx, payloadIdx + 400);
  assert.match(payloadBlock, /description: chargeDescription/);
  // …e o externalReference nao mudou.
  assert.match(payloadBlock, /externalReference: serverExternalReference/);
});

test("7b. a transacao local e a assinatura mantem a descricao completa", () => {
  // Busca tolerante a CRLF: o insert da transacao e o unico .insert em
  // "transactions" com o campo user_id na sequencia.
  const insertMatch = createPaymentCode.match(
    /\.from\("transactions"\)\s*\.insert\(\{[\s\S]{0,2200}/,
  );
  assert.ok(insertMatch, "insert da transacao deve existir");
  const insertBlock = insertMatch[0];
  assert.match(insertBlock, /description: serverDescription/);

  // Assinatura (cartao) nao foi alterada.
  const subscriptionIdx = createPaymentCode.indexOf("const subscriptionPayload: any = {");
  const subscriptionBlock = createPaymentCode.slice(subscriptionIdx, subscriptionIdx + 400);
  assert.match(subscriptionBlock, /description: serverDescription/);
});

test("7c. exemplo do vitalicio: a descricao curta e exatamente o nome-base", () => {
  // Mesma expressao aplicada pelo servidor.
  const short = "PsicoPlanilhas - Acesso Vitalício".split(" - ")[0].trim();
  assert.equal(short, "PsicoPlanilhas");
});
