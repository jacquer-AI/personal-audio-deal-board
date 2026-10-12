import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const MODES=new Set(['quick','full','deep']);
const CATEGORIES=new Set(['all','IEM','TWS','Closed','Open','Głośniki BT']);

/** Validate the exact request-file scope before emitting trusted GITHUB_ENV lines.
 * Only accepted enumerated values can cross into the shell/Actions environment. */
export function parseAudioScanRequest(raw){
  const request=typeof raw==='string'?JSON.parse(raw):raw;
  if(!request||typeof request!=='object'||Array.isArray(request)||request.schema!==1)
    throw new Error('SCAN_REQUEST_SCHEMA_INVALID');
  if(typeof request.mode!=='string'||!MODES.has(request.mode))
    throw new Error('SCAN_REQUEST_MODE_INVALID');
  if(typeof request.categories!=='string'||!CATEGORIES.has(request.categories))
    throw new Error('SCAN_REQUEST_CATEGORY_INVALID');
  return {mode:request.mode,categories:request.categories};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const source=process.argv[2]||'ops/audio-scan-now.json';
  const {mode,categories}=parseAudioScanRequest(fs.readFileSync(source,'utf8'));
  process.stdout.write('REFRESH_MODE='+mode+'\nREFRESH_CATEGORIES='+categories+'\n');
}
