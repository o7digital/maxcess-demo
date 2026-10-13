import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { pool, transaction } from "../server/db.js";
import { hashPassword } from "../server/identity.js";
const names = [
  "Aurora Salud",
  "Norte Deportivo",
  "Lumen Retail",
  "Horizonte Logística",
  "Cedro Industrial",
  "Brisa Alimentos",
  "Atlas Servicios",
  "Prisma Educación",
  "Sierra Tecnología",
  "Oasis Hoteles",
  "Delta Construcción",
  "Álamo Textil",
  "Faro Energía",
  "Coral Belleza",
  "Marea Comercio",
  "Nébula Diseño",
  "Valle Agrícola",
  "Cumbre Automotriz",
  "Roble Finanzas",
  "Solana Bienestar",
];
const cases = [
  [
    "Terminal de cobro sin conexión",
    "Conectividad",
    "La terminal perdió conexión; los pagos con tarjeta están detenidos.",
  ],
  [
    "Impresora de etiquetas intermitente",
    "Equipos",
    "La impresora presenta cortes al imprimir etiquetas de inventario.",
  ],
  [
    "Diferencia en la factura mensual",
    "Facturación",
    "Solicitamos revisar dos cargos duplicados en la factura del servicio.",
  ],
  [
    "Restablecimiento de acceso al portal",
    "Accesos",
    "El equipo de sucursal no puede iniciar sesión con su cuenta autorizada.",
  ],
  [
    "Seguimiento de visita técnica",
    "Servicio",
    "Solicitamos confirmar la ventana de atención y el alcance de la visita.",
  ],
  [
    "Red inalámbrica inestable",
    "Conectividad",
    "La señal se interrumpe en el área de recepción durante horas de operación.",
  ],
];
export async function seed() {
  const credentials = [];
  const managerEmail = (
    process.env.DEMO_MANAGER_EMAIL || "olivier.steineur@o7digitalgroup.com"
  )
    .trim()
    .toLowerCase();
  const accessPath = process.env.DEMO_ACCESS_PATH || ".local/demo-access.json";
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(7347502)");
    const companies = [];
    for (let i = 0; i < 20; i++) {
      const c = (
        await db.query(
          "INSERT INTO companies(name,sector,site) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING *",
          [
            names[i],
            ["Salud", "Comercio", "Servicios", "Industria"][i % 4],
            `Ciudad de México · Sede ${String(i + 1).padStart(2, "0")}`,
          ],
        )
      ).rows[0];
      companies.push(c);
      await db.query(
        "INSERT INTO contacts(company_id,name,email,function) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
        [
          c.id,
          `Contacto ficticio ${i + 1}`,
          `contacto${i + 1}@example.test`,
          "Responsable de sede",
        ],
      );
    }
    async function user(email, name, role, company = null) {
      const existing = (
        await db.query("SELECT * FROM users WHERE email=$1", [email])
      ).rows[0];
      if (existing) return existing;
      const password = randomBytes(18).toString("base64url");
      const u = (
        await db.query(
          "INSERT INTO users(email,name,role,company_id,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [email, name, role, company, await hashPassword(password)],
        )
      ).rows[0];
      if (
        [
          managerEmail,
          "admin@example.test",
          "gerente@example.test",
          "agente@example.test",
          "cliente@example.test",
          "cliente2@example.test",
        ].includes(email)
      )
        credentials.push({ email, password, role });
      return u;
    }
    const manager = await user(
      managerEmail,
      "Olivier Steineur",
      "platform_admin",
    );
    const agents = [];
    const count = Number(process.env.DEMO_INTERNAL_USERS || 25);
    if (!Number.isInteger(count) || count < 4 || count > 100)
      throw new Error("DEMO_INTERNAL_USERS must be 4–100");
    if (count < 4) throw new Error("At least 4 internal demo users required");
    await user("admin@example.test", "Valeria Torres", "admin");
    await user("gerente@example.test", "Daniel Rivera", "manager");
    for (let i = 0; i < count - 3; i++)
      agents.push(
        await user(
          i === 0 ? "agente@example.test" : `agente${i + 1}@example.test`,
          i === 0 ? "Ana López" : `Agente ficticio ${i + 1}`,
          "agent",
        ),
      );
    const clients = [];
    for (let i = 0; i < 4; i++)
      clients.push(
        await user(
          i === 0 ? "cliente@example.test" : `cliente${i + 1}@example.test`,
          `Cliente ficticio ${i + 1}`,
          "client",
          companies[i].id,
        ),
      );
    for (let i = 0; i < 60; i++) {
      const c = companies[i % 20],
        [title, category, description] = cases[i % 6],
        priority = ["Crítica", "Alta", "Media", "Baja"][
          (i + Math.floor(i / 20)) % 4
        ];
      const status = ["Abierto", "En curso", "Resuelto", "Cerrado"][
          (i + Math.floor(i / 20)) % 4
        ],
        agent =
          status === "Abierto" && i % 5 === 0
            ? null
            : agents[i % agents.length].id;
      const created = new Date(Date.now() - (i + 1) * 3600000),
        due = new Date(
          +created +
            { Crítica: 2, Alta: 8, Media: 24, Baja: 48 }[priority] * 3600000,
        );
      const creator = clients[i % 20]?.id || manager.id;
      const t = (
        await db.query(
          "INSERT INTO tickets(seed_key,title,company_id,site,category,description,priority,requested_priority,status,agent_id,created_by,created_at,updated_at,due_at,resolution,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$11,$12,$13,$14) ON CONFLICT(seed_key) DO NOTHING RETURNING id",
          [
            `demo-${i + 1}`,
            title,
            c.id,
            c.site,
            category,
            description,
            priority,
            status,
            agent,
            creator,
            created,
            due,
            ["Resuelto", "Cerrado"].includes(status)
              ? "Se verificó el servicio con la sede y se documentó la solución."
              : null,
            ["Resuelto", "Cerrado"].includes(status)
              ? new Date(+created + 3600000)
              : null,
          ],
        )
      ).rows[0];
      if (t) {
        await db.query(
          "INSERT INTO events(ticket_id,actor_id,kind,body,created_at) VALUES($1,$2,$3,$4,$5)",
          [t.id, creator, "history", "Solicitud registrada", created],
        );
        if (agent)
          await db.query(
            "INSERT INTO events(ticket_id,actor_id,kind,body,created_at) VALUES($1,$2,$3,$4,$5)",
            [
              t.id,
              manager.id,
              "history",
              `Asignado a ${agents.find((a) => a.id === agent).name}`,
              new Date(+created + 60000),
            ],
          );
        if (["Resuelto", "Cerrado"].includes(status))
          await db.query(
            "INSERT INTO events(ticket_id,actor_id,kind,body,created_at) VALUES($1,$2,$3,$4,$5)",
            [
              t.id,
              agent || manager.id,
              "resolution",
              "Se verificó el servicio con la sede y se documentó la solución.",
              new Date(+created + 3600000),
            ],
          );
        if (status === "Cerrado")
          await db.query(
            "INSERT INTO events(ticket_id,actor_id,kind,body,created_at) VALUES($1,$2,$3,$4,$5)",
            [
              t.id,
              agent,
              "history",
              "Solicitud cerrada",
              new Date(+created + 3660000),
            ],
          );
        await db.query(
          "UPDATE tickets SET updated_at=(SELECT max(created_at) FROM events WHERE ticket_id=$1) WHERE id=$1",
          [t.id],
        );
      }
    }
  });
  if (credentials.length) {
    await mkdir(".local", { recursive: true });
    let previous = [];
    try {
      previous = JSON.parse(await readFile(accessPath, "utf8"));
    } catch {}
    await writeFile(
      accessPath,
      JSON.stringify([...previous, ...credentials], null, 2),
      { mode: 0o600 },
    );
    console.log(
      "Test credentials saved separately in the private access file (ignored by Git).",
    );
  }
  console.log("Demo seed completed without resetting data.");
}
if (process.argv[1]?.endsWith("/seed.js")) {
  try {
    await seed();
  } finally {
    await pool.end();
  }
}
