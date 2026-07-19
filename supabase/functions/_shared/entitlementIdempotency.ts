// Chaves de idempotencia dos eventos de entitlement.
//
// Cada chave identifica um FATO FINANCEIRO, nao uma entrega. Duas linhas na
// outbox com a mesma chave e o mesmo destino sao o mesmo fato, e a segunda deve
// ser descartada. `delivery_id` continua identificando a tentativa de entrega e
// nao se mistura com isto.
//
// A chave e sempre a MINIMA que separa fatos legitimos. Incluir campo a mais
// tambem quebra: `pending:{subscription_id}:{transaction_id}` permitiria dois
// pendings para a mesma assinatura, que e exatamente o que a janela provisoria
// de 7 dias nao pode sofrer.
//
// Deliberadamente FORA de toda chave:
//   * occurred_at -- e auditoria; o mesmo fato reenviado tem occurred_at novo;
//   * o event id do webhook Asaas -- o mesmo fato financeiro chega por eventos
//     diferentes (PAYMENT_CONFIRMED e PAYMENT_RECEIVED sao o mesmo pagamento);
//   * qualquer dado pessoal -- e-mail, nome, CPF, telefone.

/** Lancado quando falta um identificador obrigatorio da chave. */
export class IdempotencyKeyError extends Error {}

const required = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new IdempotencyKeyError(
      `${field} is required to build an entitlement idempotency key`,
    );
  }
  return value.trim();
};

/**
 * Pagamento de assinatura confirmado.
 *
 * Ciclo novo tem pagamento novo, entao renovacao gera chave nova. CONFIRMED e
 * RECEIVED do mesmo pagamento colapsam, que e o desejado: sao o mesmo fato.
 */
export const confirmedSubscriptionKey = (
  subscriptionId: unknown,
  asaasPaymentId: unknown,
): string =>
  `confirmed:${required(subscriptionId, "subscription_id")}:${
    required(asaasPaymentId, "asaas_payment_id")
  }`;

/**
 * Venda avulsa, pre-paga ou legada -- sem assinatura.
 *
 * A transacao e a identidade. NUNCA fabricar um subscription_id para caber na
 * chave de assinatura: no consumidor isso criaria um escopo de assinatura falso.
 */
export const confirmedTransactionKey = (transactionId: unknown): string =>
  `confirmed:tx:${required(transactionId, "transaction_id")}`;

/**
 * Cancelamento de assinatura.
 *
 * Um por assinatura, para sempre: admin e cliente cancelando a mesma assinatura
 * produzem o mesmo fato, e um cancelamento retentado nao pode enfileirar uma
 * segunda revogacao.
 */
export const cancelledKey = (subscriptionId: unknown): string =>
  `cancelled:${required(subscriptionId, "subscription_id")}`;

// ---------------------------------------------------------------------
// Previstas para os eventos novos. Ainda NAO utilizadas: nenhum emissor as
// chama neste bloco. Vivem aqui para que a decisao de chave seja revisada junto
// com as demais, em vez de ser improvisada no bloco que emitir o evento.
// ---------------------------------------------------------------------

/**
 * Primeira cobranca pendente.
 *
 * Um por assinatura, para sempre. Sem transaction_id de proposito: a janela
 * provisoria de 7 dias nasce uma unica vez, e o consumidor aplica MIN
 * justamente para que repeticao nao prorrogue. Uma chave por transacao
 * permitiria dois pendings da mesma assinatura.
 */
export const pendingKey = (subscriptionId: unknown): string =>
  `pending:${required(subscriptionId, "subscription_id")}`;

/**
 * Falha de renovacao, por ciclo.
 *
 * `cycleFrom` deve ser o transactions.due_date imutavel da cobranca vencida --
 * nunca current_period_end, que se move. Nova falha do MESMO ciclo colapsa;
 * ciclo seguinte tem due_date diferente e por isso ganha carencia propria.
 */
export const paymentFailedKey = (
  subscriptionId: unknown,
  cycleFrom: unknown,
): string =>
  `failed:${required(subscriptionId, "subscription_id")}:${
    required(cycleFrom, "cycle_from")
  }`;

/**
 * Revogacao por estorno.
 *
 * Separada do chargeback DE PROPOSITO. O indice legado da outbox e
 * (transaction_id, event, webhook_url): como os dois fatos compartilham o mesmo
 * `event`, um chargeback posterior a um refund da mesma transacao seria
 * descartado como duplicata. Sao fatos distintos, com efeitos distintos no
 * consumidor -- finito versus infinity -- e precisam de chaves distintas.
 */
export const revokedRefundKey = (asaasPaymentId: unknown): string =>
  `revoked:refund:${required(asaasPaymentId, "asaas_payment_id")}`;

/** Revogacao por chargeback. Ver a nota em revokedRefundKey. */
export const revokedChargebackKey = (asaasPaymentId: unknown): string =>
  `revoked:chargeback:${required(asaasPaymentId, "asaas_payment_id")}`;
