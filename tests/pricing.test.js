import { test } from "node:test";
import assert from "node:assert/strict";
import { periodQuote } from "../public/pricing.js";
import { pool } from "../server/db.js";
import { after } from "node:test";
after(() => pool.end());
test("MXN catalog matches approved volume tiers and every annual price is exactly ten monthly payments", async () => {
  const plans = (
    await pool.query(
      "SELECT * FROM billing_plans WHERE active AND currency='mxn' ORDER BY seat_limit",
    )
  ).rows;
  assert.deepEqual(
    plans.map((p) => p.seat_limit),
    [5, 10, 15, 30, 50],
  );
  assert.deepEqual(
    plans.map((p) => p.monthly_cents),
    [149900, 284810, 404730, 764490, 1199200],
  );
  for (const plan of plans) {
    assert.equal(periodQuote(plan, 1).users_period_cents, plan.monthly_cents);
    assert.equal(
      periodQuote(plan, 3).users_period_cents,
      Math.round(plan.monthly_cents * 3 * 0.95),
    );
    assert.equal(
      periodQuote(plan, 6).users_period_cents,
      Math.round(plan.monthly_cents * 6 * 0.9),
    );
    assert.equal(
      periodQuote(plan, 12).users_period_cents,
      plan.monthly_cents * 10,
    );
    assert.equal(periodQuote(plan, 12).free_months, 2);
  }
  const base = plans[0];
  assert.equal(periodQuote(base, 3).users_period_cents, 427215);
  assert.equal(periodQuote(base, 6).users_period_cents, 809460);
  assert.equal(periodQuote(base, 12).users_period_cents + 299900, 1798900);
  assert.throws(() => periodQuote({ ...base, currency: "usd" }, 1));
  assert.throws(() => periodQuote(base, 2));
});
