// Versioned static documentation: no customer data or AI call is needed to read it.
const languages={es:'Español',en:'English',fr:'Français',de:'Deutsch',it:'Italiano',pt:'Português',ja:'日本語',ru:'Русский',da:'Dansk'};
const cache=new Map();
export const guideSearch=value=>String(value).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderGuide(el,{role='all',standalone=false,language=document.documentElement.lang||'es'}={}){
 let selectedRole=role==='client'?'client':role==='agent'||role==='manager'?'agent':role==='admin'||role==='platform_admin'?'admin':'all';
 let query='',code=Object.hasOwn(languages,language)?language:'es',data;
 const requested=new URLSearchParams(location.hash.slice(1)).get('help');let selected=requested||'start';
 async function load(){
  const loadingCode=code;
  el.innerHTML='<p role="status">Service Hub · …</p>';
  try{if(!cache.has(loadingCode)){const r=await fetch(`/user-guide/${loadingCode}.json`);if(!r.ok)throw Error();cache.set(loadingCode,await r.json());}if(!el.isConnected||code!==loadingCode)return;data=cache.get(loadingCode);draw();}
  catch{if(!el.isConnected||code!==loadingCode)return;el.innerHTML='<p role="alert">Service Hub — guide unavailable. <a href="/help">↻</a></p>';}
 }
 function list(){return data.articles.filter(a=>(selectedRole==='all'||a.role==='all'||a.role===selectedRole)&&guideSearch([a.title,a.summary,...a.steps,a.note,a.example].join(' ')).includes(guideSearch(query)));}
 function results(){const matches=list();el.querySelector('[data-guide-count]').textContent=`${matches.length} ${data.count}`;el.querySelector('[data-guide-list]').innerHTML=matches.length?matches.map(a=>`<button type="button" data-guide-id="${escape(a.id)}" aria-current="${a.id===selected?'true':'false'}"><strong>${escape(a.title)}</strong><span>${escape(a.summary)}</span></button>`).join(''):`<p role="status">${escape(data.empty)}</p>`;}
 function article(){const a=data.articles.find(a=>a.id===selected)||data.articles[0];el.querySelector('[data-guide-article]').innerHTML=`<div class="guide-article-label">Service Hub · ${escape(data[a.role])}</div><h2 tabindex="-1">${escape(a.title)}</h2><p class="guide-summary">${escape(a.summary)}</p><h3>${escape(data.steps)}</h3><ol>${a.steps.map(s=>`<li>${escape(s)}</li>`).join('')}</ol><section class="guide-note"><h3>${escape(data.note)}</h3><p>${escape(a.note)}</p></section><section class="guide-example"><h3>${escape(data.example)}</h3><p>${escape(a.example)}</p></section><p><a href="/help?lang=${code}#help=${encodeURIComponent(a.id)}">↗ ${escape(a.title)}</a></p>`;}
 function draw(){
 el.innerHTML=`<section class="user-guide" data-user-content lang="${code}"><header class="guide-header"><div><span class="eyebrow">SERVICE HUB</span><h1>${escape(data.title)}</h1><p>${escape(data.intro)}</p></div><div><label>${escape(data.language)}<select data-guide-language>${Object.entries(languages).map(([k,v])=>`<option value="${k}" ${k===code?'selected':''}>${v}</option>`).join('')}</select></label>${standalone?`<a class="guide-back" href="/">← ${escape(data.back)}</a>`:''}</div></header><div class="guide-controls"><label>${escape(data.search)}<input type="search" data-guide-search placeholder="${escape(data.search)}"></label><fieldset><legend>${escape(data.contents)}</legend>${['all','client','agent','admin'].map(r=>`<button type="button" data-guide-role="${r}" aria-pressed="${selectedRole===r}">${escape(data[r])}</button>`).join('')}</fieldset></div><div class="guide-layout"><nav class="guide-index" aria-label="${escape(data.contents)}"><p data-guide-count></p><div data-guide-list></div></nav><article data-guide-article></article></div></section>`;
 results();article();
 el.querySelector('[data-guide-search]').addEventListener('input',e=>{query=e.target.value;results();});
 el.querySelector('[data-guide-language]').addEventListener('change',e=>{code=e.target.value;if(standalone){const u=new URL(location.href);u.searchParams.set('lang',code);history.replaceState(null,'',u);}load();});
 el.querySelectorAll('[data-guide-role]').forEach(b=>b.addEventListener('click',()=>{selectedRole=b.dataset.guideRole;el.querySelectorAll('[data-guide-role]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));results();}));
 el.querySelector('[data-guide-list]').addEventListener('click',e=>{const b=e.target.closest('[data-guide-id]');if(!b)return;selected=b.dataset.guideId;history.replaceState(null,'',`${location.pathname}${location.search}#help=${encodeURIComponent(selected)}`);results();article();el.querySelector('[data-guide-article] h2').focus({preventScroll:true});if(matchMedia('(max-width: 760px)').matches)el.querySelector('[data-guide-article]').scrollIntoView({behavior:'smooth',block:'start'});});
 }
 await load();
}
