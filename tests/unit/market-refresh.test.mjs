import {describe,it,expect} from 'vitest';
import {fingerprint,marketStats,mergeOverlay,safeStatus,computeDelta} from '../../scripts/market-core.mjs';

const baseOffer={id:'x',model:'Model X',category:'IEM',quality:'A',fit:5,condition:'USED',rrp:1000,newMarket:900,sameMarket:600,price:650,country:'PL',seller:'Seller',region:'Polska',status:'LIVE USED',original:'650 PLN',url:'https://example.com/item/1',note:'',role:'OFFER',checked:'2026-10-07'};
const lead={...baseOffer,id:'lead',status:'LEAD ONLY',url:'https://example.com/item/2'};

describe('refresh market core',()=>{
  it('uses robust/provisional/insufficient sample thresholds',()=>{
    expect(marketStats([{pricePln:1},{pricePln:2}]).confidence).toBe('INSUFFICIENT MARKET SAMPLE');
    expect(marketStats([{pricePln:1},{pricePln:2},{pricePln:9}])).toMatchObject({confidence:'PROVISIONAL',median:2});
    expect(marketStats([1,2,3,4,5].map(pricePln=>({pricePln})))).toMatchObject({confidence:'ROBUST',median:3});
  });
  it('never promotes a lead without prior live authority',()=>{
    expect(safeStatus(lead,{status:'LIVE USED',verificationState:'DIRECT_OFFER_VERIFIED'})).toBe('LEAD ONLY');
  });
  it('marks dead direct links stale',()=>{
    expect(safeStatus(baseOffer,{verificationState:'DEAD'})).toBe('STALE / REVERIFY');
  });
  it('merges only directly verified price changes',()=>{
    const fp=fingerprint(baseOffer);
    const a=mergeOverlay({offers:[baseOffer]},{status:'COMPLETED',updates:[{fingerprint:fp,price:500,status:'LIVE USED',verificationState:'PAGE_REACHABLE_PRICE_UNPARSED'}]});
    expect(a.offers[0].price).toBe(650);
    const b=mergeOverlay({offers:[baseOffer]},{status:'COMPLETED',updates:[{fingerprint:fp,price:500,status:'LIVE USED',verificationState:'DIRECT_OFFER_VERIFIED'}]});
    expect(b.offers[0].price).toBe(500);
  });
  it('accepts verified additions but rejects unverified additions',()=>{
    const good={...baseOffer,id:'good',url:'https://example.com/item/3',price:500,refresh:{verificationState:'DIRECT_OFFER_VERIFIED'}};
    const bad={...baseOffer,id:'bad',url:'https://example.com/item/4',price:450,refresh:{verificationState:'REACHABLE'}};
    const m=mergeOverlay({offers:[baseOffer]},{status:'COMPLETED',updates:[],additions:[good,bad]});
    expect(m.offers.some(x=>x.id==='good')).toBe(true);
    expect(m.offers.some(x=>x.id==='bad')).toBe(false);
  });
  it('computes new price sold and stale delta',()=>{
    const before=[baseOffer,{...baseOffer,id:'y',url:'https://example.com/item/5',status:'LIVE USED'}];
    const after=[{...baseOffer,price:600},{...before[1],status:'STALE / REVERIFY'},{...baseOffer,id:'z',url:'https://example.com/item/6'}];
    expect(computeDelta(before,after)).toMatchObject({new:1,priceChanged:1,stale:1});
  });
});
