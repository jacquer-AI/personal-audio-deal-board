import {describe,it,expect} from 'vitest';
import {applyAdditionRecheck,sameSellerItemUrl} from '../../scripts/addition-rechecks.mjs';
import {mergeOverlay,fingerprint} from '../../scripts/market-core.mjs';

const at='2026-10-12T12:00:00Z';
const offer={
 id:'refresh-sample',model:'Beyerdynamic DT 880',category:'Open',quality:'A',fit:5,
 condition:'USED',rrp:null,newMarket:null,sameMarket:null,price:360,
 country:'Włochy',seller:'Subito',region:'UE',status:'LIVE USED',
 original:'80 EUR',url:'https://www.subito.it/audio-video/dt-880-123456.htm',
 role:'OFFER',checked:'2026-10-12',note:'Previous direct seller verification',
 refresh:{verificationState:'DIRECT_OFFER_VERIFIED',http:200,
   checkedAt:'2026-10-12T10:00:00Z',firstVerifiedAt:'2026-10-11T07:00:00Z'}
};
const change=(a,check)=>applyAdditionRecheck(a,check,at);
describe('P0: reverified discovered offers fail closed and can recover safely',()=>{
 it('blocks previous LIVE immediately after blocked HTTP 403 without renewing last verified timestamp',()=>{
   const o=change(offer,{verificationState:'ACCESS_RESTRICTED_REVERIFY',http:403});
   expect(o).toMatchObject({status:'STALE / REVERIFY',price:360});
   expect(o.refresh).toMatchObject({
     verificationState:'ACCESS_RESTRICTED_REVERIFY',lastVerifiedAt:offer.refresh.checkedAt,
     checkedAt:offer.refresh.checkedAt,lastAttemptAt:at,firstVerifiedAt:offer.refresh.firstVerifiedAt
   });
   const board=mergeOverlay({offers:[]},{status:'COMPLETED',updates:[],additions:[o]});
   expect(board.offers[0].status).not.toMatch(/^LIVE/);
 });
 it('blocks ambiguous model, variant, bid, price, currency, stock and redirect checks',()=>{
   for(const reason of ['MODEL_NOT_CONFIRMED','SELLER_REDIRECT_CHANGED_ITEM',
     'FIXED_PRICE_NOT_CONFIRMED','CONDITION_NOT_CONFIRMED','AVAILABILITY_NOT_CONFIRMED',
     'CURRENCY_UNRESOLVED','PAGE_REACHABLE_PRICE_UNPARSED','DEAD']){
     const o=change(offer,{verificationState:reason,http:200,price:1});
     expect(o.status).toBe('STALE / REVERIFY');
     expect(o.price).toBe(360);
     expect(o.refresh.verificationState).toBe(reason);
   }
 });
 it('preserves seller-proven no-shipping state on a stale offer, never as LIVE',()=>{
   const o=change(offer,{verificationState:'PL_SHIPPING_EXCLUDED',http:200,
     note:'Seller explicitly excludes all shipping. Price retained for research.'});
   expect(o.status).toBe('STALE / REVERIFY');
   expect(o).toMatchObject({shippingToPoland:'PL_EXPLICITLY_EXCLUDED',
     shippingRate:null,shippingSource:'SELLER_DESCRIPTION'});
   expect(o.note).toContain('Seller explicitly excludes all shipping');
   expect(o.refresh.verificationState).toBe('PL_SHIPPING_EXCLUDED');
   const board=mergeOverlay({offers:[]},{status:'COMPLETED',updates:[],additions:[o]});
   expect(board.offers[0].status).not.toMatch(/^LIVE/);
   expect(board.offers[0].shippingToPoland).toBe('PL_EXPLICITLY_EXCLUDED');
 });
 it('a timeout does not renew verified evidence or preserve LIVE authority',()=>{
   const o=change(offer,null);
   expect(o.status).toBe('STALE / REVERIFY');
   expect(o.refresh.verificationState).toBe('RECHECK_TIMEOUT');
   expect(o.refresh.checkedAt).toBe(offer.refresh.checkedAt);
 });
 it('fresh full seller proof restores stale offer with current price and one fingerprint',()=>{
   const stale=change(offer,{verificationState:'ACCESS_RESTRICTED_REVERIFY',http:403});
   const o=change(stale,{verificationState:'DIRECT_OFFER_VERIFIED',http:200,
     price:340,original:'77 EUR',status:'LIVE USED',checked:'2026-10-12'});
   expect(o).toMatchObject({status:'LIVE USED',price:340,original:'77 EUR'});
   expect(o.refresh.lastVerifiedAt).toBe(at);
   const result=mergeOverlay({offers:[]},{status:'COMPLETED',updates:[],additions:[o,o]});
   expect(result.offers).toHaveLength(1);
   expect(result.offers[0].status).toBe('LIVE USED');
   expect(fingerprint(result.offers[0])).toBe(fingerprint(offer));
 });
 it('known sold item becomes historical and never ranks LIVE',()=>{
   const o=change(offer,{verificationState:'DIRECT_OFFER_VERIFIED',http:200,
     status:'HISTORICAL',checked:'2026-10-12'});
   expect(o).toMatchObject({status:'HISTORICAL',role:'HISTORICAL'});
 });
 it('a purported verified result without valid price or LIVE status does not revive a listing',()=>{
   for(const response of [
     {verificationState:'DIRECT_OFFER_VERIFIED',http:200,price:null,status:'LIVE USED'},
     {verificationState:'DIRECT_OFFER_VERIFIED',http:200,price:250,status:'LEAD ONLY'}
   ])expect(change(offer,response).status).toBe('STALE / REVERIFY');
 });
});
describe('same exact seller item URL prevents replaced redirect identity',()=>{
 it('accepts same item and harmless query fragment changes, not product redirects',()=>{
   const original='https://www.subito.it/audio-video/dt-880-123456.htm?ref=abc';
   expect(sameSellerItemUrl(original,'https://www.subito.it/audio-video/dt-880-123456.htm#detail')).toBe(true);
   expect(sameSellerItemUrl(original,'https://www.subito.it/audio-video/other-999.htm')).toBe(false);
   expect(sameSellerItemUrl(original,'https://www.subito.it/search?q=dt880')).toBe(false);
   expect(sameSellerItemUrl(original,'http://www.subito.it/audio-video/dt-880-123456.htm')).toBe(false);
   expect(sameSellerItemUrl(original,'https://subito.it/audio-video/dt-880-123456.htm')).toBe(false);
   expect(sameSellerItemUrl(original,'not-a-url')).toBe(false);
 });
});
