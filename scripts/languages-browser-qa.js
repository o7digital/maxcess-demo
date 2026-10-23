import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.QA_BASE_URL||'http://127.0.0.1:3103';
let originalLanguage;
const codes=['es','en','fr','de','it','pt','ja','ru','da'];
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/signup');
 for(const code of codes){
  await page.locator('#language').selectOption(code);
  await page.waitForFunction(code=>document.documentElement.lang===code,code);
  await page.locator('#auth-form button').waitFor();
  assert.equal(await page.locator('#language option').count(),9);
  assert.ok(!/__MX_SLOT_|MXKEEP/.test(await page.locator('body').innerText()));
  const preserved=await page.evaluate(async()=>{const {localizedHtml}=await import('/localization.js');return localizedHtml`<span data-user-content>${'Reports'}</span>`;});
  assert.ok(preserved.includes('Reports'));
  await page.reload();await page.waitForFunction(code=>document.documentElement.lang===code,code);
  await page.goto(base+'/pricing');await page.locator('[data-public-plan]').first().waitFor();
  assert.equal(await page.locator('[data-public-plan]').count(),1);
  await page.locator('[data-public-months="12"]').click();
  assert.ok(!/__MX_SLOT_|MXKEEP/.test(await page.locator('body').innerText()));
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),code+' mobile');
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/signup');
 }
 await page.goto(base+'/login');
 const credentials=JSON.parse(await readFile(process.env.QA_ACCESS_PATH||'.local/demo-access.json','utf8')).find(u=>u.role==='admin');
 await page.locator('[name=email]').fill(credentials.email);await page.locator('[name=password]').fill(credentials.password);
 await page.locator('#auth-form button').click();await page.locator('[data-view=subscription]').waitFor();
 originalLanguage=(await (await page.request.get(base+'/api/me')).json()).user.language||'es';
 for(const code of codes){
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/preferences')&&r.request().method()==='PUT'),page.locator('#language').selectOption(code)]);await page.reload();await page.locator('[data-view=subscription]').waitFor();await page.waitForFunction(code=>document.documentElement.lang===code,code);
  await page.locator('[data-view=subscription]').click();await page.locator('[data-plan]').first().waitFor();
  assert.ok(!/__MX_SLOT_|MXKEEP/.test(await page.locator('body').innerText()));
 }
 assert.deepEqual(errors,[]);console.log('Nine languages: signup, reload persistence, pricing, mobile layout, authenticated subscription and customer text preservation passed.');
}finally{if(originalLanguage){const config=await (await page.request.get(base+'/api/bootstrap')).json();const restored=await page.request.put(base+'/api/preferences',{headers:{'X-CSRF-Token':config.csrf},data:{language:originalLanguage}});assert.ok(restored.ok(),'Restore original language');}await browser.close();}
