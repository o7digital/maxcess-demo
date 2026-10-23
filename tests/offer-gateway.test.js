import {test} from 'node:test';import assert from 'node:assert/strict';
import {approvedUsdOffer,publishedOffer} from '../server/offer-gateway.js';
import handler from '../api/billing-transition.js';
test('Published USD catalogue uses approved prices while old or unavailable backend cannot supply USD',async()=>{
 for(const transport of [async()=>({ok:true,json:async()=>({currency:'mxn',plans:[]})}),async()=>{throw Error('outage');}]){const offer=await publishedOffer(transport);assert.equal(offer.currency,'usd');assert.equal(offer.activation_cents,9900);assert.equal(offer.checkout_available,false);assert.deepEqual(offer.plans.map(p=>p.unit_cents),[1399]);}
 const live={...approvedUsdOffer(),checkout_available:true};assert.deepEqual(await publishedOffer(async()=>({ok:true,json:async()=>live})),live);
});
test('Vercel checkout gate blocks all payment writes while backend catalogue is MXN',async()=>{
 const old=global.fetch;let calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>({currency:'mxn',plans:[]})};};
 try{let status,body;const response={setHeader(){},status(s){status=s;return this;},json(b){body=b;return this;}};await handler({method:'POST',query:{action:'checkout'},headers:{},body:{accepted_terms:true}},response);assert.equal(status,503);assert.equal(calls,1);assert.ok(body.error.includes('USD'));}finally{global.fetch=old;}
});
