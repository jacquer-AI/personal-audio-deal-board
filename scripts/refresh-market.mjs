import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fingerprint,verificationFromHttp,directOfferEligible,computeDelta,mergeOverlay,mergeCurrent,materiallyEqual,lastObservations,dedupeObservations,statsFromLedger,redTeam} from './market-core.mjs';
import {htmlText,modelMatches,urlMatchesModel,conditionFrom,available,toPln,toNumber,isListingUrl,isPlausibleOfferLink} from './sources/common.mjs';
import {parsePage} from './sources/index.mjs';
import {planDiscoveryJobs} from './discovery-scheduler.mjs';

const argv=process.argv.slice(2);
const arg=(name,fallback='')=>{const i=argv.indexOf('--'+name);return i>=0?argv[i+1]:fallback};
const mode=(arg('mode',process.env.REFRESH_MODE||'quick')||'quick').toLowerCase();
if(!['quick','full','deep'].includes(mode))throw new Error('mode must be quick|full|deep');
const CATEGORIES=['IEM','TWS','Closed','Głośniki BT'];
const categoryArg=arg('categories',process.env.REFRESH_CATEGORIES||'all');
if(categoryArg!=='all'&&!categoryArg.split(',').every(c=>CATEGORIES.includes(c.trim())))throw new Error('invalid categories');
const selectedCategories=categoryArg==='all'?null:new Set(categoryArg.split(',').map(x=>x.trim()));
const runId=process.env.GITHUB_RUN_ID||('local-'+Date.now());
const now=new Date().toISOString();
const TIMEOUT=Number(process.env.REFRESH_TIMEOUT_MS||12000);
const CONCURRENCY=Math.max(1,Math.min(6,Number(process.env.REFRESH_CONCURRENCY||4)));
const MAX_DISCOVERY_JOBS=Math.max(1,Math.min(240,Number(process.env.REFRESH_DISCOVERY_LIMIT||(mode==='deep'?140:60))));
const DEADLINE=Date.now()+Number(process.env.REFRESH_DEADLINE_MS||20*60*1000);
const DRY=process.env.REFRESH_DRY==='1';

const readJson=(p,fallback)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;
const sourceDoc=readJson('config/source-registry.json',{sources:[]});
const modelDoc=readJson('config/model-registry.json',{models:[]});
const base=readJson('data/offers-base.json',null)||readJson('data/offers.json',{offers:[]});
const previousRuntime=readJson('data/offers.json',base);
const previousCurrent=readJson('data/market-current.json',{updates:[],additions:[]});
const previousCandidates=readJson('data/market-candidates.json',{candidates:[]});
const fx=base.fx||{EUR:4.3,GBP:5.1,USD:3.9};
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
  const match=modelMatches(page.html,meta);
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

const updates=(await pool((base.offers||[]).filter(inScope),checkOffer)).filter(Boolean);

// Re-verify previously discovered offers so a discovered offer cannot silently go stale.
const additions=[];
const reAdds=await pool(priorAdditions.filter(inScope),async a=>({a,u:await checkOffer(a)}));
for(const r of reAdds.filter(Boolean)){
  const {a,u}=r;if(!u){additions.push(a);continue}
  const first=a.refresh?.firstVerifiedAt||a.refresh?.checkedAt||now;
  if(u.verificationState==='DEAD')additions.push({...a,status:'STALE / REVERIFY',role:'OFFER',checked:u.checked,refresh:{...a.refresh,verificationState:'DEAD',http:u.http,checkedAt:now,firstVerifiedAt:first}});
  else if(u.status==='HISTORICAL')additions.push({...a,status:'HISTORICAL',role:'HISTORICAL',checked:u.checked,refresh:{...a.refresh,verificationState:'DIRECT_OFFER_VERIFIED',http:u.http,checkedAt:now,firstVerifiedAt:first}});
  else if(u.verificationState==='DIRECT_OFFER_VERIFIED')additions.push({...a,price:u.price,original:u.original,checked:u.checked,refresh:{...a.refresh,verificationState:'DIRECT_OFFER_VERIFIED',http:u.http,checkedAt:now,firstVerifiedAt:first}});
  else additions.push(a);
}
for(const a of priorAdditions.filter(a=>!inScope(a)))additions.push(a);

