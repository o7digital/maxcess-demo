import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {parseAttachments} from '../server/attachments.js';
import {pool} from '../server/db.js';
import {after} from 'node:test';
after(()=>pool.end());
test('Attachments enforce formats, file counts and total decoded size', async()=>{
 const f=(name,data)=>({name,file:Buffer.from(data).toString('base64')});
 const workbook=new ExcelJS.Workbook();workbook.addWorksheet('Data').addRow(['value',42]);
 assert.equal(parseAttachments([f('report.xlsx',await workbook.xlsx.writeBuffer())])[0].type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 for(const files of [[f('run.exe','text')],[f('fake.pdf','text')],[f('empty.txt','')],Array(6).fill(f('a.txt','a')),[f('big.txt',Buffer.alloc(2097153,65))],[f('a.txt',Buffer.alloc(1100000,65)),f('b.txt',Buffer.alloc(1100000,65))]]) assert.throws(()=>parseAttachments(files));
 assert.equal(parseAttachments([f('../../notes.txt','hello')])[0].name,'.._.._notes.txt');
});
