import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {periodQuote,withSeats,activationFor} from '../public/pricing.js';
import {pool} from '../server/db.js';
after(()=>pool.end());
test('Flat agent pricing preserves discounts, charges monthly activation and waives prepaid activation',async()=>{
 const plans=(await pool.query("SELECT * FROM billing_plans WHERE active AND currency='usd' ORDER BY seat_limit")).rows;
 assert.equal(plans.length,1);const base=plans[0];assert.equal(base.unit_cents,1800);
 for(const seats of [1,2,3,10,11,20,21,50,100]){
  const plan=withSeats(base,seats);assert.equal(plan.monthly_cents,seats*1800);
  for(const [months,factor] of [[1,1],[3,.925],[6,.875],[12,10/12]]){
   const q=periodQuote(plan,months);assert.equal(q.users_period_cents,Math.round(seats*1800*months*factor));
   assert.equal(q.activation_cents,({1:14900,3:9900,6:4900,12:0})[months]);
   if(months===12){assert.equal(q.users_period_cents,plan.monthly_cents*10);assert.equal(q.savings_cents,plan.monthly_cents*2);}
  }
 }
 const p=withSeats(base,1);assert.equal(periodQuote(p,1).users_period_cents+14900,16700);
 assert.equal(periodQuote(p,3).users_period_cents,4995);assert.equal(periodQuote(p,6).users_period_cents,9450);assert.equal(periodQuote(p,12).users_period_cents,18000);
 assert.equal(activationFor(1,true),0);assert.equal(activationFor(3,false,'activation_usd_v1'),14900);
 for(const seats of [0,10001,1.5,'2'])assert.throws(()=>withSeats(base,seats));
 assert.throws(()=>periodQuote({...p,currency:'mxn'},1));assert.throws(()=>periodQuote(p,2));
});
