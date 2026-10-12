import {createHash} from 'node:crypto';
import {canonicalUrl,fingerprint,redTeam} from './market-core.mjs';

/**
 * Converts an independently, THIS-RUN rechecked research candidate into a
 * board offer. A prior stored DIRECT_OFFER_VERIFIED flag or an indexed price
 * alone can NEVER promote. Called only after fresh seller HTTP200, matching
 * item URL/title, explicit condition, in-stock and price basis gates.
 */
export function promoteRecheckedResearch(candidate,model,source,existingOffers,now){
  if(!candidate||!model||!source?.canVerifyOffer||source.id!==candidate.sourceId)
    return {reason:'MISSING_SOURCE_MODEL'};
  const checked=Date.parse(now),at=Date.parse(candidate.verifiedAt||'');
  if(!Number.isFinite(checked)||!Number.isFinite(at)||at!==checked)
    return {reason:'NOT_VERIFIED_IN_THIS_RUN'};
  if(candidate.verificationState!=='DIRECT_OFFER_VERIFIED'||candidate.http!==200||
     candidate.availability!=='InStock'||candidate.priceBasis!=='SELLER_PAGE_PRICE')
    return {reason:'NO_FRESH_FIXED_SELLER_EVIDENCE'};
  if(!['NEW','USED','B-STOCK','OPEN-BOX'].includes(candidate.condition)||
     !Number.isFinite(candidate.pricePln)||candidate.pricePln<=0||
     !Number.isFinite(candidate.originalPrice)||candidate.originalPrice<=0||
     !['EUR','PLN','GBP','USD'].includes(candidate.currency))
    return {reason:'PRICE_CONDITION_UNRESOLVED'};
  if(!['Polska','UE'].includes(candidate.region)||
     !candidate.locationEvidence||!candidate.country)
    return {reason:'FRESH_GEO_NOT_VERIFIED'};
  if(typeof candidate.url!=='string'||!candidate.url.startsWith('https://'))
    return {reason:'INVALID_ITEM_URL'};
  const url=canonicalUrl(candidate.url);
  if((existingOffers||[]).some(x=>canonicalUrl(x.url||'')===url))
    return {reason:'ALREADY_ON_BOARD'};
  const peer=(existingOffers||[]).find(x=>x.model===candidate.model&&
    x.condition===candidate.condition&&Number.isFinite(x.sameMarket));
  const marker=fingerprint({model:candidate.model,condition:candidate.condition,
    seller:candidate.source,url:candidate.url});
  const offer={
    id:'refresh-'+createHash('sha1').update(marker).digest('hex').slice(0,16),
    model:candidate.model,category:model.category,quality:model.quality,fit:model.fit,
    condition:candidate.condition,rrp:peer?.rrp??null,
    newMarket:peer?.newMarket??null,sameMarket:peer?.sameMarket??null,
    price:candidate.pricePln,country:candidate.country,seller:candidate.source,
    region:candidate.region,
    status:candidate.condition==='USED'?'LIVE USED':'LIVE VERIFIED',
    original:candidate.originalPrice+' '+candidate.currency,url:candidate.url,
    role:'OFFER',checked:now.slice(0,10),
    priceBasis:candidate.priceBasis,shippingToPoland:candidate.shippingToPoland||'PL_SHIPPING_UNKNOWN',
    shippingRate:candidate.shippingRate??null,shippingCurrency:candidate.shippingCurrency??null,
    shippingRatePln:candidate.shippingRatePln??null,itemPlusShippingPln:candidate.itemPlusShippingPln??null,
    shippingSource:candidate.shippingSource??null,fxSource:candidate.fxSource||null,
    fxEffectiveDate:candidate.fxEffectiveDate||null,
    refresh:{verificationState:'DIRECT_OFFER_VERIFIED',http:200,
      checkedAt:now,firstVerifiedAt:now,lastVerifiedAt:now}
  };
  const gate=redTeam(offer,source,peer);
  if(gate.block)return {reason:'RED_TEAM_BLOCKED',flags:gate.flags};
  offer.note='Fresh direct seller recheck: exact item, model, current fixed asking price, condition and stock verified. Item price excludes unknown delivery and fees; shipping to Poland not guaranteed.';
  return {addition:offer,flags:gate.flags};
}
