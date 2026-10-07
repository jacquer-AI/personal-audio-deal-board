import fs from 'node:fs';
import {mergeOverlay} from './market-core.mjs';

const basePath='data/offers-base.json';
const currentPath='data/market-current.json';
if(!fs.existsSync(basePath)) throw new Error('offers-base.json missing; run sync-sheet first');
const base=JSON.parse(fs.readFileSync(basePath,'utf8'));
const current=fs.existsSync(currentPath)?JSON.parse(fs.readFileSync(currentPath,'utf8')):{updates:[]};
const merged=mergeOverlay(base,current);
fs.writeFileSync('data/offers.json',JSON.stringify(merged,null,2)+'\n');
console.log('Merged',merged.offers.length,'offers; refresh=',merged.refresh?.status||'NEVER');
