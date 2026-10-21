import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pool} from '../server/db.js';
after(()=>pool.end());
test('Twelve-day migration aligns standard unpaid trials without restarting or replacing other deadlines',async()=>{
 const db=await pool.connect();
 try {
  await db.query('BEGIN');
  const ids=[];
  for(const [name,status,days,subscription] of [
   ['standard','trialing',7,null],['manual','trialing',20,null],
   ['paid','active',7,'sub_trial_migration_test'],['suspended','suspended',7,null],
   ['expired','trialing',7,null],
  ]) {
   const {rows:[row]}=await db.query("INSERT INTO tenants(name,status,created_at,trial_ends_at,stripe_subscription_id) VALUES($1,$2,now()-($5*interval '1 day'),now()+(($3-$5)*interval '1 day'),$4) RETURNING id,trial_ends_at",[name,status,days,subscription,name==='expired'?20:2]);
   ids.push({...row,name});
  }
  await db.query(await readFile(new URL('../migrations/015_twelve_day_trial.sql',import.meta.url),'utf8'));
  for(const initial of ids) {
   const {rows:[row]}=await db.query('SELECT created_at,trial_ends_at FROM tenants WHERE id=$1',[initial.id]);
   if(['standard','expired'].includes(initial.name)) {
    assert.equal(row.trial_ends_at-row.created_at,12*86400000);
    if(initial.name==='expired') assert.ok(row.trial_ends_at<Date.now(),'Old trials must not restart today');
    else assert.ok(row.trial_ends_at<Date.now()+11*86400000,'Existing active trials keep their original start');
   } else assert.equal(+row.trial_ends_at,+initial.trial_ends_at);
  }
 } finally {await db.query('ROLLBACK');db.release();}
});
