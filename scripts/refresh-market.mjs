import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fingerprint,verificationFromHttp,directOfferEligible,computeDelta,mergeOverlay,mergeCurrent,materiallyEqual,lastObservations,dedupeObservations,statsFromLedger,redTeam} from './market-core.mjs';
import {conditionFrom,available,toPln,toNumber,isListingUrl,isPlausibleOfferLink} from './sources/common.mjs';
import {parsePage} from './sources/index.mjs';
import {planDiscoveryJobs,coreSourceIdsForDate} from './discovery-scheduler.mjs';
import {discoverPageLinks} from './sources/discovery-links.mjs';
import {mergeResearchCandidates} from './research-ledger.mjs';
import {shippingEvidencePoland} from './shipping-evidence.mjs';
import {itemTitleMatchesModel,priceBasis} from './sources/item-evidence.mjs';
import {geographicEvidence,isEuropeRecordedOffer} from './sources/europe-scope.mjs';
import {discoverEuropeanHifisharkRows} from './sources/hifishark-results.mjs';

const argv=process.argv.slice(2);
const arg=(name,fallback='')=>{const i=argv.indexOf('--'+name);return i>=0?argv[i+1]:fallback};
const mode=(arg('mode',process.env.REFRESH_MODE||'quick')||'quick').toLowerCase();
if(!['quick','full','deep'].includes(mode))throw new Error('mode must be quick|full|deep');
const CATEGORIES=['IEM','TWS','Closed','Open','Głośniki BT'];
const categoryArg=arg('categories',process.env.REFRESH_CATEGORIES||'all');
if(categoryArg!=='all'&&!categoryArg.split(',').every(c=>CATEGORIES.includes(c.trim())))throw new Error('invalid categories');
const selectedCategories=categoryArg==='all'?null:new Set(categoryArg.split(',').map(x=>x.trim()));
const runId=process.env.GITHUB_RUN_ID||('local-'+Date.now());
const now=new Date().toISOString();
const TIMEOUT=Number(process.env.REFRESH_TIMEOUT_MS||12000);
const CONCURRENCY=Math.max(1,Math.min(6,Number(process.env.REFRESH_CONCURRENCY||4)));
// FULL needs enough budget to cover Polish marketplaces plus the two EU sources
// which actually yield directly verifiable seller pages (Subito, Marktplaats).
const MAX_DISCOVERY_JOBS=Math.max(1,Math.min(500,Number(process.env.REFRESH_DISCOVERY_LIMIT||(mode==='deep'?320:240))));
const DEADLINE=Date.now()+Number(process.env.REFRESH_DEADLINE_MS||20*60*1000);
const DRY=process.env.REFRESH_DRY==='1';

const readJson=(p,fallback)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;
const sourceDoc=readJson('config/source-registry.json',{sources:[]});
const modelDoc=readJson('config/model-registry.json',{models:[]});
const base=readJson('data/offers-base.json',null)||readJson('data/offers.json',{offers:[]});
const previousRuntime=readJson('data/offers.json',base);
const previousCurrent=readJson('data/market-current.json',{updates:[],additions:[]});
const previousCandidates=readJson('data/market-candidates.json',{candidates:[]});
const fxDoc=readJson('data/fx-latest.json',null);
const fxDate=Date.parse((fxDoc?.effectiveDate||'')+'T00:00:00Z');
const fxIsFresh=fxDoc?.source==='NBP_TABLE_A'&&Number.isFinite(fxDate)
  &&Date.now()-fxDate>=0&&Date.now()-fxDate<=8*86400000
  &&['EUR','GBP','USD'].every(code=>Number.isFinite(fxDoc.rates?.[code])&&fxDoc.rates[code]>0);
