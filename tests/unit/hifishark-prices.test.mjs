import {describe,it,expect} from 'vitest';
import {discoverEuropeanHifisharkRows,europeanMarketplace,aggregatorAskingPrice} from '../../scripts/sources/hifishark-results.mjs';
import {geographicEvidence} from '../../scripts/sources/europe-scope.mjs';

const dt={model:'Beyerdynamic DT 880',aliases:['DT880','DT 880 Pro']};
/** Actual production HiFiShark structure sampled 2026-10-11:
 * a.search-product-row, .website-grid, .search-product-title,
 * .price > strong, .first-seen, and a flag <img alt="country">. */
const card=(site,title,price,id,flag='Italy',date='Sep 27, 2026')=>
 '<a class="d-flex align-items-center search-product-row" href="/goto/'+id+'/abc123" rel="nofollow" target="_blank">'+
 '<div class="website-grid"><img alt="'+flag+'" class="flag flag-it" src="/_.gif"/>'+site+'</div>'+
 '<div class="search-product-info"><span class="search-product-title"><span>'+title+'</span></span>'+
 '<span class="website">'+site+'</span><span class="price"><strong>'+price+'</strong>'+
 '<span class="price-converted" title="Originally listed for €100"><span>25%</span></span></span>'+
 '<span class="first-seen" title="Listed">'+date+'</span></div></a>';

describe('HiFiShark genuine card parsing: indexed asking price is not seller verification',()=>{
 it('reads EUR/PLN per-card prices and the geographic flag, without confusing original discount price',()=>{
  const html='<div id="search-result-body">'+
    card('Subito','Beyerdynamic dt 880 pro','€75','subito','Italy')+
    card('OLX Poland','Beyerdynamic DT880','PLN 299','olx','Poland')+
    card('Kleinanzeigen','Beyerdynamic DT 880 Pro','€80','klein','Germany')+'</div>';
  const rows=discoverEuropeanHifisharkRows(html,dt,8);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({askingPrice:75,currency:'EUR',country:'Włochy',site:'Subito',verificationState:'AGGREGATOR_PRICE_ONLY',locationEvidence:'HIFISHARK_ITEM_COUNTRY_FLAG'});
  expect(rows[1]).toMatchObject({askingPrice:299,currency:'PLN',country:'Polska'});
  expect(rows[2].askingPrice).toBe(80);
  expect(rows[0].aggregatorListedDate).toBe('Sep 27, 2026');
 });
 it('retains item price if a nested marker closes before the strong asking-price tag',()=>{
  const html=card('Subito','Beyerdynamic DT880',
    '<span class="hidden-marker">something</span><strong>€75</strong>',
    'nested','Italy').replace('<strong><span class="hidden-marker">something</span><strong>€75</strong></strong>',
      '<span class="hidden-marker">something</span><strong>€75</strong>');
  expect(discoverEuropeanHifisharkRows(html,dt)).toMatchObject([{askingPrice:75,currency:'EUR'}]);
 });
 it('reads visible asking price when vendor HTML has no strong wrapper, not the original discount-price attribute',()=>{
  const html=card('Subito','Beyerdynamic DT880','€75','no-strong','Italy')
    .replace('<strong>€75</strong>','<span>€75</span>');
  expect(discoverEuropeanHifisharkRows(html,dt)).toMatchObject([{askingPrice:75,currency:'EUR'}]);
 });
 it('accepts Spain even for an unfamiliar local marketplace when the flag proves European location',()=>{
  const rows=discoverEuropeanHifisharkRows(card('Como Ficho','Beyerdynamic DT 880','€50','spain','Spain'),dt);
  expect(rows).toMatchObject([{country:'Hiszpania',askingPrice:50}]);
 });
 it('excludes outside-Europe flags even if the marketplace name looks local',()=>{
  const html=card('OLX Brazil','Beyerdynamic DT 880 Pro','R$1,200','brazil','Brazil')+
    card('OLX Kazakhstan','Beyerdynamic DT 880 Pro','KZT 60000','kaz','Kazakhstan')+
    card('Subito','Beyerdynamic DT880','€45','wrong-flag','Japan')+
    card('Head-fi','Beyerdynamic DT 880 Pro','$100','usa','United States')+
    card('Subito','Beyerdynamic DT 880 Pro','€75','valid','Italy');
  expect(discoverEuropeanHifisharkRows(html,dt).map(x=>x.askingPrice)).toEqual([75]);
 });
 it('rejects unrelated row titles and never reads another card price or MSRP',()=>{
  const html=card('Subito','Other headphones','€5','other')+
    card('Subito','Beyerdynamic DT880','-','none')+
    card('Subito','Beyerdynamic DT880','€80','valid')+
    card('Subito','Beyerdynamic DT880','€90','valid');
  expect(discoverEuropeanHifisharkRows(html,dt)).toMatchObject([{askingPrice:80}]);
 });
 it('does not mistake eBay DE for an established seller location',()=>{
  expect(geographicEvidence({id:'ebay-de',region:'UE'},'<title>sale</title>')).toBeNull();
  expect(geographicEvidence({id:'subito-it'},'')).toMatchObject({country:'Włochy'});
  expect(geographicEvidence({id:'subito-it'},'<script>{"addressCountry":"JP"}</script>')).toBeNull();
  expect(europeanMarketplace('OLX Kazakhstan')).toBeNull();
 });
 it('keeps native currency for unsupported conversions rather than inventing PLN',()=>{
  expect(aggregatorAskingPrice('NOK 1,000')).toMatchObject({originalPrice:1000,currency:'NOK'});
  expect(aggregatorAskingPrice('HUF 45,000')).toMatchObject({originalPrice:45000,currency:'HUF'});
  expect(aggregatorAskingPrice('€75')).toMatchObject({originalPrice:75,currency:'EUR'});
  expect(aggregatorAskingPrice('&euro;75')).toMatchObject({originalPrice:75,currency:'EUR'});
  expect(aggregatorAskingPrice('&#8364;75')).toMatchObject({originalPrice:75,currency:'EUR'});
 });
});
