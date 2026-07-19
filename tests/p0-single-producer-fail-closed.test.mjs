// P0 — check-payment-status deixa de ser um segundo produtor de sale.confirmed,
// e asaas-webhook falha fechado quando nao consegue reconciliar dados locais.
//
// As duas Edge Functions importam de https://deno.land/... e chamam serve() no
// topo, entao nao sao importaveis sob `node --test`. O padrao ja usado por
// tests/annual-recurring-subscription.test.mjs para o SQL da migration e afirmar
// sobre o TEXTO-FONTE; e o mesmo padrao aqui. Sao asserçoes estruturais: provam
// que o caminho divergente nao existe mais e que os retornos sao retryable.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkPaymentStatusUrl = new URL(
  "../supabase/functions/check-payment-status/index.ts",
  import.meta.url,
);
const asaasWebhookUrl = new URL(
  "../supabase/functions/asaas-webhook/index.ts",
  import.meta.url,
);

const checkPaymentStatus = await readFile(checkPaymentStatusUrl, "utf8");
const asaasWebhook = await readFile(asaasWebhookUrl, "utf8");

/** Remove comentarios de linha e de bloco para nao contar prosa como codigo. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const checkPaymentStatusCode = stripComments(checkPaymentStatus);
const asaasWebhookCode = stripComments(asaasWebhook);

// ---------------------------------------------------------------------
// 6. check-payment-status nao enfileira payload legado
// ---------------------------------------------------------------------

test("6. check-payment-status nao possui mais o emissor legado", () => {
  assert.ok(
    !checkPaymentStatusCode.includes("queueWebhooksForTransaction"),
    "a funcao do emissor legado deve ter sido removida, inclusive a chamada",
  );
});

test("6b. check-payment-status nao escreve em webhook_queue", () => {
  assert.ok(
    !checkPaymentStatusCode.includes("webhook_queue"),
    "nenhuma insercao na fila outbound pode partir do polling",
  );
});

test("6c. check-payment-status nao dispara o processador da fila", () => {
  assert.ok(
    !checkPaymentStatusCode.includes("process-webhook-queue"),
    "o polling nao pode acionar entrega de entitlement",
  );
  assert.ok(
    !checkPaymentStatusCode.includes("SUPABASE_SERVICE_ROLE_KEY\")}`"),
    "nao deve restar chamada autenticada por service role para a fila",
  );
});

test("6d. existe um unico construtor de sale.confirmed", () => {
  // asaas-webhook usa o builder canonico compartilhado.
  assert.ok(
    asaasWebhookCode.includes("buildEntitlementPayload"),
    "asaas-webhook deve continuar usando o builder canonico",
  );
  // check-payment-status nao constroi evento algum.
  assert.ok(
    !checkPaymentStatusCode.includes("sale.confirmed"),
    "check-payment-status nao pode montar nem nomear o evento de entitlement",
  );
});

// ---------------------------------------------------------------------
// 7. nenhum payload com PII extra e criado
// ---------------------------------------------------------------------

test("7. check-payment-status nao manipula PII fora do contrato canonico", () => {
  for (const field of [
    "customer_cpf_cnpj",
    "cpf_cnpj",
    "ip_address",
    "user_agent",
    "customer_phone",
    "customer_state",
  ]) {
    assert.ok(
      !checkPaymentStatusCode.includes(field),
      `campo pessoal ${field} nao deve aparecer em check-payment-status`,
    );
  }
});

test("7b. a resposta nao devolve o objeto de pagamento cru do Asaas", () => {
  assert.ok(
    !checkPaymentStatusCode.includes("payment: paymentData"),
    "o endpoint e alcancavel sem sessao autenticada; so o status pode sair",
  );
  assert.ok(
    checkPaymentStatusCode.includes("status: paymentData.status"),
    "o status deve continuar sendo devolvido para o polling do checkout",
  );
});

// ---------------------------------------------------------------------
// 8 e 9. asaas-webhook falha fechado
// ---------------------------------------------------------------------

/**
 * Recorta o corpo do handler PAYMENT_* para afirmar sobre os ramos certos.
 */
const paymentBranch = asaasWebhookCode.slice(
  asaasWebhookCode.indexOf("if (eventType && eventType.startsWith('PAYMENT_'))"),
  asaasWebhookCode.indexOf("// Handle subscription events"),
);

test("8. transacao de assinatura ausente responde retryable, nao 200", () => {
  assert.ok(
    paymentBranch.includes("Subscription transaction reconciliation failed"),
    "deve existir um retorno dedicado para falha de reconciliacao da transacao",
  );

  const marker = paymentBranch.indexOf("Subscription transaction reconciliation failed");
  const tail = paymentBranch.slice(marker, marker + 200);
  assert.match(tail, /500/, "a falha de reconciliacao deve responder 500");
  assert.match(tail, /retryable: true/, "a resposta deve se declarar retryable");
});

