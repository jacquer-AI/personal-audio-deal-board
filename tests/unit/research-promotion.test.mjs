import {describe,it,expect} from 'vitest';
import {promoteRecheckedResearch} from '../../scripts/research-promotion.mjs';
import {mergeOverlay} from '../../scripts/market-core.mjs';
const now='2026-10-12T11:00:00.000Z';
const model={model:'Beyerdynamic DT 1990 PRO',category:'Open',quality:'A+',fit:5};
const source={id:'marktplaats-nl',canVerifyOffer:true,region:'UE'};
const lead={
 model:model.model,category:model.category,sourceId:'marktplaats-nl',
 source:'Marktplaats',region:'UE',country:'Holandia',locationEvidence:'SELLER_LOCATION',
 url:'https://www.marktplaats.nl/v/audio-tv-en-foto/koptelefoons/m2448250086-beyerdynamic-dt-1990-pro',
 status:'VERIFIED LEAD',verificationState:'DIRECT_OFFER_VERIFIED',http:200,
 condition:'B-STOCK',pricePln:1050.60,originalPrice:240,currency:'EUR',
 availability:'InStock',priceBasis:'SELLER_PAGE_PRICE',verifiedAt:now,
 shippingToPoland:'PL_SHIPPING_UNKNOWN',
 shippingRate:null,shippingCurrency:null,shippingRatePln:null,
 itemPlusShippingPln:null,shippingSource:null,
 fxSource:'NBP_TABLE_A',fxEffectiveDate:'2026-10-12'
};
const promote=(item=lead,previous=[])=>promoteRecheckedResearch(item,model,source,previous,now);
describe('research rechecks promote only current direct fixed seller proof',()=>{
 it('converts fresh fixed EUR page into one LIVE offer without fake market benchmarks',()=>{
  const res=promote();
  expect(res.addition).toMatchObject({
   model:model.model,condition:'B-STOCK',price:1050.60,original:'240 EUR',
   seller:'Marktplaats',country:'Holandia',region:'UE',
   newMarket:null,sameMarket:null,rrp:null,status:'LIVE VERIFIED',
   priceBasis:'SELLER_PAGE_PRICE',shippingToPoland:'PL_SHIPPING_UNKNOWN',
   refresh:{verificationState:'DIRECT_OFFER_VERIFIED',http:200,
     checkedAt:now,firstVerifiedAt:now,lastVerifiedAt:now}
  });
  expect(res.flags).toContain('PRICE_EXCLUDES_SHIPPING_AND_FEES');
  expect(mergeOverlay({offers:[]},{status:'COMPLETED',additions:[res.addition]}).offers).toHaveLength(1);
 });
 it('does not treat retained research or older verify timestamps as current',()=>{
  for(const c of [
   {...lead,verifiedAt:'2026-10-11T11:00:00.000Z'},
   {...lead,verifiedAt:null},
   {...lead,verificationState:'RECHECK_HTTP_403'},
   {...lead,http:403},
   {...lead,availability:'UNCONFIRMED'},
   {...lead,priceBasis:'METADATA_MAY_BE_BID'},
  ])expect(promote(c).addition).toBeUndefined();
 });
 it('rejects wrong or missing item condition, currency, geo and invalid price',()=>{
  for(const c of [
   {...lead,condition:'UNKNOWN'}, {...lead,pricePln:null},
   {...lead,originalPrice:null},{...lead,currency:null},
   {...lead,country:null},{...lead,locationEvidence:null},
   {...lead,region:'GLOBAL'}, {...lead,region:'non-EU / TLC'},
   {...lead,url:'http://seller.example/product'},
  ])expect(promote(c).addition).toBeUndefined();
  expect(promoteRecheckedResearch(lead,model,{id:'unrelated',canVerifyOffer:true},[],now).addition).toBeUndefined();
 });
 it('prevents duplicate promotion against canonical seller URLs',()=>{
  const old=[{model:model.model,url:lead.url+'?utm_source=shark'}];
  expect(promote(lead,old).reason).toBe('ALREADY_ON_BOARD');
 });
 it('red-team blocks implausible prices against same-state benchmark',()=>{
  const peer=[{model:model.model,condition:'B-STOCK',sameMarket:4000,rrp:6000,
    url:'https://www.subito.it/audio-video/other-123.htm'}];
  const res=promote(lead,peer);
  expect(res.reason).toBe('RED_TEAM_BLOCKED');
  expect(res.flags).toContain('PRICE_FAR_BELOW_MARKET_CHECK_VARIANT_OR_COUNTERFEIT');
 });
});