const fx=fxIsFresh?fxDoc.rates:(base.fx||{EUR:4.3,GBP:5.1,USD:3.9});
const fxSource=fxIsFresh?'NBP_TABLE_A':'SHEET_FALLBACK_NOT_CURRENT';
const fxEffectiveDate=fxIsFresh?fxDoc.effectiveDate:null;
function shipmentEvidence(html,priceInCurrency,itemPln){
  const shipping=shippingEvidencePoland(html,priceInCurrency);
  const ratePln=shipping.status==='PL_RATE_ADVERTISED'&&fxIsFresh?toPln(shipping.amount,shipping.currency,fx):null;
  const itemPlusShippingPln=ratePln!==null&&Number.isFinite(itemPln)?Math.round((itemPln+ratePln)*100)/100:null;
  return {shippingToPoland:shipping.status,shippingRate:shipping.amount,
    shippingCurrency:shipping.currency,shippingRatePln:ratePln,itemPlusShippingPln,
    shippingSource:shipping.source,fxSource,fxEffectiveDate};
}
const sources=sourceDoc.sources||[];
const sourceById=new Map(sources.map(s=>[s.id,s]));
const models=(modelDoc.models||[]).filter(m=>m.enabled!==false&&(!selectedCategories||selectedCategories.has(m.category)));
const modelMeta=new Map((modelDoc.models||[]).map(m=>[m.model,m]));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function sourceForUrl(url){
  try{
    const host=new URL(url).hostname.replace(/^www\./,'');
    return sources.find(s=>(s.domains||[]).some(d=>host===d||host.endsWith('.'+d)))||null;
  }catch{return null}
}
async function fetchPage(url){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),TIMEOUT);
  try{
    const res=await fetch(url,{redirect:'follow',signal:ctrl.signal,headers:{
      'user-agent':'Mozilla/5.0 (compatible; PersonalAudioDealBoard/1.0; +https://github.com/jacquer-AI/personal-audio-deal-board)',
      'accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      'accept-language':'pl,en;q=0.8,de;q=0.6'
    }});
    const text=await res.text().catch(()=> '');
    return {http:res.status,url:res.url||url,html:text.slice(0,2000000)};
  }catch(e){return {http:0,url,html:'',error:e?.name||String(e)}}
  finally{clearTimeout(timer)}
}
async function pool(items,worker){
  let index=0;const out=[];
  async function lane(){while(index<items.length&&Date.now()<DEADLINE){const i=index++;out[i]=await worker(items[i],i);await sleep(120)}}
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,items.length||1)},lane));return out;
}

const receipt={directUrlsAttempted:0,directVerified:0,accessRestricted:0,ambiguous:0,dead:0,soldOrOut:0,notDirect:0,remoteErrors:0,sourcesRestricted:{}};
const rawObs=[];
const observe=row=>rawObs.push({schema:1,observedAt:now,runId,mode,...row});

