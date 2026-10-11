import {describe,it,expect} from 'vitest';
import {discoverPageLinks,accessoryOnlyEvidence} from '../../scripts/sources/discovery-links.mjs';
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
  it('refreshes last seen evidence without duplicating and drops expired candidates',()=>{
    const now='2026-10-11T16:00:00Z';
    const fresh={...prev,discoveredAt:now,status:'UNVERIFIED LEAD'};
    const rows=mergeResearchCandidates([prev], [fresh], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({lastSeenAt:now,researchFreshness:'SCAN_OBSERVED',retained:false});
    expect(mergeResearchCandidates([prev],[],'2026-11-11T16:00:00Z')).toHaveLength(0);
  });
});

describe('do not confuse accessories with full model units',()=>{
  const bose={model:'Bose SoundLink Max'};
  const vinted={id:'vinted-pl',domains:['vinted.pl']};
  it('excludes real accessory-only wall mount from Vinted results',()=>{
    const raw='/items/9225180440-metalowy-uchwyt-scienny-dedykowany-do-glosnika-przenosnego-bose-soundlink-max';
    const page='<a href="'+raw+'">Metalowy uchwyt ścienny dedykowany do głośnika Bose SoundLink Max</a>'+
      '<a href="/items/10297193213-bose-soundlink-max">Głośnik Bose SoundLink Max</a>';
    expect(discoverPageLinks(page,'https://www.vinted.pl/catalog?search_text=bose',vinted,bose))
      .toEqual(['https://www.vinted.pl/items/10297193213-bose-soundlink-max']);
  });
  it('keeps real headphones sold with a case and excludes case-only ads',()=>{
    expect(accessoryOnlyEvidence('https://www.vinted.pl/items/9687038424-hifiman-arya-stealth-and-case-fiio-k7-like-new')).toBe(false);
    expect(accessoryOnlyEvidence('https://www.vinted.pl/items/15567890-case-for-hifiman-arya-stealth')).toBe(true);
    expect(accessoryOnlyEvidence('https://www.vinted.pl/items/11112222-right-earbud-only-bowers-wilkins-pi8')).toBe(true);
  });
  it('prunes accessory ads from retained and newly discovered candidate records',()=>{
    const today='2026-10-11T19:00:00Z';
    const ad={model:'Bose SoundLink Max',url:'https://www.vinted.pl/items/9225180440-metalowy-uchwyt-scienny-dedykowany-do-glosnika-przenosnego-bose-soundlink-max',discoveredAt:today};
    const good={model:'Bose SoundLink Max',url:'https://www.vinted.pl/items/10297193213-bose-soundlink-max',discoveredAt:today};
    const rows=mergeResearchCandidates([ad,good],[ad,good],today);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(good.url);
  });
});
