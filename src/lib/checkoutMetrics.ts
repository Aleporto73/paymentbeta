// Contagens do funil do checkout.
//
// A regra que organiza tudo: o navegador mede navegacao e intencao; o banco
// mede cobranca e venda.
//
//   acessos            evento `view`, uma vez por sessao
//   tentativas         evento `payment_attempt`, uma vez por sessao
//   cobrancas criadas  linhas de `transactions`
//   vendas confirmadas `transactions` com status aprovado
//
// Eventos historicos (`abandon`, `conversion`, `payment_created`) continuam no
// banco e nao entram em conta nenhuma. `abandon` era `beforeunload` e disparava
// ate no redirect pos-compra; os outros dois eram o navegador afirmando que uma
// cobranca existia, sem ter como provar.

export const CHECKOUT_EVENT = {
  view: "view",
  paymentAttempt: "payment_attempt",
} as const;

/** Status do Asaas que significam dinheiro recebido. */
export const APPROVED_TRANSACTION_STATUSES = ["RECEIVED", "CONFIRMED"];

export interface CheckoutEvent {
  event_type: string;
  session_id: string;
  product_id?: string | null;
}

export interface ChargeTransaction {
  asaas_payment_id?: string | null;
  product_id?: string | null;
  status?: string | null;
}

/**
 * Sessoes distintas que registraram um dos tipos pedidos. Contar linhas fazia
 * de cada reload um visitante novo.
 */
export function countSessions(
  events: readonly CheckoutEvent[],
  eventTypes: readonly string[],
  productId?: string | null,
): number {
  const sessions = new Set<string>();

  for (const event of events) {
    if (!event?.session_id || !eventTypes.includes(event.event_type)) continue;
    if (productId && event.product_id !== productId) continue;
    sessions.add(event.session_id);
  }

  return sessions.size;
}

/**
 * Cobrancas criadas: uma linha de `transactions` por cobranca real do Asaas.
 *
 * Todos os status entram — PENDING, OVERDUE, CONFIRMED, RECEIVED —, porque a
 * cobranca existiu no gateway. Isso NAO e venda.
 *
 * PIX recuperado nao cria linha nova (create-payment devolve a transacao que ja
 * existe), entao nao ha o que deduplicar.
 *
 * As linhas ja chegam filtradas pelo mesmo periodo dos eventos.
 */
export function countChargesCreated(
  transactions: readonly ChargeTransaction[],
  productId?: string | null,
): number {
  return transactions.filter(
    (transaction) =>
      transaction?.asaas_payment_id?.trim()
      && (!productId || transaction.product_id === productId),
  ).length;
}

/** Vendas confirmadas: subconjunto financeiro das cobrancas criadas. */
export function countConfirmedSales(
  transactions: readonly ChargeTransaction[],
  productId?: string | null,
): number {
  return transactions.filter(
    (transaction) =>
      transaction?.asaas_payment_id?.trim()
      && APPROVED_TRANSACTION_STATUSES.includes(String(transaction.status))
      && (!productId || transaction.product_id === productId),
  ).length;
}
