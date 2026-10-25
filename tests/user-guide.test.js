import {test,after} from 'node:test';
import {pool} from '../server/db.js';
after(()=>pool.end());
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {guideSearch} from '../public/user-guide.js';
const codes=['en','es','fr','de','it','pt','ja','ru','da'];
test('User guide translations preserve complete workflows, identifiers and role filters',async()=>{
 const docs=await Promise.all(codes.map(async code=>JSON.parse(await readFile(new URL(`../public/user-guide/${code}.json`,import.meta.url),'utf8'))));
 const base=docs[0];assert.equal(base.articles.length,20);assert.equal(new Set(base.articles.map(a=>a.id)).size,20);
 for(const [i,d] of docs.entries()){
  assert.equal(new Set(d.articles.map(a=>a.note)).size,20,`${codes[i]} distinct article notes`);
  assert.deepEqual(Object.keys(d).sort(),Object.keys(base).sort());
  for(const [n,a] of d.articles.entries()){
   const source=base.articles[n];assert.equal(a.id,source.id);assert.equal(a.role,source.role);assert.ok(['all','admin','agent','client'].includes(a.role));assert.deepEqual(Object.keys(a).sort(),Object.keys(source).sort());assert.equal(a.steps.length,source.steps.length);
   for(const value of [a.title,a.summary,...a.steps,a.note,a.example]){assert.ok(typeof value==='string'&&value.length>4,`${codes[i]} ${a.id}`);assert.ok(!/<\/?(?:script|iframe)/i.test(value));}
   if(i)assert.notEqual(a.title,source.title,`${codes[i]} ${a.id} must be translated`);
  }
 }
});
test('Guide search matches accents and case without altering Japanese or Cyrillic',()=>{assert.equal(guideSearch('RÉSOLU'),guideSearch('resolu'));assert.equal(guideSearch('Запрос'),guideSearch('запрос'));assert.equal(guideSearch('日本語'),'日本語');});
test('Public guide routes serve the application without authentication',async()=>{
 const {default:request}=await import('supertest');const {createApp}=await import('../server/app.js');const app=createApp();
 for(const path of ['/help','/help/']){const r=await request(app).get(path);assert.equal(r.status,200);assert.match(r.text,/user-guide\.css/);assert.match(r.text,/src="\/app\.js"/);}
});
