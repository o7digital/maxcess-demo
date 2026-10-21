import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:3100';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
const money=(c,lang)=>new Intl.NumberFormat(lang,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol'}).format(c/100)+' USD';
try {
 await page.goto(base+'/pricing');
 for(const lang of ['es','en','fr']) {
  if(lang!=='es') {await page.locator('#language').selectOption(lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);}
  await page.locator('[data-public-plan="solo-2"]').waitFor();assert.equal(await page.locator('[data-public-plan]').count(),4);
  for(const [id,seats,unit] of [['solo-2',1,2900],['solo-2',2,2900],['team-5',3,2400],['team-5',10,2400],['team-15',11,1900],['team-15',20,1900],['business-30',21,1200],['business-30',50,1200]]) {
   await page.locator(`[data-seats="${id}"]`).fill(String(seats));await page.locator(`[data-seats="${id}"]`).press('Tab');
   for(const [months,factor] of [[1,1],[3,.925],[6,.875],[12,10/12]]) {
    await page.locator(`[data-public-months="${months}"]`).click();
    assert.equal(await page.locator(`[data-public-plan="${id}"] .plan-price`).innerText(),money(Math.round(seats*unit*months*factor),lang)+" "+(lang==="en"?"excl. tax":"HT"));
   }
  }
  assert.ok(!/18%|MXN/.test(await page.locator('body').innerText()));
  assert.ok((await page.locator('[data-public-months="12"]').innerText()).includes({es:"2 meses gratis",en:"2 months free",fr:"2 mois offerts"}[lang]));
 }
 // Check the authenticated subscription route uses the same quantities and totals.
 const credentials=JSON.parse(await readFile(process.env.QA_ACCESS_PATH || '.local/demo-access.json','utf8'));
 const c=credentials.find(c=>c.role==='admin') || credentials.find(c=>c.role==='platform_admin' || c.role==='manager');
 await page.goto(base+'/login');await page.locator('#email').fill(c.email);await page.locator('#password').fill(c.password);await page.locator('#auth-form button').click();await page.locator('[data-action=logout]').waitFor();
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/preferences')&&r.request().method()==='PUT'),page.locator('#language').selectOption('fr')]);await page.reload();await page.locator('[data-action=logout]').waitFor();await page.waitForFunction(()=>document.documentElement.lang==='fr');
 await page.locator('nav [data-view="subscription"]').click();await page.locator('[data-billing-plan="solo-2"]').waitFor();
 await page.locator('[data-seats="team-5"]').fill('7');await page.locator('[data-seats="team-5"]').press('Tab');
 await page.locator('[data-months="6"]').click();
 const lang=await page.locator('html').getAttribute('lang');
 assert.equal(await page.locator('[data-billing-plan="team-5"] .plan-price').innerText(),money(88200,lang)+" "+(lang==="en"?"excl. tax":"HT"));
 const billingState=await (await page.request.get(base+'/api/billing')).json();
 if(!billingState.configured) {
  const before=page.url();await page.locator('[data-plan="team-5"]').click();
  await page.locator('[data-billing-plan="team-5"] [role="alert"]').waitFor();assert.equal(page.url(),before);
 }
 const colours=new Set();
 for(const m of [1,3,6,12]) {
  await page.locator(`[data-months="${m}"]`).click();
  colours.add(await page.locator(`[data-months="${m}"]`).evaluate(n=>getComputedStyle(n).backgroundColor));
  const savings=page.locator(`[data-billing-plan="team-5"] .pricing-saving`);
  await savings.waitFor();if(m>1) assert.ok((await savings.innerText()).includes(money(m===12 ? 7*2400*2 : 7*2400*m-Math.round(7*2400*m*(1-({3:.075,6:.125}[m]))),lang)));
 }
 assert.equal(colours.size,4);
 await mkdir('.local/screenshots',{recursive:true});await page.screenshot({path:'.local/screenshots/servicehub-volume-pricing.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 await Promise.all([page.waitForResponse(r=>r.url().endsWith("/api/logout")),page.locator('[data-action="logout"]').click()]);
 await page.goto(base+'/signup');await page.locator('.signup-legal').waitFor();
 assert.ok((await page.locator('.signup-legal').innerText()).includes('FR17899748560'));
 assert.equal(await page.locator('input[name=accepted_terms]').isChecked(),false);
 for(const path of ['/terms','/privacy']) {
  await page.goto(base+path);await page.locator('.detailed-legal').waitFor();
  assert.equal(await page.locator('.detailed-legal').getAttribute('lang'),await page.locator('html').getAttribute('lang'));
  assert.equal(await page.locator('.detailed-legal details[lang=en]').count(),1);
  assert.ok((await page.locator('.detailed-legal').innerText()).length>5000);
 }
 console.log('Pricing browser QA passed: all volume boundaries, four periods, exact discounts, ES/EN/FR, subscription quantities and mobile layout.');
}finally{await browser.close();}
