import {describe,it,expect} from 'vitest';
import {memoizeScanFetch} from '../../scripts/fetch-cache.mjs';

describe('market scan same-URL fetch dedupe',()=>{
 it('shares the same in-flight seller response across board and research',async()=>{
   let calls=0,release;
   const gate=new Promise(resolve=>{release=resolve});
   const fetch=memoizeScanFetch(async url=>{calls++;await gate;return {url,http:200,html:'item-local evidence'}});
   const first=fetch('https://seller.example/item/100');
   const second=fetch('https://seller.example/item/100');
   const other=fetch('https://seller.example/item/101');
   expect(first).toBe(second);
   release();
   const results=await Promise.all([first,second,other]);
   expect(calls).toBe(2);
   expect(results[0]).toBe(results[1]);
   expect(results[0].http).toBe(200);
 });
 it('does not conflate distinct query URLs or different model items',async()=>{
   let calls=0;
   const fetch=memoizeScanFetch(async url=>{calls++;return {url,http:403}});
   await fetch('https://shop.example/item/1?a=1');
   await fetch('https://shop.example/item/1?a=2');
   await fetch('https://shop.example/item/2?a=1');
   expect(calls).toBe(3);
 });
 it('allows a retry after unexpected fetch rejection and never treats 403 as buyable',async()=>{
   let calls=0;
   const fetch=memoizeScanFetch(async()=>{calls++;if(calls===1)throw new Error('temporary');return {http:403}});
   await expect(fetch('https://shop.example/item')).rejects.toThrow('temporary');
   await Promise.resolve();
   expect(await fetch('https://shop.example/item')).toMatchObject({http:403});
   expect(calls).toBe(2);
 });
 it('starts with a fresh cache for every distinct scan',async()=>{
   let calls=0,real=async()=>({http:200,id:++calls});
   const one=memoizeScanFetch(real),two=memoizeScanFetch(real);
   expect((await one('https://shop.example/item')).id).toBe(1);
   expect((await one('https://shop.example/item')).id).toBe(1);
   expect((await two('https://shop.example/item')).id).toBe(2);
 });
});
