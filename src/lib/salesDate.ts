export interface PaidTransactionDates {
  created_at: string;
  confirmed_date?: string | null;
  payment_date?: string | null;
}

/** Fuso do negócio. Agrupar por UTC joga as vendas da noite pro dia seguinte. */
export const SALES_TIME_ZONE = "America/Sao_Paulo";

// en-CA formata como yyyy-MM-dd, que é justamente o formato comparável por string.
const businessDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SALES_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Dia comercial (yyyy-MM-dd, America/Sao_Paulo) de um instante — usar para
 * qualquer coluna que seja timestamp real, como checkout_events.created_at.
 */
export function businessDay(instant: string | Date): string {
  return businessDayFormatter.format(typeof instant === "string" ? new Date(instant) : instant);
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
  return paidAt ? paidAt.slice(0, 10) : businessDay(transaction.created_at);
}

/**
 * Rótulo de comparação com o dia anterior.
 *
 * Base zero não tem variação percentual: devolver "+100%" inventaria um
 * crescimento que ninguém mediu (de R$ 0 pra R$ 1 e pra R$ 10.000 daria o
 * mesmo número). Nesse caso o card diz que não há comparação.
 */
export function formatDayOverDayChange(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? "Sem comparação com ontem" : "0% vs ontem";
  }

  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs ontem`;
}

/** Lista de dias comerciais consecutivos terminando em `endDay` (inclusive). */
export function businessDayRange(endDay: string, days: number): string[] {
  // Meio-dia UTC: qualquer fuso real continua no mesmo dia-calendário ao somar/subtrair.
  const end = new Date(`${endDay}T12:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}
