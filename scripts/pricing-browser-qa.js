import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:3100';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
const money=(c,lang)=>new Intl.NumberFormat(lang,{style:'currency',currency:'MXN',currencyDisplay:'narrowSymbol'}).format(c/100)+' MXN';
try {
 await page.goto(base+'/pricing');
 for(const lang of ['es','en','fr']) {
  if(lang!=='es') {await page.locator('#language').selectOption(lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);}
  await page.locator('[data-public-plan="solo-2"]').waitFor();assert.equal(await page.locator('[data-public-plan]').count(),4);
  for(const [id,seats,unit] of [['solo-2',1,49900],['solo-2',2,49900],['team-5',3,39900],['team-5',10,39900],['team-15',11,29900],['team-15',20,29900],['business-30',21,19900],['business-30',50,19900]]) {
   await page.locator(`[data-seats="${id}"]`).fill(String(seats));await page.locator(`[data-seats="${id}"]`).press('Tab');
   for(const [months,factor] of [[1,1],[3,.97],[6,.925],[12,.82]]) {
    await page.locator(`[data-public-months="${months}"]`).click();
    assert.equal(await page.locator(`[data-public-plan="${id}"] .plan-price`).innerText(),money(Math.round(seats*unit*months*factor),lang));
   }
  }
  assert.ok(!/2 months free|2 meses gratis|2 mois offerts|USD/.test(await page.locator('body').innerText()));
 }
 // Check the authenticated subscription route uses the same quantities and totals.
 const credentials=JSON.parse(await readFile(process.env.QA_ACCESS_PATH || '.local/demo-access.json','utf8'));
 const c=credentials.find(c=>c.role==='admin') || credentials.find(c=>c.role==='platform_admin' || c.role==='manager');
 await page.goto(base+'/login');await page.locator('#email').fill(c.email);await page.locator('#password').fill(c.password);await page.locator('#auth-form button').click();await page.locator('nav').waitFor();
 await page.locator('nav [data-view="subscription"]').click();await page.locator('[data-billing-plan="solo-2"]').waitFor();
 await page.locator('[data-seats="team-5"]').fill('7');await page.locator('[data-seats="team-5"]').press('Tab');
 await page.locator('[data-months="6"]').click();
 const lang=await page.locator('html').getAttribute('lang');
 assert.equal(await page.locator('[data-billing-plan="team-5"] .plan-price').innerText(),money(1550115,lang));
 await mkdir('.local/screenshots',{recursive:true});await page.screenshot({path:'.local/screenshots/servicehub-volume-pricing.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('Pricing browser QA passed: all volume boundaries, four periods, exact discounts, ES/EN/FR, subscription quantities and mobile layout.');
}finally{await browser.close();}
