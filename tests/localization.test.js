import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {readFile} from 'node:fs/promises';
import {pool} from '../server/db.js';
import {createApp} from '../server/app.js';
import {validateSettings} from '../server/workspace.js';
import {languages} from '../public/international.js';
const codes=['en','es','fr','de','it','pt','ja','ru','da'];
after(()=>pool.end());
test('All nine language preferences persist, enforce valid codes and support customer branches',async()=>{
 assert.deepEqual(Object.keys(languages).sort(),[...codes].sort());
 const app=createApp(),agent=request.agent(app);
 const credentials=JSON.parse(await readFile('.local/demo-access.json','utf8')).find(c=>c.role==='admin');
 const boot=(await agent.get('/api/bootstrap')).body;
 const login=(await agent.post('/api/login').set('X-CSRF-Token',boot.csrf).send(credentials).expect(200)).body;
 const {rows:[original]}=await pool.query('SELECT language FROM users WHERE id=$1',[login.user.id]);
 try {
  for(const language of codes) {
   assert.equal(validateSettings({language}).language,language);
   await agent.put('/api/preferences').set('X-CSRF-Token',login.csrf).send({language}).expect(200);
   assert.equal((await agent.get('/api/me')).body.user.language,language);
   const {rows:[saved]}=await pool.query('SELECT language FROM users WHERE id=$1',[login.user.id]);assert.equal(saved.language,language);
  }
  await agent.put('/api/preferences').set('X-CSRF-Token',login.csrf).send({language:'xx'}).expect(400);
  assert.throws(()=>validateSettings({language:'xx'}));
 }finally{await pool.query('UPDATE users SET language=$1 WHERE id=$2',[original.language,login.user.id]);}
 const db=await pool.connect();
 try{
  await db.query('BEGIN');const {rows:[company]}=await db.query('SELECT id,tenant_id FROM companies LIMIT 1');
  for(const language of codes)await db.query("INSERT INTO customer_branches(tenant_id,company_id,name,country_code,language,timezone) VALUES($1,$2,$3,'MX',$4,'America/Mexico_City')",[company.tenant_id,company.id,'Localization '+language,language]);
 }finally{await db.query('ROLLBACK');db.release();}
});
test('Every shipped dictionary has the same non-empty messages and preserves dynamic placeholders',async()=>{
 const dictionaries=await Promise.all(codes.map(async code=>[code,JSON.parse(await readFile(new URL(`../public/locales/${code}.json`,import.meta.url),'utf8'))]));
 const expected=Object.keys(dictionaries[0][1]).sort();assert.ok(expected.length>800);
 for(const [code,messages] of dictionaries){assert.deepEqual(Object.keys(messages).sort(),expected,code);
  for(const [source,value] of Object.entries(messages)){
   assert.equal(typeof value,'string',`${code}: ${source}`);assert.ok(value.trim(),`${code}: ${source}`);
   assert.deepEqual((value.match(/__MX_SLOT_\d+__/g)||[]).sort(),(source.match(/__MX_SLOT_\d+__/g)||[]).sort(),`${code}: ${source}`);
   assert.ok(!/MXBEGIN\d|MXEND\d|MXKEEP\d/.test(value),`${code}: untranslated internal marker`);
  }
 }
});
