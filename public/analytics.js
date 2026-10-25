import {reportGraphs} from "./report-graphs.js";
import {reportToolbar} from "./report-delivery.js";
import { REPORT_TYPES, reportType } from "./report-types.js";
import { localizedHtml, translateText, ensureLocale } from "./localization.js";
const e = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function metricCards(data) {
  const m = data.metrics;
  return localizedHtml`<div class="stats executive-stats">${[
    ["Solicitudes del periodo", m.total, "Registros guardados"],
    ["En atención", m.active, `${m.overdue} SLA vencidos`],
    [
      "Cumplimiento SLA",
      m.sla_percent === null ? "—" : m.sla_percent + "%",
      `${m.resolved} casos atendidos`,
    ],
    [
      "Tiempo de resolución",
      m.average_resolution_hours === null
        ? "—"
        : m.average_resolution_hours + " h",
      "Promedio de casos atendidos",
    ],
  ]
    .map(
      ([l, v, n]) =>
        localizedHtml`<div class="stat"><small>${l}</small><strong>${v}</strong><footer>${n}</footer></div>`,
    )
    .join("")}</div>`;
}
function lines(series) {
  if(!series.some(d=>d.created||d.resolved))return localizedHtml`<p class="empty report-empty-chart">Sin datos en este periodo.</p>`;
  const step=Math.ceil(series.length/31);
  const data=step>1?Array.from({length:Math.ceil(series.length/step)},(_,i)=>{const group=series.slice(i*step,(i+1)*step);return {date:group[0].date+' — '+group.at(-1).date,created:group.reduce((s,d)=>s+d.created,0),resolved:group.reduce((s,d)=>s+d.resolved,0)};}):series;
  const
    max = Math.max(1, ...data.map((d) => Math.max(d.created, d.resolved))),
    w = 600,
    h = 160;
  const points = (key) =>
    data
      .map(
        (d, i) =>
          `${30 + (i / Math.max(data.length - 1, 1)) * 540},${h - 20 - (d[key] / max) * 120}`,
      )
      .join(" ");
  return localizedHtml`<svg class="activity-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Solicitudes creadas y atendidas durante el periodo"><path d="M30 20H570M30 60H570M30 100H570M30 140H570" class="grid-line"/><polyline points="${points("created")}" class="chart-created"/><polyline points="${points("resolved")}" class="chart-resolved"/>${data.map((d, i) => localizedHtml`<circle cx="${30 + (i / Math.max(data.length - 1, 1)) * 540}" cy="${h - 20 - (d.created / max) * 120}" r="3" class="chart-dot"><title>${d.date}: ${d.created} creadas, ${d.resolved} atendidas</title></circle>`).join("")}</svg><div class="chart-labels"><span>${e(series[0]?.date)}</span><span>${e(series.at(-1)?.date)}</span></div>`;
}
function bars(values) {
  const max = Math.max(1, ...values.map((v) => v.count));
  return values.length
    ? values
        .map(
          (v) =>
            localizedHtml`<div class="report-bar"><div class="row"><span>${e(translateText(v.label))}</span><b>${v.count}</b></div><svg viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="5" rx="2" fill="#edf0e9"/><rect width="${(v.count / max) * 100}" height="5" rx="2" fill="#a6be72"/></svg></div>`,
        )
        .join("")
    : localizedHtml('<p class="empty">Sin datos en este periodo.</p>');
}
export function charts(data) {
  return localizedHtml`<div class="dashboard-charts"><div class="panel activity-panel"><div class="panel-head"><div><div class="eyebrow">PULSO DE ATENCIÓN</div><h2>Evolución de solicitudes</h2></div><div class="chart-key"><span>Creadas</span><span>Atendidas</span></div></div>${lines(data.series)}<p class="chart-caption">Cohorte de solicitudes creadas durante el periodo seleccionado. Atendidas según su fecha de resolución.</p></div><div class="panel"><div class="eyebrow">DISTRIBUCIÓN</div><h2>Estado de la operación</h2><div class="chart-list">${bars(data.status)}</div></div><div class="panel"><div class="eyebrow">MOTIVOS DE CONTACTO</div><h2>Categorías</h2><div class="chart-list">${bars(data.category)}</div></div><div class="panel"><div class="eyebrow">FOCO DE SERVICIO</div><h2>Volumen por empresa</h2><div class="chart-list">${bars(data.companies.slice(0, 8))}</div></div></div>`;
}
export function reportDocument(report, {controls=true}={}) {
  const d = report.snapshot;
  return localizedHtml`<div class="saved-report"><div class="row"><div><div class="eyebrow">INFORME ${e(report.id.slice(0, 8))}</div><h2>${translateText(reportType(d.filters.report_type || "executive").title)}</h2></div><span class="badge">${report.provider === "huggingface" ? translateText("Hugging Face") : translateText("Datos verificados")}</span></div><p class="subtitle">${d.filters.start} — ${d.filters.end} · alcance ${e(d.scope)} · creado ${new Date(report.created_at).toLocaleString(document.documentElement.lang || "es")}</p>${d.calculation_version < 3 ? localizedHtml`<p class="subtitle">Informe anterior al ajuste de zona horaria. Genera uno nuevo para consultar las cifras del periodo corregido.</p>` : ""}${reportBody(d)}${report.narrative ? localizedHtml`<div class="report-narrative text-block">${e(report.narrative)}</div>` : ""}${controls?reportToolbar(report.id):""}</div>`;
}

