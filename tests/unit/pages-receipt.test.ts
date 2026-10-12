import {describe,it,expect} from 'vitest';
import {pagesForMarketRun} from '../../src/lib/pagesReceipt';

const refresh={id:38253367508,created_at:'2026-10-12T13:06:00Z'};
const pages=(message:string,overrides:Record<string,unknown>={})=>({
  name:'Verify and deploy audio board',
  display_title:'Verify and deploy audio board',
  head_commit:{message},
  created_at:'2026-10-12T13:08:18Z',
  status:'completed',
  conclusion:'success',
  ...overrides
});

describe('Pages publication proof',()=>{
  it('rejects newer unrelated successful Pages runs even when their workflow name matches',()=>{
    const unrelated=pages('data: market refresh quick (38251695239)');
    const matching=pages('data: market refresh deep (38253367508)',{status:'in_progress',conclusion:null});
    expect(pagesForMarketRun([unrelated,matching],refresh)).toBe(matching);
  });
  it('accepts direct workflow dispatch with a different display title but correct name and data commit',()=>{
    const matching=pages('data: market refresh full (38253367508)',{display_title:'Some push title'});
    expect(pagesForMarketRun([matching],refresh)).toBe(matching);
  });
  it('fails closed without exact refresh commit, matching workflow or valid chronological evidence',()=>{
    expect(pagesForMarketRun([pages('ops(audio): trigger scan')],refresh)).toBeUndefined();
    expect(pagesForMarketRun([pages('data: market refresh deep (382533675080)')],refresh)).toBeUndefined();
    expect(pagesForMarketRun([pages('data: market refresh deep (38253367508)',{head_commit:null})],refresh)).toBeUndefined();
    expect(pagesForMarketRun([pages('data: market refresh deep (38253367508)',{name:'CI'})],refresh)).toBeUndefined();
    expect(pagesForMarketRun([pages('data: market refresh deep (38253367508)',{created_at:'2026-10-12T13:05:00Z'})],refresh)).toBeUndefined();
  });
});
