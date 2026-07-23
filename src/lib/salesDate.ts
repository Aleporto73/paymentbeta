import { format } from "date-fns";

export interface PaidTransactionDates {
  created_at: string;
  confirmed_date?: string | null;
  payment_date?: string | null;
}

/**
 * Data-calendário (yyyy-MM-dd) em que a cobrança virou pagamento — NÃO a data
 * em que a cobrança foi criada. Uma cobrança gerada dia 15 e confirmada dia 23
 * é venda do dia 23.
 *
 * confirmed_date é o campo canônico: está preenchido em todo RECEIVED/CONFIRMED
 * (payment_date fica nulo em cartão até o crédito cair, por isso só entra como
 * fallback). Ambos vêm do Asaas como data pura, gravada à meia-noite UTC
 * representando o dia local — mesma pegadinha do product_sales.sale_date.
 * Comparar por instante (new Date(...) no fuso do navegador) joga a venda pro
 * dia anterior, então extraímos a data-calendário direto da string.
 */
export function paidSaleDate(transaction: PaidTransactionDates): string {
  const paidAt = transaction.confirmed_date ?? transaction.payment_date;
  return paidAt ? paidAt.slice(0, 10) : format(new Date(transaction.created_at), "yyyy-MM-dd");
}