const candidates=[];
const newAdditions=[];
if(mode!=='quick'){
  const sweepSources=sources.filter(s=>s.searchUrlTemplate&&(mode==='deep'||s.sweep==='daily'));
  const known=new Set([...(base.offers||[]),...priorAdditions].map(o=>o.url));
  const jobs=planDiscoveryJobs(models,sweepSources,MAX_DISCOVERY_JOBS);
  const discoveryStats=Object.fromEntries(sweepSources.map(s=>[s.id,{requested:0,reachable:0,candidateUrls:0,restricted:0,errors:0}]));
  const discovered=await pool(jobs,async j=>{
    const stat=discoveryStats[j.s.id];
    stat.requested++;
    const p=await fetchPage(j.url);
    if(p.http>=200&&p.http<400)stat.reachable++;
    else if([401,403,429,451].includes(p.http))stat.restricted++;
    else stat.errors++;
    if(p.http<200||p.http>=400)return [];
    const links=[];const re=/href=["']([^"'#]+)["']/gi;let x;
    while((x=re.exec(p.html))&&links.length<80){
      try{
        const u=new URL(x[1],p.url).toString();
        const src=sourceForUrl(u);
        if(src?.id!==j.s.id||isListingUrl(u)||!isPlausibleOfferLink(u,src)||!urlMatchesModel(u,j.m)||known.has(u))continue;
        if(!links.includes(u))links.push(u);
      }catch{/* unparsable href */}
    }
    const found=links.slice(0,2).map(url=>({model:j.m.model,category:j.m.category,quality:j.m.quality,fit:j.m.fit,sourceId:j.s.id,source:j.s.name,region:j.s.region,url,query:j.query,discoveredAt:now,status:'LEAD ONLY'}));
    stat.candidateUrls+=found.length;
    return found;
  });
  receipt.discovery={plannedJobs:jobs.length,plannedSources:Object.values(discoveryStats).filter(s=>s.requested>0).length,reachableSources:Object.values(discoveryStats).filter(s=>s.reachable>0).length,sources:discoveryStats};
  const seen=new Set();
  for(const rows of discovered)for(const c of rows||[]){if(seen.has(c.url)||candidates.length>=120)continue;seen.add(c.url);candidates.push(c)}

  // A lead becomes an offer only after a concrete final seller page verifies model, condition, price and stock.
  const verify=candidates.filter(c=>sourceById.get(c.sourceId)?.canVerifyOffer).slice(0,40);
  await pool(verify,async c=>{
    const source=sourceById.get(c.sourceId);
    const p=await fetchPage(c.url);if(p.http<200||p.http>=300)return;
    if(!directOfferEligible(c.url,source))return;
    const {blocked,parsed}=parsePage(source,p.html,p.http);if(blocked||!parsed)return;
    const meta=modelMeta.get(c.model);if(!meta||!urlMatchesModel(c.url,meta)||!modelMatches(p.html,meta))return;
    // Never infer listing condition/availability from generic page boilerplate.
    const cond=conditionFrom(parsed,''),stock=available(parsed,''),pln=toPln(parsed.price,parsed.currency,fx);
    if(!cond||!pln||stock!==true)return;
    const peer=(base.offers||[]).find(o=>o.model===c.model&&o.condition===cond&&Number.isFinite(o.sameMarket));
    const add={
      id:'refresh-'+createHash('sha1').update(fingerprint({model:c.model,condition:cond,seller:c.source,url:c.url})).digest('hex').slice(0,16),
      model:c.model,category:c.category,quality:c.quality,fit:c.fit,condition:cond,
      rrp:peer?.rrp??null,newMarket:peer?.newMarket??null,sameMarket:peer?.sameMarket??null,
      price:pln,country:c.region,seller:c.source,region:c.region,status:cond==='USED'?'LIVE USED':'LIVE VERIFIED',
      original:parsed.price+' '+(parsed.currency||''),url:c.url,role:'OFFER',checked:now.slice(0,10),
      refresh:{verificationState:'DIRECT_OFFER_VERIFIED',checkedAt:now,firstVerifiedAt:now,http:p.http}
    };
    const rt=redTeam(add,source,peer);
    add.note='Discovered and verified on direct offer page during '+mode.toUpperCase()+' refresh. Red-team flags: '+rt.flags.join(', ')+'.';
    const fp=fingerprint(add);
    if(rt.block){c.redTeam=rt.flags;c.status='LEAD ONLY';observe({fingerprint:fp,model:c.model,condition:cond,sourceId:c.sourceId,url:c.url,http:p.http,result:'RED_TEAM_BLOCKED',pricePln:pln});return}
    newAdditions.push(add);
    observe({fingerprint:fp,model:c.model,condition:cond,sourceId:c.sourceId,url:c.url,http:p.http,result:'NEW_DIRECT_OFFER_VERIFIED',pricePln:pln,currency:parsed.currency});
  });
  for(const a of newAdditions)if(!additions.some(x=>fingerprint(x)===fingerprint(a)))additions.push(a);
}

