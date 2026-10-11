import {describe,it,expect} from 'vitest';
import {shippingEvidencePoland} from '../../scripts/shipping-evidence.mjs';
import {validatedNbpTable} from '../../scripts/refresh-fx.mjs';
const page=offer=>'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Product',name:'Example IEM',offers:offer})+'</script>';
const offer=(shippingDetails,price='150')=>({'@type':'Offer',price,priceCurrency:'EUR',availability:'https://schema.org/InStock',shippingDetails});
const detail=(country,amount,currency='EUR')=>({'@type':'OfferShippingDetails',shippingDestination:{'@type':'DefinedRegion',addressCountry:country},
  shippingRate:{'@type':'MonetaryAmount',value:amount,currency}});
describe('seller shipping evidence to Poland',()=>{
  it('reads explicit PL shipping rate and clearly labels it advertised only',()=>{
    expect(shippingEvidencePoland(page(offer(detail('PL',15))),150)).toMatchObject({status:'PL_RATE_ADVERTISED',amount:15,currency:'EUR',source:'JSON_LD_OFFER'});
  });
  it('does not infer Poland shipping from EU, NL or missing destinations',()=>{
    expect(shippingEvidencePoland(page(offer(detail('DE',0))),150).status).toBe('PL_SHIPPING_UNKNOWN');
    expect(shippingEvidencePoland(page(offer(detail('EU',0))),150).status).toBe('PL_SHIPPING_UNKNOWN');
    expect(shippingEvidencePoland(page(offer({'@type':'OfferShippingDetails',shippingRate:{value:0,currency:'EUR'}})),150).status).toBe('PL_SHIPPING_UNKNOWN');
  });
  it('does not accept a price from a different offer in a multi-offer Product',()=>{
    const html=page([offer(detail('PL',15),'150'),offer(detail('PL',0),'999')]);
    expect(shippingEvidencePoland(html,150)).toMatchObject({amount:15,currency:'EUR'});
  });
  it('supports genuinely free shipping, but not unknown shipping',()=>{
    expect(shippingEvidencePoland(page(offer(detail('PL',0))),150)).toMatchObject({status:'PL_RATE_ADVERTISED',amount:0});
    expect(shippingEvidencePoland(page(offer([])),150).status).toBe('PL_SHIPPING_UNKNOWN');
  });
  it('recognizes explicit refusal and no-rate cases fail closed',()=>{
    const x={...detail('PL',10),doesNotShip:true};
    expect(shippingEvidencePoland(page(offer(x)),150).status).toBe('PL_EXPLICITLY_EXCLUDED');
    expect(shippingEvidencePoland(page(offer({...detail('PL',10),shippingRate:{value:10}})),150).status).toBe('PL_SHIPPING_UNKNOWN');
    expect(shippingEvidencePoland(page(offer({...detail('PL',10),shippingDestination:{addressCountry:'PL',postalCode:'00-001'}})),150).status).toBe('PL_SHIPPING_UNKNOWN');
  });
  it('does not promote one price option with min/max variable values',()=>{
    expect(shippingEvidencePoland(page(offer({...detail('PL',10),shippingRate:{minValue:10,maxValue:55,currency:'EUR'}})),150).status).toBe('PL_SHIPPING_UNKNOWN');
  });
});
describe('official NBP FX evidence',()=>{
  it('accepts a recent Table A with three exact currency codes',()=>{
    const d=new Date(Date.now()-86400000).toISOString().slice(0,10);
    const j=[{table:'A',no:'200/A/NBP/2026',effectiveDate:d,rates:[{code:'EUR',mid:4.4},{code:'GBP',mid:5.3},{code:'USD',mid:3.8}]}];
    expect(validatedNbpTable(j)).toMatchObject({effectiveDate:d,rates:{EUR:4.4,GBP:5.3,USD:3.8}});
  });
  it('rejects old, partial, invented, impossible and future rate tables',()=>{
    const make=(d,rates)=>[{table:'A',no:'1/A/NBP',effectiveDate:d,rates}];
    const rates=[{code:'EUR',mid:4.4},{code:'GBP',mid:5.3},{code:'USD',mid:3.8}];
    expect(()=>validatedNbpTable(make('2024-01-01',rates))).toThrow();
    expect(()=>validatedNbpTable(make(new Date().toISOString().slice(0,10),rates.slice(0,2)))).toThrow();
    expect(()=>validatedNbpTable(make(new Date(Date.now()+2*86400000).toISOString().slice(0,10),rates))).toThrow();
    expect(()=>validatedNbpTable(make(new Date().toISOString().slice(0,10),[{code:'EUR',mid:-1},...rates.slice(1)]))).toThrow();
  });
});
