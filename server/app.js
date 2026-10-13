import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {randomBytes} from 'node:crypto';
import {pool,transaction} from './db.js';
import {exposeUser,verifyPassword} from './identity.js';
const categories=['Conectividad','Equipos','Facturación','Accesos','Servicio'];
const priorities=['Baja','Media','Alta','Crítica'];
const hours={Baja:48,Media:24,Alta:8,Crítica:2};
const fail=(status,message)=>Object.assign(new Error(message),{status});
function text(value,label,max=4000) {if(typeof value!=='string'||!value.trim()||value.trim().length>max) throw fail(400,`${label}: valor requerido (máximo ${max} caracteres)`); return value.trim();}
function choice(value,list) {if(!list.includes(value)) throw fail(400,'Valor no válido'); return value;}
function id(value) {const n=Number(value);if(!Number.isSafeInteger(n)||n<1) throw fail(400,'Identificador no válido');return n;}
const internal=user=>user.role!=='client';
function scope(user,alias='t') {return user.role==='client'?{sql:`${alias}.company_id=$1`,args:[user.company_id]}:user.role==='agent'?{sql:`${alias}.agent_id=$1`,args:[user.id]}:{sql:'true',args:[]};}
async function ticket(db,user,ticketId,lock=false) {
 const s=scope(user);const t=(await db.query(`SELECT t.* FROM tickets t WHERE ${s.sql} AND t.id=$${s.args.length+1}${lock?' FOR UPDATE':''}`,[...s.args,id(ticketId)])).rows[0];
 if(!t) throw fail(404,'Solicitud no disponible'); return t;
}
async function event(db,t,user,kind,body,isInternal=false) {await db.query('INSERT INTO events(ticket_id,actor_id,kind,body,internal) VALUES($1,$2,$3,$4,$5)',[t.id,user.id,kind,body,isInternal]);await db.query('UPDATE tickets SET updated_at=now() WHERE id=$1',[t.id]);}
export function createApp() {
 if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32) throw new Error('SESSION_SECRET must contain at least 32 characters');
 const app=express();app.set('trust proxy',1);app.disable('x-powered-by');
 app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'"],'style-src':["'self'"], 'img-src':["'self'",'data:'], 'upgrade-insecure-requests':process.env.NODE_ENV==='production'?[]:null}}}));
 app.use(express.json({limit:'32kb'}));
 app.get('/health',async(req,res)=>{try{await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');res.json({status:'ok'});}catch{res.status(503).json({status:'unavailable'});}});
 app.use(session({store:new (pgSession(session))({pool,tableName:'session',createTableIfMissing:false}),secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*3600000}}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/api/bootstrap',(req,res)=>{req.session.csrf ||= randomBytes(24).toString('hex');res.json({csrf:req.session.csrf,brand:process.env.BRAND_NAME||'Service Hub',subtitle:process.env.BRAND_SUBTITLE||'powered by O7 Digital',demo:process.env.DEMO_MODE==='true'});});
 app.use('/api',(req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(!req.session.csrf||req.get('X-CSRF-Token')!==req.session.csrf)) return next(fail(403,'Sesión no válida. Actualiza la página.'));next();});
 const loginLimit=rateLimit({windowMs:15*60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiados intentos. Intenta más tarde.'}});
 app.post('/api/login',loginLimit,async(req,res)=>{
  const email=text(req.body.email,'Correo',200).toLowerCase(), password=text(req.body.password,'Contraseña',200);
  const user=(await pool.query('SELECT * FROM users WHERE lower(email)=$1',[email])).rows[0];
  // Fixed bcrypt cost also for unknown accounts.
  const valid=await verifyPassword(password,user?.password_hash||'$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
  if(!user||!valid) throw fail(401,'Correo o contraseña incorrectos');
  await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
  req.session.userId=user.id;req.session.csrf=randomBytes(24).toString('hex');res.json({user:exposeUser(user),csrf:req.session.csrf});
 });
 app.use('/api',async(req,res,next)=>{if(!req.session.userId) return next(fail(401,'Inicia sesión para continuar'));const user=(await pool.query('SELECT id,email,name,role,company_id FROM users WHERE id=$1',[req.session.userId])).rows[0];if(!user)return next(fail(401,'Sesión finalizada'));req.user=user;next();});
 app.get('/api/me',(req,res)=>res.json({user:req.user}));
 app.post('/api/logout',async(req,res)=>{await new Promise((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));res.clearCookie('connect.sid');res.json({ok:true});});
 app.get('/api/companies',async(req,res)=>{
  const query=req.user.role==='client'?{sql:'WHERE id=$1',args:[req.user.company_id]}:req.user.role==='agent'?{sql:'WHERE id IN (SELECT company_id FROM tickets WHERE agent_id=$1)',args:[req.user.id]}:{sql:'',args:[]};
  const companies=(await pool.query(`SELECT * FROM companies ${query.sql} ORDER BY name`,query.args)).rows;
  // An agent's contacts are restricted to companies for assigned tickets.
  const contacts=(await pool.query('SELECT * FROM contacts WHERE company_id=ANY($1::int[]) ORDER BY name',[companies.map(c=>c.id)])).rows;
  res.json({companies,contacts});
 });
 app.get('/api/users',async(req,res)=>{if(req.user.role!=='manager')throw fail(403,'Acceso reservado al responsable');res.json({users:(await pool.query('SELECT id,name,email,role,company_id FROM users ORDER BY role,name')).rows});});
 app.get('/api/tickets',async(req,res)=>{
  const s=scope(req.user);res.json({tickets:(await pool.query(`SELECT t.*,c.name company,a.name agent FROM tickets t JOIN companies c ON c.id=t.company_id LEFT JOIN users a ON a.id=t.agent_id WHERE ${s.sql} ORDER BY t.created_at DESC,t.id DESC`,s.args)).rows});
 });
 app.get('/api/tickets/:id',async(req,res)=>{
  const t=await ticket(pool,req.user,req.params.id);
  const events=(await pool.query(`SELECT e.*,u.name actor FROM events e JOIN users u ON u.id=e.actor_id WHERE ticket_id=$1 ${internal(req.user)?'':'AND internal=false'} ORDER BY e.created_at,e.id`,[t.id])).rows;
  if(!internal(req.user)) delete t.resolution;res.json({ticket:t,events});
 });
 app.post('/api/tickets',async(req,res)=>{
  if(req.user.role==='agent') throw fail(403,'Las solicitudes nuevas se registran desde el portal cliente o la supervisión');
  const b=req.body, company=req.user.role==='client'?req.user.company_id:id(b.company_id);
  if(req.user.role==='client'&&b.company_id!==undefined&&Number(b.company_id)!==company)throw fail(403,'Empresa no autorizada');
  const c=(await pool.query('SELECT id FROM companies WHERE id=$1',[company])).rows[0];if(!c)throw fail(400,'Empresa no válida');
  const priority=choice(b.priority,priorities);
  const t=await transaction(async db=>{
   const t=(await db.query("INSERT INTO tickets(title,company_id,site,category,description,priority,requested_priority,created_by,due_at) VALUES($1,$2,$3,$4,$5,$6,$6,$7,now()+($8 * interval '1 hour')) RETURNING *",[text(b.title,'Asunto',160),company,text(b.site,'Sede',160),choice(b.category,categories),text(b.description,'Descripción'),priority,req.user.id,hours[priority]])).rows[0];
   await event(db,t,req.user,'history','Solicitud registrada');return t;
  });res.status(201).json({ticket:t});
 });
 app.post('/api/tickets/:id/actions',async(req,res)=>{
  const b=req.body;
  const result=await transaction(async db=>{
   const t=await ticket(db,req.user,req.params.id,true);
   if(b.action==='reply') {
    if(['Cerrado','Resuelto'].includes(t.status)) throw fail(409,'Reabre la solicitud antes de responder');
    if(internal(req.user)&&b.approved!==true)throw fail(400,'Confirma la revisión humana antes de publicar');
    await event(db,t,req.user,'reply',text(b.body,'Respuesta'));
   } else {
    if(!internal(req.user))throw fail(403,'Acción reservada al equipo');
    switch(b.action) {
     case 'assign': {
      if(req.user.role!=='manager')throw fail(403,'Solo el responsable puede asignar');
      const agent=(await db.query("SELECT id,name FROM users WHERE id=$1 AND role='agent'",[id(b.agent_id)])).rows[0];if(!agent)throw fail(400,'Agente no válido');
      if(['Resuelto','Cerrado'].includes(t.status))throw fail(409,'Reabre la solicitud antes de asignar');
      await db.query("UPDATE tickets SET agent_id=$1,status='En curso' WHERE id=$2",[agent.id,t.id]);await event(db,t,req.user,'history',`Asignado a ${agent.name}`);break;
     }
     case 'note':await event(db,t,req.user,'note',text(b.body,'Nota interna'),true);break;
     case 'classify': {
      if(b.approved!==true)throw fail(400,'Confirma la clasificación');
      const priority=choice(b.priority,priorities),category=choice(b.category,categories);
      await db.query("UPDATE tickets SET priority=$1,category=$2,due_at=created_at+($3 * interval '1 hour') WHERE id=$4",[priority,category,hours[priority],t.id]);await event(db,t,req.user,'history',`Clasificación validada: ${category} · ${priority}`);break;
     }
     case 'resolve': {
      if(!['Abierto','En curso'].includes(t.status))throw fail(409,'La solicitud ya está resuelta');
      const resolution=text(b.body,'Resolución');
      await db.query("UPDATE tickets SET status='Resuelto',resolution=$1,resolved_at=now() WHERE id=$2",[resolution,t.id]);await event(db,t,req.user,'resolution',resolution);break;
     }
     case 'close': {
      if(t.status!=='Resuelto')throw fail(409,'Documenta la resolución antes de cerrar');
      await db.query("UPDATE tickets SET status='Cerrado' WHERE id=$1",[t.id]);await event(db,t,req.user,'history','Solicitud cerrada');break;
     }
     case 'reopen': {
      if(!['Resuelto','Cerrado'].includes(t.status))throw fail(409,'La solicitud ya está abierta');
      const reason=text(b.body,'Motivo de reapertura');
      await db.query("UPDATE tickets SET status='Abierto',resolution=NULL,resolved_at=NULL,due_at=now()+($2 * interval '1 hour') WHERE id=$1",[t.id,hours[t.priority]]);await event(db,t,req.user,'history',`Solicitud reabierta: ${reason}`);break;
     }
     default:throw fail(400,'Acción no válida');
    }
   }
   return (await db.query('SELECT * FROM tickets WHERE id=$1',[t.id])).rows[0];
  });res.json({ticket:result});
 });
 app.post('/api/tickets/:id/olivia',async(req,res)=>{
  if(!internal(req.user))throw fail(403,'Olivia está reservada al equipo');
  const t=await ticket(pool,req.user,req.params.id);
  const events=(await pool.query('SELECT body FROM events WHERE ticket_id=$1 ORDER BY created_at DESC LIMIT 4',[t.id])).rows;
  const priority=/detenid|sin conexión|no puede procesar/i.test(t.description)?'Crítica':t.priority;
  res.json({mode:'demo',summary:`${t.title}. ${t.description} Estado: ${t.status}. ${events.length} eventos recientes.`,priority,category:t.category,draft:`Estimado equipo: recibimos su solicitud «${t.title}» en ${t.site}. ${t.category==='Conectividad'?'Por favor, confirme el estado de los indicadores de red y si otras terminales presentan la misma incidencia. Evite reiniciar equipos durante operaciones activas.':t.category==='Facturación'?'Por favor, comparta los números de referencia de los cargos para cotejarlos con el periodo facturado. No incluya datos bancarios.':'Por favor, confirme cuándo comenzó la incidencia y qué verificaciones realizó su equipo.'} Coordinaremos el siguiente paso y mantendremos el seguimiento en este portal.`,nextAction:`Confirmar el alcance con ${t.site}, revisar ${t.category.toLowerCase()} y actualizar el seguimiento antes del vencimiento SLA.`,resolution:t.resolution?`Síntesis: ${t.resolution}`:`Borrador pendiente de verificación: documentar la causa de «${t.title}», las acciones realizadas y la confirmación de ${t.site}. No afirmar que el caso está resuelto sin verificarlo.`});
 });
 app.use('/api',(req,res,next)=>next(fail(404,'Ruta no disponible')));
 app.use(express.static(new URL('../public/',import.meta.url).pathname));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);if(!err.status||err.status>=500) console.error('Request failed:',err.code||err.name);res.status(err.status||500).json({error:err.status&&err.status<500?err.message:'No fue posible completar la operación'});});
 return app;
}
