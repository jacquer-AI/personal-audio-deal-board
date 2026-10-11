import {describe,it,expect} from 'vitest';
import {discoverEuropeanHifisharkRows,europeanMarketplace,aggregatorAskingPrice} from '../../scripts/sources/hifishark-results.mjs';
import {geographicEvidence} from '../../scripts/sources/europe-scope.mjs';

const dt={model:'Beyerdynamic DT 880',aliases:['DT880','DT 880 Pro']};
const row=(site,item,price,url,date='Sep 27, 2026')=>
 '<tr><td><a href="'+url+'">'+item+'</a></td><td>'+site+'</td><td>'+price+'</td><td>'+date+'</td></tr>';

describe('HiFiShark index prices must stay separate from seller verification',()=>{
 it('reads each row own EUR and PLN asking prices and provenance',()=>{
  const html='<table>'+
    row('Subito','Beyerdynamic dt 880 pro','€75','/goto/152_example/abc123')+
    row('OLX Poland','Beyerdynamic DT880','PLN 299','/goto/102_example/abc123')+
    row('Kleinanzeigen','Beyerdynamic DT 880 Pro','€ 80','/goto/239_example/abc123')+'</table>';
  const results=discoverEuropeanHifisharkRows(html,dt,8);
  expect(results).toHaveLength(3);
  expect(results[0]).toMatchObject({askingPrice:75,currency:'EUR',country:'Włochy',site:'Subito',verificationState:'AGGREGATOR_PRICE_ONLY'});
  expect(results[1]).toMatchObject({askingPrice:299,currency:'PLN',country:'Polska'});
  expect(results[2].askingPrice).toBe(80);
  expect(results.every(x=>x.locationEvidence==='EUROPEAN_MARKETPLACE_NOT_SELLER')).toBe(true);
 });
 it('rejects Brazil/Kazakhstan, global marketplace, missing price, and misleading unrelated title',()=>{
  const html='<table>'+
    row('OLX Brazil','Beyerdynamic DT 880 Pro','R$1,200','/goto/brazil/1')+
    row('OLX Kazakhstan','Beyerdynamic DT 880 Pro','KZT 60000','/goto/kaz/2')+
    row('Head-fi','Beyerdynamic DT 880 600 Ohm','$100','/goto/headfi/3')+
    row('Subito','Other headphones','€7','/goto/other/4')+
    row('Subito','Beyerdynamic DT 880 Pro','-','/goto/empty/5')+
    row('Subito','Beyerdynamic DT 880 Pro','€75','/goto/valid/6')+'</table>';
  expect(discoverEuropeanHifisharkRows(html,dt).map(x=>x.askingPrice)).toEqual([75]);
 });
 it('deduplicates and never reads price from outside the same table row',()=>{
  const link='/goto/152_example/abc123';
  const html='<table>'+row('Subito','Beyerdynamic DT 880','- ',link)+
    row('Other','Not DT880','€75','/goto/other/1')+
    row('Subito','Beyerdynamic DT 880','€80',link)+
    row('Subito','Beyerdynamic DT 880','€90',link)+'</table>';
  expect(discoverEuropeanHifisharkRows(html,dt)).toMatchObject([{askingPrice:80}]);
 });
 it('does not label global or unknown seller location as European',()=>{
  expect(geographicEvidence({id:'ebay-de',region:'UE'},'<title>sale</title>')).toBeNull();
  expect(geographicEvidence({id:'subito-it'},'')).toMatchObject({country:'Włochy'});
  expect(geographicEvidence({id:'subito-it'},'<script>{"addressCountry":"JP"}</script>')).toBeNull();
  expect(europeanMarketplace('OLX Kazakhstan')).toBeNull();
  expect(europeanMarketplace('Finn')).toMatchObject({country:'Norwegia'});
 });
 it('handles native prices without inventing currency conversions',()=>{
  expect(aggregatorAskingPrice('NOK 1,000')).toMatchObject({originalPrice:1000,currency:'NOK'});
  expect(aggregatorAskingPrice('HUF 45,000')).toMatchObject({originalPrice:45000,currency:'HUF'});
  expect(aggregatorAskingPrice('€75')).toMatchObject({originalPrice:75,currency:'EUR'});
 });
});
