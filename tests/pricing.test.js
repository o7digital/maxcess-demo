import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {periodQuote,withSeats} from '../public/pricing.js';
import {pool} from '../server/db.js';
after(()=>pool.end());
test('Volume pricing applies the correct whole-team rate at every tier boundary and exact period discounts',async()=>{
 const plans=(await pool.query("SELECT * FROM billing_plans WHERE active AND currency='usd' ORDER BY seat_limit")).rows;
 assert.equal(plans.length,4);
 for(const [seats,unit] of [[1,2900],[2,2900],[3,2400],[10,2400],[11,1900],[20,1900],[21,1200],[50,1200],[100,1200]]) {
  const base=plans.find(p=>seats>=p.min_seats && seats<=p.max_seats);
  const plan=withSeats(base,seats);assert.equal(plan.monthly_cents,seats*unit);
  for(const [months,factor] of [[1,1],[3,.925],[6,.875],[12,10/12]]) {
   const q=periodQuote(plan,months);
   assert.equal(q.users_period_cents,Math.round(seats*unit*months*factor));
   assert.equal(q.activation_cents,14900);assert.equal(q.free_months,months===12?2:0);
   if(months===12){assert.equal(q.users_period_cents,plan.monthly_cents*10);assert.equal(q.savings_cents,plan.monthly_cents*2);}
  }
 }
 const p=withSeats(plans[0],1);
 assert.equal(periodQuote(p,1).users_period_cents+14900,17800);
 assert.equal(periodQuote(p,3).users_period_cents,8048);
 assert.equal(periodQuote(p,6).users_period_cents,15225);
 assert.equal(periodQuote(p,12).users_period_cents,29000);
 assert.equal(periodQuote({...p,monthly_cents:9999,discounts:{12:16.67}},12).users_period_cents,99990);
 for(const seats of [0,3,1.5,'2']) assert.throws(()=>withSeats(plans[0],seats));
 assert.throws(()=>periodQuote({...p,currency:'mxn'},1));assert.throws(()=>periodQuote(p,2));
});
