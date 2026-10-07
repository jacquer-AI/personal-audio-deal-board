import generic from './generic.mjs';
import allegro from './allegro.mjs';
import olx from './olx.mjs';
import ebay from './ebay.mjs';
import retailer from './retailer-jsonld.mjs';
import {looksBlocked} from './common.mjs';

const BY_SOURCE_PREFIX=[['allegro',allegro],['olx',olx],['ebay',ebay]];

export function adapterFor(source){
  const id=String(source?.id||'');
  return BY_SOURCE_PREFIX.find(([p])=>id.startsWith(p))?.[1]||(source?.role?.includes('verification')?retailer:generic);
}

/** One entry point for the refresh: {blocked, parsed}. A blocked page never yields a price. */
export function parsePage(source,html,http){
  if(looksBlocked(html,http))return {blocked:true,parsed:null};
  const adapter=adapterFor(source);
  const parsed=adapter.parse(html)||(adapter===generic?null:generic.parse(html));
  return {blocked:false,parsed};
}
