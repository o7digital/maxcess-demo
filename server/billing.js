import { LEGAL_VERSION } from "../public/legal.js";
import {
  CURRENCY,
  ACTIVATION_CENTS,
  BILLING_MODEL,
  ACTIVATION_MODELS,
  periodQuote,
  PERIOD_DISCOUNTS,
  withSeats,
} from "../public/pricing.js";
import express from "express";
import Stripe from "stripe";
import { pool, transaction } from "./db.js";
import {
  fail,
  owner,
  publicOrigin,
  audit,
  queueEmail,
  accessState,
} from "./workspace.js";
const LEGACY_LICENSE = 39900;
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_"))
    throw fail(
      503,
      "La facturación está en preparación. Contacta con O7 Digital Group.",
    );
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 });
}
export function quote(plan, months) {
  try {
    return periodQuote(plan, months);
  } catch {
    throw fail(400, "Elige un plan disponible y un periodo válido");
  }
}
async function prices(stripe, plan, months, db) {
  const q = quote(plan, months);
  async function cached(key, create) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const {
      rows: [existing],
    } = await db.query(
      "SELECT stripe_price_id FROM stripe_price_catalog WHERE catalog_key=$1",
      [key],
    );
    if (existing) return { id: existing.stripe_price_id };
    const price = await create();
    await db.query(
      "INSERT INTO stripe_price_catalog(catalog_key,stripe_price_id) VALUES($1,$2)",
      [key, price.id],
    );
    return price;
  }
  const activation = await cached(`${CURRENCY}-activation-${ACTIVATION_CENTS}-tax-v2`, async () => {
    const product = await stripe.products.create(
      { name: "Service Hub · Activación", metadata: { kind: "activation" } },
      { idempotencyKey: "servicehub-usd-activation-product-v1" },
    );
    return stripe.prices.create(
      {
        product: product.id,
        currency: CURRENCY,
        unit_amount: ACTIVATION_CENTS,
        tax_behavior: "exclusive",
        metadata: { kind: "activation" },
      },
      { idempotencyKey: "servicehub-usd-activation-price-149-tax-v2" },
    );
  });
  const users = await cached(
    `usd-users-tax-v2-${plan.id}-v${plan.version}-${plan.seat_limit}-${months}`,
    async () => {
      const product = await stripe.products.create(
        { name: `Service Hub · ${plan.name}`, metadata: { kind: "users" } },
        { idempotencyKey: `servicehub-usd-plan-${plan.id}-v${plan.version}-${plan.seat_limit}` },
      );
      return stripe.prices.create(
        {
          product: product.id,
          currency: CURRENCY,
          unit_amount: q.users_period_cents,
          tax_behavior: "exclusive",
          recurring: { interval: "month", interval_count: months },
          metadata: {
            kind: "users",
            plan_id: plan.id,
            seat_limit: String(plan.seat_limit),
            ai_limit: String(plan.ai_limit),
          },
        },
        {
          idempotencyKey: `servicehub-usd-price-tax-v2-${plan.id}-v${plan.version}-${plan.seat_limit}-${months}`,
        },
      );
    },
  );
  return { activation, users };
}
async function syncSubscription(db, stripe, id) {
  let subscription = await stripe.subscriptions.retrieve(id, {
    expand: ["items.data.price"],
  });
  if (subscription.livemode)
    throw fail(400, "Los eventos live no están habilitados");
  const tenantId = Number(subscription.metadata?.tenant_id);
  if (!Number.isSafeInteger(tenantId) || tenantId < 1) return null;
  const {
    rows: [t],
  } = await db.query("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [
    tenantId,
  ]);
  // Re-read after the tenant lock so concurrent, out-of-order events cannot overwrite newer state.
  subscription = await stripe.subscriptions.retrieve(id, {
    expand: ["items.data.price"],
  });
  if (t?.retired_subscription_ids?.includes(id)) return null;
  if (
    !t ||
    t.is_demo ||
    t.stripe_customer_id !== subscription.customer ||
    (t.stripe_subscription_id && t.stripe_subscription_id !== id)
  )
    throw fail(400, "Suscripción no reconocida");
  const items = subscription.items.data,
    license = items.find((i) => i.price.metadata?.kind === "license"),
    users = items.find((i) => i.price.metadata?.kind === "users");
  const legacyInvalid =
    items.length !== 2 ||
    !license ||
    !users ||
    license.quantity !== 1 ||
    users.quantity !== 1 ||
    license.price.unit_amount !== LEGACY_LICENSE ||
    license.price.currency !== "usd" ||
    license.price.recurring?.interval !== "year" ||
    (license.price.recurring.interval_count || 1) !== 1 ||
    users.price.currency !== "usd" ||
    !Number.isSafeInteger(users.price.unit_amount) ||
    users.price.unit_amount < 1 ||
    users.price.recurring?.interval !== "month" ||
    ![1, 3, 6, 12].includes(users.price.recurring.interval_count);
  const activationTerms = ACTIVATION_MODELS[subscription.metadata?.billing_model];
  const activationModel = Boolean(activationTerms);
  const activationInvalid =
    items.length !== 1 ||
    !users ||
    users.quantity !== 1 ||
    users.price.currency !== activationTerms?.currency ||
    !Number.isSafeInteger(users.price.unit_amount) ||
    users.price.unit_amount < 1 ||
    users.price.recurring?.interval !== "month" ||
    ![1, 3, 6, 12].includes(users.price.recurring.interval_count);
  const invalid = activationModel
    ? activationInvalid || t.billing_model !== subscription.metadata.billing_model || t.billing_currency !== activationTerms.currency
    : legacyInvalid || t.billing_model !== "legacy_usd_v1";
  if (invalid) {
    await db.query(
      "UPDATE tenants SET status='suspended',monthly_recurring_cents=0 WHERE id=$1",
      [tenantId],
    );
    await db.query(
      "INSERT INTO workspace_audit(tenant_id,action) VALUES($1,'billing.invalid_structure')",
      [tenantId],
    );
    return tenantId;
  }
  if (
    activationModel &&
    !t.activation_paid_at &&
    !["canceled", "incomplete_expired"].includes(subscription.status)
  ) {
    // A subscription status alone never proves the one-time activation was paid.
    await db.query("UPDATE tenants SET stripe_subscription_id=$1 WHERE id=$2", [
      id,
      tenantId,
    ]);
    return tenantId;
  }
  const seats = Number(users.price.metadata.seat_limit),
    ai = Number(users.price.metadata.ai_limit);
  if (
    !Number.isSafeInteger(seats) ||
    seats < 1 ||
    seats > 10000 ||
    !Number.isSafeInteger(ai) ||
    ai < 0
  )
    throw fail(400, "Cuotas no válidas");
  const status =
    {
      active: "active",
      trialing: "trialing",
      past_due: "past_due",
      unpaid: "past_due",
      canceled: "canceled",
      incomplete: "trialing",
      incomplete_expired: "canceled",
      paused: "past_due",
    }[subscription.status] || "suspended";
  const recurring = Math.round(
    (users.price.unit_amount || 0) / users.price.recurring.interval_count +
      (activationModel ? 0 : LEGACY_LICENSE / 12),
  );
  const end = Math.min(
    ...items.map((i) => i.current_period_end).filter(Boolean),
  );
  await db.query(
    "UPDATE tenants SET stripe_subscription_id=$1,status=CASE WHEN status='suspended' THEN status ELSE $2 END,seat_limit=$3,ai_limit=$4,billing_plan_id=$5,billing_months=$6,billing_period_end=$7,cancel_at_period_end=$8,monthly_recurring_cents=$10,grace_ends_at=CASE WHEN $2='past_due' THEN COALESCE(grace_ends_at,now()+interval '3 days') ELSE NULL END WHERE id=$9",
    [
      id,
      status,
      seats,
      ai,
      users.price.metadata.plan_id,
      users.price.recurring.interval_count,
      Number.isFinite(end) ? new Date(end * 1000) : null,
      subscription.cancel_at_period_end,
      tenantId,
      recurring,
    ],
  );
  return tenantId;
}
export function installBillingPublic(app, getStripe = stripeClient) {
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      if (!process.env.STRIPE_WEBHOOK_SECRET)
        throw fail(503, "Webhook no configurado");
      const stripe = getStripe();
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.get("Stripe-Signature"),
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        throw fail(400, "Firma no válida");
      }
      if (event.livemode)
        throw fail(400, "Los eventos live no están habilitados");
      await transaction(async (db) => {
        const inserted = await db.query(
          "INSERT INTO billing_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",
          [event.id, event.type],
        );
        if (!inserted.rowCount) return;
        let o = event.data.object;
        if (event.type.startsWith("invoice.") && stripe.invoices)
          o = await stripe.invoices.retrieve(o.id);
        if (event.type.startsWith("customer.subscription."))
          await syncSubscription(db, stripe, o.id);
        if (
          [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
          ].includes(event.type) &&
          o.mode === "subscription" &&
          o.subscription
        ) {
          const tax = o.total_details?.amount_tax;
          const validTaxTotal = o.automatic_tax?.enabled === true
            ? o.automatic_tax.status === "complete" && Number.isSafeInteger(tax) && tax >= 0 && Number.isSafeInteger(o.amount_subtotal) && o.amount_total === o.amount_subtotal + tax && !o.total_details?.amount_discount && !o.total_details?.amount_shipping
            : true;
          const paidTerms=Object.entries(ACTIVATION_MODELS).find(([,terms])=>terms.currency===o.currency);
          if (o.payment_status === "paid" && paidTerms && validTaxTotal) {
            await db.query(
              "UPDATE tenants SET activation_paid_at=COALESCE(activation_paid_at,now()) WHERE checkout_session_id=$1 AND stripe_customer_id=$2 AND checkout_activation_cents=$3 AND checkout_total_cents=$4 AND billing_model=$5 AND NOT is_demo",
              [
                o.id,
                typeof o.customer === "string" ? o.customer : o.customer?.id,
                paidTerms[1].activation_cents,
                o.automatic_tax?.enabled ? o.amount_subtotal : o.amount_total,
                paidTerms[0],
              ],
            );
          }
          await syncSubscription(
            db,
            stripe,
            typeof o.subscription === "string"
              ? o.subscription
              : o.subscription.id,
          );
        }
        if (
          [
            "invoice.paid",
            "invoice.payment_failed",
            "invoice.payment_action_required",
          ].includes(event.type)
        ) {
          const sub =
            o.parent?.subscription_details?.subscription || o.subscription;
          if (sub) {
            const tenant = await syncSubscription(
              db,
              stripe,
              typeof sub === "string" ? sub : sub.id,
            );
            if (!tenant) return;
            await db.query(
              "INSERT INTO billing_invoices(id,tenant_id,status,amount_paid,currency,hosted_url) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET status=excluded.status,amount_paid=excluded.amount_paid,hosted_url=excluded.hosted_url",
              [
                o.id,
                tenant,
                o.status || "open",
                o.amount_paid || 0,
                o.currency,
                o.hosted_invoice_url || null,
              ],
            );
            const { rows: admins } = await db.query(
              "SELECT email FROM users WHERE tenant_id=$1 AND role='admin' AND active",
              [tenant],
            );
            for (const a of admins)
              await queueEmail(
                db,
                tenant,
                `invoice:${event.id}:${a.email}`,
                a.email,
                event.type === "invoice.paid"
                  ? "Service Hub · Pago confirmado"
                  : "Service Hub · Revisa tu pago",
                `Consulta tu suscripción y tus facturas en Service Hub. ${o.hosted_invoice_url || ""}`,
              );
          }
        }
      });
      res.json({ received: true });
    },
  );
}
export function installBillingRoutes(app, getStripe = stripeClient) {
  app.get("/api/billing", async (req, res) => {
    owner(req);
    const invoices = (
      await pool.query(
        "SELECT * FROM billing_invoices WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50",
        [req.tenant.id],
      )
    ).rows;
    res.json({
      status: req.tenant.status,
      access: accessState(req.tenant),
      trial_ends_at: req.tenant.trial_ends_at,
      grace_ends_at: req.tenant.grace_ends_at,
      seat_limit: req.tenant.seat_limit,
      plan_id: req.tenant.billing_plan_id,
      months: req.tenant.billing_months,
      next_billing_at: req.tenant.billing_period_end,
      cancel_at_period_end: req.tenant.cancel_at_period_end,
      currency: req.tenant.billing_currency,
      offer_currency: CURRENCY,
      migration_required: req.tenant.billing_model !== BILLING_MODEL,
      billing_model: req.tenant.billing_model,
      activation_cents: ACTIVATION_MODELS[req.tenant.billing_model]?.activation_cents ?? 0,
      activation_paid: Boolean(req.tenant.activation_paid_at),
      configured: Boolean(
        process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
        process.env.STRIPE_WEBHOOK_SECRET,
      ),
      invoices,
    });
  });
  app.post("/api/billing/checkout", async (req, res) => {
    owner(req);
    if (!req.user.email_verified_at)
      throw fail(403, "Confirma tu correo antes de suscribirte");
    if (req.tenant.is_demo)
      throw fail(403, "El espacio ilustrativo no admite pagos");
    if (req.body.accepted_terms !== true)
      throw fail(400, "Acepta los importes y las condiciones de renovación");
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw fail(503, "La facturación está en preparación");
    const stripe = getStripe(),
      origin = publicOrigin();
    const result = await transaction(async (db) => {
      const {
        rows: [t],
      } = await db.query("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [
        req.tenant.id,
      ]);
      if (t.stripe_subscription_id && t.status !== "canceled")
        throw fail(
          409,
          "Ya existe una suscripción. Usa Gestionar suscripción.",
        );
      const {
        rows: [basePlan],
      } = await db.query("SELECT * FROM billing_plans WHERE id=$1 AND active", [
        req.body.plan_id,
      ]);
      if (!basePlan || basePlan.currency !== CURRENCY) throw fail(400, "Plan no disponible");
      let plan;
      try { plan = withSeats(basePlan, req.body.seats); }
      catch { throw fail(400, "Número de usuarios fuera del rango del plan"); }
      const q = quote(plan, req.body.months);
      const {
        rows: [count],
      } = await db.query(
        "SELECT (SELECT count(*) FROM users WHERE tenant_id=$1 AND active)+(SELECT count(*) FROM invitations WHERE tenant_id=$1 AND accepted_at IS NULL AND expires_at>now()) AS total",
        [t.id],
      );
      if (Number(count.total) > plan.seat_limit)
        throw fail(409, "Este plan no cubre tus usuarios e invitaciones");
      if (t.checkout_session_id && t.status !== "canceled") {
        const old = await stripe.checkout.sessions.retrieve(
          t.checkout_session_id,
        );
        if (old.status === "open") return { url: old.url };
        if (old.status === "complete")
          throw fail(409, "El pago está pendiente de confirmación");
      }
      if (t.billing_model !== BILLING_MODEL)
        throw fail(
          409,
          "Tu contrato anterior se conserva. Contacta con O7 Digital Group para cambiar a USD.",
        );
      if (t.status === "canceled")
        await db.query(
          "UPDATE tenants SET retired_subscription_ids=array_append(retired_subscription_ids,stripe_subscription_id),stripe_subscription_id=NULL WHERE id=$1",
          [t.id],
        );
      const activationDue = t.activation_paid_at ? 0 : ACTIVATION_CENTS;
      const p = await prices(stripe, plan, req.body.months, db);
      let customer = t.stripe_customer_id;
      if (!customer) {
        customer = (
          await stripe.customers.create(
            {
              email: req.user.email,
              name: t.name,
              metadata: { tenant_id: String(t.id) },
            },
            { idempotencyKey: `servicehub-customer-${t.id}` },
          )
        ).id;
        await db.query("UPDATE tenants SET stripe_customer_id=$1 WHERE id=$2", [
          customer,
          t.id,
        ]);
      }
      const metadata = {
        tenant_id: String(t.id),
        billing_model: BILLING_MODEL,
      };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer,
          automatic_tax: { enabled: true },
          billing_address_collection: "required",
          tax_id_collection: { enabled: true },
          customer_update: { address: "auto", name: "auto" },
          line_items: [
            ...(activationDue ? [{ price: p.activation.id, quantity: 1 }] : []),
            { price: p.users.id, quantity: 1 },
          ],
          subscription_data: {
            billing_mode: { type: "flexible" },
            metadata,
          },
          metadata,
          success_url: origin + "/subscription?checkout=complete",
          cancel_url: origin + "/subscription",
          custom_text: {
            submit: {
              message: `Activación: ${activationDue / 100} USD HT una sola vez. Plan: ${q.users_period_cents / 100} USD HT cada ${q.months} mes(es). Total inicial: ${(activationDue + q.users_period_cents) / 100} USD HT. Los impuestos aplicables se calculan antes de confirmar el pago. Al confirmar comienza la suscripción de pago y termina la prueba gratuita. Solo el plan se renueva. Cancela antes de renovar.`,
            },
          },
        },
        {
          idempotencyKey: `servicehub-checkout-tax-v2-${t.id}-${plan.id}-v${plan.version}-${plan.seat_limit}-${q.months}-${t.checkout_session_id || "initial"}`,
        },
      );
      await db.query(
        "UPDATE tenants SET checkout_session_id=$1,checkout_total_cents=$3,checkout_activation_cents=$4 WHERE id=$2",
        [session.id, t.id, q.users_period_cents + activationDue, activationDue],
      );
      await audit(db, req, "billing.consent", {
        ...q,
        activation_due_cents: activationDue,
        plan_id: plan.id,
        seats: plan.seat_limit,
        terms_version: LEGAL_VERSION,
        accepted_at: new Date().toISOString(),
      });
      return { url: session.url };
    });
    res.json(result);
  });
  app.post("/api/billing/portal", async (req, res) => {
    owner(req);
    if (!req.tenant.stripe_customer_id)
      throw fail(409, "No tienes una suscripción");
    const session = await getStripe().billingPortal.sessions.create({
      customer: req.tenant.stripe_customer_id,
      return_url: publicOrigin() + "/subscription",
    });
    res.json({ url: session.url });
  });
  app.post("/api/billing/change-plan", async (req, res) => {
    owner(req);
    if (req.body.accepted_terms !== true)
      throw fail(400, "Confirma el cambio y los ajustes prorrateados");
    const stripe = getStripe();
    await transaction(async (db) => {
      const {
        rows: [t],
      } = await db.query("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [
        req.tenant.id,
      ]);
      if (!t.stripe_subscription_id)
        throw fail(409, "Primero activa una suscripción");
      if (t.billing_model !== BILLING_MODEL)
        throw fail(
          409,
          "Contacta con O7 Digital Group para migrar tu contrato anterior a USD.",
        );
      const {
        rows: [basePlan],
      } = await db.query("SELECT * FROM billing_plans WHERE id=$1 AND active", [
        req.body.plan_id,
      ]);
      if (!basePlan || basePlan.currency !== CURRENCY) throw fail(400, "Plan no disponible");
      let plan;
      try { plan = withSeats(basePlan, req.body.seats); }
      catch { throw fail(400, "Número de usuarios fuera del rango del plan"); }
      quote(plan, req.body.months);
      const {
        rows: [c],
      } = await db.query(
        "SELECT (SELECT count(*) FROM users WHERE tenant_id=$1 AND active)+(SELECT count(*) FROM invitations WHERE tenant_id=$1 AND accepted_at IS NULL AND expires_at>now()) total",
        [t.id],
      );
      if (Number(c.total) > plan.seat_limit)
        throw fail(
          409,
          "Reduce tus usuarios e invitaciones antes de reducir el plan",
        );
      const subscription = await stripe.subscriptions.retrieve(
        t.stripe_subscription_id,
      );
      const users = subscription.items.data.find(
        (i) => i.price.metadata?.kind === "users",
      );
      if (!users) throw fail(409, "Suscripción no válida");
      if (users.price.recurring.interval_count !== req.body.months)
        throw fail(
          409,
          "Contacta con O7 Digital Group para cambiar la periodicidad sin volver a cobrar la activación",
        );
      const p = await prices(stripe, plan, req.body.months, db);
      await stripe.subscriptions.update(
        subscription.id,
        {
          items: [{ id: users.id, price: p.users.id }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
        },
        {
          idempotencyKey: `servicehub-change-${t.id}-${users.price.id}-${p.users.id}`,
        },
      );
      await syncSubscription(db, stripe, subscription.id);
      await audit(db, req, "billing.plan_changed", {
        plan_id: plan.id,
        months: req.body.months,
      });
    });
    res.json({ ok: true });
  });
  const platform = (req) => {
    if (!req.user.is_platform_owner)
      throw fail(403, "Acceso reservado a O7 Digital Group");
  };
  app.get("/api/platform", async (req, res) => {
    platform(req);
    const tenants = (
      await pool.query(
        "SELECT t.id,t.name,t.is_demo,t.status,t.trial_ends_at,t.seat_limit,t.ai_limit,t.billing_plan_id,t.billing_months,t.billing_period_end,(SELECT count(*)::int FROM users u WHERE u.tenant_id=t.id AND u.active) users FROM tenants t ORDER BY t.created_at DESC",
      )
    ).rows;
    const plans = (
      await pool.query(
        "SELECT * FROM billing_plans WHERE currency='usd' AND unit_cents IS NOT NULL ORDER BY seat_limit",
      )
    ).rows;
    const revenue = (
      await pool.query(
        "SELECT COALESCE(sum(monthly_recurring_cents) FILTER(WHERE NOT is_demo AND status='active' AND billing_currency='usd'),0)::bigint mrr_cents FROM tenants",
      )
    ).rows[0];
    const payments = (
      await pool.query(
        "SELECT COALESCE(sum(amount_paid),0)::bigint paid_cents FROM billing_invoices WHERE status='paid' AND currency='usd'",
      )
    ).rows[0];
    res.json({
      tenants,
      plans,
      revenue: {
        mrr_cents: Number(revenue.mrr_cents),
        received_cents: Number(payments.paid_cents),
        currency: CURRENCY,
      },
      services: {
        database: true,
        stripe: Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")),
        email: Boolean(process.env.SMTP_URL && process.env.MAIL_FROM),
        olivia: process.env.OLIVIA_TENANT_READY === "true",
        huggingface: Boolean(
          (process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN) &&
          process.env.HF_REPORT_MODEL,
        ),
      },
      templates: (
        await pool.query("SELECT * FROM configuration_templates ORDER BY id")
      ).rows,
    });
  });
  app.put("/api/platform/plans/:id", async (req, res) => {
    platform(req);
    const b = req.body;
    if (
      !Number.isSafeInteger(b.monthly_cents) ||
      b.monthly_cents < 100 ||
      b.monthly_cents > 10000000 ||
      !Number.isSafeInteger(b.ai_limit) ||
      b.ai_limit < 0 ||
      b.ai_limit > 1000000 ||
      typeof b.active !== "boolean" ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 100
    )
      throw fail(400, "Tarifa no válida");
    const discounts = {};
    for (const months of [1, 3, 6, 12]) {
      const d = months === 12 ? PERIOD_DISCOUNTS[12] : b.discounts?.[String(months)];
      if (!Number.isFinite(d) || d < 0 || d > 80 || (months === 1 && d !== 0))
        throw fail(400, "Descuento no válido");
      discounts[months] = d;
    }
    const r = await pool.query(
      "UPDATE billing_plans SET name=$1,monthly_cents=CASE WHEN unit_cents IS NOT NULL THEN $2*seat_limit ELSE $2 END,unit_cents=CASE WHEN unit_cents IS NOT NULL THEN $2 ELSE NULL END,discounts=$3,ai_limit=$4,active=$5,version=version+1 WHERE id=$6 AND currency='usd' RETURNING id",
      [
        b.name.trim(),
        b.monthly_cents,
        discounts,
        b.ai_limit,
        b.active,
        req.params.id,
      ],
    );
    if (!r.rowCount) throw fail(404, "Plan no disponible");
    res.json({ ok: true });
  });
  app.put("/api/platform/tenants/:id", async (req, res) => {
    platform(req);
    if (!["suspended", "trialing"].includes(req.body.status))
      throw fail(400, "Estado no válido");
    await transaction(async (db) => {
      const {
        rows: [t],
      } = await db.query("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [
        Number(req.params.id),
      ]);
      if (!t || t.is_demo) throw fail(400, "Espacio no válido");
      // Reactivation never restarts a trial or grants unpaid access.
      await db.query("UPDATE tenants SET status=$1 WHERE id=$2", [
        req.body.status,
        t.id,
      ]);
      if (req.body.status === "trialing" && t.stripe_subscription_id)
        await syncSubscription(db, getStripe(), t.stripe_subscription_id);
      await audit(db, req, "platform.tenant_status", {
        tenant_id: t.id,
        status: req.body.status,
      });
    });
    res.json({ ok: true });
  });
  app.put("/api/platform/templates/:id", async (req, res) => {
    platform(req);
    const { validateSettings } = await import("./workspace.js");
    const b = req.body;
    const settings = validateSettings(b.settings);
    if (
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 100 ||
      typeof b.active !== "boolean" ||
      !/^[a-z][a-z0-9-]{1,40}$/.test(req.params.id)
    )
      throw fail(400, "Modelo no válido");
    await pool.query(
      "INSERT INTO configuration_templates(id,name,settings,active) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,settings=excluded.settings,active=excluded.active",
      [req.params.id, b.name.trim(), settings, b.active],
    );
    res.json({ ok: true });
  });
}
