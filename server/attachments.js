import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { fail } from './workspace.js';
const MAX = 2 * 1024 * 1024;
const types = {
  pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};
export function parseAttachments(files = []) {
  if (!Array.isArray(files) || files.length > 5) throw fail(400, 'Máximo 5 archivos por envío');
  let total = 0;
  return files.map(f => {
    if (!f || typeof f.name !== 'string' || typeof f.file !== 'string' || !f.file.length || f.file.length > Math.ceil(MAX / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.file)) throw fail(400, 'Archivo no válido');
    const name = f.name.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim();
    const ext = name.split('.').at(-1).toLowerCase();
    if (!name || name.length > 180 || !Object.hasOwn(types, ext)) throw fail(400, 'Formatos: PDF, Excel, Word, CSV, TXT, PNG y JPG');
    const data = Buffer.from(f.file, 'base64');
    total += data.length;
    if (!data.length || total > MAX) throw fail(413, 'Máximo 2 MB en total por envío');
    const hex = data.subarray(0,8).toString('hex');
    const valid = ext === 'pdf' ? data.subarray(0,5).toString() === '%PDF-'
      : ['xlsx','docx'].includes(ext) ? hex.startsWith('504b0304')
      : ['xls','doc'].includes(ext) ? hex === 'd0cf11e0a1b11ae1'
      : ext === 'png' ? hex === '89504e470d0a1a0a'
      : ['jpg','jpeg'].includes(ext) ? hex.startsWith('ffd8ff')
      : !data.includes(0);
    if (!valid) throw fail(400, 'El contenido no corresponde al formato del archivo');
    return {name, type:types[ext], data};
  });
}
export async function saveAttachments(db, req, ticket, files) {
  if (!files.length) return;
  // Serialize workspace storage accounting across concurrent uploads.
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [req.user.tenant_id]);
  const {rows:[usage]} = await db.query('SELECT count(*) FILTER (WHERE ticket_id=$2)::int count,COALESCE(sum(octet_length(data)),0)::bigint bytes FROM ticket_attachments WHERE tenant_id=$1',[req.user.tenant_id,ticket.id]);
  if (usage.count + files.length > 20 || Number(usage.bytes) + files.reduce((s,f)=>s+f.data.length,0) > 100 * MAX) throw fail(413,'Límite: 20 archivos por solicitud y 200 MB por espacio');
  for (const f of files) await db.query('INSERT INTO ticket_attachments(id,tenant_id,ticket_id,uploaded_by,filename,content_type,data) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),req.user.tenant_id,ticket.id,req.user.id,f.name,f.type,f.data]);
  await db.query("INSERT INTO events(ticket_id,actor_id,kind,body,internal,tenant_id) VALUES($1,$2,'history',$3,false,$4)",[ticket.id,req.user.id,`Archivos adjuntos: ${files.map(f=>f.name).join(', ')}`,req.user.tenant_id]);
}
export function installAttachmentRoutes(app, ticket) {
  app.post('/api/tickets/:id/attachments', async (req,res) => {
    const files = parseAttachments(req.body.attachments);
    if (!files.length) throw fail(400,'Selecciona al menos un archivo');
    await transaction(async db => {
      const t=await ticket(db,req.user,req.params.id);
      if (['Resuelto','Cerrado'].includes(t.status)) throw fail(409,'Reabre la solicitud antes de adjuntar archivos');
      await saveAttachments(db,req,t,files);
    });
    res.status(201).json({ok:true});
  });
  app.get('/api/tickets/:id/attachments/:attachmentId', async (req,res) => {
    const t=await ticket(pool,req.user,req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.attachmentId)) throw fail(404,'Archivo no disponible');
    const {rows:[f]}=await pool.query('SELECT filename,content_type,data FROM ticket_attachments WHERE id=$1 AND ticket_id=$2 AND tenant_id=$3',[req.params.attachmentId,t.id,req.user.tenant_id]);
    if (!f) throw fail(404,'Archivo no disponible');
    res.set({'Content-Type':f.content_type,'Content-Disposition':`attachment; filename="download.${f.filename.split('.').at(-1)}"; filename*=UTF-8''${encodeURIComponent(f.filename).replace(/'/g,'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(f.data);
  });
}
