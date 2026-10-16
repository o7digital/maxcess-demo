export const CURRENCY = "mxn";
export const ACTIVATION_CENTS = 299900;
export const BILLING_MODEL = "activation_mxn_v1";
export const ANNUAL_FREE_MONTHS = 2;
export function periodQuote(plan, months) {
  if (
    ![1, 3, 6, 12].includes(months) ||
    !Number.isSafeInteger(plan.monthly_cents) ||
    plan.monthly_cents < 1 ||
    plan.currency !== CURRENCY
  )
    throw new Error("Plan o periodo no válido");
  const discount =
    months === 12
      ? (100 * ANNUAL_FREE_MONTHS) / 12
      : Number(plan.discounts?.[months] || 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 80)
    throw new Error("Descuento no válido");
  const users_period_cents =
    months === 12
      ? plan.monthly_cents * (12 - ANNUAL_FREE_MONTHS)
      : Math.round((plan.monthly_cents * months * (100 - discount)) / 100);
  return {
    currency: CURRENCY,
    months,
    discount,
    free_months: months === 12 ? ANNUAL_FREE_MONTHS : 0,
    users_period_cents,
    savings_cents: plan.monthly_cents * months - users_period_cents,
    monthly_equivalent_cents: Math.round(users_period_cents / months),
    activation_cents: ACTIVATION_CENTS,
  };
}