const value=v=>v===null||v===undefined?'—':v;
export function reportingDetails(data){
 if(!data.workload)return '';
 const w=data.workload,c=data.comparison,r=data.first_response;
 const cards=[['Open requests',w.total],['Unassigned',w.unassigned],['SLA vencidos',w.overdue],['Oldest open request',w.oldest_age_days===null?'—':w.oldest_age_days+' '+translateText('days')],['Average first response',r.average_hours===null?'—':r.average_hours+' h'],['Volume change',c.volume_change_percent===null?translateText('Not comparable'):(c.volume_change_percent>0?'+':'')+c.volume_change_percent+'%']];
 const header=['Agent','Total','En atención','Resueltas o cerradas','SLA vencidos','First response (h)','Resolution (h)'];
 return localizedHtml`${data.metrics.total===0?localizedHtml`<div class="panel report-empty-period" role="status"><h2>${translateText('No requests in this period')}</h2><p>${translateText('No requests were created in this period. Open requests from earlier dates are shown below.')}</p>${!data.coverage?.earliest_created_at?localizedHtml`<p>${translateText('No requests exist in this scope yet.')}</p>`:''}</div>`:''}<section class="report-detail-section"><div class="panel-head"><h2>${translateText('Current workload · all creation dates')}</h2><small>${new Date(w.as_of).toLocaleString(document.documentElement.lang||'es')}</small></div><div class="stats report-detail-stats">${cards.map(([label,n])=>localizedHtml`<div class="stat"><small>${translateText(label)}</small><strong>${e(n)}</strong></div>`).join('')}</div><p class="subtitle">${translateText('Previous period')}: ${c.start} — ${c.end} · ${c.total} ${translateText('solicitudes')} · ${translateText('First responses recorded')}: ${r.answered} / ${data.metrics.total}</p><div class="dashboard-charts"><div class="panel"><h2>${translateText('Open request age')}</h2>${bars(w.aging)}</div><div class="panel"><h2>${translateText('Prioridad')}</h2>${bars(data.priority)}</div></div><div class="panel report-performance"><h2>${translateText('Agent performance')}</h2><p class="subtitle">${data.filters.start} — ${data.filters.end}</p>${performanceTable(data,header)}</div><p class="report-methodology">${translateText('Figures use the selected creation period; current workload includes all creation dates. Response times count public staff replies only. Missing timestamps are excluded from SLA and duration averages.')}</p></section>`;
}
export function reportCsvRows(data){
 const rows=[['Section','Dimension','Metric','Value'],['Report type','',data.filters.report_type||'executive',data.business?.title||'Executive service review'],['Period',data.filters.start,'End',data.filters.end],['Scope',data.scope,'Timezone',data.timezone]];
 for(const[k,v]of Object.entries(data.metrics))rows.push(['Indicators','',k,v]);
 for(const group of ['status','category','priority','companies'])for(const row of data[group]||[])rows.push([group,row.label,'count',row.count]);
 for(const row of data.series)for(const k of ['created','resolved'])rows.push(['Daily',row.date,k,row[k]]);
 if(data.workload){for(const k of ['total','overdue','unassigned','critical','oldest_age_days'])rows.push(['Current workload','',k,data.workload[k]]);for(const a of data.workload.aging)rows.push(['Age',a.label,'count',a.count]);}
 for(const row of data.performance||[])for(const k of ['total','active','resolved','overdue','average_first_response_hours','average_resolution_hours'])rows.push(['Agent',row.label,k,row[k]]);
 if(data.comparison)for(const k of ['start','end','total','resolved','volume_change_percent'])rows.push(['Previous period','',k,data.comparison[k]]);
 if(data.first_response)for(const[k,v]of Object.entries(data.first_response))rows.push(['First response','',k,v]);
 if(data.business){for(const m of data.business.metrics)rows.push([data.business.title,'',m.label,m.value]);for(const t of data.business.tables){t.rows.forEach((row,i)=>{for(const c of t.columns)rows.push([t.title,String(i+1),c.label,row[c.key]]);});}for(const note of data.business.limitations)rows.push(['Methodology','',note,'']);}
 return rows;
}

