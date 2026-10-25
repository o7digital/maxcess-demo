// One numeric source for on-screen SVG, printing and native Excel charts.
export function reportChartData(data){
 const b=data.business,type=b?.type||'executive',charts=[];
 const metric=k=>b?.metrics.find(m=>m.key===k)?.value??null;
 const table=k=>b?.tables.find(t=>t.key===k)?.rows||[];
 const bar=(id,title,rows,columns,label,unit='')=>charts.push({id,title,kind:'bar',categories:rows.slice(0,10).map(label),series:columns.map(([key,name])=>({name,values:rows.slice(0,10).map(r=>typeof r[key]==='number'?r[key]:null)})),unit,truncated_groups:rows.length>10,total_categories:rows.length,all_categories:rows.map(label),all_series:columns.map(([key,name])=>({name,values:rows.map(r=>typeof r[key]==='number'?r[key]:null)}))});
 const line=(id,title,rows)=>{const step=Math.max(1,Math.ceil(rows.length/31)),bins=[];for(let i=0;i<rows.length;i+=step){const part=rows.slice(i,i+step);bins.push({label:part[0].date+(part.length>1?' — '+part.at(-1).date:''),created:part.reduce((n,r)=>n+r.created,0),resolved:part.reduce((n,r)=>n+r.resolved,0)});}charts.push({id,title,kind:'line',categories:bins.map(r=>r.label),series:[{name:'Solicitudes del periodo',values:bins.map(r=>r.created)},{name:'Resolved in the period',values:bins.map(r=>r.resolved)}],unit:'',total_categories:bins.length});};
 const mk=(key,label)=>({label,value:metric(key)});
 if(type==='executive'){
  line('activity','Service activity',data.series||[]);
  bar('status','Estado de la operación',data.status||[],[['count','Total']],r=>r.label);
  bar('aging','Open request age',data.workload?.aging||[],[['count','Open requests']],r=>r.label);
 }else if(type==='support'){
  const flow=new Map(table('flow').map(r=>[r.label,r]));line('flow','Daily service flow',(data.series||[]).map(r=>({date:r.date,created:flow.get(r.date)?.created||0,resolved:flow.get(r.date)?.resolved||0})));
  bar('times','Measured response and resolution times',[mk('p90_response','First response p90 (h)'),mk('p90_resolution','Resolution p90 (h)')],[['value','Measured duration']],r=>r.label,'h');
 }else if(type==='sla'){
  bar('exposure','SLA commitments and exposure',[mk('overdue','SLA vencidos'),mk('due24','Due within 24 hours'),mk('critical','Critical open requests'),mk('overdue_unassigned','Overdue and unassigned')],[['value','Total']],r=>r.label);
  bar('lateness','Overdue hours',table('risk'),[['overdue_hours','Overdue hours']],r=>r.label,'h');
 }else if(type==='capacity'){
  bar('queues','Current assignment queues',table('queues'),[['total','Open requests'],['overdue','SLA vencidos']],r=>r.label);
  bar('queue-age','Oldest open request',table('queues'),[['oldest_days','days']],r=>r.label,'days');
 }else if(type==='engineering'){
  const rows=table('sites');bar('sites','Interventions by site and category',rows,[['total','Total'],['evidence','Requests with attachments']],r=>r.site+' · '+r.category);
  bar('durations','Measured response and resolution times',rows,[['average_resolution_hours','Resolution (h)'],['p90_resolution_hours','Resolution p90 (h)']],r=>r.site+' · '+r.category,'h');
 }else if(type==='recurring'){
  const rows=table('patterns');bar('patterns','Patterns to investigate',rows,[['total','Total'],['active','En atención']],r=>r.site+' · '+r.category);
  bar('duration','Resolution (h)',rows,[['average_resolution_hours','Resolution (h)']],r=>r.site+' · '+r.category,'h');
 }else if(type==='quality'){
  bar('gaps','Resolution documentation gaps',[mk('missing_notes','Missing resolution notes'),mk('missing_dates','Missing resolution timestamps'),mk('multiple_replies','Multiple public replies'),mk('no_reply','No public staff reply')],[['value','Total']],r=>r.label);
  bar('coverage','Resolution documentation by category',table('coverage'),[['resolved','Resueltas o cerradas'],['documented','Documented resolutions']],r=>r.label);
 }else if(type==='customer'){
  const rows=table('customers');bar('customers','Customer service results',rows,[['total','Solicitudes del periodo'],['open','Open requests']],r=>r.label);
  bar('customer-sla','Cumplimiento SLA',rows,[['sla_percent','Cumplimiento SLA']],r=>r.label,'%');
 }
 for(const chart of charts){if(chart.id==='status')chart.kind='doughnut';const choice=data.filters?.chart_styles?.[chart.id];if(choice){if(!allowedChartKinds(chart).includes(choice.kind))throw Object.assign(new Error('Unsupported chart presentation'),{status:400});chart.kind=choice.kind;chart.selected_series=choice.series||0;if(chart.selected_series>=chart.series.length)throw Object.assign(new Error('Unknown chart series'),{status:400});}}
 for(const chart of charts){if(['pie','doughnut'].includes(chart.kind)){const categories=chart.all_categories||chart.categories,series=chart.all_series||chart.series,selected=chart.selected_series||0;const order=categories.map((_,i)=>i).sort((a,b)=>(series[selected].values[b]||0)-(series[selected].values[a]||0));chart.categories=order.map(i=>categories[i]);chart.series=series.map(s=>({name:s.name,values:order.map(i=>s.values[i])}));if(chart.categories.length>10){chart.categories=[...chart.categories.slice(0,9),'Other groups'];chart.series=chart.series.map(s=>({name:s.name,values:[...s.values.slice(0,9),s.values.slice(9).some(Number.isFinite)?s.values.slice(9).reduce((n,v)=>n+(Number.isFinite(v)?v:0),0):null]}));}}delete chart.all_categories;delete chart.all_series;}

 return charts;
}

export function allowedChartKinds(chart){
 const share=['activity','flow','status','aging','queues','sites','patterns','coverage','customers'].includes(chart.id)&&!chart.unit;
 return share?['bar','column','line','pie','doughnut']:['bar','column','line'];
}
export function validateChartStyles(raw){
 if(raw===undefined||raw===null||raw==='')return {};
 let value=raw;if(typeof raw==='string'){if(raw.length>4096)throw Object.assign(new Error('Invalid chart options'),{status:400});try{value=JSON.parse(raw);}catch{throw Object.assign(new Error('Invalid chart options'),{status:400});}}
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>20)throw Object.assign(new Error('Invalid chart options'),{status:400});
 const result={};for(const[id,choice]of Object.entries(value)){if(!/^[a-z][a-z-]{0,30}$/.test(id)||!choice||!['bar','column','line','pie','doughnut'].includes(choice.kind)||!Number.isInteger(choice.series??0)||(choice.series??0)<0||(choice.series??0)>2)throw Object.assign(new Error('Invalid chart options'),{status:400});result[id]={kind:choice.kind,series:choice.series??0};}return result;
}
