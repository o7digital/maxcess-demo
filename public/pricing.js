export const CURRENCY = "mxn";
export const ACTIVATION_CENTS = 299900;
export const BILLING_MODEL = "activation_mxn_v1";
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
  const discount = Number(plan.discounts?.[months] || 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 80)
    throw new Error("Descuento no válido");
  const users_period_cents = Math.round(plan.monthly_cents * months * (100 - discount) / 100);
  return {
    currency: CURRENCY,
    months,
    discount,
    free_months: 0,
    users_period_cents,
    savings_cents: plan.monthly_cents * months - users_period_cents,
    monthly_equivalent_cents: Math.round(users_period_cents / months),
    activation_cents: ACTIVATION_CENTS,
  };
}
