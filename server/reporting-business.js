import {reportType} from '../public/report-types.js';
const isOpen=t=>['Abierto','En curso'].includes(t.status);
const isClosed=t=>['Resuelto','Cerrado'].includes(t.status);
const hours=t=>t.resolved_at&&new Date(t.resolved_at)>=new Date(t.created_at)?(new Date(t.resolved_at)-new Date(t.created_at))/3600000:null;
const response=t=>t.first_response_at?(new Date(t.first_response_at)-new Date(t.created_at))/3600000:null;
const round=n=>Number(n.toFixed(1));
const avg=a=>a.length?round(a.reduce((s,n)=>s+n,0)/a.length):null;
// Nearest-rank percentile; never turn an absent duration into zero.
export const percentile90=a=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(a.length*.9)-1]:null;
const pct=(n,d)=>d?round(n/d*100):null;
const date=d=>new Date(d).toISOString();
function grouped(rows,key){const map=new Map();for(const r of rows){const k=JSON.stringify(key(r));if(!map.has(k))map.set(k,[]);map.get(k).push(r);}return [...map.values()];}
function summary(rows){const closed=rows.filter(isClosed),durations=closed.map(hours).filter(n=>n!==null),responses=rows.map(response).filter(n=>n!==null);return{total:rows.length,active:rows.filter(isOpen).length,resolved:closed.length,average_resolution_hours:avg(durations),p90_resolution_hours:percentile90(durations)===null?null:round(percentile90(durations)),first_response_hours:avg(responses),sla_percent:pct(closed.filter(t=>hours(t)!==null&&new Date(t.resolved_at)<=new Date(t.due_at)).length,durations.length),documented:closed.filter(t=>t.has_resolution).length,evidence:rows.filter(t=>Number(t.attachment_count)>0).length};}
export function businessReport(typeId,tickets,open,completed,timezone='America/Mexico_City',now=Date.now()){
 const type=reportType(typeId),s=summary(tickets),late=open.filter(t=>new Date(t.due_at).getTime()<now),responded=tickets.map(response).filter(n=>n!==null),closed=tickets.filter(isClosed),metrics=[],tables=[],limitations=[];
 const metric=(key,label,value,unit='')=>metrics.push({key,label,value,unit});
 const table=(key,title,columns,rows)=>tables.push({key,title,columns:columns.map(([key,label])=>({key,label})),rows});
 const overdue=rows=>rows.filter(t=>new Date(t.due_at).getTime()<now).length;
 if(type.id==='support'){
  metric('created','Solicitudes del periodo',tickets.length);metric('completed','Resolved in the period',completed.length);metric('balance','Created minus resolved',tickets.length-completed.length);metric('answered','First responses recorded',responded.length);metric('p90_response','First response p90 (h)',percentile90(responded)===null?null:round(percentile90(responded)));metric('p90_resolution','Resolution p90 (h)',s.p90_resolution_hours);
  const days=new Map();for(const[times,key]of[[tickets,'created'],[completed,'resolved']])for(const t of times){const d=new Date(key==='created'?t.created_at:t.resolved_at).toLocaleDateString('en-CA',{timeZone:timezone});if(!days.has(d))days.set(d,{label:d,created:0,resolved:0});days.get(d)[key]++;}
  table('flow','Daily service flow',[['label','Date'],['created','Solicitudes del periodo'],['resolved','Resolved in the period']],[...days.values()].sort((a,b)=>a.label.localeCompare(b.label)));
  limitations.push('Created minus resolved is not an exact backlog change when reopenings are untracked.');
 }else if(type.id==='sla'){
  const soon=open.filter(t=>new Date(t.due_at).getTime()>=now&&new Date(t.due_at).getTime()<=now+86400000);
  metric('sla','Cumplimiento SLA',s.sla_percent,'%');metric('overdue','SLA vencidos',late.length);metric('due24','Due within 24 hours',soon.length);metric('critical','Critical open requests',open.filter(t=>t.priority==='Crítica').length);metric('overdue_unassigned','Overdue and unassigned',late.filter(t=>t.agent_id===null).length);
  table('risk','Commitments needing attention',[['label','Request'],['priority','Prioridad'],['due_at','Due date'],['overdue_hours','Overdue hours']],[...late,...soon].sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)).slice(0,25).map(t=>({label:'SH-'+t.id,priority:t.priority,due_at:date(t.due_at),overdue_hours:round(Math.max(0,(now-new Date(t.due_at))/3600000))})));
 }else if(type.id==='capacity'){
  const assigned=open.filter(t=>t.agent_id!==null),groups=grouped(assigned,t=>t.agent_id),largest=Math.max(0,...groups.map(g=>g.length));
  metric('open','Open requests',open.length);metric('unassigned','Unassigned',open.length-assigned.length);metric('agents','Agents with assigned work',groups.length);metric('largest','Largest assigned queue',largest);metric('concentration','Largest queue share',pct(largest,assigned.length),'%');
  table('queues','Current assignment queues',[['label','Agent'],['total','Open requests'],['overdue','SLA vencidos'],['oldest_days','Oldest open request']],grouped(open,t=>t.agent_id).map(g=>({label:g[0].agent_name||'Unassigned',total:g.length,overdue:overdue(g),oldest_days:Math.max(...g.map(t=>Math.max(0,Math.floor((now-new Date(t.created_at))/86400000))))})).sort((a,b)=>b.total-a.total));
  limitations.push('Recorded workload is not staff utilization; working hours and availability are not recorded.');
 }else if(type.id==='engineering'){
  metric('sites','Sites covered',new Set(tickets.map(t=>JSON.stringify([t.company_id,t.site]))).size);metric('requests','Solicitudes del periodo',tickets.length);metric('evidence','Requests with attachments',s.evidence);metric('resolution','Resolution (h)',s.average_resolution_hours);metric('p90','Resolution p90 (h)',s.p90_resolution_hours);metric('documented','Documented resolutions',pct(s.documented,s.resolved),'%');
  table('sites','Interventions by site and category',[['company','Cliente'],['site','Site'],['category','Categorías'],['total','Total'],['resolved','Resueltas o cerradas'],['evidence','Requests with attachments'],['average_resolution_hours','Resolution (h)']],grouped(tickets,t=>[t.company_id,t.site,t.category]).map(g=>({company:g[0].company,site:g[0].site,category:g[0].category,...summary(g)})).sort((a,b)=>b.total-a.total));
  limitations.push('Asset reliability, repair labor and costs are not recorded.');
 }else if(type.id==='recurring'){
  const patterns=grouped(tickets,t=>[t.company_id,t.site,t.category]).filter(g=>g.length>1),count=patterns.reduce((n,g)=>n+g.length,0);
  metric('patterns','Repeated request groups',patterns.length);metric('requests','Requests in repeated groups',count);metric('share','Share of period requests',pct(count,tickets.length),'%');metric('sites','Sites covered',new Set(patterns.map(g=>JSON.stringify([g[0].company_id,g[0].site]))).size);
  table('patterns','Patterns to investigate',[['company','Cliente'],['site','Site'],['category','Categorías'],['total','Total'],['active','En atención'],['average_resolution_hours','Resolution (h)']],patterns.map(g=>({company:g[0].company,site:g[0].site,category:g[0].category,...summary(g)})).sort((a,b)=>b.total-a.total));limitations.push('Similar requests are not proof of a shared root cause.');
 }else if(type.id==='quality'){
  metric('closed','Resueltas o cerradas',closed.length);metric('documented','Documented resolutions',pct(s.documented,s.resolved),'%');metric('missing_notes','Missing resolution notes',closed.filter(t=>!t.has_resolution).length);metric('missing_dates','Missing resolution timestamps',closed.filter(t=>hours(t)===null).length);metric('multiple_replies','Multiple public replies',tickets.filter(t=>Number(t.staff_reply_count)>1).length);metric('no_reply','No public staff reply',tickets.filter(t=>!t.first_response_at).length);
  table('coverage','Resolution documentation by category',[['label','Categorías'],['resolved','Resueltas o cerradas'],['documented','Documented resolutions'],['missing','Missing resolution notes']],grouped(closed,t=>t.category).map(g=>({label:g[0].category,resolved:g.length,documented:g.filter(t=>t.has_resolution).length,missing:g.filter(t=>!t.has_resolution).length})));
  limitations.push('Resolution notes show documentation coverage, not verified technical quality.','Customer satisfaction requires a survey and cannot be inferred from ticket counts.');
 }else{
  metric('requests','Solicitudes del periodo',tickets.length);metric('resolved','Resueltas o cerradas',s.resolved);metric('sla','Cumplimiento SLA',s.sla_percent,'%');metric('response','Average first response',avg(responded),'h');metric('open','Open requests',open.length);metric('overdue','SLA vencidos',late.length);
  table('customers','Customer service results',[['label','Cliente'],['total','Total'],['resolved','Resueltas o cerradas'],['sla_percent','Cumplimiento SLA'],['first_response_hours','First response (h)'],['open','Open requests'],['overdue','SLA vencidos']],grouped([...tickets,...open],t=>t.company_id).map(g=>{const id=g[0].company_id,period=tickets.filter(t=>t.company_id===id),current=open.filter(t=>t.company_id===id);return{label:g[0].company,...summary(period),open:current.length,overdue:overdue(current)};}).sort((a,b)=>b.total-a.total));
  limitations.push('Customer satisfaction requires a survey and cannot be inferred from ticket counts.');
 }
 if(metrics.some(m=>m.label.includes("p90")))limitations.push("At least 90% of measured durations are at or below p90.");
 return{type:type.id,title:type.title,description:type.description,metrics,tables,limitations};
}
