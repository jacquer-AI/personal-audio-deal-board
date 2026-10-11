import {describe,it,expect} from 'vitest';
import {europeanOffer,europeanResearch} from '../../src/lib/europeScope';
import type {Offer} from '../../src/types';

const offer=(country:string,region:'Polska'|'UE'|'non-EU / TLC')=>({country,region} as Offer);
describe('Europe-only offer and aggregator admission',()=>{
 it('shows Poland, European Union and non-EU European countries',()=>{
  expect(europeanOffer(offer('Polska','Polska'))).toBe(true);
  expect(europeanOffer(offer('Węgry','UE'))).toBe(true);
  expect(europeanOffer(offer('UK','non-EU / TLC'))).toBe(true);
  expect(europeanOffer(offer('Norwegia','non-EU / TLC'))).toBe(true);
  expect(europeanOffer(offer('Szwajcaria','non-EU / TLC'))).toBe(true);
 });
 it('hides Japan via Germany-based eBay and unknown origin',()=>{
  expect(europeanOffer(offer('Japonia via eBay DE','non-EU / TLC'))).toBe(false);
  expect(europeanOffer(offer('Nie podano w SSOT','non-EU / TLC'))).toBe(false);
 });
 it('requires provenance for global HiFiShark, excluding historic global results',()=>{
  expect(europeanResearch({sourceId:'hifishark',region:'UE'})).toBe(false);
  expect(europeanResearch({sourceId:'ebay-de',region:'UE'})).toBe(false);
  expect(europeanResearch({sourceId:'hifishark',region:'UE',locationEvidence:'EUROPEAN_MARKETPLACE_NOT_SELLER',country:'Włochy'})).toBe(true);
  expect(europeanResearch({sourceId:'hifishark',region:'EUROPE_UNCONFIRMED'})).toBe(false);
  expect(europeanResearch({sourceId:'hifishark',region:'UE',locationEvidence:'EUROPEAN_MARKETPLACE_NOT_SELLER',country:'Japonia'})).toBe(false);
 });
});
