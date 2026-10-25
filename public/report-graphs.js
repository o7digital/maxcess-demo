import {reportChartData,allowedChartKinds}from'./report-chart-data.js';import{translateText}from'./localization.js';
export const CHART_COLORS=['#608642','#b47838','#347b8a'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>{const max=/[\u3000-\u9fff]/.test(s)?12:22;return s.length>max?s.slice(0,max-1)+'…':s;};
export function reportGraphs(data){return '<section class="report-graphs" aria-label="'+esc(translateText('Report charts'))+'">'+reportChartData(data).map(chart=>graphCard(chart)).join('')+'</section>';}
function graphCard(chart){
 const t=translateText,number=n=>new Intl.NumberFormat(document.documentElement.lang||'es',{maximumFractionDigits:2}).format(n);
 const legend=(['pie','doughnut'].includes(chart.kind)?[chart.series[chart.selected_series||0]]:chart.series).map((s,i)=>'<span><i class="chart-color-'+i%3+'"></i>'+esc(t(s.name))+'</span>').join('');
 // No data remains distinct from real zero values.
 const available=chart.categories.length&&chart.series.some(s=>s.values.some(n=>Number.isFinite(n)));
 let svg='';
 if(available){
  const max=Math.max(1,...chart.series.flatMap(s=>s.values).filter(Number.isFinite)),w=760;
  if(['pie','doughnut'].includes(chart.kind)){svg=pieSvg(chart,number);}
  else if(chart.kind==='column'){const h=380,left=55,bottom=270,top=25,group=(700-left)/Math.max(1,chart.categories.length),bw=Math.max(4,Math.min(38,(group-10)/chart.series.length));svg=`<svg viewBox="0 0 760 ${h}" role="img" aria-label="${esc(t(chart.title))}">`;for(let i=0;i<=4;i++){const y=bottom-i*(bottom-top)/4;svg+=`<line x1="${left}" y1="${y}" x2="720" y2="${y}" stroke="#dce3d7"/><text x="${left-7}" y="${y+4}" text-anchor="end">${number(max*i/4)}</text>`;}chart.categories.forEach((label,i)=>{const gx=left+i*group+8;chart.series.forEach((s,j)=>{const v=s.values[i];if(!Number.isFinite(v))return;const height=v/max*(bottom-top);svg+=`<rect x="${gx+j*bw}" y="${bottom-height}" width="${bw-2}" height="${height}" fill="${CHART_COLORS[j%3]}"><title>${esc(label)} · ${esc(t(s.name))}: ${number(v)}</title></rect>`;});svg+=`<text transform="translate(${gx},${bottom+15}) rotate(35)" font-size="14">${esc(short(t(label)))}</text>`;});svg+='</svg>'; }
  else if(chart.kind==='line'){
   const h=280,left=48,right=735,bottom=224,top=24;
   svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t(chart.title))}">`;
   for(let i=0;i<=4;i++){const y=bottom-i*(bottom-top)/4;svg+=`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#dce3d7"/><text x="${left-8}" y="${y+4}" text-anchor="end">${number(max*i/4)}</text>`;}
   for(const[s,series]of chart.series.entries()){let segment=[];const flush=()=>{if(segment.length)svg+=`<polyline points="${segment.join(' ')}" stroke="${CHART_COLORS[s%3]}" stroke-width="3" fill="none"/>`;segment=[];};series.values.forEach((v,i)=>{if(!Number.isFinite(v)){flush();return;}const x=left+i*(right-left)/Math.max(1,chart.categories.length-1),y=bottom-v/max*(bottom-top);segment.push(`${x},${y}`);svg+=`<circle cx="${x}" cy="${y}" r="4" fill="${CHART_COLORS[s%3]}"><title>${esc(chart.categories[i])}: ${esc(t(series.name))} ${number(v)}</title></circle>`;});flush();}
   if(chart.categories.length<=8){chart.categories.forEach((label,i)=>{const text=t(label),limit=chart.categories.length>5?9:16;svg+=`<text x="${left+i*(right-left)/Math.max(1,chart.categories.length-1)}" y="258" text-anchor="${i===0?'start':i===chart.categories.length-1?'end':'middle'}">${esc(text.length>limit?text.slice(0,limit-1)+'…':text)}</text>`;});svg+='</svg>';}else svg+=`<text x="${left}" y="258">${esc(chart.categories[0])}</text><text x="${right}" y="258" text-anchor="end">${esc(chart.categories.at(-1))}</text></svg>`;
  }else{
   const rowH=chart.series.length>1?64:48,left=246,right=704,h=chart.categories.length*rowH+30;
   svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t(chart.title))}">`;
   chart.categories.forEach((category,i)=>{const y=15+i*rowH;svg+=`<text x="0" y="${y+15}">${esc(short(t(category)))}<title>${esc(category)}</title></text>`;chart.series.forEach((s,j)=>{const value=s.values[i],by=y+j*22;const width=Number.isFinite(value)?Math.max(0,value)/max*(right-left):0;svg+=`<rect x="${left}" y="${by}" width="${right-left}" height="15" rx="3" fill="#f0f3ec"/><rect x="${left}" y="${by}" width="${width}" height="15" rx="3" fill="${CHART_COLORS[j%3]}"><title>${esc(category)} · ${esc(t(s.name))}: ${value===null?'—':number(value)}</title></rect><text x="${right+10}" y="${by+12}">${value===null?'—':number(value)}</text>`;});});svg+='</svg>';
  }
 }
 return '<section class="panel report-graph-card" data-chart-id="'+chart.id+'" data-render-kind="'+chart.kind+'"><h3>'+esc(t(chart.title))+'</h3>'+chartControls(chart)+'<div class="report-chart-legend">'+legend+'</div>'+(available?svg:'<p class="empty">'+esc(t('Sin datos en este periodo.'))+'</p>')+'<p class="report-chart-note">'+esc(t('Chart values match the report tables. Missing measurements are shown as a dash.'))+(chart.truncated_groups&&!['pie','doughnut'].includes(chart.kind)?' '+esc(t('Only the first ten groups are charted; full tables are exported.')):'')+'</p></section>';
}
export function chartControls(chart){
 const labels={bar:'Horizontal bars',column:'Vertical columns',line:'Line chart',pie:'Pie chart',doughnut:'Doughnut chart'};
 return '<div class="chart-display-controls"><label>'+esc(translateText('Chart display'))+'<select data-chart-kind="'+chart.id+'">'+allowedChartKinds(chart).map(kind=>'<option value="'+kind+'"'+(kind===chart.kind?' selected':'')+'>'+esc(translateText(labels[kind]))+'</option>').join('')+'</select></label>'+(['pie','doughnut'].includes(chart.kind)&&chart.series.length>1?'<label>'+esc(translateText('Series'))+'<select data-chart-series="'+chart.id+'">'+chart.series.map((s,i)=>'<option value="'+i+'"'+(i===(chart.selected_series||0)?' selected':'')+'>'+esc(translateText(s.name))+'</option>').join('')+'</select></label>':'')+'</div>';
}
function pieSvg(chart,number){
 const s=chart.series[chart.selected_series||0],total=s.values.reduce((n,v)=>n+(Number.isFinite(v)&&v>0?v:0),0);
 if(!total)return '<p class="empty">'+esc(translateText('No positive values to display as shares.'))+'</p>';
 let angle=-Math.PI/2,svg='<svg viewBox="0 0 760 350" role="img" aria-label="'+esc(translateText(chart.title))+'">';
 s.values.forEach((v,i)=>{if(!Number.isFinite(v)||v<=0)return;const end=angle+v/total*2*Math.PI,cx=170,cy=170,r=135,color=PIE_COLORS[i%PIE_COLORS.length];if(v===total)svg+='<circle cx="170" cy="170" r="135" fill="'+color+'"/>';else{const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle),x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);svg+=`<path d="M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${end-angle>Math.PI?1:0} 1 ${x2} ${y2} Z" fill="${color}" stroke="white" stroke-width="2"><title>${esc(chart.categories[i])}: ${number(v)} (${number(v/total*100)}%)</title></path>`;}angle=end;});
 if(chart.kind==='doughnut')svg+='<circle cx="170" cy="170" r="74" fill="white"/><text x="170" y="176" text-anchor="middle">'+number(total)+'</text>';
 chart.categories.forEach((category,i)=>{const v=s.values[i],y=30+i*30;svg+='<rect x="340" y="'+(y-14)+'" width="12" height="12" fill="'+PIE_COLORS[i%PIE_COLORS.length]+'"/><text x="360" y="'+y+'">'+esc(short(translateText(category)))+' · '+(Number.isFinite(v)?number(v)+' ('+number(v/total*100)+'%)':'—')+'</text>';});return svg+'</svg>';
}
const PIE_COLORS=['#608642','#b47838','#347b8a','#855f99','#be6770','#5374a1','#c0a132','#588d77','#915e3a','#728048'];
