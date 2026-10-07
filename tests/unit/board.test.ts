import {describe,it,expect}from'vitest';import{b4b,discount,savings,results,group,selectCompare,buyable}from'../../src/lib/board';import type{Offer,Filters}from'../../src/types';import snapshot from '../../data/offers.json';
const offers=snapshot.offers as Offer[];const f:Filters={search:'',category:'Wszystkie',conditions:[],region:'Wszystkie',status:'Wszystkie',liveOnly:true,history:false,sort:'b4b'};
const az=offers.find(o=>o.model.includes('AZ100')&&o.condition==='NEW')!;
describe('price semantics',()=>{
it('A at 20% discount is 125, B is 87.5',()=>{expect(b4b({...az,price:80,sameMarket:100,quality:'A'})).toBe(125);expect(b4b({...az,price:80,sameMarket:100,quality:'B'})).toBe(87.5)});
it('USED AZ100 is expensive vs USED despite savings vs NEW',()=>{const o=offers.find(o=>o.model.includes('AZ100')&&o.price===610)!;expect(discount(o)).toBeCloseTo(-.1296296);expect(savings(o)).toBeCloseTo(.274673);expect(b4b(o)).toBeCloseTo(88.52459)});
it('B-stock uses B-stock benchmark 4799, not new 5222',()=>{const o=offers.find(o=>o.condition==='B-STOCK')!;expect(b4b(o)).toBeCloseTo(117.33274);expect(discount(o)).toBeCloseTo(300/4799)});
it('JBL MSRP does not inflate B4B',()=>{const o=offers.find(o=>o.model==='JBL Charge 6')!;expect(b4b(o)).toBe(80);expect(discount(o)).toBe(0)});
it('missing benchmark never ranks',()=>expect(b4b({...az,sameMarket:null})).toBeNull());
it('invalid price never ranks',()=>expect(b4b({...az,price:0})).toBeNull());
it.each(['HISTORICAL','LEAD ONLY','NON-EU / TLC','STALE / REVERIFY'] as const)('%s cannot masquerade as buyable',status=>{expect(buyable({...az,status})).toBe(false);expect(b4b({...az,status})).toBeNull()});
});
describe('workbench',()=>{
it('groups AZ100 offers once',()=>expect(group(offers).filter(p=>p.model===az.model)).toHaveLength(1));
it('excludes history by default and restores only explicitly',()=>{expect(results(offers,f).some(p=>p.model.includes('AEON 2'))).toBe(false);expect(results(offers,{...f,liveOnly:false,history:true}).some(p=>p.model.includes('AEON 2'))).toBe(true)});
it('speakers include all three models',()=>expect(results(offers,{...f,category:'Głośniki BT'}).map(p=>p.model).sort()).toEqual(['Bose SoundLink Max','JBL Charge 6','Marshall Middleton II']));
it('searches sellers and country',()=>{expect(results(offers,{...f,search:'Thomann'}).length).toBeGreaterThan(0);expect(results(offers,{...f,search:'Niemcy'}).length).toBeGreaterThan(0)});
it('filters conditions',()=>expect(results(offers,{...f,conditions:['USED']}).every(p=>p.best.condition==='USED')).toBe(true));
it('filters region',()=>expect(results(offers,{...f,region:'Polska'}).every(p=>p.best.region==='Polska')).toBe(true));
it('filters status',()=>expect(results(offers,{...f,status:'LIVE USED'}).every(p=>p.best.status==='LIVE USED')).toBe(true));
it('sorts cheapest first',()=>expect(results(offers,{...f,sort:'price'})[0].model).toBe('JBL Charge 6'));
it('sorts B4B within eligible current sources',()=>{const scores=results(offers,f).map(p=>b4b(p.best)??-Infinity);expect(scores).toEqual([...scores].sort((a,b)=>b-a))});
it('rejects fourth compare without mutating selection',()=>{const ids=['a','b','c'];const r=selectCompare(ids,'d');expect(r.ids).toEqual(ids);expect(r.error).toContain('3')});
it('removes comparison and adds third',()=>{expect(selectCompare(['a','b'],'c').ids).toEqual(['a','b','c']);expect(selectCompare(['a','b','c'],'b').ids).toEqual(['a','c'])});
});
