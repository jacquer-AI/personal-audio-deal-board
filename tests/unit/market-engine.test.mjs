import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {fingerprint,mergeOverlay,mergeCurrent,materiallyEqual,noopDelta,dedupeObservations,lastObservations,statsFromLedger,redTeam,verificationFromHttp,directOfferEligible,computeDelta} from '../../scripts/market-core.mjs';
import {parsePage} from '../../scripts/sources/index.mjs';
import {parseOlx} from '../../scripts/sources/olx.mjs';
import {parseEbay} from '../../scripts/sources/ebay.mjs';

const offer={id:'x',model:'Model X',category:'IEM',quality:'A',fit:5,condition:'USED',rrp:1000,newMarket:900,sameMarket:600,price:650,country:'PL',seller:'Seller',region:'Polska',status:'LIVE USED',original:'650 PLN',url:'https://shop.example/item/1',note:'',role:'OFFER',checked:'2026-10-07'};
const retailer={id:'shop',role:['discovery','verification'],canVerifyOffer:true,domains:['shop.example']};
const aggregator={id:'agg',role:['discovery'],canVerifyOffer:false,domains:['agg.example'],aggregator:true};
const ld=(extra='')=>'<script type="application/ld+json">'+JSON.stringify({'@type':'Product',offers:{'@type':'Offer',price:'499.00',priceCurrency:'PLN',availability:'https://schema.org/InStock',itemCondition:'https://schema.org/UsedCondition',...JSON.parse(extra||'{}')}})+'</script>';

describe('direct-page gate',()=>{
  it('HTTP 200 alone is only REACHABLE, never a live verification',()=>{
    expect(verificationFromHttp(200)).toBe('REACHABLE');
    expect(parsePage(retailer,'<html><body>Model X</body></html>',200).parsed).toBeNull();
  });
  it('restricted access is flagged, not parsed',()=>{
    expect(parsePage(retailer,'',403).blocked).toBe(true);
    expect(parsePage(retailer,'<html>Please solve the captcha</html>',200)).toEqual({blocked:true,parsed:null});
    expect(verificationFromHttp(429)).toBe('ACCESS_RESTRICTED_REVERIFY');
  });
  it('aggregators can never verify an offer',()=>{
    expect(directOfferEligible('https://agg.example/p/1',aggregator)).toBe(false);
    expect(directOfferEligible('https://shop.example/p/1',retailer)).toBe(true);
    expect(directOfferEligible('https://other.example/p/1',retailer)).toBe(false);
  });
  it('extracts explicit JSON-LD price, availability, condition',()=>{
    const {parsed}=parsePage(retailer,ld(),200);
    expect(parsed).toMatchObject({price:499,currency:'PLN',via:'JSON_LD'});
  });
  it('marketplace adapters extract price and condition',()=>{
    expect(parseOlx('<html>Stan Używane '+ld('{"itemCondition":""}')+'</html>')).toMatchObject({price:499,itemCondition:'UsedCondition'});
    expect(parseOlx('<script>{"price":{"value":350,"currency":"PLN"}}</script>')).toMatchObject({price:350,via:'OLX_STATE'});
    expect(parseEbay(ld())).toMatchObject({price:499});
    expect(parseEbay('<html>no offer</html>')).toBeNull();
  });
});

describe('observation ledger',()=>{
  const o=(extra={})=>({fingerprint:'fp1',model:'Model X',condition:'USED',url:offer.url,result:'DIRECT_OFFER_VERIFIED',pricePln:650,...extra});
  it('does not re-append an unchanged observation',()=>{
    const last=lastObservations([JSON.stringify(o())]);
    expect(dedupeObservations([o(),o()],last)).toHaveLength(0);
  });
  it('appends materially distinct states once',()=>{
    const last=lastObservations([JSON.stringify(o())]);
    expect(dedupeObservations([o({pricePln:600}),o({pricePln:600}),o({result:'DEAD',pricePln:600})],last)).toHaveLength(2);
    expect(dedupeObservations([o()],new Map())).toHaveLength(1);
  });
  it('tolerates corrupt ledger lines',()=>{
    expect(lastObservations(['not json',JSON.stringify(o())]).size).toBe(1);
  });
});

describe('same-condition market sample',()=>{
  it('never mixes conditions and counts only verified offers',()=>{
    const rows=[1,2,3,4,5].map(i=>({fingerprint:'n'+i,model:'M',condition:'NEW',result:'DIRECT_OFFER_VERIFIED',pricePln:100*i}))
      .concat([{fingerprint:'u1',model:'M',condition:'USED',result:'DIRECT_OFFER_VERIFIED',pricePln:50},{fingerprint:'u2',model:'M',condition:'USED',result:'DEAD',pricePln:10}]);
    const stats=statsFromLedger(lastObservations(rows.map(r=>JSON.stringify(r))));
    expect(stats.find(s=>s.key==='M|NEW')).toMatchObject({n:5,confidence:'ROBUST',median:300});
    expect(stats.find(s=>s.key==='M|USED')).toMatchObject({n:1,confidence:'INSUFFICIENT MARKET SAMPLE',median:null});
  });
});

