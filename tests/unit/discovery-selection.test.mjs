import {describe,it,expect} from 'vitest';
import {selectDiscoveryCandidates,recentResearchUrls} from '../../scripts/discovery-selection.mjs';

const sources=[
 {id:'hifishark',canVerifyOffer:false},
 {id:'vinted-pl',canVerifyOffer:false},
 {id:'marktplaats-nl',canVerifyOffer:true},
 {id:'subito-it',canVerifyOffer:true}
];
const models=Array.from({length:56},(_,i)=>({model:'Audio '+i}));
const lead=(model,sourceId,n)=>({
 model,sourceId,url:'https://'+sourceId+'.example/'+encodeURIComponent(model)+'/'+n
});
describe('direct seller first: full scan must not starve product verification',()=>{
  it('gives all 56 tracked families seller pages even if each returns 8 HiFiShark hits first',()=>{
    const discovered=[];
    for(const sourceId of ['hifishark','vinted-pl','marktplaats-nl','subito-it']){
      const n=sourceId==='hifishark'?8:2;
      for(const m of models)discovered.push(Array.from({length:n},(_,i)=>lead(m.model,sourceId,i)));
    }
    const out=selectDiscoveryCandidates(discovered,models,sources,360);
    expect(out).toHaveLength(360);
    expect(new Set(out.map(x=>x.model)).size).toBe(56);
    expect(out.filter(x=>x.sourceId==='subito-it').length).toBeGreaterThanOrEqual(56);
    expect(out.filter(x=>x.sourceId==='marktplaats-nl').length).toBeGreaterThanOrEqual(56);
    // Old algorithm selected only HiFiShark here because its 448 leads came first.
    expect(out.filter(x=>x.sourceId==='hifishark').length).toBeLessThan(180);
    expect(new Set(out.map(x=>x.url)).size).toBe(out.length);
  });
  it('interleaves each direct seller source before the next offer from that source',()=>{
    const m=[{model:'A'}];
    const all=[[
      ...Array.from({length:8},(_,i)=>lead('A','hifishark',i)),
      ...Array.from({length:4},(_,i)=>lead('A','marktplaats-nl',i)),
      ...Array.from({length:4},(_,i)=>lead('A','subito-it',i)),
      lead('A','vinted-pl',0)
    ]];
    const first=selectDiscoveryCandidates(all,m,sources,5);
    expect(first.map(x=>x.sourceId)).toEqual(['subito-it','marktplaats-nl','vinted-pl','hifishark','subito-it']);
  });
  it('deduplicates URLs across model aliases and ignores malformed candidates',()=>{
    const duplicate=lead('Audio 1','subito-it',0);
    const rows=[[duplicate,{...duplicate,model:'Audio 2'},null,
      lead('Audio 2','marktplaats-nl',1)]];
    const result=selectDiscoveryCandidates(rows,models,sources,40);
    expect(result).toHaveLength(2);
    expect(new Set(result.map(x=>x.url)).size).toBe(2);
  });
  it('does not self-promote aggregates or change statuses: selection only chooses URLs',()=>{
    const original=lead('Audio 0','hifishark',0);
    const result=selectDiscoveryCandidates([[original]],models,sources,1);
    expect(result).toEqual([original]);
    expect(result[0].status).toBeUndefined();
    expect(selectDiscoveryCandidates([],models,sources,30)).toEqual([]);
    expect(selectDiscoveryCandidates([[original]],models,sources,0)).toEqual([]);
  });
});
describe('recent search-lead cooldown',()=>{
 const now='2026-10-12T12:00:00Z';
 const row=(state,hours,url,originUrl)=>({
  model:'Audio 1',url,originUrl,verificationState:state,
  lastSeenAt:new Date(Date.parse(now)-hours*3600000).toISOString()
 });
 it('does not repeatedly fetch the same recent HiFiShark /goto redirects',()=>{
   const records=[
     row('AGGREGATOR_PRICE_ONLY',20,'https://hifishark.com/goto/1'),
     row('DIRECT_OFFER_VERIFIED',5,'https://subito.it/item/2','https://hifishark.com/goto/2'),
     row('SELLER_PAGE_NOT_SUPPORTED',50,'https://hifishark.com/goto/3'),
     row('DIRECT_PAGE_PRICE_ONLY',100,'https://subito.it/item/4')
   ];
   const urls=recentResearchUrls(records,now);
   expect(urls.has('https://hifishark.com/goto/1')).toBe(true);
   expect(urls.has('https://subito.it/item/2')).toBe(true);
   expect(urls.has('https://hifishark.com/goto/2')).toBe(true);
   expect(urls.has('https://hifishark.com/goto/3')).toBe(true);
   expect(urls.has('https://subito.it/item/4')).toBe(false);
 });
 it('expires cooldowns; never blocks unseen or future-dated URLs',()=>{
   const records=[
     row('AGGREGATOR_PRICE_ONLY',121,'https://hifishark.com/goto/old'),
     row('DIRECT_OFFER_VERIFIED',25,'https://subito.it/old'),
     row('OTHER',37,'https://subito.it/other'),
     row('OTHER',-3,'https://subito.it/future'),
     {model:'X',url:'https://no-time.example'}
   ];
   expect([...recentResearchUrls(records,now)]).toEqual([]);
   expect([...recentResearchUrls(records,'not-a-date')]).toEqual([]);
 });
});
