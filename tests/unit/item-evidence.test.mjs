import {describe,it,expect} from 'vitest';
import {itemTitleMatchesModel,itemTitleEvidence,priceBasis} from '../../scripts/sources/item-evidence.mjs';
const dt={model:'Beyerdynamic DT 880',aliases:['DT880','DT 880 Pro']};
const dunu={model:'DUNU SA6 MkII',aliases:['SA6 MkII','Studio SA6 MK2']};

describe('item-specific seller evidence',()=>{
  it('confirms an actual item from title or OpenGraph metadata',()=>{
    expect(itemTitleMatchesModel('<title>Beyerdynamic dt 880 pro - Subito</title>',dt)).toBe(true);
    expect(itemTitleMatchesModel('<meta content="DUNU Studio SA6 MK2 In-ear Hoofdtelefoon" property="og:title">',dunu)).toBe(true);
    expect(itemTitleMatchesModel('<meta property="og:title" content="Beyerdynamic DT 880 PRO">',dt)).toBe(true);
  });
  it('ignores sidebar recommendations and generic page body',()=>{
    const misleading='<title>Generic headphones for sale</title><aside>Beyerdynamic DT 880 pro</aside>';
    expect(itemTitleMatchesModel(misleading,dt)).toBe(false);
    expect(itemTitleEvidence(misleading)).toEqual(['Generic headphones for sale']);
  });
  it('accepts Product JSON-LD name and rejects other embedded objects',()=>{
    const ld=obj=>'<script type="application/ld+json">'+JSON.stringify(obj)+'</script>';
    expect(itemTitleMatchesModel(ld({'@type':'Product',name:'DUNU Studio SA6 MK2',offers:{price:200}}),dunu)).toBe(true);
    expect(itemTitleMatchesModel(ld({'@type':'Organization',name:'Beyerdynamic DT 880'}),dt)).toBe(false);
  });
  it('does not mistake a Marktplaats bid/metadata value for a buy-now price',()=>{
    expect(priceBasis({id:'marktplaats-nl'})).toBe('METADATA_MAY_BE_BID');
    expect(priceBasis({id:'subito-it'})).toBe('SELLER_PAGE_PRICE');
  });
});
