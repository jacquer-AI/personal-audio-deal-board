import type {Offer} from '../types';

/** Strict Europe-only user view. A marketplace domain alone is not proof that a
 * specific third-party merchant ships from Europe (especially eBay).
 * Historic entries without known geographic provenance stay out of the results. */
const outside=/(?:japonia|japan|china|chiny|hong kong|taiwan|kazakhstan|brazil|brasil|usa|united states|singapore|canada|australia|korea)/i;
const unknown=/(?:nie podano|nieustalon|unknown|europe_unconfirmed)/i;
export function europeanOffer(o:Offer):boolean {
  if(outside.test(o.country))return false;
  if(unknown.test(o.country))return false;
  if(o.region==='Polska'||o.region==='UE')return true;
  return /(?:uk|united kingdom|norway|norwegia|switzerland|szwajcaria|wielka brytania|islandia|iceland)/i.test(o.country);
}
export function europeanResearch(c:{region?:string;country?:string;sourceId?:string;locationEvidence?:string}):boolean {
  if(c.sourceId==='hifishark'&&!c.locationEvidence)return false;
  if(!c.region||c.region==='EUROPE_UNCONFIRMED')return false;
  if(c.country&&(outside.test(c.country)||unknown.test(c.country)))return false;
  // A directly reached HiFiShark seller needs explicit geographic provenance.
  if(c.locationEvidence)return true;
  // First-party local European marketplaces are regional discovery scopes.
  return c.region==='Polska'||c.region==='UE'||c.region==='non-EU / TLC';
}