/** Direct-page verification of one known offer. Returns an update record and records exactly one observation. */
async function checkOffer(o){
  const fp=fingerprint(o);const source=sourceForUrl(o.url);
  const stamp={fingerprint:fp,category:o.category,checkedAt:now,checked:now.slice(0,10)};
  const row={fingerprint:fp,model:o.model,condition:o.condition,sourceId:source?.id||null,url:o.url};
  if(!source||!directOfferEligible(o.url,source)||isListingUrl(o.url)){
    receipt.notDirect++;
    observe({...row,result:'NOT_DIRECT_OFFER_PAGE',pricePln:o.price});
    return {...stamp,verificationState:'NOT_DIRECT_OFFER_PAGE',http:null,note:'Refresh: source URL is discovery/listing or source cannot verify a concrete offer.'};
  }
  receipt.directUrlsAttempted++;
  const page=await fetchPage(o.url);
  const v=verificationFromHttp(page.http);
  if(v==='DEAD'){
    receipt.dead++;
    observe({...row,http:page.http,result:'DEAD',pricePln:o.price});
    return {...stamp,verificationState:'DEAD',http:page.http,status:'STALE / REVERIFY',note:'Refresh: direct URL returned '+page.http+'.'};
  }
  const {blocked,parsed}=v==='REACHABLE'||v==='ACCESS_RESTRICTED_REVERIFY'?parsePage(source,page.html,page.http):{blocked:false,parsed:null};
  if(v==='ACCESS_RESTRICTED_REVERIFY'||blocked){
    receipt.accessRestricted++;receipt.sourcesRestricted[source.id]=(receipt.sourcesRestricted[source.id]||0)+1;
    observe({...row,http:page.http,result:'ACCESS_RESTRICTED_REVERIFY',pricePln:o.price});
    return {...stamp,verificationState:'ACCESS_RESTRICTED_REVERIFY',http:page.http,note:'Refresh: source restricted automated access. Prior SSOT value retained.'};
  }
  if(page.http===0||page.http>=500){
    // Transient network/server failure: keep the previous state and ledger untouched instead of flapping.
    receipt.remoteErrors++;
    return null;
  }
  if(v!=='REACHABLE'){
    receipt.ambiguous++;
    observe({...row,http:page.http,result:v,pricePln:o.price});
    return {...stamp,verificationState:v,http:page.http,note:'Refresh: direct page could not be verified automatically.'};
  }
  const meta=modelMeta.get(o.model)||{model:o.model,aliases:[]};
  // Verify this item's own title/metadata, never a navigation/sidebar mention.
  const match=itemTitleMatchesModel(page.html,meta);
  const cond=conditionFrom(parsed,page.html);const stock=available(parsed,page.html);
  const pln=parsed?toPln(parsed.price,parsed.currency,fx):null;
  if(match&&parsed&&pln&&stock===true&&cond===o.condition){
    receipt.directVerified++;
    observe({...row,http:page.http,result:'DIRECT_OFFER_VERIFIED',pricePln:pln,currency:parsed.currency});
    // Foreign-currency price unchanged at the source: keep the stored PLN value so FX drift is not reported as a price change.
    const sameForeign=parsed.currency&&parsed.currency!=='PLN'&&toNumber(o.original)===parsed.price;
    return {...stamp,verificationState:'DIRECT_OFFER_VERIFIED',http:page.http,status:o.status,price:sameForeign?o.price:pln,original:sameForeign?o.original:parsed.price+' '+(parsed.currency||''),note:'Refresh: exact model + explicit price on direct offer page ('+parsed.via+').'};
  }
  if(match&&stock===false){
    receipt.soldOrOut++;
    observe({...row,http:page.http,result:'SOLD_OR_OUT_OF_STOCK',pricePln:o.price});
    return {...stamp,verificationState:'DIRECT_OFFER_VERIFIED',http:page.http,status:'HISTORICAL',note:'Refresh: exact model direct page is sold/out of stock.'};
  }
  receipt.ambiguous++;
  const reason=!match?'MODEL_NOT_CONFIRMED':!parsed?'PAGE_REACHABLE_PRICE_UNPARSED':!pln?'CURRENCY_UNRESOLVED':stock!==true?'AVAILABILITY_NOT_CONFIRMED':cond!==o.condition?'CONDITION_NOT_CONFIRMED':'REVERIFY';
  observe({...row,http:page.http,result:reason,pricePln:o.price});
  return {...stamp,verificationState:reason,http:page.http,note:'Refresh: '+reason+'. Prior SSOT value retained.'};
}

const inScope=o=>!selectedCategories||selectedCategories.has(o.category);
const baseFps=new Set((base.offers||[]).map(fingerprint));
const priorAdditions=(previousCurrent.additions||[]).filter(a=>!baseFps.has(fingerprint(a)));
console.log('Refresh',mode,'base offers',(base.offers||[]).length,'prior additions',priorAdditions.length,'categories',categoryArg);

const updates=(await pool((base.offers||[]).filter(o=>inScope(o)&&isEuropeRecordedOffer(o)),checkOffer)).filter(Boolean);

