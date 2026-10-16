import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db.js";
import { owner, fail, audit } from "./workspace.js";
const logoPath = (id) => `/api/workspace/logo/${id}`;
export function installLogoAssetRoute(app) {
  // Branding images are public assets identified by opaque IDs, without tenant metadata.
  app.get("/api/workspace/logo/:id", async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id))
      throw fail(404, "Logo no disponible");
    const {
      rows: [logo],
    } = await pool.query("SELECT image FROM workspace_logos WHERE id=$1", [
      req.params.id,
    ]);
    if (!logo) throw fail(404, "Logo no disponible");
    res
      .set({
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": 'inline; filename="logo.png"',
      })
      .send(logo.image);
  });
}
export function installLogoRoutes(app) {
  app.put("/api/workspace/logo", async (req, res) => {
    owner(req);
    const { file, type } = req.body || {};
    const formats = {
      "image/png": "png",
      "image/jpeg": "jpeg",
      "image/webp": "webp",
    };
    if (
      !Object.hasOwn(formats, type) ||
      typeof file !== "string" ||
      !file.length ||
      file.length > 1333336 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file)
    )
      throw fail(400, "Selecciona un PNG, JPG o WebP de hasta 1 MB");
    const input = Buffer.from(file, "base64");
    if (input.length > 1000000) throw fail(413, "El logo no debe superar 1 MB");
    const validHeader =
      type === "image/png"
        ? input
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "image/jpeg"
          ? input.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          : input.subarray(0, 4).toString() === "RIFF" &&
            input.subarray(8, 12).toString() === "WEBP";
    if (!validHeader) throw fail(400, "El archivo no es una imagen válida");
    let image;
    try {
      const processor = sharp(input, {
        limitInputPixels: 16000000,
        failOn: "warning",
      });
      const metadata = await processor.metadata();
      if (metadata.format !== formats[type] || (metadata.pages || 1) > 1)
        throw new Error("Unsupported image");
      image = await processor
        .rotate()
        .resize({
          width: 512,
          height: 512,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch {
      throw fail(400, "La imagen no es válida o es demasiado grande");
    }
    if (image.length > 1000000)
      throw fail(
        400,
        "La imagen es demasiado compleja. Elige un logo más pequeño.",
      );
    const id = randomUUID(),
      url = logoPath(id);
    await transaction(async (db) => {
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        req.tenant.id,
      ]);
      await db.query(
        "INSERT INTO workspace_logos(id,tenant_id,image) VALUES($1,$2,$3) ON CONFLICT(tenant_id) DO UPDATE SET id=excluded.id,image=excluded.image,updated_at=now()",
        [id, req.tenant.id, image],
      );
      await db.query(
        "UPDATE tenants SET settings=jsonb_set(settings,'{logo}',$1::jsonb),configuration_version=configuration_version+1 WHERE id=$2",
        [JSON.stringify(url), req.tenant.id],
      );
      await audit(db, req, "workspace.logo_uploaded");
    });
    res.json({ url });
  });
  app.delete("/api/workspace/logo", async (req, res) => {
    owner(req);
    await transaction(async (db) => {
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        req.tenant.id,
      ]);
      await db.query(
        "UPDATE tenants SET settings=jsonb_set(settings,'{logo}','\"\"'::jsonb),configuration_version=configuration_version+1 WHERE id=$1",
        [req.tenant.id],
      );
      await db.query("DELETE FROM workspace_logos WHERE tenant_id=$1", [
        req.tenant.id,
      ]);
      await audit(db, req, "workspace.logo_removed");
    });
    res.json({ ok: true });
  });
}
