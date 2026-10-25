import {rateLimit}from'express-rate-limit';
import{pool}from'./db.js';import{reportData}from'./reporting.js';import{reportWorkbook}from'./report-xlsx.js';import{departmentManager,accessScope}from'./roles.js';
let active=0;
export function installReportExportRoutes(app){
 const limit=rateLimit({windowMs:15*60000,limit:30,keyGenerator:req=>req.user.tenant_id+':'+req.user.id,standardHeaders:'draft-8',legacyHeaders:false});
 async function send(req,res,snapshot,narrative){
  if(active>=2)throw Object.assign(new Error('An export is already running. Try again shortly.'),{status:429});active++;
  try{const buffer=await reportWorkbook(snapshot,{language:req.user.language||'en',narrative});res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="servicehub-${snapshot.filters.report_type||'executive'}-${snapshot.filters.start}.xlsx"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(buffer);}finally{active--;}
 }
 app.get('/api/reports/export.xlsx',limit,async(req,res)=>send(req,res,await reportData(req.user,req.query),null));
 app.get('/api/reports/:reportId/export.xlsx',limit,async(req,res)=>{
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(req.params.reportId))throw Object.assign(new Error('Report not found'),{status:404});
  const scope=req.user.role==='client'?'empresa':req.user.role==='agent'?'asignados':departmentManager(req.user)?accessScope(req.user):'global';
  const{rows:[report]}=await pool.query("SELECT * FROM reports WHERE id=$1 AND user_id=$2 AND tenant_id=$3 AND snapshot->>'scope'=$4",[req.params.reportId,req.user.id,req.user.tenant_id,scope]);
  if(!report||(req.user.role==='client'&&Number(report.filters.company_id)!==req.user.company_id))throw Object.assign(new Error('Report not found'),{status:404});
  await send(req,res,report.snapshot,report.narrative);
 });
}
