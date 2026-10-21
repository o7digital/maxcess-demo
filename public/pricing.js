export const CURRENCY = "usd";
export const ACTIVATION_CENTS = 14900;
export const ANNUAL_FREE_MONTHS = 2;
export const PERIOD_DISCOUNTS = {1: 0, 3: 7.5, 6: 12.5, 12: 100 * ANNUAL_FREE_MONTHS / 12};
export const BILLING_MODEL = "activation_usd_v1";
export const ACTIVATION_MODELS = {
 activation_mxn_v1: {currency:"mxn",activation_cents:299900},
 activation_usd_v1: {currency:CURRENCY,activation_cents:ACTIVATION_CENTS},
};
export function withSeats(plan, seats = plan.seat_limit) {
  if (!plan.unit_cents) return plan;
  if (!Number.isSafeInteger(seats) || seats < plan.min_seats || seats > plan.max_seats)
    throw new Error("Número de usuarios fuera del rango del plan");
  return {...plan, seat_limit: seats, monthly_cents: seats * plan.unit_cents,
    ai_limit: Math.round(plan.ai_limit * seats / plan.seat_limit)};
}
export function periodQuote(plan, months) {
  if (
    ![1, 3, 6, 12].includes(months) ||
    !Number.isSafeInteger(plan.monthly_cents) ||
    plan.monthly_cents < 1 ||
    plan.currency !== CURRENCY
  )
    throw new Error("Plan o periodo no válido");
  const discount = months === 12 ? PERIOD_DISCOUNTS[12] : Number(plan.discounts?.[months] || 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 80)
    throw new Error("Descuento no válido");
  const users_period_cents = months === 12
    ? plan.monthly_cents * (12 - ANNUAL_FREE_MONTHS)
    : Math.round(plan.monthly_cents * months * (100 - discount) / 100);
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
