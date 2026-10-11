import {describe,it,expect} from 'vitest';
import {discoverPageLinks} from '../../scripts/sources/discovery-links.mjs';
import {mergeResearchCandidates} from '../../scripts/research-ledger.mjs';

const vinted={id:'vinted-pl',domains:['vinted.pl']};
const ebay={id:'ebay-de',domains:['ebay.de']};
const m={model:'Sony MDR-SA5000',aliases:['MDR-SA5000','SA5000']};
const s=(url,label)=>'<a href="'+url+'"><span>'+label+'</span></a>';

describe('discovery of actual item links',()=>{
  it('accepts an item URL with numeric ID when its OWN anchor identifies the model',()=>{
    const page='<main>'+s('/items/123456789-sluchawki','Sony MDR-SA5000 uzywane')+
       s('/catalog?search_text=sony','Sony MDR-SA5000')+
       s('/items/999999999-random','Other model')+
       s('https://evil.example/items/123456789','Sony MDR-SA5000')+'</main>';
    expect(discoverPageLinks(page,'https://www.vinted.pl/catalog?search_text=Sony',vinted,m)).toEqual(
      ['https://www.vinted.pl/items/123456789-sluchawki']);
  });
  it('discovers eBay item IDs through own labels without arbitrary nearby page text',()=>{
    const page='<h1>Sony MDR-SA5000 results</h1>'+
      s('/itm/227123456789','Sony MDR-SA5000 working')+
      s('/itm/227111111111','Other headphones')+
      s('/sch/i.html?_nkw=Sony','Sony MDR-SA5000');
    expect(discoverPageLinks(page,'https://www.ebay.de/sch/i.html?_nkw=Sony',ebay,m)).toEqual(
      ['https://www.ebay.de/itm/227123456789']);
  });
  it('dedupes, limits and ignores known inventory',()=>{
    const p=[0,1,2,3,4].map(i=>s('/itm/22712345678'+i,'Sony MDR-SA5000')).join('');
    expect(discoverPageLinks(p,'https://www.ebay.de/sch/',ebay,m,new Set(),3)).toHaveLength(3);
    expect(discoverPageLinks(p,'https://www.ebay.de/sch/',ebay,m,new Set(['https://www.ebay.de/itm/227123456780']),6)).toHaveLength(4);
  });
});

describe('durable non-buyable research register',()=>{
  const prev={model:'Sony MDR-SA5000',url:'https://www.vinted.pl/items/123456789-old',
    discoveredAt:'2026-10-09T12:00:00Z',price:1200,currency:'EUR',verificationState:'DIRECT_OFFER_VERIFIED'};
  it('retains prior URLs but marks them RECHECK_REQUIRED and preserves PLN units',()=>{
    const rows=mergeResearchCandidates([prev],[],'2026-10-11T16:00:00Z');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({pricePln:1200,researchFreshness:'RECHECK_REQUIRED',retained:true});
    expect(rows[0]).not.toHaveProperty('price');
  });
  it('does not carry forward price evidence from the broken pre-V2 HiFiShark parser',()=>{
    const old={model:'Beyerdynamic DT 880',sourceId:'hifishark',
      verificationState:'AGGREGATOR_PRICE_ONLY',askingPriceText:'€ 4',
      pricePln:17.2,region:'UE',url:'https://www.hifishark.com/goto/old',
      discoveredAt:'2026-10-11T20:00:00Z'};
    expect(mergeResearchCandidates([old],[],'2026-10-12T00:00:00Z')).toEqual([]);
    const revised={...old,url:'https://www.hifishark.com/goto/v2',
      priceEvidenceVersion:'HIFISHARK_CARD_PRICE_V2',askingPriceText:'90 €',pricePln:387};
    expect(mergeResearchCandidates([old],[revised],'2026-10-12T00:00:00Z'))
      .toMatchObject([{askingPriceText:'90 €',priceEvidenceVersion:'HIFISHARK_CARD_PRICE_V2'}]);
  });
  it('refreshes last seen evidence without duplicating and drops expired candidates',()=>{
    const now='2026-10-11T16:00:00Z';
    const fresh={...prev,discoveredAt:now,status:'UNVERIFIED LEAD'};
    const rows=mergeResearchCandidates([prev], [fresh], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({lastSeenAt:now,researchFreshness:'SCAN_OBSERVED',retained:false});
    expect(mergeResearchCandidates([prev],[],'2026-11-11T16:00:00Z')).toHaveLength(0);
  });
});
