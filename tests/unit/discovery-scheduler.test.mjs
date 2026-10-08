import {describe,it,expect} from 'vitest';
import {planDiscoveryJobs} from '../../scripts/discovery-scheduler.mjs';

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
