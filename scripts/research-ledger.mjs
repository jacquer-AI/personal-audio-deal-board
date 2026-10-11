import {canonicalUrl} from './market-core.mjs';

const key=c=>[String(c.model||'').toLowerCase(),canonicalUrl(c.url||'')].join('|');
const dateOf=c=>Date.parse(c.lastSeenAt||c.verifiedAt||c.discoveredAt||'');
/** Preserve research evidence across scans instead of replacing the whole lead
 * register with a handful of hits. Nothing in this register is buyable. */
export function mergeResearchCandidates(prior=[],found=[],now=new Date().toISOString(),max=500,days=14){
  const byKey=new Map();
  const cutoff=Date.parse(now)-days*86400000;
  for(const p of prior){
    // Drop pre-v2 aggregate prices: their numeric field could have been parsed
    // from the wrong HTML fragment (e.g. a missing trailing EUR amount).
    // Re-discover them from source under the corrected parser instead.
    if(p.sourceId==='hifishark'&&p.verificationState==='AGGREGATOR_PRICE_ONLY'&&p.priceEvidenceVersion!=='HIFISHARK_CARD_PRICE_V2')continue;
    const at=dateOf(p);
    if(!Number.isFinite(at)||at<cutoff||!p?.url||!p?.model)continue;
    const c={...p,firstSeenAt:p.firstSeenAt||p.discoveredAt,lastSeenAt:p.lastSeenAt||p.verifiedAt||p.discoveredAt,
      researchFreshness:'RECHECK_REQUIRED',retained:true};
    // Historical candidate prices are in PLN even if the raw source currency is EUR.
    if(c.pricePln==null && Number.isFinite(c.price)) c.pricePln=c.price;
    delete c.price;
    byKey.set(key(c),c);
  }
  for(const n of found){
    if(!n?.url||!n?.model)continue;
    const before=byKey.get(key(n));
    const c={...n,firstSeenAt:before?.firstSeenAt||n.discoveredAt||now,lastSeenAt:now,
      researchFreshness:'SCAN_OBSERVED',retained:false};
    if(c.pricePln==null&&Number.isFinite(c.price))c.pricePln=c.price;
    delete c.price;
    byKey.set(key(c),c);
  }
  return [...byKey.values()].sort((a,b)=>dateOf(b)-dateOf(a)||key(a).localeCompare(key(b))).slice(0,max);
}
