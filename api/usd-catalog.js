import {publishedOffer} from '../server/offer-gateway.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).json({error:'Method not allowed'});return res.status(200).json(await publishedOffer());}
