export interface CheckoutCapabilities {
  isRecurring: boolean;
  allowCoupon: boolean;
  allowOrderBumps: boolean;
  allowInstallments: boolean;
}

export interface CheckoutInstallmentData {
  installmentCount?: number;
  installmentValue?: number;
}

export const getCheckoutCapabilities = (productType: unknown): CheckoutCapabilities => {
  const isRecurring = productType === "recorrente";

  return {
    isRecurring,
    allowCoupon: !isRecurring,
    allowOrderBumps: !isRecurring,
    allowInstallments: !isRecurring,
  };
};

export const buildCheckoutInstallmentData = (
  isRecurring: boolean,
  installmentCount: number,
  installmentValue: number,
): CheckoutInstallmentData => {
  if (isRecurring) {
    return { installmentCount: 1 };
  }

  if (Number.isInteger(installmentCount) && installmentCount > 1) {
    return { installmentCount, installmentValue };
  }

  return {};
};
