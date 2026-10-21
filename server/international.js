import { pool, transaction } from "./db.js";
import { globalAccess } from "./permissions.js";
import { fail, str, audit } from "./workspace.js";
import {
  countries,
  languages,
  validTimezone,
} from "../public/international.js";

export function installInternationalRoutes(app) {
  app.put("/api/preferences", async (req, res) => {
    const language = req.body.language;
    if (!Object.hasOwn(languages, language))
      throw fail(400, "Idioma no válido");
    await pool.query(
      "UPDATE users SET language=$1 WHERE id=$2 AND tenant_id=$3",
      [language, req.user.id, req.tenant.id],
    );
    res.json({ language });
  });
  for (const method of ["post", "put"])
    app[method](
      method === "post"
        ? "/api/companies/:company/branches"
        : "/api/companies/:company/branches/:branch",
      async (req, res) => {
        if (!globalAccess(req.user))
          throw fail(403, "Acceso reservado al responsable");
        const company = Number(req.params.company),
          b = req.body;
        if (!Number.isSafeInteger(company) || company < 1)
          throw fail(400, "Cliente no válido");
        const country = b.country_code;
        if (!countries.includes(country)) throw fail(400, "País no válido");
        if (!Object.hasOwn(languages, b.language))
          throw fail(400, "Idioma no válido");
        if (!validTimezone(b.timezone))
          throw fail(400, "Zona horaria no válida");
        const branch = await transaction(async (db) => {
          if (
            !(
              await db.query(
                "SELECT id FROM companies WHERE tenant_id=$1 AND id=$2",
                [req.tenant.id, company],
              )
            ).rowCount
          )
            throw fail(404, "Cliente no disponible");
          const values = [
            req.tenant.id,
            company,
            str(b.name, "Filial"),
            country,
            typeof b.city === "string" ? b.city.trim().slice(0, 160) : "",
            typeof b.address === "string" ? b.address.trim().slice(0, 500) : "",
            b.language,
            b.timezone,
          ];
          let result;
          if (method === "post")
            result = await db.query(
              "INSERT INTO customer_branches(tenant_id,company_id,name,country_code,city,address,language,timezone) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
              values,
            );
          else {
            const id = Number(req.params.branch);
            if (!Number.isSafeInteger(id) || id < 1)
              throw fail(400, "Filial no válida");
            result = await db.query(
              "UPDATE customer_branches SET name=$3,country_code=$4,city=$5,address=$6,language=$7,timezone=$8 WHERE tenant_id=$1 AND company_id=$2 AND id=$9 RETURNING *",
              [...values, id],
            );
          }
          if (!result.rowCount) throw fail(404, "Filial no disponible");
          await audit(
            db,
            req,
            method === "post" ? "branch.created" : "branch.updated",
            { id: result.rows[0].id, company_id: company },
          );
          return result.rows[0];
        });
        res.status(method === "post" ? 201 : 200).json({ branch });
      },
    );
}
