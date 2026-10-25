import { businessReport } from "./reporting-business.js";
import { scope } from './permissions.js';
const mean=values=>values.length?Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)):null;
export async function reportingDetails(db,user,filters,timezone,tickets){
 const now=Date.now(),s=scope(user),args=[...s.args];let where=s.sql;
 if(filters.company_id){args.push(filters.company_id);where+=` AND t.company_id=$${args.length}`;}
 const baseline=[...args];baseline.push(timezone);const tz=baseline.length;
 const days=Math.round((Date.parse(filters.end)-Date.parse(filters.start))/86400000)+1;
 const previousStart=new Date(Date.parse(filters.start)-days*86400000).toISOString().slice(0,10);
 const previousEnd=new Date(Date.parse(filters.start)-86400000).toISOString().slice(0,10);
 baseline.push(previousStart,filters.start);
 const{rows:[previous]}=await db.query(`SELECT count(*)::int total,count(*) FILTER(WHERE t.status IN ('Resuelto','Cerrado'))::int resolved FROM tickets t WHERE ${where} AND t.created_at >= ($${tz+1}::date::timestamp AT TIME ZONE $${tz}) AND t.created_at < ($${tz+2}::date::timestamp AT TIME ZONE $${tz})`,baseline);
 const{rows:open}=await db.query(`SELECT t.id,t.created_at,t.due_at,t.priority,t.agent_id,t.site,t.category,t.company_id,c.name company,u.name agent_name FROM tickets t JOIN companies c ON c.id=t.company_id AND c.tenant_id=t.tenant_id LEFT JOIN users u ON u.id=t.agent_id AND u.tenant_id=t.tenant_id WHERE ${where} AND t.status IN ('Abierto','En curso')`,args);
 const flowArgs=[...args,timezone,filters.start,filters.end],ftz=args.length+1;
 const{rows:completed}=await db.query(`SELECT t.created_at,t.resolved_at FROM tickets t WHERE ${where} AND t.resolved_at >= ($${ftz+1}::date::timestamp AT TIME ZONE $${ftz}) AND t.resolved_at < (($${ftz+2}::date+1)::timestamp AT TIME ZONE $${ftz})`,flowArgs);
 const business=businessReport(filters.report_type||'executive',tickets,open,completed,timezone,now);
 const ages=[{label:'0–2 days',min:0,max:2},{label:'3–7 days',min:3,max:7},{label:'8–14 days',min:8,max:14},{label:'15+ days',min:15,max:Infinity}].map(b=>({label:b.label,count:open.filter(t=>{const age=Math.max(0,Math.floor((now-new Date(t.created_at))/86400000));return age>=b.min&&age<=b.max;}).length}));
 const byAgent=new Map();
 for(const t of tickets){const key=t.agent_id??'unassigned';if(!byAgent.has(key))byAgent.set(key,{label:t.agent_name||'Unassigned',total:0,active:0,resolved:0,overdue:0,resolution:[],response:[]});const a=byAgent.get(key);a.total++;if(['Abierto','En curso'].includes(t.status)){a.active++;if(new Date(t.due_at).getTime()<now)a.overdue++;}if(['Resuelto','Cerrado'].includes(t.status)){a.resolved++;if(t.resolved_at&&new Date(t.resolved_at)>=new Date(t.created_at))a.resolution.push((new Date(t.resolved_at)-new Date(t.created_at))/3600000);}if(t.first_response_at)a.response.push((new Date(t.first_response_at)-new Date(t.created_at))/3600000);}
 const performance=[...byAgent.values()].map(({resolution,response,...a})=>({...a,average_resolution_hours:mean(resolution),average_first_response_hours:mean(response)})).sort((a,b)=>b.total-a.total);
 const responses=tickets.filter(t=>t.first_response_at).map(t=>(new Date(t.first_response_at)-new Date(t.created_at))/3600000);
 const previousTotal=Number(previous.total);
 return {business,comparison:{start:previousStart,end:previousEnd,total:previousTotal,resolved:Number(previous.resolved),volume_change_percent:previousTotal?Number(((tickets.length-previousTotal)/previousTotal*100).toFixed(1)):null},workload:{as_of:new Date(now).toISOString(),basis:'currently_open_all_creation_dates',total:open.length,overdue:open.filter(t=>new Date(t.due_at).getTime()<now).length,unassigned:open.filter(t=>t.agent_id===null).length,critical:open.filter(t=>t.priority==='Crítica').length,oldest_age_days:open.length?Math.max(...open.map(t=>Math.max(0,Math.floor((now-new Date(t.created_at))/86400000)))):null,aging:ages},performance,first_response:{average_hours:mean(responses),answered:responses.length,without_reply:tickets.length-responses.length},coverage:{earliest_created_at:(await db.query(`SELECT min(t.created_at) earliest FROM tickets t WHERE ${where}`,args)).rows[0].earliest}};
}