test("8b. o ramo so falha fechado quando ha contexto de assinatura", () => {
  // Um pagamento sem payment.subscription nunca foi nosso: continuar retentando
  // seria ruido, nao recuperacao.
  const marker = paymentBranch.indexOf("if (recurringSubscriptionAsaasId) {");
  assert.ok(marker > -1, "a decisao deve ser guardada por recurringSubscriptionAsaasId");

  const afterGuard = paymentBranch.slice(marker);
  assert.ok(
    afterGuard.includes("received: true, ignored: true"),
    "pagamento irrelevante deve continuar sendo aceito e ignorado",
  );
});

test("9. assinatura local ausente responde retryable, nao 200", () => {
  assert.ok(
    paymentBranch.includes("Subscription payment application failed"),
    "deve existir um retorno dedicado para aplicacao de pagamento nao concluida",
  );

  const marker = paymentBranch.indexOf("Subscription payment application failed");
  const tail = paymentBranch.slice(marker, marker + 200);
  assert.match(tail, /500/, "a aplicacao nao concluida deve responder 500");
  assert.match(tail, /retryable: true/, "a resposta deve se declarar retryable");
});

test("9b. nenhum dos dois ramos responde 200 com received simples", () => {
  for (const sentinel of [
    "Subscription transaction reconciliation failed",
    "Subscription payment application failed",
  ]) {
    const marker = paymentBranch.indexOf(sentinel);
    const tail = paymentBranch.slice(marker, marker + 200);
    assert.ok(
      !/jsonResponse\(\{ received: true \}\)/.test(tail),
      `${sentinel} nao pode terminar em 200 received`,
    );
  }
});

// ---------------------------------------------------------------------
// 10. falha ao enfileirar entitlement continua retryable
// ---------------------------------------------------------------------

test("10. falha de enfileiramento de entitlement permanece retryable", () => {
  assert.ok(
    paymentBranch.includes("shouldRetryEntitlementQueue(queueResult)"),
    "a classificacao de retry da fila deve continuar existindo",
  );

  // O texto aparece duas vezes: no console.error e no corpo da resposta.
  // Ancorar no segundo, que e o retorno.
  const marker = paymentBranch.indexOf("error: 'Entitlement queue failed'");
  assert.ok(marker > -1, "o retorno de falha de fila deve continuar existindo");
  const tail = paymentBranch.slice(marker, marker + 260);
  assert.match(tail, /500/, "falha de fila deve continuar respondendo 500");
  assert.match(tail, /retryable: true/, "falha de fila deve continuar retryable");
});

// ---------------------------------------------------------------------
// 11. replay do Asaas nao duplica efeito
// ---------------------------------------------------------------------

test("11. os ramos que falham marcam a inbox como failed antes de responder", () => {
  // 'failed' e reaproveitavel por resolveExistingAsaasWebhookEvent; 'processed'
  // e 'ignored' seriam tratados como duplicata final e bloqueariam o retry.
  for (const sentinel of [
    "Subscription transaction reconciliation failed",
    "Subscription payment application failed",
  ]) {
    const marker = paymentBranch.indexOf(sentinel);
    const window = paymentBranch.slice(Math.max(0, marker - 700), marker);
    assert.ok(
      window.includes("updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'failed')"),
      `${sentinel} deve marcar o evento como failed antes de responder`,
    );
  }
});

test("11b. evento failed ou received e reaproveitado no replay", () => {
  assert.ok(
    asaasWebhookCode.includes("if (existingEvent.status === 'processed' || existingEvent.status === 'ignored')"),
    "somente processed/ignored podem ser tratados como duplicata final",
  );
});

// ---------------------------------------------------------------------
// 12. fluxo valido existente continua funcionando
// ---------------------------------------------------------------------

test("12. o caminho de sucesso continua respondendo 200 e marcando processed", () => {
  assert.ok(
    paymentBranch.includes("updateAsaasWebhookEventStatus(supabaseAdmin, webhookEventRowId, 'processed')"),
    "o caminho de sucesso deve continuar marcando processed",
  );
  assert.ok(
    paymentBranch.includes("return jsonResponse({ received: true });"),
    "o caminho de sucesso deve continuar respondendo 200",
  );
});

test("12b. check-payment-status continua reconciliando a transacao", () => {
  for (const expected of [
    "from('transactions')",
    "product_sales",
    "reconciliation_status",
  ]) {
    assert.ok(
      checkPaymentStatusCode.includes(expected),
      `a reconciliacao (${expected}) deve ser preservada`,
    );
  }
});