if(mode==='deep'){
  // Challenger discovery: isolated in market-candidates.json, never scored, never an offer.
  const broad=['high end IEM used sale Europe','audiophile TWS open box Europe','closed audiophile headphones B-stock Europe','premium Bluetooth speaker outlet Europe'];
  await pool(broad,async query=>{
    const p=await fetchPage('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query));
    if(p.http<200||p.http>=400)return;
    const re=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let x,n=0;
    while((x=re.exec(p.html))&&n<8){
      let u=x[1];try{u=decodeURIComponent(new URL(u,'https://duckduckgo.com').searchParams.get('uddg')||u)}catch{/* keep raw */}
      candidates.push({model:null,category:null,sourceId:'web-deep',source:'Web discovery',region:'UE/unknown',url:u,title:htmlText(x[2]).trim(),query,discoveredAt:now,status:'UNADJUDICATED',deep:true});n++;
    }
  });
}

const current=mergeCurrent(previousCurrent,{schema:1,refreshedAt:now,mode,runId,status:'COMPLETED',updates,additions});
const merged=mergeOverlay(base,current);
const delta=computeDelta(previousRuntime.offers||[],merged.offers);

const ledgerPath='data/market-observations.jsonl';
const ledgerLines=fs.existsSync(ledgerPath)?fs.readFileSync(ledgerPath,'utf8').split(/\r?\n/).filter(Boolean):[];
const last=lastObservations(ledgerLines);
const obsAppend=dedupeObservations(rawObs,last);

const candidatesDoc=mode==='quick'?previousCandidates:{schema:1,refreshedAt:now,mode,candidates};
const currentChanged=!materiallyEqual({...previousCurrent,status:undefined,mode:undefined},{...current,status:undefined,mode:undefined});
const candidatesChanged=mode!=='quick'&&!materiallyEqual(previousCandidates.candidates||[],candidates);
const material=currentChanged||candidatesChanged||obsAppend.length>0||delta.changes.length>0;

Object.assign(delta,{schema:1,refreshedAt:now,mode,runId,candidates:candidatesDoc.candidates?.length??0,verifiedAdditions:newAdditions.length,observationChanges:obsAppend.length,receipt});
const summary={mode,categories:categoryArg,material,DELTA:material?'CHANGED':'NONE',receipt,newLeads:candidates.length,newVerifiedOffers:newAdditions.length,deepCandidates:candidates.filter(c=>c.deep).length,priceChanged:delta.priceChanged,sold:delta.sold,stale:delta.stale,new:delta.new,observationChanges:obsAppend.length};

if(material&&!DRY){
  fs.writeFileSync('data/market-current.json',JSON.stringify(current,null,2)+'\n');
  if(mode!=='quick')fs.writeFileSync('data/market-candidates.json',JSON.stringify(candidatesDoc,null,2)+'\n');
  if(obsAppend.length)fs.appendFileSync(ledgerPath,obsAppend.map(o=>JSON.stringify(o)).join('\n')+'\n');
  fs.writeFileSync('data/refresh-delta.json',JSON.stringify(delta,null,2)+'\n');
  const all=lastObservations(fs.readFileSync(ledgerPath,'utf8').split(/\r?\n/).filter(Boolean));
  fs.writeFileSync('data/market-stats.json',JSON.stringify({schema:1,refreshedAt:now,stats:statsFromLedger(all)},null,2)+'\n');
}
if(process.env.REFRESH_VERBOSE)console.log(delta.changes,rawObs.filter(o=>!['DIRECT_OFFER_VERIFIED'].includes(o.result)).map(o=>[o.model,o.result,o.http,o.url].join(' | ')).join(String.fromCharCode(10)));
console.log(JSON.stringify(summary,null,2));
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'changed='+(material&&!DRY)+'\ndelta='+summary.DELTA+'\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### Market refresh '+mode.toUpperCase()+' · '+categoryArg+'\n\n```json\n'+JSON.stringify(summary,null,2)+'\n```\n');
