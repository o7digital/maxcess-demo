import {BACKEND,backendOffer} from '../server/offer-gateway.js';
import {CURRENCY} from '../public/pricing.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const action=req.query?.action;
 if(req.method!=='POST'||!['checkout','change-plan'].includes(action))return res.status(405).json({error:'Method not allowed'});
 try{
  const offer=await backendOffer();
  if(offer.currency!==CURRENCY||!offer.plans?.every(p=>p.currency===CURRENCY))return res.status(503).json({error:'USD payments are not available yet. No payment has been started.'});
  const response=await fetch(BACKEND+'/api/billing/'+action,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',Cookie:req.headers.cookie||'','X-CSRF-Token':req.headers['x-csrf-token']||'',...(req.headers['x-client-portal']?{'X-Client-Portal':req.headers['x-client-portal']}:{})},body:JSON.stringify(req.body)});
  return res.status(response.status).json(await response.json());
 }catch{return res.status(503).json({error:'Payment service temporarily unavailable. No payment confirmation has been received.'});}
}
