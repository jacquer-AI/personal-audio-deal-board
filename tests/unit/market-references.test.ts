import {describe,it,expect} from 'vitest';
import {priceReferences} from '../../src/lib/marketReferences';
import market from '../../data/market-stats.json';
import retail from '../../data/retail-price-references.json';
import {b4b, discount} from '../../src/lib/board';
import type {Offer} from '../../src/types';

const base = {model:'Beyerdynamic DT 880',condition:'USED',sameMarket:null,newMarket:null} as const;
const at = Date.parse('2026-10-12T07:00:00+02:00');

describe('price reference evidence', () => {
  it('shows observed used median and indexed new price without inventing confirmed benchmark', () => {
    const result=priceReferences(base,market,retail as never,at);
    const observed=market.stats.find(x=>x.key==='Beyerdynamic DT 880|USED')!;
    expect(result.same).toMatchObject({
      value:observed.n>=3?observed.median:observed.min,
      basis:'VERIFIED_SELLER_SAMPLE'
    });
    expect(result.same.explanation).toContain(
      observed.n>=3?'mediana '+observed.n+' cen':observed.n===1?'1 odczytana':'od '+observed.n+' odczytanych'
    );
    expect(result.newest).toMatchObject({value:retail.references.find(x=>x.model==='Beyerdynamic DT 880')!.pricePln,basis:'RETAIL_INDEX'});
    expect(result.newest.url).toMatch(/^https:\/\//);
  });
  it('handles growing samples and weak one-observation evidence without assuming historical counts', () => {
    const k702Sample=market.stats.find(x=>x.key==='AKG K702|USED')!;
    const k702=priceReferences({...base,model:'AKG K702'},market,retail as never,at);
    expect(k702.same).toMatchObject({
      value:k702Sample.n>=3?k702Sample.median:k702Sample.min,
      basis:'VERIFIED_SELLER_SAMPLE'
    });
    const xsSample=market.stats.find(x=>x.key==='HIFIMAN Edition XS|USED')!;
    const xs=priceReferences({...base,model:'HIFIMAN Edition XS'},market,retail as never,at);
    expect(xs.newest.value).toBe(retail.references.find(x=>x.model==='HIFIMAN Edition XS')!.pricePln);
    expect(xs.same.value).toBe(xsSample.n>=3?xsSample.median:xsSample.min);
    const single=priceReferences({...base,model:'Synthetic single'},{
      refreshedAt:market.refreshedAt,
      stats:[{key:'Synthetic single|USED',n:1,confidence:'INSUFFICIENT MARKET SAMPLE',
        median:null,min:531.25,max:531.25}]
    },{references:[]},at);
    expect(single.same).toMatchObject({value:531.25,basis:'VERIFIED_SELLER_SAMPLE'});
    expect(single.same.explanation).toContain('1 odczytana');
  });
  it('does not label aging indexed information as fresh, and never uses it for B4B', () => {
    const later=priceReferences(base,market,retail as never,Date.parse('2026-11-20T00:00:00Z'));
    expect(later.newest.stale).toBe(true);
    const o={...base,price:328.31,quality:'A',
      id:'x',category:'Open',fit:null,rrp:null,country:'UE',seller:'Subito',region:'UE',
      status:'LIVE USED',original:'',url:'https://www.subito.it/p/1',note:'',role:'OFFER',checked:'2026-10-12',
      refresh:{verificationState:'DIRECT_OFFER_VERIFIED',http:200,checkedAt:new Date().toISOString()}
    } as Offer;
    expect(b4b(o)).toBeNull();
    expect(discount(o)).toBeNull();
    expect(o.newMarket).toBeNull();
    expect(o.sameMarket).toBeNull();
  });
  it('does not interpolate unrelated model names or a price when sources are absent', () => {
    const missing=priceReferences({...base,model:'Beyerdynamic DT 48 25 Ohm'},market,retail as never,at);
    expect(missing.same.value).toBeNull();
    expect(missing.newest.value).toBeNull();
  });
  it('keeps explicit sheet benchmark as the first-class comparison', () => {
    const result=priceReferences({...base,sameMarket:400,newMarket:750},market,retail as never,at);
    expect(result.same).toMatchObject({value:400,basis:'SHEET_BENCHMARK'});
    expect(result.newest).toMatchObject({value:750,basis:'SHEET_BENCHMARK'});
  });
});
