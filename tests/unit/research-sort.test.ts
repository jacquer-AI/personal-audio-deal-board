import {describe,it,expect} from 'vitest';
import {sortResearch,researchSortExplanation,pricePln} from '../../src/lib/researchSort';

const entries=[
 {model:'B',url:'b1',pricePln:800,currency:'EUR',originalPrice:200,quality:'B',fit:2},
 {model:'A',url:'a1',pricePln:140,currency:'PLN',originalPrice:140,quality:'A',fit:5},
 {model:'C',url:'c1',pricePln:350,currency:'EUR',originalPrice:80,quality:'UNRATED',fit:null},
 {model:'D',url:'d1',pricePln:null,currency:'UAH',originalPrice:2000,quality:'UNRATED',fit:null}
];
describe('HiFiShark research sort',()=>{
 it('ascending and descending compare PLN-equivalent prices without treating EUR 200 as PLN 200',()=>{
   expect(sortResearch(entries,'price').map(c=>c.model)).toEqual(['A','C','B','D']);
   expect(sortResearch(entries,'price_desc').map(c=>c.model)).toEqual(['B','C','A','D']);
 });
 it('model ordering works independently of asking prices',()=>{
   expect(sortResearch([...entries].reverse(),'model').map(c=>c.model)).toEqual(['A','B','C','D']);
 });
 it('quality and fit use the model profile, missing values are last',()=>{
   expect(sortResearch(entries,'quality').map(c=>c.model)).toEqual(['A','B','C','D']);
   expect(sortResearch(entries,'fit').map(c=>c.model)).toEqual(['A','B','C','D']);
 });
 it('unverified research is not assigned fabricated B4B, discount or savings',()=>{
   for(const sort of ['b4b','discount','savings']){
    expect(sortResearch(entries,sort).map(c=>c.model)).toEqual(['A','C','B','D']);
    expect(researchSortExplanation(sort)).toContain('nie obliczamy');
   }
 });
 it('unknown conversion is always last; native PLN can be ranked without FX',()=>{
   expect(pricePln({model:'X',url:'x',currency:'UAH',originalPrice:6000})).toBeNull();
   expect(pricePln({model:'X',url:'x',currency:'PLN',originalPrice:240})).toBe(240);
   expect(pricePln({model:'X',url:'x',pricePln:null,currency:'EUR',originalPrice:90})).toBeNull();
   expect(sortResearch(entries,'price_desc').at(-1)?.model).toBe('D');
 });
 it('does not mutate input sorting original order',()=>{
   expect(sortResearch([...entries].reverse(),'price')).not.toBe(entries);
   expect(entries.map(x=>x.model)).toEqual(['B','A','C','D']);
 });
});