describe('overlay, delta and no-op',()=>{
  it('category-scoped run keeps overlay of untouched offers',()=>{
    const prev={updates:[{fingerprint:'a',category:'IEM'},{fingerprint:'b',category:'TWS'}],additions:[]};
    const next={updates:[{fingerprint:'b',category:'TWS',price:1}],additions:[]};
    const m=mergeCurrent(prev,next);
    expect(m.updates.map(u=>u.fingerprint).sort()).toEqual(['a','b']);
    expect(m.updates.find(u=>u.fingerprint==='b').price).toBe(1);
  });
  it('identical runs differing only in timestamps are materially equal (DELTA=NONE)',()=>{
    const a={refreshedAt:'1',runId:'1',updates:[{fingerprint:'a',checkedAt:'1',http:200}]};
    const b={refreshedAt:'2',runId:'2',updates:[{fingerprint:'a',checkedAt:'2',http:200}]};
    expect(materiallyEqual(a,b)).toBe(true);
    expect(materiallyEqual(a,{...b,updates:[{fingerprint:'a',checkedAt:'2',http:404}]})).toBe(false);
    expect(noopDelta(computeDelta([offer],[offer]),0)).toBe(true);
  });
  it('verified additions can later be downgraded but never admitted unverified',()=>{
    const add={...offer,id:'add',url:'https://shop.example/item/9',status:'STALE / REVERIFY',refresh:{verificationState:'DEAD',firstVerifiedAt:'t'}};
    const never={...add,id:'never',url:'https://shop.example/item/10',refresh:{verificationState:'DEAD'}};
    const m=mergeOverlay({offers:[offer]},{updates:[],additions:[add,never]});
    expect(m.offers.map(x=>x.id)).toEqual(['x','add']);
  });
  it('DEEP challengers stay in candidates and cannot become offers',()=>{
    const challenger={model:null,url:'https://web.example/x',status:'UNADJUDICATED',deep:true};
    const m=mergeOverlay({offers:[offer]},{updates:[],additions:[challenger],candidates:[challenger]});
    expect(m.offers).toHaveLength(1);
    expect(computeDelta([offer],m.offers).new).toBe(0);
  });
  it('a blocked source never pretends it was freshly verified',()=>{
    const update={fingerprint:fingerprint(offer),verificationState:'ACCESS_RESTRICTED_REVERIFY',http:403,checked:'2026-10-08',checkedAt:'2026-10-08T09:00:00Z'};
    const merged=mergeOverlay({offers:[offer]},{updates:[update],additions:[]}).offers[0];
    expect(merged.checked).toBe('2026-10-07');
    expect(merged.refresh.verificationState).toBe('ACCESS_RESTRICTED_REVERIFY');
    const confirmed=mergeOverlay({offers:[offer]},{updates:[{...update,verificationState:'DIRECT_OFFER_VERIFIED',http:200}],additions:[]}).offers[0];
    expect(confirmed.checked).toBe('2026-10-08');
  });
  it('a discovered lead cannot promote an existing LEAD to live',()=>{
    const lead={...offer,status:'LEAD ONLY',url:'https://shop.example/item/2'};
    const m=mergeOverlay({offers:[lead]},{updates:[{fingerprint:fingerprint(lead),status:'LIVE USED',verificationState:'REACHABLE'}]});
    expect(m.offers[0].status).toBe('LEAD ONLY');
  });
});

describe('red team',()=>{
  it('blocks non-EU and implausibly cheap offers, flags battery risk',()=>{
    expect(redTeam({...offer,condition:'NEW'},{region:'non-EU / TLC'},offer).block).toBe(true);
    expect(redTeam({...offer,price:100},{region:'UE'},offer).block).toBe(true);
    const r=redTeam({...offer,category:'TWS',price:500},{region:'UE'},offer);
    expect(r.block).toBe(false);
    expect(r.flags).toContain('BATTERY_HEALTH_UNVERIFIED');
  });
});

describe('source registry',()=>{
  const doc=JSON.parse(fs.readFileSync('config/source-registry.json','utf8'));
  it('encodes required fields and keeps aggregators lead-only',()=>{
    for(const s of doc.sources){
      expect(s.id&&s.region&&s.role&&s.priority&&s.domains?.length&&s.conditions?.length,s.id).toBeTruthy();
      expect(typeof s.aggregator,s.id).toBe('boolean');
      expect(typeof s.canDiscover,s.id).toBe('boolean');
      if(s.aggregator)expect(s.canVerifyOffer,s.id).toBe(false);
    }
    expect(doc.sources.filter(s=>['ceneo-pl','hifishark','geizhals','idealo-de'].includes(s.id)).every(s=>s.aggregator)).toBe(true);
  });
});

