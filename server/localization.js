import {readFileSync} from 'node:fs';
import aliases from '../public/locale-aliases.js';
import {languages} from '../public/international.js';
import {mailMessages} from '../public/mail-copy.js';
const cache=new Map();
export function serverText(source,language,values=[]) {
  if(!Object.hasOwn(languages,language))language='es';
  if(!cache.has(language))cache.set(language,JSON.parse(readFileSync(new URL(`../public/locales/${language}.json`,import.meta.url),'utf8')));
  const normalized=String(source).replace(/\s+/g," ").trim();
  const key=aliases[normalized]||normalized;
  return (cache.get(language)[key]||source).replace(/__MX_SLOT_(\d+)__/g,(_,i)=>String(values[Number(i)]??''));
}
export async function localizedEmail(db,tenant,recipient,key,subject,body) {
  const {rows:[context]}=await db.query('SELECT t.name,t.settings,t.trial_ends_at,(SELECT language FROM users WHERE tenant_id=t.id AND lower(email)=lower($2) LIMIT 1) language FROM tenants t WHERE t.id=$1',[tenant,recipient]);
  const language=context?.language||context?.settings?.language||'es';
  if(!context||language==='es')return {subject,body};
  const text=(name,values=[])=>serverText(mailMessages[name],language,values);
  const url=body.match(/https:\/\/[^\s]+/)?.[0]||'';
  const finish=(name,values,copy,copyValues)=>({subject:'Service Hub · '+text(name,values),body:text(copy,copyValues)});
  if(key.startsWith('account:'))return finish(key.startsWith('account:reset:')?'resetSubject':'verifySubject',[],'accountBody',[url]);
  const date=new Date(context.trial_ends_at).toLocaleString(language,{timeZone:context.settings.timezone||'America/Mexico_City'});
  if(key.startsWith('welcome:'))return finish('welcomeSubject',[],'welcomeBody',[context.name,date]);
  if(key.startsWith('invite:'))return finish('inviteSubject',[context.name],'inviteBody',[context.name,url]);
  if(key.startsWith('trial:'))return key.endsWith(':expired')?finish('trialExpiredSubject',[],'trialExpiredBody',[context.name,url]):finish('trialReminderSubject',[],'trialReminderBody',[context.name,date,url]);
  if(key.startsWith('invoice:'))return finish(subject.includes('Pago confirmado')?'paidSubject':'paymentSubject',[],'invoiceBody',[url]);
  if(/^(assigned|escalation):\d+$/.test(key)) {
    const id=Number(key.split(':')[1]);const {rows:[ticket]}=await db.query('SELECT title FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,id]);
    if(ticket){const type=key.startsWith('assigned:')?'assigned':'escalation';return finish(type+'Subject',['SH-'+id],type+'Body',['SH-'+id,ticket.title]);}
  }
  return {subject,body};
}
