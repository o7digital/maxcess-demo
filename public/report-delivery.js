import{translateText}from'./localization.js';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reportToolbar(id='current'){
 const t=translateText;return '<div class="report-delivery-toolbar" aria-label="'+e(t('Print and export'))+'">'+[['report-preview','Print preview'],['report-print','Print'],['report-pdf','PDF'],['report-excel','Excel (.xlsx)'],['report-csv','CSV']].map(([action,label])=>'<button type="button" class="btn" data-action="'+action+'" data-report-source="'+e(id)+'">'+e(t(label))+'</button>').join('')+'</div>';
}
export function excelUrl(data,id){
 if(id&&id!=='current')return '/api/reports/'+encodeURIComponent(id)+'/export.xlsx';
 const query=new URLSearchParams();for(const[k,v]of Object.entries(data.filters))if(v!==null&&v!==undefined&&v!=='')query.set(k,typeof v==='object'?JSON.stringify(v):v);return '/api/reports/export.xlsx?'+query;
}
export function openReportPreview({html,title,excel,autoPrint=false,pdf=false}){
 document.querySelector('#report-print-preview')?.remove();const t=translateText,dialog=document.createElement('dialog');dialog.id='report-print-preview';dialog.className='report-print-dialog';
 dialog.innerHTML='<header><h2>'+e(t(pdf?'PDF':'Print preview'))+'</h2><button type="button" class="btn" data-close>'+e(t('Close'))+'</button></header><p>'+e(t('Choose a printer or Save as PDF in the system print dialog.'))+'</p><div class="report-preview-actions"><button type="button" class="btn primary" data-print>'+e(t(pdf?'Save as PDF':'Choose a printer'))+'</button><a class="btn" href="'+e(excel)+'" download>'+e(t('Excel (.xlsx)'))+'</a></div><iframe title="'+e(t('Print preview'))+'" sandbox="allow-same-origin allow-modals"></iframe>';
 document.body.append(dialog);dialog.showModal();const frame=dialog.querySelector('iframe');
 const print=()=>{frame.contentWindow.focus();frame.contentWindow.print();};dialog.querySelector('[data-print]').disabled=true;dialog.querySelector('[data-print]').onclick=print;dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 frame.addEventListener('load',async()=>{if(!dialog.open||!frame.contentDocument)return;await frame.contentDocument.fonts.ready;if(!dialog.open)return;dialog.querySelector('[data-print]').disabled=false;if(autoPrint)print();},{once:true});
 frame.srcdoc='<!doctype html><html lang="'+e(document.documentElement.lang||'en')+'"><head><meta charset="utf-8"><title>'+e(title)+'</title>'+['style.css','saas.css','premium.css','report-print.css'].map(file=>'<link rel="stylesheet" href="'+location.origin+'/'+file+'">').join('')+'</head><body class="report-preview-document"><main id="mx-demo"><div class="body report-print-body">'+html+'</div></main></body></html>';
 return dialog;
}
export async function downloadReportExcel(url){
 const response=await fetch(url,{credentials:'same-origin'});
 if(!response.ok){let message;try{message=(await response.json()).error;}catch{}throw new Error(message||'Excel export failed');}
 const blob=await response.blob(),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'servicehub.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
