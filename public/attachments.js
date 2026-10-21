import { localizedHtml, translateText, ensureLocale } from "./localization.js";
export function attachmentInput(tr) {
  return localizedHtml`<label for="ticket-files">${tr('Archivos adjuntos','Attachments')}</label><input id="ticket-files" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.txt,.png,.jpg,.jpeg" aria-describedby="attachment-help"><p id="attachment-help" class="subtitle">${tr('PDF, Excel, Word, CSV, TXT, PNG y JPG · Hasta 5 archivos y 2 MB en total por envío. Visibles para el cliente y el equipo del caso.','PDF, Excel, Word, CSV, TXT, PNG and JPG · Up to 5 files and 2 MB total per upload. Visible to the customer and the team handling this request.')}</p>`;
}
export async function readAttachments(input, tr) {
  const files = [...input.files];
  if (files.length > 5 || files.reduce((s,f)=>s+f.size,0) > 2*1024*1024) throw Error(tr('Máximo 5 archivos y 2 MB en total por envío','Maximum 5 files and 2 MB total per upload'));
  return Promise.all(files.map(async f => ({name:f.name,file:await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error(tr('No fue posible leer el archivo','Could not read the file')));reader.readAsDataURL(f);
  })})));
}
export async function downloadAttachment(ticketId, attachmentId, filename, clientPortal) {
  const res=await fetch(`/api/tickets/${ticketId}/attachments/${attachmentId}`,{headers:clientPortal?{'X-Client-Portal':'1'}:{}});
  if (!res.ok) {const body=await res.json();throw Error(body.error || 'Archivo no disponible');}
  const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
