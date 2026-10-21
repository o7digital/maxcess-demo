import aliases from './locale-aliases.js';
import {languages} from './international.js';
const dictionaries=new Map(), pending=new Map();
export const normalize = value => String(value).replace(/\s+/g,' ').trim();
export async function ensureLocale(code) {
  if(!Object.hasOwn(languages,code)) code='es';
  if(dictionaries.has(code)) return;
  if(!pending.has(code)) pending.set(code,fetch(`/locales/${code}.json`).then(async response=>{
    if(!response.ok) throw Error('Language resources unavailable');
    dictionaries.set(code,await response.json());
  }).catch(error=>{pending.delete(code);throw error;}));
  await pending.get(code);
}
export function translateText(value,code=document.documentElement.lang||'es') {
  if(Array.isArray(value)) return value.map(item=>translateText(item,code));
  const source=normalize(value), key=aliases[source]||source;
  return dictionaries.get(code)?.[key] ?? (code==='es'?source:key);
}
function translateTree(root,code) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
    if(node.parentElement?.closest('script,style,[data-user-content]'))continue;
    const original=node.nodeValue, trimmed=normalize(original);
    if(!trimmed || !/[A-Za-zÁÉÍÓÚáéíóúñ]/.test(trimmed.replace(/__MX_SLOT_\d+__/g,'')))continue;
    if(node.parentElement?.tagName==='OPTION'&&!node.parentElement.hasAttribute('value'))node.parentElement.value=node.parentElement.textContent;
    const value=translateText(trimmed,code);
    if(value!==trimmed)node.nodeValue=original.replace(original.trim(),value);
  }
  for(const element of root.querySelectorAll('[placeholder],[title],[aria-label]')){
    if(element.closest('[data-user-content]'))continue;
    for(const name of ['placeholder','title','aria-label'])if(element.hasAttribute(name))element.setAttribute(name,translateText(element.getAttribute(name),code));
  }
}
// Translate static template text before inserting values, preserving customer data.
export function localizedHtml(strings,...values) {
  const template=document.createElement('template');
  const raw=typeof strings==='string'?strings:strings.map((part,i)=>part+(i<values.length?`__MX_SLOT_${i}__`:'')).join('');
  let output;
  if (/<!doctype|<html[\s>]/i.test(raw)) {
    const parsed=new DOMParser().parseFromString(raw,'text/html');
    parsed.documentElement.lang=document.documentElement.lang||'es';
    translateTree(parsed,parsed.documentElement.lang);
    output='<!doctype html>'+parsed.documentElement.outerHTML;
  } else {
    template.innerHTML=raw;translateTree(template.content,document.documentElement.lang||'es');output=template.innerHTML;
  }
  return output.replace(/__MX_SLOT_(\d+)__/g,(_,i)=>String(values[Number(i)]??''));
}
export function translatedLegal(html,code=document.documentElement.lang||'es') {
  const template=document.createElement('template');template.innerHTML=html;translateTree(template.content,code);return template.innerHTML;
}
