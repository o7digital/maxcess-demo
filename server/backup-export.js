import archiver from 'archiver';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { pool } from './db.js';
import { owner, fail } from './workspace.js';

const tables=['companies','contacts','customer_branches','tickets','events','teams','departments','workspace_roles','reports','ai_conversations','ai_messages','external_tickets'];
const userFields='id,email,name,role,company_id,tenant_id,language,role_id,department_id,specialty,active';
let exporting=false;
export function installBackupExportRoutes(app){
 const limit=rateLimit({windowMs:15*60000,limit:3,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/api/workspace/backup.zip',limit,async(req,res)=>{
  owner(req);
  if(!req.user.email_verified_at)throw fail(403,'Verifica tu correo antes de exportar los datos');
  if(exporting)throw fail(409,'Una exportación está en curso. Intenta más tarde.');
  exporting=true;
  let db,archive,timer;
  try{
   db=await pool.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await db.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
   const {rows:[workspace]}=await db.query('SELECT id,name,settings,created_at FROM tenants WHERE id=$1',[req.user.tenant_id]);
   archive=archiver('zip',{zlib:{level:6}});
   archive.on('error',e=>res.destroy(e));
   res.on('close',()=>{if(!res.writableFinished)archive.abort();});
   timer=setTimeout(()=>{archive.abort();res.destroy(new Error('Export timeout'));},10*60000);
   res.set({'Content-Type':'application/zip','Content-Disposition':`attachment; filename="servicehub-workspace-${workspace.id}-${new Date().toISOString().slice(0,10)}.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   archive.pipe(res);
   const manifest={format:1,created_at:new Date().toISOString(),workspace_id:workspace.id,consistent_snapshot:true,table_counts:{},files_sha256:{},excluded:['passwords','MFA secrets','session and account tokens','Stripe and connector credentials','other workspaces']};
   async function append(source,name){
    if(res.destroyed)throw new Error('Download disconnected');
    await new Promise((resolve,reject)=>{
     const cleanup=()=>{archive.off('entry',ok);archive.off('error',bad);res.off('close',closed);};
     const ok=()=>{cleanup();resolve();},bad=e=>{cleanup();reject(e);},closed=()=>bad(new Error('Download disconnected'));
     archive.once('entry',ok);archive.once('error',bad);res.once('close',closed);archive.append(source,{name});
    });
   }
   async function file(data,name){manifest.files_sha256[name]=createHash('sha256').update(data).digest('hex');await append(data,name);}
   await file(Buffer.from(JSON.stringify(workspace,null,2)),'workspace.json');
   for(const table of ['users',...tables,'ticket_attachments']){
    const columns=table==='users'?userFields:table==='ticket_attachments'?'id,tenant_id,ticket_id,uploaded_by,filename,content_type,created_at': '*';
    await db.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT ${columns} FROM ${table} WHERE tenant_id=$1 ORDER BY ${table==='external_tickets'?'provider,ticket_id':'id'}`,[workspace.id]);
    let count=0;const hash=createHash('sha256');
    const stream=Readable.from((async function*(){while(true){const {rows}=await db.query('FETCH FORWARD 100 FROM backup_rows');if(!rows.length)break;for(const row of rows){const line=JSON.stringify(row)+'\n';count++;hash.update(line);yield line;}}})());
    await append(stream,'data/'+table+'.jsonl');await db.query('CLOSE backup_rows');
    manifest.table_counts[table]=count;manifest.files_sha256['data/'+table+'.jsonl']=hash.digest('hex');
   }
   const {rows:attachments}=await db.query('SELECT id,ticket_id FROM ticket_attachments WHERE tenant_id=$1 ORDER BY id',[workspace.id]);
   for(const a of attachments){const{rows:[f]}=await db.query('SELECT data,filename FROM ticket_attachments WHERE id=$1 AND tenant_id=$2',[a.id,workspace.id]);const safe=f.filename.replace(/[^\p{L}\p{N}._-]/gu,'_').slice(0,180);await file(f.data,`attachments/${a.ticket_id}/${a.id}-${safe}`);}
   const{rows:logos}=await db.query('SELECT id,image FROM workspace_logos WHERE tenant_id=$1',[workspace.id]);
   for(const logo of logos)await file(logo.image,'logos/'+logo.id+'.image');
   await db.query('COMMIT');
   await append(Buffer.from(JSON.stringify(manifest,null,2)),'manifest.json');
   await append(Buffer.from('Service Hub workspace data export\n\nData tables are UTF-8 JSON Lines: one JSON record per line. Attachments retain their original bytes; data/ticket_attachments.jsonl maps file IDs to their original names and requests. workspace.json contains your workspace configuration. manifest.json lists counts and SHA256 hashes.\n\nThis export contains only this workspace and excludes passwords, MFA, server secrets, payment credentials and other workspaces. Store it privately. It supports data portability and assisted recovery; automatic re-import of the complete ZIP is not provided. Operator backups separately protect the complete application and database.\n'),'README.txt');
   await archive.finalize();
  }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});if(res.headersSent)res.destroy(e);else throw e;}
  finally{clearTimeout(timer);if(db)db.release();exporting=false;}
 });
}
