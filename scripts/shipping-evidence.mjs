import {jsonLdBlocks,toNumber,walk} from './sources/common.mjs';

const list=value=>Array.isArray(value)?value:[value];
function eligiblePoland(dest){
  if(!dest)return false;
  for(const item of list(dest)){
    if(!item)continue;
    if(typeof item==='string'&&/^PL$/i.test(item.trim()))return true;
    if(typeof item==='object'){
      // Only exact country codes; generic EU or postal-code-limited zones
      // cannot substantiate shipping to the user's actual Polish address.
      if(item.postalCode||item.postalCodePrefix||item.postalCodeRange)return false;
      if(list(item.addressCountry).some(c=>(typeof c==='string'?c:c?.name||'').toUpperCase()==='PL'))return true;
    }
  }
  return false;
}
function money(rate){
  if(rate&&typeof rate==='object'){
    if(rate.shippingRate)return money(rate.shippingRate);
    const value=rate.value??rate.maxValue;
    const currency=String(rate.currency||'').toUpperCase();
    const amount=value===0||value==='0'||value==='0.00'?0:toNumber(value);
    if(amount!==null&&Number.isFinite(amount)&&amount>=0&&/^(PLN|EUR|GBP|USD)$/.test(currency)
        &&rate.minValue==null &&rate.maxValue==null)return {amount,currency};
  }
  return null;
}

/** Item-specific seller description, not recommendation cards or general FAQ. */
function sellerRejectsAllShipping(html){
  const descriptions=[];
  for(const m of String(html||'').matchAll(/<meta\b[^>]{0,1800}>/gi)){
    const tag=m[0];
    const kind=tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if(!['description','og:description','twitter:description'].includes(kind))continue;
    const value=tag.match(/\bcontent\s*=\s*["']([^"']{1,1400})["']/i)?.[1];
    if(value)descriptions.push(value);
  }
  return descriptions.some(s=>
    /non si effettuano spedizioni|non spedisco|non effettuo spedizioni|solo ritiro a mano|solo ritiro in zona|kein versand|nur abholung|pickup only|collection only|no shipping available|no shipping offered|bez wysyłki|bez wysylki|tylko odbiór osobisty|tylko odbior osobisty/i.test(s));
}

/** Structured seller-declared shipping to Poland, not guessed shipping or a
 * platform-wide promise. Does not prove checkout, payment fees or customs. */
export function shippingEvidencePoland(html,selectedPrice=null){
  if(sellerRejectsAllShipping(html))return {status:'PL_EXPLICITLY_EXCLUDED',amount:null,currency:null,source:'SELLER_DESCRIPTION'};
  const options=[];
  let explicitlyExcluded=false;
  for(const block of jsonLdBlocks(html)){
    walk(block,obj=>{
      if(obj===null||typeof obj!=='object')return;
      const type=String(obj['@type']||'');
      if(!/Offer$/i.test(type)||/AggregateOffer/i.test(type))return;
      // Do not apply shipping from some other advertised price/offer.
      if(selectedPrice!==null&&obj.price!=null&&toNumber(obj.price)!==selectedPrice)return;
      for(const detail of list(obj.shippingDetails).filter(Boolean)){
        if(!eligiblePoland(detail.shippingDestination))continue;
        if(detail.doesNotShip===true||detail.doesNotShip==='true'){explicitlyExcluded=true;continue;}
        const rate=money(detail.shippingRate);
        if(rate)options.push(rate);
      }
    });
  }
  if(explicitlyExcluded)return {status:'PL_EXPLICITLY_EXCLUDED',amount:null,currency:null,source:'JSON_LD_OFFER'};
  if(!options.length)return {status:'PL_SHIPPING_UNKNOWN',amount:null,currency:null,source:null};
  // A lower option is a minimum seller-advertised shipping rate, not an
  // all-fees-inclusive customer checkout total.
  options.sort((a,b)=>a.amount-b.amount);
  return {status:'PL_RATE_ADVERTISED',...options[0],source:'JSON_LD_OFFER',optionCount:options.length};
}
