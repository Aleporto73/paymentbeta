export const SUBSCRIPTION_CYCLE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUALLY: 6,
  YEARLY: 12,
};

const addUtcMonths = (date: Date, months: number): Date => {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

export const computeSubscriptionPeriodEnd = (start: Date, cycle: unknown): Date | null => {
  if (typeof cycle !== "string") return null;
  const months = SUBSCRIPTION_CYCLE_MONTHS[cycle];
  return months ? addUtcMonths(start, months) : null;
};
