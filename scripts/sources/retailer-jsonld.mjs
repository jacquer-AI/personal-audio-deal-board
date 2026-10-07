import {jsonLdBlocks,walk,toNumber} from './common.mjs';

/** Strict schema.org Offer/AggregateOffer extraction; returns null when no explicit price. */
export function parseJsonLdOffer(html){
  let found=null;
  for(const block of jsonLdBlocks(html)){
    walk(block,obj=>{
      if(found)return;
      const type=Array.isArray(obj['@type'])?obj['@type'].join(' '):String(obj['@type']||'');
      if(/Offer|AggregateOffer/i.test(type)||obj.price||obj.lowPrice){
        const price=toNumber(obj.price??obj.lowPrice);
        if(price)found={price,currency:String(obj.priceCurrency||'').toUpperCase(),availability:String(obj.availability||''),itemCondition:String(obj.itemCondition||''),via:'JSON_LD'};
      }
    });
  }
  return found;
}

export default {id:'retailer-jsonld',parse:parseJsonLdOffer};
