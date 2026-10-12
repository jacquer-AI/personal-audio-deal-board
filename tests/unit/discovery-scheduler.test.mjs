import {describe,it,expect} from 'vitest';
import {planDiscoveryJobs,coreSourceIdsForDate} from '../../scripts/discovery-scheduler.mjs';

const models=Array.from({length:16},(_,i)=>({model:'Headphone '+i}));
const sources=Array.from({length:9},(_,i)=>({id:'site-'+i,queryTerms:[],searchUrlTemplate:'https://site.example/?q={q}'}));
describe('refresh discovery breadth under budgets',()=>{
  it('FULL budget covers all models and all 9 sites, not only first few models',()=>{
    const jobs=planDiscoveryJobs(models,sources,60);
    expect(jobs).toHaveLength(60);
    expect(new Set(jobs.map(j=>j.m.model)).size).toBe(16);
    expect(new Set(jobs.map(j=>j.s.id)).size).toBe(9);
    expect(new Set(jobs.map(j=>j.m.model+'|'+j.s.id)).size).toBe(60);
  });
  it('DEEP budget covers 16 models and 23 sources with no pair repeated',()=>{
    const many=Array.from({length:23},(_,i)=>({...sources[0],id:'site-'+i}));
    const jobs=planDiscoveryJobs(models,many,140);
    expect(new Set(jobs.map(j=>j.m.model)).size).toBe(16);
    expect(new Set(jobs.map(j=>j.s.id)).size).toBe(23);
    expect(new Set(jobs.map(j=>j.m.model+'|'+j.s.id)).size).toBe(jobs.length);
  });
  it('handles zero/limited budget and encodes queries safely',()=>{
    expect(planDiscoveryJobs([],sources,60)).toEqual([]);
    expect(planDiscoveryJobs(models,[],60)).toEqual([]);
    expect(planDiscoveryJobs(models,sources,0)).toEqual([]);
    const jobs=planDiscoveryJobs([{model:'B&W Pi8'}],sources,1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toContain('B%26W%20Pi8');
  });
});

describe('model-only search restores seller recall',()=>{
 it('avoids redundant used-condition keywords on Subito and Marktplaats',()=>{
   const pair=[{model:'Beyerdynamic DT 48 25 Ohm'}];
   const s=[
     {id:'subito-it',canVerifyOffer:true,queryTerms:['usato'],searchUrlTemplate:'https://subito.it/annunci-italia/vendita/usato/?q={q}'},
     {id:'marktplaats-nl',canVerifyOffer:true,queryTerms:['tweedehands'],searchUrlTemplate:'https://www.marktplaats.nl/q/{q}/'},
     {id:'olx-pl',canVerifyOffer:true,queryTerms:['używane'],searchUrlTemplate:'https://www.olx.pl/oferty/q-{q}/'}
   ];
   const jobs=planDiscoveryJobs(pair,s,3,['subito-it','marktplaats-nl','olx-pl'],'2026-10-12');
   expect(jobs[0].query).toBe('Beyerdynamic DT 48 25 Ohm');
   expect(jobs[1].query).toBe('Beyerdynamic DT 48 25 Ohm');
   expect(jobs[2].query).toContain('używane');
   expect(jobs[0].url).toContain('DT%2048%2025%20Ohm');
 });
});

describe('prioritized all-model discovery',()=>{
  it('queries each active marketplace for all 32 models before low-yield exploration',()=>{
    const manyModels=Array.from({length:32},(_,i)=>({model:'Headphone '+i}));
    const mixed=Array.from({length:23},(_,i)=>({id:'site-'+i,queryTerms:[],searchUrlTemplate:'https://site.example?q={q}'}));
    const core=['site-2','site-9','site-5','site-11','site-1'];
    const jobs=planDiscoveryJobs(manyModels,mixed,320,core);
    expect(jobs).toHaveLength(320);
    expect(new Set(jobs.map(j=>j.m.model+'|'+j.s.id)).size).toBe(320);
    for(const source of core)expect(jobs.filter(j=>j.s.id===source)).toHaveLength(32);
    expect(new Set(jobs.map(j=>j.m.model)).size).toBe(32);
  });
  it('daily FULL budget covers six priority sources across all 32 model families',()=>{
    const manyModels=Array.from({length:32},(_,i)=>({model:'Headphone '+i}));
    const priority=['allegro-pl','olx-pl','mediaexpert-outlet','vinted-pl','subito-it','marktplaats-nl','kleinanzeigen-de'];
    const mixed=priority.map(id=>({id,queryTerms:[],searchUrlTemplate:'https://site.example?q={q}'}));
    const jobs=planDiscoveryJobs(manyModels,mixed,240,priority);
    expect(jobs).toHaveLength(224);
    for(const source of priority.slice(0,6))
      expect(jobs.filter(j=>j.s.id===source)).toHaveLength(32);
    expect(new Set(jobs.map(j=>j.m.model)).size).toBe(32);
  });
  it('small budgets cover all models at highest-priority provider first',()=>{
    const jobs=planDiscoveryJobs(models,sources,20,['site-5','site-1']);
    expect(jobs.slice(0,16).every(j=>j.s.id==='site-5')).toBe(true);
    expect(new Set(jobs.slice(0,16).map(j=>j.m.model)).size).toBe(16);
    expect(jobs.slice(16).every(j=>j.s.id==='site-1')).toBe(true);
  });
});

describe('48 model daily rotation preserves 5 Europe-wide sources and a Polish discovery channel',()=>{
  it('gives every model productive daily baselines and rotates exploratory sources',()=>{
    const models48=Array.from({length:48},(_,i)=>({model:'Audio '+i}));
    const ids=['hifishark','allegro-pl','olx-pl','vinted-pl','subito-it','kleinanzeigen-de','marktplaats-nl','mediaexpert-outlet','ebay-de'];
    const available=ids.map(id=>({id,queryTerms:[],searchUrlTemplate:'https://site.example/?q={q}'}));
    const encountered=new Set();
    for(let d=11;d<16;d++){
      const core=coreSourceIdsForDate('2026-10-'+d);
      expect(core).toHaveLength(5);
      expect(core.slice(0,4)).toEqual(['subito-it','marktplaats-nl','hifishark','vinted-pl']);
      core.forEach(x=>encountered.add(x));
      const jobs=planDiscoveryJobs(models48,available,240,core);
      expect(jobs).toHaveLength(240);
      for(const id of core)expect(jobs.filter(j=>j.s.id===id)).toHaveLength(48);
      expect(new Set(jobs.map(j=>j.m.model)).size).toBe(48);
    }
    expect([...encountered].sort()).toEqual([...ids].sort());
  });
});


describe('60 tracked models in 300-job FULL budget',()=>{
  it('covers every model across all four baselines plus the daily European outlet',()=>{
    const models60=Array.from({length:60},(_,i)=>({model:'Headphone '+i}));
    const ids=['hifishark','allegro-pl','olx-pl','vinted-pl','subito-it','kleinanzeigen-de','marktplaats-nl','mediaexpert-outlet','ebay-de'];
    const sources60=ids.map(id=>({id,queryTerms:[],searchUrlTemplate:'https://site.example/?q={q}'}));
    for(let d=11;d<16;d++){
      const core=coreSourceIdsForDate('2026-10-'+d);
      const jobs=planDiscoveryJobs(models60,sources60,300,core);
      expect(jobs).toHaveLength(300);
      for(const id of core)expect(jobs.filter(j=>j.s.id===id)).toHaveLength(60);
      expect(new Set(jobs.map(j=>j.m.model+'|'+j.s.id)).size).toBe(300);
    }
  });
});


describe('source productivity routing and coverage',()=>{
  it('prioritizes verified seller page sources ahead of persistently blocked searches',()=>{
    const core=coreSourceIdsForDate('2026-10-12');
    expect(core).toContain('marktplaats-nl');
    expect(core).toContain('subito-it');
    expect(core).toContain('vinted-pl');
    expect(core).toContain('hifishark');
    expect(core.filter(id=>id==='allegro-pl'||id==='olx-pl').length).toBeLessThanOrEqual(1);
  });
  it('still revisits both Polish blocked sources and all EU sources over five days',()=>{
    const names=new Set();
    for(let d=11;d<16;d++)
      coreSourceIdsForDate('2026-10-'+d).forEach(x=>names.add(x));
    for(const source of ['allegro-pl','olx-pl','kleinanzeigen-de','mediaexpert-outlet','ebay-de'])
      expect(names.has(source)).toBe(true);
  });
});


describe('precise variant search without false DT48 impedance matches',()=>{
  it('rotates aliases by date and source, always preserving the requested 25 ohm variant',()=>{
    const rare={model:'Beyerdynamic DT 48 25 Ohm',searchTerms:['Beyerdynamic DT48 25 Ohm','Beyerdynamic DT 48 E 25','DT48 25 Ohm']};
    const sites=['hifishark','subito-it','marktplaats-nl'].map(id=>({id,searchUrlTemplate:'https://site.example/?q={q}',queryTerms:[]}));
    const observed=new Set();
    for(const date of ['2026-10-11','2026-10-12','2026-10-13']){
      const jobs=planDiscoveryJobs([rare],sites,3,sites.map(x=>x.id),date);
      expect(jobs).toHaveLength(3);
      for(const job of jobs){
        expect(job.query).toMatch(/25/);
        expect(job.query).not.toMatch(/200|250/);
        observed.add(job.query);
      }
    }
    expect(observed.size).toBe(3);
  });
});