// Re-verify previously discovered offers so a discovered offer cannot silently go stale.
const additions=[];
const reAdds=await pool(priorAdditions.filter(o=>inScope(o)&&isEuropeRecordedOffer(o)),async a=>({a,u:await checkOffer(a)}));
for(const r of reAdds.filter(Boolean)){
  const {a,u}=r;if(!u){additions.push(a);continue}
  const first=a.refresh?.firstVerifiedAt||a.refresh?.checkedAt||now;
  if(u.verificationState==='DEAD')additions.push({...a,status:'STALE / REVERIFY',role:'OFFER',checked:u.checked,refresh:{...a.refresh,verificationState:'DEAD',http:u.http,checkedAt:now,firstVerifiedAt:first}});
  else if(u.status==='HISTORICAL')additions.push({...a,status:'HISTORICAL',role:'HISTORICAL',checked:u.checked,refresh:{...a.refresh,verificationState:'DIRECT_OFFER_VERIFIED',http:u.http,checkedAt:now,firstVerifiedAt:first}});
  else if(u.verificationState==='DIRECT_OFFER_VERIFIED')additions.push({...a,price:u.price,original:u.original,checked:u.checked,refresh:{...a.refresh,verificationState:'DIRECT_OFFER_VERIFIED',http:u.http,checkedAt:now,firstVerifiedAt:first}});
  else additions.push(a);
}
for(const a of priorAdditions.filter(a=>!inScope(a)&&isEuropeRecordedOffer(a)))additions.push(a);

const researchRechecks=await pool(
  (previousCandidates.candidates||[]).filter(c=>c.verificationState==='DIRECT_OFFER_VERIFIED'&&inScope(c) && c.region!=='GLOBAL' && c.region!=='EUROPE_UNCONFIRMED').slice(0,80),
  async c=>{
    receipt.researchRechecked=(receipt.researchRechecked||0)+1;
    const source=sourceById.get(c.sourceId);
    const meta=modelMeta.get(c.model);
    const reject=(reason,http=null)=>{
      receipt.researchDowngraded=(receipt.researchDowngraded||0)+1;
      observe({fingerprint:fingerprint({model:c.model,condition:c.condition||'UNVERIFIED',seller:c.source,url:c.url}),
        model:c.model,condition:c.condition||'UNVERIFIED',sourceId:c.sourceId,url:c.url,http,
        result:'RESEARCH_RECHECK_'+reason});
      return {...c,status:'UNVERIFIED LEAD',verificationState:'RECHECK_'+reason,verifiedAt:null,http,
        pricePln:null,originalPrice:null,currency:null,availability:null,
        priceBasis:null,shippingToPoland:'PL_SHIPPING_UNKNOWN',shippingRate:null,
        shippingCurrency:null,shippingRatePln:null,itemPlusShippingPln:null,
        shippingSource:null,redTeam:['REVERIFY_REQUIRED','NO_LANDED_COST']};
    };
    if(!source?.canVerifyOffer||!meta||!directOfferEligible(c.url,source))return reject('SOURCE_NOT_VERIFIABLE');
    const p=await fetchPage(c.url);
    if(p.http!==200)return reject('HTTP_'+p.http,p.http);
    const {blocked,parsed}=parsePage(source,p.html,p.http);
    if(blocked||!parsed)return reject(blocked?'BLOCKED':'PRICE_UNPARSED',p.http);
    if(!itemTitleMatchesModel(p.html,meta))return reject('MODEL_TITLE_MISMATCH',p.http);
    const cond=conditionFrom(parsed,''),stock=available(parsed,'');
    const price=toPln(parsed.price,parsed.currency,fx);
    if(cond!==c.condition||stock!==true||!price)return reject(stock===false?'SOLD':'PRICE_CONDITION_OR_STOCK_UNKNOWN',p.http);
    receipt.researchReverified=(receipt.researchReverified||0)+1;
    return {...c,status:'VERIFIED LEAD',verificationState:'DIRECT_OFFER_VERIFIED',
      pricePln:price,originalPrice:parsed.price,currency:parsed.currency,
      availability:'InStock',verifiedAt:now,priceBasis:priceBasis(source),
      ...shipmentEvidence(p.html,parsed.price,price),http:200};
  });
