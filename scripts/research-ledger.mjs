import {canonicalUrl} from './market-core.mjs';

const key=c=>[String(c.model||'').toLowerCase(),canonicalUrl(c.url||'')].join('|');
const dateOf=c=>Date.parse(c.lastSeenAt||c.verifiedAt||c.discoveredAt||'');

const tier=c=>c.verificationState==='DIRECT_OFFER_VERIFIED'&&c.priceBasis==='SELLER_PAGE_PRICE'?0:
  c.verificationState==='DIRECT_OFFER_VERIFIED'?1:
  c.verificationState==='DIRECT_PAGE_PRICE_ONLY'?2:
  c.verificationState==='AGGREGATOR_PRICE_ONLY'?4:3;

/** Prefer confirmed seller evidence, then actionable seller leads and only then
 * aggregator records. Round-robin by model within each evidence tier prevents a
 * prolific marketplace/model from evicting rare tracked models at the hard cap.
 * Ordering is deterministic for identical observations. */
export function selectResearchForDisplay(records,max=500) {
  if(!Number.isFinite(max)||max<=0)return [];
  const sorted=[...(records||[])].sort((a,b)=>dateOf(b)-dateOf(a)||key(a).localeCompare(key(b)));
  const tiers=new Map();
  for(const c of sorted){
    const t=tier(c);
    if(!tiers.has(t))tiers.set(t,new Map());
    const grouped=tiers.get(t);
    const model=String(c.model||'');
    if(!grouped.has(model))grouped.set(model,[]);
    grouped.get(model).push(c);
  }
  const out=[];
  for(const t of [0,1,2,3,4]){
    const models=tiers.get(t);
    if(!models)continue;
    const names=[...models.keys()].sort((a,b)=>a.localeCompare(b));
    let again=true;
    while(again && out.length<max){
      again=false;
      for(const model of names){
        const c=models.get(model).shift();
        if(!c)continue;
        again=true;
        out.push(c);
        if(out.length>=max)break;
      }
    }
    if(out.length>=max)break;
  }
  return out;
}

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
  return selectResearchForDisplay([...byKey.values()],max);
}
