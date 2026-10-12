import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {parseAudioScanRequest} from '../../scripts/scan-request.mjs';

const valid={schema:1,requestId:'audio-open-e2e-1',mode:'full',categories:'Open'};
describe('request-file market refresh scope',()=>{
  it('respects scoped full scans and every supported category',()=>{
    for(const categories of ['all','IEM','TWS','Closed','Open','Głośniki BT']){
      expect(parseAudioScanRequest({...valid,categories})).toEqual({mode:'full',categories});
    }
    for(const mode of ['quick','full','deep'])
      expect(parseAudioScanRequest(JSON.stringify({...valid,mode}))).toEqual({mode,categories:'Open'});
  });
  it('fails closed on absent, malformed and newline-injected request fields',()=>{
    for(const invalid of [
      {...valid,categories:undefined},
      {...valid,categories:'Open\\nFAKE=1'},
      {...valid,categories:'Open,IEM'},
      {...valid,mode:'full\\nREFRESH_CATEGORIES=all'},
      {...valid,mode:'FULL'},
      {...valid,schema:2},
      {...valid,mode:undefined}
    ])expect(()=>parseAudioScanRequest(invalid)).toThrow();
    expect(()=>parseAudioScanRequest('{invalid-json')).toThrow();
  });
  it('the GitHub push PLAN uses the validated request-file parser rather than implicit all',()=>{
    const yaml=fs.readFileSync('.github/workflows/refresh-market.yml','utf8');
    expect(yaml).toContain('node scripts/scan-request.mjs ops/audio-scan-now.json >> "$GITHUB_ENV"');
    expect(yaml).toContain('if [ "$GITHUB_EVENT_NAME" = "push" ]; then');
    expect(yaml).toContain('REFRESH_CATEGORIES=$categories');
  });
});
