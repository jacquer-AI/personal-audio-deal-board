import {describe,it,expect} from 'vitest';
import {mergeResearchCandidates,selectResearchForDisplay} from '../../scripts/research-ledger.mjs';
const now='2026-10-12T11:00:00Z';
const rec=(model,n,verificationState='AGGREGATOR_PRICE_ONLY',priceBasis='AGGREGATOR_INDEXED_ASK')=>({
 model,url:'https://example.org/'+encodeURIComponent(model)+'/'+n,
 lastSeenAt:now,verifiedAt:now,discoveredAt:now,
 verificationState,priceBasis,pricePln:100+n
});
describe('research evidence retention under heavy aggregator traffic',()=>{
 it('500-row cap does not evict directly verified seller records due to aggregator flood',()=>{
   const raw=[
     ...Array.from({length:1000},(_,i)=>rec('A',i)),
     rec('ZZZ Rare',3000,'DIRECT_OFFER_VERIFIED','SELLER_PAGE_PRICE'),
     rec('YYY Bid',3001,'DIRECT_OFFER_VERIFIED','METADATA_MAY_BE_BID'),
     rec('XXX Seller',3002,'DIRECT_PAGE_PRICE_ONLY','SELLER_PAGE_PRICE')
   ];
   const selected=selectResearchForDisplay(raw,500);
   expect(selected).toHaveLength(500);
   expect(selected[0].model).toBe('ZZZ Rare');
   expect(selected[1].model).toBe('YYY Bid');
   expect(selected[2].model).toBe('XXX Seller');
   expect(selected.filter(x=>x.verificationState==='AGGREGATOR_PRICE_ONLY')).toHaveLength(497);
 });
 it('balances equal-age aggregator results across different tracked model families',()=>{
   const raw=[...Array.from({length:70},(_,i)=>rec('A',i)),
     ...Array.from({length:20},(_,i)=>rec('B',i)),
     ...Array.from({length:10},(_,i)=>rec('C',i))];
   const queue=selectResearchForDisplay(raw,15);
   expect(queue).toHaveLength(15);
   expect(new Set(queue.map(x=>x.model))).toEqual(new Set(['A','B','C']));
   expect(queue.map(x=>x.model).slice(0,6)).toEqual(['A','B','C','A','B','C']);
 });
 it('current LIVE seller evidence stays ahead of stale research leads',()=>{
   const raw=[rec('A',1,'SELLER_PAGE_NOT_SUPPORTED'),
     rec('B',2,'DIRECT_OFFER_VERIFIED','SELLER_PAGE_PRICE'),
     rec('C',3,'DIRECT_OFFER_VERIFIED','METADATA_MAY_BE_BID')];
   const result=selectResearchForDisplay(raw,2);
   expect(result.map(x=>x.model)).toEqual(['B','C']);
 });
 it('preserves latest metadata, deduplicates by model/url and expires old history',()=>{
   const old={...rec('A',1),firstSeenAt:'2026-10-01T00:00:00Z',
     lastSeenAt:'2026-10-11T12:00:00Z',retained:true};
   const fresh={...rec('A',1,'DIRECT_PAGE_PRICE_ONLY','SELLER_PAGE_PRICE'),
     verifiedAt:now};
   const oldExpired={...rec('X',0),lastSeenAt:'2026-09-02T00:00:00Z'};
   const merged=mergeResearchCandidates([old,oldExpired],[fresh],now,500);
   expect(merged).toHaveLength(1);
   expect(merged[0]).toMatchObject({model:'A',firstSeenAt:old.firstSeenAt,
     verificationState:'DIRECT_PAGE_PRICE_ONLY',retained:false});
 });
 it('does not revive outdated HiFiShark price-v1 evidence',()=>{
   const old={...rec('Old',0),sourceId:'hifishark',priceEvidenceVersion:'HIFISHARK_CARD_PRICE_V1'};
   const result=mergeResearchCandidates([old],[],now,500);
   expect(result).toEqual([]);
 });
});
