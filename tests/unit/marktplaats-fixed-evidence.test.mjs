import {describe,it,expect} from 'vitest';
import {marktplaatsFixedPriceEvidence,priceBasis} from '../../scripts/sources/item-evidence.mjs';
const url='https://www.marktplaats.nl/v/audio-tv-en-foto/koptelefoons/m2448250086-beyerdynamic-dt-1990-pro';
const source={id:'marktplaats-nl'};
const parsed={price:240,currency:'EUR'};
const document=(type='FIXED',id='m2448250086',cents=24000)=>
  '<html><head><title>Beyerdynamic DT 1990 PRO</title></head><body>'+
  '<script>window.pageState={"itemId":"'+id+'","priceInfo":'+
  '{"priceCents":'+cents+',"priceType":"'+type+'"}};</script></body></html>';

describe('Marktplaats exact fixed-price evidence cannot convert bids to LIVE',()=>{
  it('accepts a single main item FIXED EUR price exactly matching seller page cents',()=>{
    const html=document();
    expect(marktplaatsFixedPriceEvidence(html,url,parsed)).toBe(true);
    expect(priceBasis(source,html,url,parsed)).toBe('SELLER_PAGE_PRICE');
  });
  it('rejects bid types even if a numerical asking price is displayed',()=>{
    for(const type of ['BID','MIN_BID','FAST_BID','ASKING','NEGOTIABLE','SEE_DESCRIPTION','FREE','bidding']){
      const html=document(type);
      expect(marktplaatsFixedPriceEvidence(html,url,parsed)).toBe(false);
      expect(priceBasis(source,html,url,parsed)).toBe('METADATA_MAY_BE_BID');
    }
  });
  it('rejects recommendation price, wrong item id, multiple ids and conflicting price models',()=>{
    const mismatched=document('FIXED','m9999999999');
    const different=document().replace('m2448250086','m9876543210');
    const extra=document()+'<script>{"itemId":"m5555555555"}</script>';
    const twoPrices=document()+'<script>{"priceInfo":{"priceCents":19000,"priceType":"BID"}}</script>';
    for(const html of [mismatched,different,extra,twoPrices])
      expect(priceBasis(source,html,url,parsed)).toBe('METADATA_MAY_BE_BID');
  });
  it('rejects unbound, missing or inconsistent amount and unknown currency',()=>{
    for(const html of [
      document('FIXED','m2448250086',24001),
      document('FIXED','m2448250086',1),
      document().replace('"priceCents":24000,',''),
      document().replace('"itemId":"m2448250086",',''),
      document().replace('"priceCents":24000,"priceType":"FIXED"','"priceType":"FIXED","priceCents":24000'),
      document().replace('"itemId":"m2448250086",','"itemId":"m2448250086","nested":{"k":1},')
    ])expect(priceBasis(source,html,url,parsed)).toBe('METADATA_MAY_BE_BID');
    for(const input of [{price:240,currency:'PLN'},{price:241,currency:'EUR'},{price:NaN,currency:'EUR'},null])
      expect(priceBasis(source,document(),url,input)).toBe('METADATA_MAY_BE_BID');
  });
  it('cannot use a generic search page or Marktplaats ID of another item',()=>{
    expect(priceBasis(source,document(),'https://www.marktplaats.nl/q/beyerdynamic/',parsed)).toBe('METADATA_MAY_BE_BID');
    expect(priceBasis(source,document(),'https://www.marktplaats.nl/v/other/m1234567890-other',parsed)).toBe('METADATA_MAY_BE_BID');
    expect(priceBasis(source)).toBe('METADATA_MAY_BE_BID');
    expect(priceBasis({id:'subito-it'})).toBe('SELLER_PAGE_PRICE');
  });
});
