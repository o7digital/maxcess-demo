import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {periodQuote,withSeats,activationFor} from '../public/pricing.js';
import {pool} from '../server/db.js';
after(()=>pool.end());
test('Flat agent pricing preserves discounts, charges monthly activation and waives prepaid activation',async()=>{
 const plans=(await pool.query("SELECT * FROM billing_plans WHERE active AND currency='usd' ORDER BY seat_limit")).rows;
 assert.equal(plans.length,1);const base=plans[0];assert.equal(base.unit_cents,1399);
 for(const seats of [1,2,3,10,11,20,21,50,100]){
  const plan=withSeats(base,seats);assert.equal(plan.monthly_cents,seats*1399);
  for(const [months,factor] of [[1,1],[3,.925],[6,.875],[12,10/12]]){
   const q=periodQuote(plan,months);assert.equal(q.users_period_cents,Math.round(seats*1399*months*factor));
   assert.equal(q.activation_cents,months===1?9900:0);
   if(months===12){assert.equal(q.users_period_cents,plan.monthly_cents*10);assert.equal(q.savings_cents,plan.monthly_cents*2);}
  }
 }
 const p=withSeats(base,1);assert.equal(periodQuote(p,1).users_period_cents+9900,11299);
 assert.equal(periodQuote(p,3).users_period_cents,3882);assert.equal(periodQuote(p,6).users_period_cents,7345);assert.equal(periodQuote(p,12).users_period_cents,13990);
 assert.equal(activationFor(1,true),0);assert.equal(activationFor(3,false,'activation_usd_v1'),14900);
 for(const seats of [0,10001,1.5,'2'])assert.throws(()=>withSeats(base,seats));
 assert.throws(()=>periodQuote({...p,currency:'mxn'},1));assert.throws(()=>periodQuote(p,2));
});