function performanceTable(data,headers){
 if(!data.performance.length)return localizedHtml`<p class="empty">Sin datos en este periodo.</p>`;
 return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+e(translateText(h))+'</th>').join('')+'</tr></thead><tbody>'+data.performance.map(a=>'<tr><td>'+e(a.label==='Unassigned'?translateText(a.label):a.label)+'</td>'+[a.total,a.active,a.resolved,a.overdue,a.average_first_response_hours,a.average_resolution_hours].map(n=>'<td>'+e(value(n))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}

export function reportCatalogue(selected='executive'){
 return localizedHtml`<section class="report-catalogue" aria-label="${e(translateText('Choose a report'))}"><h2>${translateText('Choose a report')}</h2><div class="report-type-grid">${REPORT_TYPES.map((type,i)=>localizedHtml`<button type="button" class="report-type-card ${type.id===selected?'selected':''}" data-report-type="${type.id}" aria-pressed="${type.id===selected}"><span class="report-type-index">${String(i+1).padStart(2,'0')}</span><strong>${translateText(type.title)}</strong><small>${translateText(type.description)}</small></button>`).join('')}</div></section>`;
}
function businessTable(table){
 if(!table.rows.length)return localizedHtml`<p class="empty">Sin datos en este periodo.</p>`;
 const cell=(row,column)=>{const n=row[column.key];if(n===null||n===undefined)return '—';if(column.key==='priority')return e(translateText(n));if(column.key==='due_at')return e(new Date(n).toLocaleString(document.documentElement.lang||'es'));return e(typeof n==='string'&&n==='Unassigned'?translateText(n):n);};
 return '<div class="table-wrap"><table><thead><tr>'+table.columns.map(c=>'<th>'+e(translateText(c.label))+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr>'+table.columns.map(c=>'<td>'+cell(row,c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
export function reportBody(data){
 if(!data.business)return metricCards(data)+charts(data)+reportingDetails(data);
 const b=data.business;
 const intro=localizedHtml`<section class="panel report-type-intro"><div class="eyebrow">${translateText('Purpose-built report')}</div><h2>${translateText(b.title)}</h2><p>${translateText(b.description)}</p><small>${data.filters.start} — ${data.filters.end} · ${e(data.timezone)} · ${translateText('Current figures')}: ${new Date(data.generated_at).toLocaleString(document.documentElement.lang||'es')}</small></section>`;
 if(b.type==='executive')return intro+metricCards(data)+reportGraphs(data)+reportingDetails(data);
 return intro+reportGraphs(data)+localizedHtml`<section class="business-report" data-business-report="${b.type}">${data.metrics.total===0?localizedHtml`<div class="report-empty-period"><p>${translateText('No requests in this period')}</p></div>`:''}<div class="stats report-business-stats">${b.metrics.map(m=>localizedHtml`<div class="stat"><small>${translateText(m.label)}</small><strong>${e(m.value===null?'—':m.value)}${m.value===null?'':e(m.unit)}</strong></div>`).join('')}</div>${b.tables.map(t=>localizedHtml`<section class="panel business-table"><h2>${translateText(t.title)}</h2>${businessTable(t)}</section>`).join('')}<div class="panel report-methodology"><p>${translateText('Figures use the selected creation period; current workload includes all creation dates. Response times count public staff replies only. Missing timestamps are excluded from SLA and duration averages.')}</p>${b.limitations.map(note=>localizedHtml`<p>${translateText(note)}</p>`).join('')}</div></section>`;
}
