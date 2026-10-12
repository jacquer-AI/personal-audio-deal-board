import {canonicalUrl} from './market-core.mjs';

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
  // Seller URLs are actionable verification targets. Exhaust direct seller
  // candidates before using a bounded HTTP budget on aggregator /goto links.
  // The remaining indexed prices are retained as non-LIVE research below.
  const maxAggregators=Math.min(models.length,6,Math.max(1,Math.floor(max/4)));
  const direct=queues.map(({model,queue})=>({model,queue:queue.filter(c=>c.sourceId!=='hifishark')}));
  const aggregate=queues.map(({model,queue})=>({
    model,queue:queue.filter(c=>c.sourceId==='hifishark').slice(0,1)
  }));
  function takeRounds(groups,stopAt){
    let remaining=true;
    while(remaining&&out.length<stopAt){
      remaining=false;
      for(const item of groups){
        const next=item.queue.shift();
        if(!next)continue;
        remaining=true;
        out.push(next);
        if(out.length>=stopAt)break;
      }
    }
  }
  takeRounds(direct,max);
  takeRounds(aggregate,Math.min(max,out.length+maxAggregators));
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

/** Plan fresh verification for research leads NOT already maintained as board
 * offers. The board refresh independently rechecks its own seller URLs; spending
 * 80 research slots on those same URLs starves unpromoted candidates.
 *
 * The plan changes URL scheduling only. No past proof can promote to LIVE:
 * refresh-market still fetches the final seller page and executes all gates.
 */
export function planResearchRechecks(candidates, trackedModels, existingOffers, max=80) {
  if(!Array.isArray(candidates)||!Array.isArray(trackedModels)||!Number.isFinite(max)||max<=0)
    return {selected:[],eligible:0,skippedOnBoard:0,skippedDuplicates:0};
  const tracked=new Map(trackedModels.map(m=>[m.model,m]));
  const boardUrls=new Set((existingOffers||[]).filter(o=>typeof o?.url==='string').map(o=>canonicalUrl(o.url)));
  const seen=new Set(),groups=new Map();
  let skippedOnBoard=0,skippedDuplicates=0;
  for(const c of candidates){
    if(c?.verificationState!=='DIRECT_OFFER_VERIFIED'||!tracked.has(c.model)||
       !['Polska','UE','non-EU / TLC'].includes(c.region)||typeof c.url!=='string'||
       !c.url.startsWith('https://'))continue;
    const url=canonicalUrl(c.url);
    if(boardUrls.has(url)){skippedOnBoard++;continue}
    if(seen.has(url)){skippedDuplicates++;continue}
    seen.add(url);
    if(!groups.has(c.model))groups.set(c.model,[]);
    groups.get(c.model).push(c);
  }
  const priority=m=>Number.isFinite(tracked.get(m)?.priority)?tracked.get(m).priority:99;
  const names=[...groups.keys()].sort((a,b)=>priority(a)-priority(b)||a.localeCompare(b));
  const when=c=>Date.parse(c.verifiedAt||c.lastSeenAt||c.discoveredAt||'')||0;
  for(const group of groups.values())group.sort((a,b)=>
    (a.priceBasis==='SELLER_PAGE_PRICE'?0:1)-(b.priceBasis==='SELLER_PAGE_PRICE'?0:1)||
    when(a)-when(b)||canonicalUrl(a.url).localeCompare(canonicalUrl(b.url)));
  const eligible=seen.size,selected=[];
  let remaining=true;
  while(remaining&&selected.length<max){
    remaining=false;
    for(const name of names){
      const next=groups.get(name).shift();
      if(!next)continue;
      remaining=true;
      selected.push(next);
      if(selected.length>=max)break;
    }
  }
  return {selected,eligible,skippedOnBoard,skippedDuplicates};
}

/** Keep all source-parsed HiFiShark asking prices as RESEARCH when their
 * redirects were not probed. An indexed price is neither current stock nor
 * a seller-confirmed asking price. Crucially, no HTTP calls occur here. */
export function retainUnprobedIndexedPrices(discovered,probed,convertToPln=()=>null,fxSource=null,fxEffectiveDate=null){
  const checked=new Set((probed||[]).filter(c=>c?.sourceId==='hifishark').map(c=>canonicalUrl(c.url)));
  const seen=new Set(),out=[];
  for(const rows of discovered||[])for(const c of rows||[]){
    if(c?.sourceId!=='hifishark'||c.priceEvidenceVersion!=='HIFISHARK_CARD_PRICE_V2'||
       !(c.askingPrice>0)||!c.currency||typeof c.url!=='string')continue;
    const key=canonicalUrl(c.url);
    if(checked.has(key)||seen.has(key))continue;
    seen.add(key);
    const pricePln=convertToPln(c.askingPrice,c.currency);
    out.push({...c,status:'AGGREGATOR PRICE ONLY',
      verificationState:'AGGREGATOR_PRICE_ONLY',
      lastVerificationFailure:'GOTO_NOT_PROBED_BUDGET',
      verifiedAt:null,http:null,availability:null,
      originalPrice:c.askingPrice,pricePln:Number.isFinite(pricePln)?pricePln:null,
      priceBasis:'AGGREGATOR_INDEXED_ASK',fxSource,fxEffectiveDate,
      redTeam:['SELLER_NOT_VERIFIED','AVAILABILITY_UNKNOWN','SHIPPING_UNKNOWN']});
  }
  return out;
}
