import {test}from'node:test';import assert from'node:assert/strict';
import {REPORT_TYPES,reportType}from'../public/report-types.js';import{businessReport,percentile90}from'../server/reporting-business.js';
const now=Date.parse('2026-10-12T12:00:00Z');const base={company_id:1,company:'Customer A',site:'Site A',category:'Network',priority:'Media',agent_id:10,agent_name:'Engineer A',created_at:'2026-10-10T10:00:00Z',due_at:'2026-10-13T10:00:00Z',attachment_count:0,staff_reply_count:0,has_resolution:false};
const tickets=[{...base,id:1,status:'Resuelto',resolved_at:'2026-10-10T11:00:00Z',first_response_at:'2026-10-10T10:30:00Z',has_resolution:true,attachment_count:1,staff_reply_count:1},{...base,id:2,agent_id:11,status:'Cerrado',resolved_at:null,first_response_at:'2026-10-10T12:00:00Z',staff_reply_count:3},{...base,id:3,company_id:2,company:'Customer B',agent_id:null,agent_name:null,status:'Abierto',priority:'Crítica',due_at:'2026-10-12T20:00:00Z'},{...base,id:4,site:'Site B',status:'En curso',priority:'Crítica',due_at:'2026-10-12T10:00:00Z'}];
const open=tickets.slice(2),completed=[tickets[0],{...base,id:5,created_at:'2026-09-01T00:00:00Z',resolved_at:'2026-10-11T12:00:00Z'}];
const get=id=>businessReport(id,tickets,open,completed,'UTC',now);const metric=(b,k)=>b.metrics.find(m=>m.key===k)?.value;
test('Eight report purposes have genuinely different metrics, evidence tables and safe empty results',()=>{
 assert.equal(REPORT_TYPES.length,8);assert.equal(new Set(REPORT_TYPES.map(t=>t.focus)).size,8);assert.throws(()=>reportType('invented'),{status:400});
 for(const type of REPORT_TYPES){const b=get(type.id);assert.equal(b.type,type.id);assert.ok(b.metrics.length>=4);assert.ok(b.tables.length>0);const empty=businessReport(type.id,[],[],[],'UTC',now);assert.ok(empty.metrics.every(m=>m.value===null||m.value===0));}
 assert.equal(percentile90([]),null);assert.equal(percentile90([10,1,8,2,3,5,7,4,6,9]),9);
});
test('Support throughput counts closures of older requests while SLA exposure separates overdue from due-soon',()=>{
 const support=get('support');assert.equal(metric(support,'completed'),2);assert.equal(metric(support,'balance'),2);assert.equal(metric(support,'p90_response'),2);assert.equal(support.tables[0].rows.reduce((n,d)=>n+d.resolved,0),2);
 const sla=get('sla');assert.equal(metric(sla,'sla'),100);assert.equal(metric(sla,'overdue'),1);assert.equal(metric(sla,'due24'),1);assert.equal(metric(sla,'critical'),2);
});
test('Engineering and recurring patterns distinguish customers sharing a site name and never claim proven root causes',()=>{
 const engineering=get('engineering');assert.equal(metric(engineering,'sites'),3);assert.equal(metric(engineering,'evidence'),1);assert.equal(metric(engineering,'documented'),50);
 const recurring=get('recurring');assert.equal(metric(recurring,'patterns'),1);assert.equal(metric(recurring,'requests'),2);assert.equal(metric(recurring,'share'),50);assert.ok(recurring.limitations.some(x=>x.includes('root cause')));
});
test('Quality measures documentation and missing timestamps; dispatch does not fabricate availability or utilization',()=>{
 const q=get('quality');assert.equal(metric(q,'missing_notes'),1);assert.equal(metric(q,'missing_dates'),1);assert.equal(metric(q,'documented'),50);assert.equal(metric(q,'multiple_replies'),1);
 const c=get('capacity');assert.equal(metric(c,'unassigned'),1);assert.equal(metric(c,'agents'),1);assert.equal(metric(c,'largest'),1);assert.ok(c.limitations.some(x=>x.includes('availability')));
 const customer=get('customer');assert.equal(customer.tables[0].rows.length,2);assert.equal(customer.tables[0].rows.reduce((n,r)=>n+r.total,0),4);
});
