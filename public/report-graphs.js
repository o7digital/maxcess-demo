import {reportChartData}from'./report-chart-data.js';import{translateText}from'./localization.js';
export const CHART_COLORS=['#608642','#b47838','#347b8a'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>{const max=/[\u3000-\u9fff]/.test(s)?12:22;return s.length>max?s.slice(0,max-1)+'…':s;};
export function reportGraphs(data){return '<section class="report-graphs" aria-label="'+esc(translateText('Report charts'))+'">'+reportChartData(data).map(chart=>graphCard(chart)).join('')+'</section>';}
function graphCard(chart){
 const t=translateText,number=n=>new Intl.NumberFormat(document.documentElement.lang||'es',{maximumFractionDigits:2}).format(n);
 const legend=chart.series.map((s,i)=>'<span><i class="chart-color-'+i%3+'"></i>'+esc(t(s.name))+'</span>').join('');
 // No data remains distinct from real zero values.
 const available=chart.categories.length&&chart.series.some(s=>s.values.some(n=>Number.isFinite(n)));
 let svg='';
 if(available){
  const max=Math.max(1,...chart.series.flatMap(s=>s.values).filter(Number.isFinite)),w=760;
  if(chart.kind==='line'){
   const h=280,left=48,right=735,bottom=224,top=24;
   svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t(chart.title))}">`;
   for(let i=0;i<=4;i++){const y=bottom-i*(bottom-top)/4;svg+=`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#dce3d7"/><text x="${left-8}" y="${y+4}" text-anchor="end">${number(max*i/4)}</text>`;}
   for(const[s,series]of chart.series.entries()){const points=series.values.map((v,i)=>`${left+i*(right-left)/Math.max(1,chart.categories.length-1)},${bottom-v/max*(bottom-top)}`).join(' ');svg+=`<polyline points="${points}" stroke="${CHART_COLORS[s%3]}" stroke-width="3" fill="none"/>`;series.values.forEach((v,i)=>{svg+=`<circle cx="${left+i*(right-left)/Math.max(1,chart.categories.length-1)}" cy="${bottom-v/max*(bottom-top)}" r="3" fill="${CHART_COLORS[s%3]}"><title>${esc(chart.categories[i])}: ${esc(t(series.name))} ${number(v)}</title></circle>`;});}
   svg+=`<text x="${left}" y="258">${esc(chart.categories[0])}</text><text x="${right}" y="258" text-anchor="end">${esc(chart.categories.at(-1))}</text></svg>`;
  }else{
   const rowH=chart.series.length>1?64:48,left=246,right=704,h=chart.categories.length*rowH+30;
   svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t(chart.title))}">`;
   chart.categories.forEach((category,i)=>{const y=15+i*rowH;svg+=`<text x="0" y="${y+15}">${esc(short(t(category)))}<title>${esc(category)}</title></text>`;chart.series.forEach((s,j)=>{const value=s.values[i],by=y+j*22;const width=Number.isFinite(value)?Math.max(0,value)/max*(right-left):0;svg+=`<rect x="${left}" y="${by}" width="${right-left}" height="15" rx="3" fill="#f0f3ec"/><rect x="${left}" y="${by}" width="${width}" height="15" rx="3" fill="${CHART_COLORS[j%3]}"><title>${esc(category)} · ${esc(t(s.name))}: ${value===null?'—':number(value)}</title></rect><text x="${right+10}" y="${by+12}">${value===null?'—':number(value)}</text>`;});});svg+='</svg>';
  }
 }
 return '<section class="panel report-graph-card"><h3>'+esc(t(chart.title))+'</h3><div class="report-chart-legend">'+legend+'</div>'+(available?svg:'<p class="empty">'+esc(t('Sin datos en este periodo.'))+'</p>')+'<p class="report-chart-note">'+esc(t('Chart values match the report tables. Missing measurements are shown as a dash.'))+(chart.total_categories>10&&chart.kind==='bar'?' '+esc(t('Only the first ten groups are charted; full tables are exported.')):'')+'</p></section>';
}
