// Regras dos tres eventos financeiros de assinatura.
//
// Funcoes PURAS, sem import de deno.land: as decisoes que definem quanto tempo
// de acesso alguem tem -- e se um evento deve existir -- ficam testaveis sem
// subir Edge Function.
//
// PRINCIPIO QUE ATRAVESSA O ARQUIVO INTEIRO:
// nenhum prazo deriva de now(). Todos derivam de datas IMUTAVEIS ja gravadas --
// subscriptions.created_at e transactions.due_date. Se o prazo dependesse do
// instante da emissao, um evento reenviado, atrasado ou reprocessado concederia
// acesso novo, e a janela provisoria de 7 dias viraria 7 dias a cada tentativa.

/** Janela provisoria da primeira compra pendente. */
export const PENDING_WINDOW_DAYS = 7;

/** Carencia de uma renovacao que falhou. */
export const GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDaysIso = (value: unknown, days: number): string | null => {
  const base = parseDate(value);
  return base ? new Date(base.getTime() + days * DAY_MS).toISOString() : null;
};

/**
 * Fim da janela provisoria: subscriptions.created_at + 7 dias.
 *
 * NUNCA now() + 7. O consumidor aplica MIN nesta data justamente para que
 * repeticao nao prorrogue -- mas a garantia comeca aqui: mesmo que o evento
 * seja emitido tres vezes, em dias diferentes, o valor e sempre o mesmo.
 */
export const pendingExpiresAt = (subscriptionCreatedAt: unknown): string | null =>
  addDaysIso(subscriptionCreatedAt, PENDING_WINDOW_DAYS);

/**
 * Ancora do ciclo que falhou: transactions.due_date, imutavel.
 *
 * Deliberadamente NAO e current_period_end, que se move a cada pagamento: com
 * ele, reemitir a mesma falha pareceria um ciclo novo e reiniciaria a carencia.
 */
export const failedCycleFrom = (dueDate: unknown): string | null => {
  const parsed = parseDate(dueDate);
  return parsed ? parsed.toISOString() : null;
};

/** Fim da carencia: due_date + 3 dias. NUNCA now() + 3. */
export const failedExpiresAt = (dueDate: unknown): string | null =>
  addDaysIso(dueDate, GRACE_DAYS);

/**
 * Primeira compra pendente?
 *
 * A pergunta e "esta assinatura ja teve ALGUM pagamento aplicado?", e a resposta
 * durável esta no ledger subscription_payment_applications -- nao em datas
 * proximas, nem em last_payment_id, que continua nulo tanto na primeira cobranca
 * pendente quanto na primeira que vence sem pagar.
 */
export const shouldEmitPending = (ledgerCount: number): boolean => ledgerCount === 0;

export type PaymentFailedDecision =
  | { emit: true; cycleFrom: string; expiresAt: string }
  | { emit: false; reason: "first_charge" | "already_applied" | "missing_due_date" };

/**
 * Falha de RENOVACAO, nunca de primeira compra.
 *
 * Tres recusas distintas, porque significam coisas diferentes na auditoria:
 *   * first_charge     -> quem governa e a janela provisoria de 7 dias. Somar
 *                         carencia aqui daria 10 dias no primeiro ciclo;
 *   * already_applied  -> este pagamento ja foi aplicado; um OVERDUE tardio
 *                         sobre cobranca ja paga nao e falha;
 *   * missing_due_date -> sem ancora imutavel nao ha como posicionar a carencia.
 *                         Falha fechada: fabricar a data seria inventar prazo.
 */
export const decidePaymentFailed = (args: {
  ledgerCount: number;
  currentPaymentInLedger: boolean;
  dueDate: unknown;
}): PaymentFailedDecision => {
  if (args.ledgerCount === 0) return { emit: false, reason: "first_charge" };
  if (args.currentPaymentInLedger) return { emit: false, reason: "already_applied" };

  const cycleFrom = failedCycleFrom(args.dueDate);
  const expiresAt = failedExpiresAt(args.dueDate);
  if (!cycleFrom || !expiresAt) return { emit: false, reason: "missing_due_date" };

  return { emit: true, cycleFrom, expiresAt };
};

export type RevocationKind = "refund" | "chargeback";

/**
 * Que tipo de revogacao este status Asaas representa -- ou nenhuma.
 *
 * Somente estados TERMINAIS entram. Um pedido de estorno ainda em curso
 * (REFUND_REQUESTED, REFUND_IN_PROGRESS) pode ser negado, e revogar sobre ele
 * tiraria acesso de quem continua pagando.
 *
 * CHARGEBACK_DISPUTE e AWAITING_CHARGEBACK_REVERSAL ficam de fora por outro
 * motivo: sao movimentos de um chargeback JA revogado. Reemitir nao acrescenta
 * nada -- no consumidor a revogacao por chargeback ja e absorvente (infinity) --
 * e AWAITING_CHARGEBACK_REVERSAL, apesar do nome, indica reversao em analise,
 * nao concedida. Reativacao apos reversao continua sendo decisao humana.
 *
 * PAYMENT_DELETED nao revoga: cobranca removida nunca concedeu acesso.
 */
export const classifyRevocation = (paymentStatus: unknown): RevocationKind | null => {
  if (typeof paymentStatus !== "string") return null;
  const status = paymentStatus.trim().toUpperCase();

  if (status === "REFUNDED") return "refund";
  if (status === "CHARGEBACK_REQUESTED") return "chargeback";
  return null;
};

/** Eventos Asaas que podem originar revogacao. */
export const REVOCATION_EVENTS = [
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
] as const;
