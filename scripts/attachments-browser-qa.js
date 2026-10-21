import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {pool} from '../server/db.js';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:3100';
const credentials=JSON.parse(await readFile(process.env.QA_ACCESS_PATH || '.local/demo-access.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
let ticketId;
try {
 const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/login');const c=credentials.find(c=>c.role==='client');
 await page.locator('#email').fill(c.email);await page.locator('#password').fill(c.password);
 await page.getByRole('button',{name:'Entrar a mi espacio'}).click();await page.locator('nav').waitFor();console.log('Signed in');
 await page.getByRole('button',{name:'+ Nueva solicitud'}).click();
 await page.locator('#title').fill('QA attachments');await page.locator('#description').fill('PDF and Excel attachment verification');
 await page.locator('#ticket-files').setInputFiles({name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});
 await page.getByRole('button',{name:'Registrar solicitud'}).click();
 await page.locator('[data-download-attachment]').waitFor();console.log('PDF created');ticketId=Number((await page.locator('.dialog .eyebrow').innerText()).match(/SH-(\d+)/)[1]);
 const workbook=new ExcelJS.Workbook();workbook.addWorksheet('Evidence').addRow(['value',42]);
 await page.locator('#ticket-files').setInputFiles({name:'report.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await workbook.xlsx.writeBuffer())});
 await page.getByRole('button',{name:'Adjuntar archivos',exact:true}).click();await page.getByRole('button',{name:'↓ report.xlsx',exact:true}).waitFor();
 console.log('Excel uploaded');await page.reload();await page.locator('nav [data-view="tickets"]').click();await page.getByRole('button',{name:'QA attachments',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'↓ report.xlsx',exact:true}).click();
 const download=await downloadPromise;assert.equal(download.suggestedFilename(),'report.xlsx');assert.equal(await download.failure(),null);
 assert.equal(await page.locator('[data-download-attachment]').count(),2);
 await page.setViewportSize({width:390,height:844});await mkdir('.local/screenshots',{recursive:true});await page.screenshot({path:'.local/screenshots/attachments-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Browser QA passed: PDF on creation, Excel upload, persistence after reload, authenticated download and mobile layout.');
}catch(err){console.error(err);throw err;}finally{
 await browser.close();if(ticketId && base.includes('127.0.0.1')) {await pool.query('DELETE FROM events WHERE ticket_id=$1',[ticketId]);await pool.query('DELETE FROM tickets WHERE id=$1',[ticketId]);}await pool.end();
}