describe('availability evidence',()=>{
  it('boilerplate "niedostępny" text does not mark an in-stock microdata page sold',async()=>{
    const {available}=await import('../../scripts/sources/common.mjs');
    expect(available({availability:''},'<link href="http://schema.org/InStock"/> <span>Niedostępny w wybranym rozmiarze</span>')).toBe(true);
    expect(available({availability:''},'<p>Niedostępny</p>')).toBeNull();
    expect(available({availability:''},'<p>Ogłoszenie nieaktywne</p>')).toBe(false);
    expect(available({availability:'https://schema.org/OutOfStock'},'')).toBe(false);
  });
});

describe('sold offers',()=>{
  it('a sold direct page becomes HISTORICAL with the HISTORICAL role (passes data validation)',()=>{
    const m=mergeOverlay({offers:[offer]},{updates:[{fingerprint:fingerprint(offer),status:'HISTORICAL',verificationState:'DIRECT_OFFER_VERIFIED'}]});
    expect(m.offers[0]).toMatchObject({status:'HISTORICAL',role:'HISTORICAL'});
  });
});

describe('discovery link hygiene',()=>{
  it('rejects assets and site stubs, keeps concrete item paths',async()=>{
    const {isPlausibleOfferLink}=await import('../../scripts/sources/common.mjs');
    expect(isPlausibleOfferLink('https://www.kleinanzeigen.de/favicon.svg')).toBe(false);
    expect(isPlausibleOfferLink('https://www.olx.pl/')).toBe(false);
    expect(isPlausibleOfferLink('https://www.olx.pl/d/oferta/sluchawki-pi8-CID99-ID1.html')).toBe(true);
  });
});

describe('discovery rejects navigation and search URLs',()=>{
  it.each([
    ['kleinanzeigen-de','https://www.kleinanzeigen.de/manifest.webmanifest'],
    ['kleinanzeigen-de','https://www.kleinanzeigen.de/s-sony-ier-m9-gebraucht/k0'],
    ['marktplaats-nl','https://www.marktplaats.nl/i/help/over-marktplaats/voorwaarden-en-privacybeleid/algemene-gebruiksvoorwaarden.dot.html'],
    ['marktplaats-nl','https://www.marktplaats.nl/m/veiligheidscentrum/'],
    ['subito-it','https://www.subito.it/annunci-italia/vendita/usato/?q=sony+ier-m9'],
    ['subito-it','https://areariservata.subito.it/transazioni/lista'],
    ['amazon-de-resale','https://www.amazon.de/gp/help/customer/display.html']
  ])('%s rejects non-offer %s',async(id,url)=>{
    const {isPlausibleOfferLink}=await import('../../scripts/sources/common.mjs');
    expect(isPlausibleOfferLink(url,{id})).toBe(false);
  });
  it.each([
    ['kleinanzeigen-de','https://www.kleinanzeigen.de/s-anzeige/sony-ier-m9-in-ovp/1234567890-172-1'],
    ['marktplaats-nl','https://www.marktplaats.nl/v/audio-tv-en-foto/koptelefoons-en-headsets/m2255512345-sony-ier-m9'],
    ['subito-it','https://www.subito.it/audio-video/sony-ier-m9-milano-123456789.htm'],
    ['olx-pl','https://www.olx.pl/d/oferta/sony-ier-m9-CID99-ID123.html'],
    ['allegro-pl','https://allegro.pl/oferta/sony-ier-m9-1234567890'],
    ['ebay-de','https://www.ebay.de/itm/227532985491'],
    ['amazon-de-resale','https://www.amazon.de/dp/B0ABC12345']
  ])('%s preserves concrete offer %s',async(id,url)=>{
    const {isPlausibleOfferLink}=await import('../../scripts/sources/common.mjs');
    expect(isPlausibleOfferLink(url,{id})).toBe(true);
  });
});
describe('overlay determinism',()=>{
  it('order of re-checked offers does not change the overlay',()=>{
    const prev={updates:[{fingerprint:'a',http:1},{fingerprint:'b',http:1}],additions:[]};
    const one=mergeCurrent(prev,{updates:[{fingerprint:'a',http:1}],additions:[]});
    const two=mergeCurrent(prev,{updates:[{fingerprint:'b',http:1},{fingerprint:'a',http:1}],additions:[]});
    expect(materiallyEqual(one,two)).toBe(true);
  });
});
