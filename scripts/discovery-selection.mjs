/**
 * Select direct merchant item pages before index/aggregator leads, without
 * allowing one brand or one marketplace to monopolise the verification budget.
 *
 * This changes only which URLs get CHECKED. It never authorizes an offer as LIVE.
 * The existing direct-page/model/condition/fixed-price/availability gates still apply.
 */
export function selectDiscoveryCandidates(discovered, models, sources, max=360) {
  if(!Array.isArray(discovered)||!Array.isArray(models)||!Number.isFinite(max)||max<=0)return [];
  const sourceMap=new Map((sources||[]).map(s=>[s.id,s]));
  const buckets=new Map(models.map(m=>[m.model,[]]));
  const seen=new Set();
  for(const rows of discovered)for(const c of rows||[]){
    if(!c?.model||!c?.url||!buckets.has(c.model))continue;
    // One URL cannot become two different offers by matching multiple model searches.
    if(seen.has(c.url))continue;
    seen.add(c.url);
    buckets.get(c.model).push(c);
  }
  const score=c=>{
    const s=sourceMap.get(c.sourceId);
    if(c.sourceId==='subito-it'&&s?.canVerifyOffer)return 0;
    if(s?.canVerifyOffer&&c.sourceId!=='hifishark')return 1;
    if(c.sourceId==='hifishark')return 3; // discovery; needs destination check
    return 2; // non-verifying marketplace, research only
  };
  const queues=[];
  for(const [model,rows] of buckets){
    const bySource=new Map();
    for(const c of rows){
      const id=c.sourceId||'unknown';
      if(!bySource.has(id))bySource.set(id,[]);
      bySource.get(id).push(c);
    }
    const order=[...bySource.keys()].sort((a,b)=>
      score(bySource.get(a)[0])-score(bySource.get(b)[0])||a.localeCompare(b));
    const queue=[];
    // One direct item per marketplace per pass before taking the second item.
    // This retains source diversity instead of selecting 8 HiFiShark hits first.
    let again=true;
    while(again){
      again=false;
      for(const id of order){
        const next=bySource.get(id).shift();
        if(next){again=true;queue.push(next)}
      }
    }
    queues.push({model,queue});
  }
  const out=[];
  // Aggregator redirects are valuable research, but cannot themselves establish
  // a fixed seller price. Keep a bounded one-per-model sample so old search
  // indexes never absorb hundreds of checks needed for direct seller items.
  const maxAggregators=Math.min(models.length,Math.max(1,Math.floor(max/4)));
  let aggregateCount=0;
  const aggregateSeen=new Set();
  let remaining=true;
  while(remaining&&out.length<max){
    remaining=false;
    for(const {model,queue} of queues){
      if(!queue.length)continue;
      remaining=true;
      const next=queue.shift();
      if(next.sourceId==='hifishark'){
        if(aggregateSeen.has(model)||aggregateCount>=maxAggregators)continue;
        aggregateSeen.add(model);
        aggregateCount++;
      }
      out.push(next);
      if(out.length>=max)break;
    }
  }
  return out;
}

/**
 * Full/deep scans must not spend their finite HTTP-verification budget on the
 * same recently checked search hits on every run. History is still preserved
 * in the research ledger and seller-verified leads are independently rechecked.
 * A prior HiFiShark /goto is also blocked when the stored record has since
 * resolved to a final seller URL (originUrl).
 */
export function recentResearchUrls(candidates, now, windows={
  verifiedHours:24,
  aggregatorHours:120,
  unsupportedHours:96,
  otherHours:36
}) {
  const nowMs=Date.parse(now),known=new Set();
  if(!Number.isFinite(nowMs))return known;
  for(const c of candidates||[]){
    if(!c?.url)continue;
    const when=Date.parse(c.lastSeenAt||c.verifiedAt||c.discoveredAt||'');
    if(!Number.isFinite(when)||when>nowMs)continue;
    const age=nowMs-when;
    const hours=c.verificationState==='DIRECT_OFFER_VERIFIED'?windows.verifiedHours:
      c.verificationState==='AGGREGATOR_PRICE_ONLY'?windows.aggregatorHours:
      ['SELLER_PAGE_NOT_SUPPORTED','NOT_DIRECT_OR_MODEL'].includes(c.verificationState)
        ?windows.unsupportedHours:windows.otherHours;
    if(age>hours*3600000)continue;
    known.add(c.url);
    if(c.originUrl)known.add(c.originUrl);
  }
  return known;
}