const candidates=[];
const newAdditions=[];
if(mode!=='quick'){
  const sweepSources=sources.filter(s=>s.searchUrlTemplate&&(s.id==='hifishark'||(s.region!=='GLOBAL'&&(mode==='deep'||s.sweep==='daily'))));
  const known=new Set([...(base.offers||[]),...priorAdditions].map(o=>o.url));
  // ALL models on HiFiShark, Allegro, OLX, Vinted in FULL and DEEP.
  // One European source rotates daily; additional DEEP slots explore more sources.
  const coreSourceIds=coreSourceIdsForDate(now);
  const jobs=planDiscoveryJobs(models,sweepSources,MAX_DISCOVERY_JOBS,coreSourceIds);
  const discoveryStats=Object.fromEntries(sweepSources.map(s=>[s.id,{requested:0,reachable:0,candidateUrls:0,restricted:0,errors:0}]));
  const discovered=await pool(jobs,async j=>{
    const stat=discoveryStats[j.s.id];
    stat.requested++;
    const p=await fetchPage(j.url);
    if(p.http>=200&&p.http<400)stat.reachable++;
    else if([401,403,429,451].includes(p.http))stat.restricted++;
    else stat.errors++;
    if(p.http<200||p.http>=400)return [];
    if(j.s.id==='hifishark'&&j.m.model==='Beyerdynamic DT 880'){
      const at=p.html.indexOf('/goto/');
      const sample=at>=0?p.html.slice(Math.max(0,at-420),at+1020).slice(0,1440):p.html.slice(0,650);
      console.log('HIFISHARK_HTML_DIAGNOSTIC',JSON.stringify({
        http:p.http,length:p.html.length,
        gotoOccurrences:p.html.split('/goto/').length-1,
        classMarkerOccurrences:p.html.split('search-product-row').length-1,
        priceMarkers:p.html.split('class="price"').length-1,
        snippet:sample
      }));
    }
    // HiFiShark indexes asking prices and the origin marketplace; capture both
    // at item-row level. These amounts are not a seller-price check or live stock.
    const found=j.s.id==='hifishark'
      ?discoverEuropeanHifisharkRows(p.html,j.m,8)
        .filter(x=>!known.has(x.url))
        .map(x=>({...x,category:j.m.category,quality:j.m.quality,fit:j.m.fit,
          sourceId:j.s.id,source:j.s.name,query:j.query,discoveredAt:now,
          status:'AGGREGATOR PRICE ONLY',evidence:'HIFISHARK_ITEM_ROW_PRICE'}))
      :discoverPageLinks(p.html,p.url,j.s,j.m,known,8)
        .map(url=>({model:j.m.model,category:j.m.category,quality:j.m.quality,
          fit:j.m.fit,sourceId:j.s.id,source:j.s.name,region:j.s.region,url,
          query:j.query,discoveredAt:now,status:'LEAD ONLY',evidence:'ITEM_URL_OR_ANCHOR'}));
    stat.candidateUrls+=found.length;
    return found;
  });
  receipt.discovery={plannedJobs:jobs.length,coreSources:coreSourceIds,plannedSources:Object.values(discoveryStats).filter(s=>s.requested>0).length,reachableSources:Object.values(discoveryStats).filter(s=>s.reachable>0).length,sources:discoveryStats};
  // Discovery URLs are INTERNAL INPUT, never publishable offers or even user-facing leads.
  // Round-robin by model: a prolific seller cannot consume all verification
  // slots before other headphone families receive a chance.
  const buckets=new Map(models.map(m=>[m.model,[]]));
  const seen=new Set();
  for(const rows of discovered)for(const c of rows||[]){
    if(seen.has(c.url))continue;
    seen.add(c.url);buckets.get(c.model)?.push(c);
  }
  const discoveredUrls=[];
  let left=true;
  while(left&&discoveredUrls.length<360){
    left=false;
    for(const group of buckets.values()){
      if(!group.length)continue;
      left=true;discoveredUrls.push(group.shift());
      if(discoveredUrls.length>=360)break;
    }
  }
  // Final seller verification remains mandatory for LIVE. A missing shipping
  // quote is disclosed, not a blocker; a bid/non-fixed price stays research-only.
  const verify=discoveredUrls;
  const verified=await pool(verify,async discovered=>{
    let c=discovered;
    let source=sourceById.get(c.sourceId);
    const meta=modelMeta.get(c.model);
    const stat=discoveryStats[c.sourceId];
    stat.checkedUrls=(stat.checkedUrls||0)+1;
    const observation={fingerprint:fingerprint({model:c.model,condition:'UNVERIFIED',seller:c.source,url:c.url}),model:c.model,condition:'UNVERIFIED',sourceId:c.sourceId,url:c.url};
    const reject=(reason,http=null,retain=false)=>{
      stat.unverifiedUrls=(stat.unverifiedUrls||0)+1;
      observe({...observation,http,result:'SEARCH_REJECT_'+reason});
      if(!retain)return null;
      // Preserve HiFiShark's publicly indexed asking price and EUR seller
      // marketplace as research evidence, even if the redirect returns 403.
      // Never convert it into a LIVE price or imply current availability.
      const indexed=c.askingPrice>0&&c.currency;
      const candidate={...c,status:indexed?'AGGREGATOR PRICE ONLY':'UNVERIFIED LEAD',
        verificationState:indexed?'AGGREGATOR_PRICE_ONLY':reason,
        lastVerificationFailure:reason,verifiedAt:null,http,availability:null,
        redTeam:['SELLER_NOT_VERIFIED','AVAILABILITY_UNKNOWN','SHIPPING_UNKNOWN']};
      if(indexed){
        candidate.originalPrice=c.askingPrice;
        candidate.pricePln=toPln(c.askingPrice,c.currency,fx);
        candidate.priceBasis='AGGREGATOR_INDEXED_ASK';
        candidate.fxSource=fxSource;
        candidate.fxEffectiveDate=fxEffectiveDate;
      }
      return {candidate,addition:null};
    };
    if(!source||!meta||isListingUrl(c.url)||!isPlausibleOfferLink(c.url,source))
      return reject('NOT_DIRECT_OR_MODEL');
    // HiFiShark is a valuable global discovery engine, not the item seller.
    // Follow its own /goto link ONCE to the merchant. A 403/blocked redirect
    // is disclosed, never silently elevated to a verified price or EU listing.
    let p=null;
    if(source.id==='hifishark'){
      p=await fetchPage(c.url);
      if(p.http!==200)return reject('HIFISHARK_GOTO_HTTP_'+p.http,p.http,true);
      const destination=sourceForUrl(p.url);
      if(!destination||destination.id==='hifishark'||!destination.canVerifyOffer)
        return reject('HIFISHARK_DESTINATION_NOT_VERIFIABLE',p.http,true);
      const originalUrl=c.url;
      source=destination;
      c={...c,url:p.url,sourceId:source.id,source:source.name,
        originSource:'HiFiShark',originUrl:originalUrl};
    }
    if(!source.canVerifyOffer||!directOfferEligible(c.url,source))
      return reject('SELLER_PAGE_NOT_SUPPORTED',p?.http??null,true);
    if(!p)p=await fetchPage(c.url);
    if(p.http!==200)return reject('HTTP_'+p.http,p.http,[401,403,429,451].includes(p.http));
    try{
      const expected=new URL(c.url),actual=new URL(p.url);
      if(expected.hostname!==actual.hostname||expected.pathname.replace(/[/]$/,'')!==actual.pathname.replace(/[/]$/,''))
        return reject('SELLER_REDIRECT_CHANGED_ITEM',p.http);
    }catch{return reject('SELLER_REDIRECT_CHANGED_ITEM',p.http)}
    const geo=geographicEvidence(source,p.html);
    if(!geo)return reject('SELLER_OUTSIDE_EUROPE_OR_LOCATION_UNKNOWN',p.http,false);
    c={...c,region:geo.region,country:geo.country,locationEvidence:geo.basis};
    const {blocked,parsed}=parsePage(source,p.html,p.http);
    if(blocked||!parsed)return reject(blocked?'SELLER_ACCESS_BLOCKED':'SELLER_PRICE_NOT_READABLE',p.http,true);
    if(!itemTitleMatchesModel(p.html,meta))return reject('SELLER_MODEL_TITLE_MISMATCH',p.http);
    // No text scraped from generic page boilerplate may prove an individual item is in stock.
    const condition=conditionFrom(parsed,''),stock=available(parsed,'');
    const price=toPln(parsed.price,parsed.currency,fx);
    if(stock===false)return reject('SOLD_OR_OUT_OF_STOCK',p.http);
    // A directly read, model-matched seller asking price is useful even when
    // explicit stock/condition metadata is absent. Never call this LIVE.
    if(price&&(stock!==true||!condition)){
      stat.sellerPriceOnly=(stat.sellerPriceOnly||0)+1;
      observe({...observation,result:'SELLER_PRICE_ONLY_AVAILABILITY_UNCONFIRMED',
        http:p.http,pricePln:price,currency:parsed.currency});
      return {candidate:{...c,status:'SELLER PRICE ONLY',
        verificationState:'DIRECT_PAGE_PRICE_ONLY',verifiedAt:now,http:200,
        pricePln:price,originalPrice:parsed.price,currency:parsed.currency,
        priceBasis:priceBasis(source),condition:condition||null,
        availability:'UNCONFIRMED',redTeam:['AVAILABILITY_OR_CONDITION_NOT_CONFIRMED'],
        ...shipmentEvidence(p.html,parsed.price,price)},addition:null};
    }
    if(!price)return reject('SELLER_PRICE_NOT_READABLE',p.http,true);
    const peer=(base.offers||[]).find(o=>o.model===c.model&&o.condition===condition&&Number.isFinite(o.sameMarket));
    const add={
      id:'refresh-'+createHash('sha1').update(fingerprint({model:c.model,condition,seller:c.source,url:c.url})).digest('hex').slice(0,16),
      model:c.model,category:c.category,quality:c.quality,fit:c.fit,condition,
      rrp:peer?.rrp??null,newMarket:peer?.newMarket??null,sameMarket:peer?.sameMarket??null,
      price,country:c.country,seller:c.source,region:c.region,status:condition==='USED'?'LIVE USED':'LIVE VERIFIED',
      original:parsed.price+' '+(parsed.currency||''),url:c.url,role:'OFFER',checked:now.slice(0,10),
      priceBasis:priceBasis(source),...shipmentEvidence(p.html,parsed.price,price),
      refresh:{verificationState:'DIRECT_OFFER_VERIFIED',checkedAt:now,firstVerifiedAt:now,http:p.http}
    };
    const rt=redTeam(add,source,peer);
    const candidate={...c,status:rt.block?'VERIFIED LEAD':'PRICE VERIFIED LIVE',verifiedAt:now,verificationState:'DIRECT_OFFER_VERIFIED',
      http:200,condition,pricePln:price,originalPrice:parsed.price,currency:parsed.currency,availability:'InStock',
      priceBasis:add.priceBasis,shippingToPoland:add.shippingToPoland,shippingRate:add.shippingRate,
      shippingCurrency:add.shippingCurrency,shippingRatePln:add.shippingRatePln,
      itemPlusShippingPln:add.itemPlusShippingPln,shippingSource:add.shippingSource,
      fxSource:add.fxSource,fxEffectiveDate:add.fxEffectiveDate,redTeam:rt.flags};
    stat.verifiedUrls=(stat.verifiedUrls||0)+1;
    const fp=fingerprint(add);
    if(rt.block){
      observe({fingerprint:fp,model:c.model,condition,sourceId:c.sourceId,url:c.url,http:p.http,
        result:'DIRECT_CURRENT_NOT_PURCHASABLE_'+rt.flags.join('_'),pricePln:price});
      return {candidate,addition:null};
    }
    add.note='Seller direct page verified during '+mode.toUpperCase()+': exact model, condition, asking price and stock. Displayed price excludes shipping and fees; Poland shipping not guaranteed.';
    observe({fingerprint:fp,model:c.model,condition,sourceId:c.sourceId,url:c.url,http:p.http,result:'NEW_DIRECT_OFFER_VERIFIED',pricePln:price,currency:parsed.currency});
    return {candidate,addition:add};
  });
  for(const v of verified.filter(Boolean)){
    candidates.push(v.candidate);
    if(v.addition)newAdditions.push(v.addition);
  }
  for(const a of newAdditions)if(!additions.some(x=>fingerprint(x)===fingerprint(a)))additions.push(a);
}

