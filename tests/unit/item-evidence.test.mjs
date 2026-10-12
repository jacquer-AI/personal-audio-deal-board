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
  it('rejects distinct subvariants even when their family names match',()=>{
    const svanar={model:'HIFIMAN Svanar Wireless',aliases:['Svanar Wireless']};
    const focal={model:'Focal Clear MG',aliases:['Clear Mg']};
    const monarch={model:'Thieaudio Monarch MkII',aliases:['Monarch MK2','Monarch II']};
    expect(itemTitleMatchesModel('<title>HIFIMAN Svanar Wireless Jr</title>',svanar)).toBe(false);
    expect(itemTitleMatchesModel('<title>HIFIMAN Svanar Wireless LE</title>',svanar)).toBe(false);
    expect(itemTitleMatchesModel('<title>HIFIMAN Svanar Wireless</title>',svanar)).toBe(true);
    expect(itemTitleMatchesModel('<title>Focal Clear MG Professional</title>',focal)).toBe(false);
    expect(itemTitleMatchesModel('<title>Focal Clear MG</title>',focal)).toBe(true);
    expect(itemTitleMatchesModel('<title>Thieaudio Monarch III</title>',monarch)).toBe(false);
    expect(itemTitleMatchesModel('<title>Thieaudio Monarch II</title>',monarch)).toBe(true);
    const dt1990={model:'Beyerdynamic DT 1990 PRO',aliases:['DT1990 Pro','DT 1990']};
    const er4s={model:'Etymotic ER4S',aliases:['ER-4S','ER4 S']};
    expect(itemTitleMatchesModel('<title>Beyerdynamic DT 1990 PRO MKII</title>',dt1990)).toBe(false);
    expect(itemTitleMatchesModel('<title>Beyerdynamic DT 1990 PRO</title>',dt1990)).toBe(true);
    expect(itemTitleMatchesModel('<title>Etymotic ER4SR</title>',er4s)).toBe(false);
    expect(itemTitleMatchesModel('<title>Etymotic ER4S</title>',er4s)).toBe(true);
    const dt48={model:'Beyerdynamic DT 48 25 Ohm',aliases:['DT48 25 Ohm','DT 48 E 25','DT48E 25','DT 48 25 ohm']};
    expect(itemTitleMatchesModel('<title>Beyerdynamic DT 48 E 25 Ohm used</title>',dt48)).toBe(true);
    expect(itemTitleMatchesModel('<title>Beyerdynamic DT48 25 Ohm classic</title>',dt48)).toBe(true);
    expect(itemTitleMatchesModel('<title>Beyerdynamic DT48 E 200 Ohm</title>',dt48)).toBe(false);
    expect(itemTitleMatchesModel('<title>Beyerdynamic DT48 250 Ohm</title>',dt48)).toBe(false);
    const timeless={model:'7Hz Timeless',aliases:['7Hertz Timeless']};
    expect(itemTitleMatchesModel('<title>7Hertz Timeless original planar IEM</title>',timeless)).toBe(true);
    expect(itemTitleMatchesModel('<title>Linsoul 7Hertz Timeless AE DAC</title>',timeless)).toBe(false);
    expect(itemTitleMatchesModel('<meta property="og:title" content="7Hz Timeless Anniversary Edition">',timeless)).toBe(false);
    expect(itemTitleMatchesModel('<title>7Hz Timeless AE</title><script type="application/ld+json">{"@type":"Product","name":"7Hz Timeless"}</script>',timeless)).toBe(false);
    const m1={model:'Sony MDR-M1',aliases:['Sony MDR M1','MDR-M1']};
    expect(itemTitleMatchesModel('<title>Sony MDR-M1 monitor headphones</title>',m1)).toBe(true);
    expect(itemTitleMatchesModel('<title>Sony MDR-M1ST vintage</title>',m1)).toBe(false);
  });
  it('does not mistake a Marktplaats bid/metadata value for a buy-now price',()=>{
    expect(priceBasis({id:'marktplaats-nl'})).toBe('METADATA_MAY_BE_BID');
    expect(priceBasis({id:'subito-it'})).toBe('SELLER_PAGE_PRICE');
  });
  it('never promotes HD 800 S as original HD 800 even if JSON-LD is generic',()=>{
    const original={model:'Sennheiser HD 800',aliases:['HD800','HD 800']};
    const wrong='<title>Sennheiser HD 800 S headphones</title>'+
      '<script type="application/ld+json">{"@type":"Product","name":"Sennheiser HD 800"}</script>';
    expect(itemTitleMatchesModel(wrong,original)).toBe(false);
    expect(itemTitleMatchesModel('<title>Sennheiser HD800S used</title>',original)).toBe(false);
    expect(itemTitleMatchesModel('<title>Sennheiser HD 800 original headphones</title>',original)).toBe(true);
  });

});
