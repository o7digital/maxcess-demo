import {ACTIVATION_CENTS,CURRENCY,PERIOD_DISCOUNTS} from '../public/pricing.js';
export const BACKEND='https://service-hub-dev-3fbf.up.railway.app';
export const approvedUsdOffer=()=>({currency:CURRENCY,activation_cents:ACTIVATION_CENTS,trial_days:12,checkout_available:false,plans:[
 ['solo-2','1–2 usuarios',2,1,2,2900,40],['team-5','3–10 usuarios',5,3,10,2400,100],['team-15','11–20 usuarios',15,11,20,1900,300],['business-30','21+ usuarios',30,21,10000,1200,600]
].map(([id,name,seat_limit,min_seats,max_seats,unit_cents,ai_limit])=>({id,name,seat_limit,min_seats,max_seats,unit_cents,ai_limit,monthly_cents:seat_limit*unit_cents,currency:CURRENCY,discounts:PERIOD_DISCOUNTS,active:true,version:5}))});
export async function backendOffer(transport=fetch){const response=await transport(BACKEND+'/api/plans',{signal:AbortSignal.timeout(7000),cache:'no-store'});if(!response.ok)throw Error('Pricing service unavailable');return response.json();}
export async function publishedOffer(transport=fetch){try{const offer=await backendOffer(transport);if(offer.currency===CURRENCY&&offer.plans?.every(p=>p.currency===CURRENCY))return offer;}catch{}return approvedUsdOffer();}