// Deep discovery of new model families requires separate research; unverified
// search-engine hits must never be serialized as customer-visible offers.

const current=mergeCurrent(previousCurrent,{schema:1,refreshedAt:now,mode,runId,status:'COMPLETED',updates,additions});
const merged=mergeOverlay(base,current);
const delta=computeDelta(previousRuntime.offers||[],merged.offers);

const ledgerPath='data/market-observations.jsonl';
const ledgerLines=fs.existsSync(ledgerPath)?fs.readFileSync(ledgerPath,'utf8').split(/\r?\n/).filter(Boolean):[];
const last=lastObservations(ledgerLines);
const obsAppend=dedupeObservations(rawObs,last);

const candidatesDoc={schema:2,refreshedAt:now,mode,candidates:mergeResearchCandidates(previousCandidates.candidates||[],[...researchRechecks.filter(Boolean),...candidates],now)};
const currentChanged=!materiallyEqual({...previousCurrent,status:undefined,mode:undefined},{...current,status:undefined,mode:undefined});
const candidatesChanged=!materiallyEqual(previousCandidates.candidates||[],candidatesDoc.candidates);
// Fresh seller verification is perishable evidence. Persist a positive recheck at
// least every four hours even if price is unchanged, so static Pages can prove recency.
const persistedAt=Date.parse(previousRuntime?.refresh?.refreshedAt||'');
const freshnessRenewal=receipt.directVerified>0&&(!Number.isFinite(persistedAt)||Date.now()-persistedAt>=4*60*60*1000);
const material=currentChanged||candidatesChanged||obsAppend.length>0||delta.changes.length>0||freshnessRenewal;

Object.assign(delta,{schema:1,refreshedAt:now,mode,runId,candidates:candidatesDoc.candidates?.length??0,verifiedAdditions:newAdditions.length,observationChanges:obsAppend.length,freshnessRenewal,receipt});
const summary={mode,categories:categoryArg,material,DELTA:material?'CHANGED':'NONE',receipt,
  fxSource,fxEffectiveDate,shippingToPolandEvidence:candidatesDoc.candidates?.filter(c=>c.shippingToPoland==='PL_RATE_ADVERTISED').length||0,
  newLeads:candidates.length,researchRechecked:receipt.researchRechecked||0,researchReverified:receipt.researchReverified||0,researchDowngraded:receipt.researchDowngraded||0,retainedResearchLeads:candidatesDoc.candidates?.length??0,newVerifiedOffers:newAdditions.length,deepCandidates:candidates.filter(c=>c.deep).length,priceChanged:delta.priceChanged,sold:delta.sold,stale:delta.stale,new:delta.new,observationChanges:obsAppend.length,freshnessRenewal,discoveredUrlsChecked:mode==='quick'?0:(receipt.discovery?.sources?Object.values(receipt.discovery.sources).reduce((n,x)=>n+(x.checkedUrls||0),0):0)};

if(material&&!DRY){
  fs.writeFileSync('data/market-current.json',JSON.stringify(current,null,2)+'\n');
  if(candidatesChanged)fs.writeFileSync('data/market-candidates.json',JSON.stringify(candidatesDoc,null,2)+'\n');
  if(obsAppend.length)fs.appendFileSync(ledgerPath,obsAppend.map(o=>JSON.stringify(o)).join('\n')+'\n');
  fs.writeFileSync('data/refresh-delta.json',JSON.stringify(delta,null,2)+'\n');
  const all=lastObservations(fs.readFileSync(ledgerPath,'utf8').split(/\r?\n/).filter(Boolean));
  fs.writeFileSync('data/market-stats.json',JSON.stringify({schema:1,refreshedAt:now,stats:statsFromLedger(all)},null,2)+'\n');
}
if(process.env.REFRESH_VERBOSE)console.log(delta.changes,rawObs.filter(o=>!['DIRECT_OFFER_VERIFIED'].includes(o.result)).map(o=>[o.model,o.result,o.http,o.url].join(' | ')).join(String.fromCharCode(10)));
console.log(JSON.stringify(summary,null,2));
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'changed='+(material&&!DRY)+'\ndelta='+summary.DELTA+'\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### Market refresh '+mode.toUpperCase()+' · '+categoryArg+'\n\n```json\n'+JSON.stringify(summary,null,2)+'\n```\n');
