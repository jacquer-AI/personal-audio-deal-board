import fs from 'node:fs';
import {fingerprint,verificationFromHttp,directOfferEligible,computeDelta,marketStats} from './market-core.mjs';

const argv=process.argv.slice(2);
const arg=(name,fallback='')=>{const i=argv.indexOf('--'+name);return i>=0?argv[i+1]:fallback};
const mode=(arg('mode',process.env.REFRESH_MODE||'quick')||'quick').toLowerCase();
if(!['quick','full','deep'].includes(mode))throw new Error('mode must be quick|full|deep');
const categoryArg=arg('categories',process.env.REFRESH_CATEGORIES||'all');
const selectedCategories=categoryArg==='all'?null:new Set(categoryArg.split(',').map(x=>x.trim()).filter(Boolean));
const runId=process.env.GITHUB_RUN_ID||('local-'+Date.now());
const now=new Date().toISOString();
const TIMEOUT=Number(process.env.REFRESH_TIMEOUT_MS||12000);
const CONCURRENCY=Math.max(1,Math.min(6,Number(process.env.REFRESH_CONCURRENCY||4)));
const MAX_DISCOVERY_JOBS=Math.max(1,Math.min(240,Number(process.env.REFRESH_DISCOVERY_LIMIT||(mode==='deep'?140:60))));

const sourceDoc=JSON.parse(fs.readFileSync('config/source-registry.json','utf8'));
const modelDoc=JSON.parse(fs.readFileSync('config/model-registry.json','utf8'));
const basePath=fs.existsSync('data/offers-base.json')?'data/offers-base.json':'data/offers.json';
const base=JSON.parse(fs.readFileSync(basePath,'utf8'));
const previousRuntime=fs.existsSync('data/offers.json')?JSON.parse(fs.readFileSync('data/offers.json','utf8')):base;
const fx=base.fx||{EUR:4.3,GBP:5.1,USD:3.9};
const sources=sourceDoc.sources||[];
const sourceById=new Map(sources.map(s=>[s.id,s]));
const models=(modelDoc.models||[]).filter(m=>m.enabled!==false&&(!selectedCategories||selectedCategories.has(m.category)));
const modelMeta=new Map(models.map(m=>[m.model,m]));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const listingHints=['/listing','/kategoria/','/sch/','/search','/szukaj','/s?k=','/q/','/oferty/q-','/app/search'];
function isListingUrl(url){
  try{const u=new URL(url);const s=(u.pathname+u.search).toLowerCase();return listingHints.some(x=>s.includes(x));}catch{return true}
}
function sourceForUrl(url){
  try{
    const host=new URL(url).hostname.replace(/^www\./,'');
    return sources.find(s=>(s.domains||[]).some(d=>host===d||host.endsWith('.'+d)))||null;
  }catch{return null}
}
function htmlText(html){
  return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');
}
function modelMatches(html,meta){
  const t=norm(htmlText(html).slice(0,300000));
  const names=[meta.model,...(meta.aliases||[])].map(norm).filter(Boolean);
  return names.some(n=>n.length>3&&t.includes(n));
}
function jsonLdBlocks(html){
  const out=[];const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;
  while((m=re.exec(html))){try{out.push(JSON.parse(m[1].trim()))}catch{}}
  return out;
}
function walk(x,fn){
  if(Array.isArray(x)){for(const v of x)walk(v,fn);return}
  if(x&&typeof x==='object'){fn(x);for(const v of Object.values(x))walk(v,fn)}
}
function parseOffer(html){
  let found=null;
  for(const block of jsonLdBlocks(html)){
    walk(block,obj=>{
      if(found)return;
      const type=Array.isArray(obj['@type'])?obj['@type'].join(' '):String(obj['@type']||'');
      if(/Offer|AggregateOffer/i.test(type)||obj.price||obj.lowPrice){
        const price=Number(String(obj.price??obj.lowPrice??'').replace(/[^0-9.,]/g,'').replace(',','.'));
        const currency=String(obj.priceCurrency||'').toUpperCase();
        const availability=String(obj.availability||'');
        const itemCondition=String(obj.itemCondition||'');
        if(Number.isFinite(price)&&price>0)found={price,currency,availability,itemCondition,via:'JSON_LD'};
      }
    });
  }
  if(found)return found;
  const meta=(name)=>{const re=new RegExp("<meta[^>]+(?:property|name|itemprop)=[\\\"']"+name+"[\\\"'][^>]+content=[\\\"']([^\\\"']+)","i");return html.match(re)?.[1]||null};
  const amount=meta('product:price:amount')||meta('price')||meta('og:price:amount');
  const currency=meta('product:price:currency')||meta('priceCurrency')||meta('og:price:currency');
  const price=Number(String(amount||'').replace(/[^0-9.,]/g,'').replace(',','.'));
  return Number.isFinite(price)&&price>0?{price,currency:String(currency||'').toUpperCase(),availability:'',itemCondition:'',via:'META'}:null;
}
function conditionFrom(parsed,html){
  const c=String(parsed?.itemCondition||'').toLowerCase();
  if(c.includes('newcondition'))return 'NEW';
  if(c.includes('usedcondition'))return 'USED';
  if(c.includes('refurbishedcondition'))return 'B-STOCK';
  const t=norm(htmlText(html).slice(0,120000));
  if(/\b(b stock|b ware|outlet|powystaw|ausstellungsstuck|ex demo|ex display)\b/.test(t))return 'B-STOCK';
  if(/\b(open box|otwarte pudelko|offene verpackung|scatola aperta|caja abierta|open doos)\b/.test(t))return 'OPEN-BOX';
  if(/\b(used|gebraucht|uzywan|pre owned|second hand|usato|segunda mano|tweedehands|gebruikt)\b/.test(t))return 'USED';
  return null;
}
function available(parsed,html){
  const a=String(parsed?.availability||'').toLowerCase();
  if(/outofstock|soldout|discontinued/.test(a))return false;
  if(/instock|preorder|limitedavailability/.test(a))return true;
  const t=norm(htmlText(html).slice(0,100000));
  if(/sold out|out of stock|wyprzedane|niedostepny|nicht verfugbar|nicht lieferbar/.test(t))return false;
  return null;
}
function toPln(price,currency){
  if(!Number.isFinite(price))return null;
  if(!currency||currency==='PLN')return Math.round(price*100)/100;
  const rate=fx[currency];
  return Number.isFinite(rate)?Math.round(price*rate*100)/100:null;
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
  async function lane(){while(index<items.length){const i=index++;out[i]=await worker(items[i],i);await sleep(120)}}
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,items.length||1)},lane));return out;
}
function observation(row){
  return JSON.stringify({schema:1,observedAt:now,runId,mode,...row});
}

const offers=(base.offers||[]).filter(o=>!selectedCategories||selectedCategories.has(o.category));
const updates=[];
const obs=[];
console.log('Refresh',mode,'offers',offers.length,'categories',categoryArg);
await pool(offers,async o=>{
  const fp=fingerprint(o);const source=sourceForUrl(o.url);
  if(!source||!directOfferEligible(o.url,source)||isListingUrl(o.url)){
    updates.push({fingerprint:fp,checkedAt:now,checked:now.slice(0,10),verificationState:'NOT_DIRECT_OFFER_PAGE',http:null,note:'Refresh: source URL is discovery/listing or source cannot verify a concrete offer.'});
    obs.push(observation({fingerprint:fp,model:o.model,condition:o.condition,sourceId:source?.id||null,url:o.url,result:'NOT_DIRECT_OFFER_PAGE',pricePln:o.price}));
    return;
  }
  const page=await fetchPage(o.url);const v=verificationFromHttp(page.http);
  if(v==='DEAD'){
    updates.push({fingerprint:fp,checkedAt:now,checked:now.slice(0,10),verificationState:'DEAD',http:page.http,status:'STALE / REVERIFY',note:'Refresh: direct URL returned '+page.http+'.'});
    obs.push(observation({fingerprint:fp,model:o.model,condition:o.condition,sourceId:source.id,url:o.url,http:page.http,result:'DEAD',pricePln:o.price}));
    return;
  }
  if(v!=='REACHABLE'){
    updates.push({fingerprint:fp,checkedAt:now,checked:now.slice(0,10),verificationState:v,http:page.http,note:'Refresh: direct page could not be verified automatically.'});
    obs.push(observation({fingerprint:fp,model:o.model,condition:o.condition,sourceId:source.id,url:o.url,http:page.http,result:v,pricePln:o.price}));
    return;
  }
  const meta=modelMeta.get(o.model)||{model:o.model,aliases:[]};
  const parsed=parseOffer(page.html);const match=modelMatches(page.html,meta);
  const cond=conditionFrom(parsed,page.html);const stock=available(parsed,page.html);
  const pln=parsed?toPln(parsed.price,parsed.currency):null;
  if(match&&parsed&&pln&&stock!==false&&(!cond||cond===o.condition)){
    updates.push({fingerprint:fp,checkedAt:now,checked:now.slice(0,10),verificationState:'DIRECT_OFFER_VERIFIED',http:page.http,status:o.status,price:pln,original:parsed.price+' '+(parsed.currency||''),note:'Refresh: exact model + explicit price on direct offer page ('+parsed.via+').'});
    obs.push(observation({fingerprint:fp,model:o.model,condition:o.condition,sourceId:source.id,url:o.url,http:page.http,result:'DIRECT_OFFER_VERIFIED',pricePln:pln,currency:parsed.currency}));
  }else if(match&&stock===false){
    updates.push({fingerprint:fp,checkedAt:now,checked:now.slice(0,10),verificationState:'DIRECT_OFFER_VERIFIED',http:page.http,status:'HISTORICAL',note:'Refresh: exact model direct page is sold/out of stock.'});
    obs.push(observation({fingerprint:fp,model:o.model,condition:o.condition,sourceId:source.id,url:o.url,http:page.http,result:'SOLD_OR_OUT_OF_STOCK',pricePln:o.price}));
  }else{
    const reason=!match?'MODEL_NOT_CONFIRMED':!parsed?'PAGE_REACHABLE_PRICE_UNPARSED':!pln?'CURRENCY_UNRESOLVED':'CONDITION_NOT_CONFIRMED';
    updates.push({fingerprint:fp,checkedAt:now,checked:now.slice(0,10),verificationState:reason,http:page.http,note:'Refresh: '+reason+'. Prior SSOT value retained.'});
    obs.push(observation({fingerprint:fp,model:o.model,condition:o.condition,sourceId:source.id,url:o.url,http:page.http,result:reason,pricePln:o.price}));
  }
});

const candidates=[];
const additions=[];
if(mode!=='quick'){
  const sweepSources=sources.filter(s=>s.searchUrlTemplate&&(mode==='deep'||s.sweep==='daily'));
  const existingUrls=new Set((base.offers||[]).map(o=>o.url));
  const jobs=[];
  for(const m of models){
    for(const s of sweepSources){
      const term=(s.queryTerms||[])[0]||'';
      const query=[m.model,term].filter(Boolean).join(' ');
      const url=s.searchUrlTemplate.replace('{q}',encodeURIComponent(query));
      jobs.push({m,s,query,url});
    }
  }
  const discovered=await pool(jobs,async j=>{
    const p=await fetchPage(j.url);
    if(p.http<200||p.http>=400)return [];
    const links=[];const re=/href=["']([^"'#]+)["']/gi;let x;
    while((x=re.exec(p.html))&&links.length<80){
      try{
        const u=new URL(x[1],p.url).toString();
        const src=sourceForUrl(u);
        if(src?.id!==j.s.id||isListingUrl(u)||existingUrls.has(u))continue;
        if(!links.includes(u))links.push(u);
      }catch{}
    }
    return links.slice(0,2).map(url=>({model:j.m.model,category:j.m.category,quality:j.m.quality,fit:j.m.fit,sourceId:j.s.id,source:j.s.name,region:j.s.region,url,query:j.query,discoveredAt:now,status:'LEAD ONLY'}));
  });
  for(const rows of discovered)for(const c of rows)candidates.push(c);
  const unique=[];const seen=new Set();
  for(const c of candidates){if(seen.has(c.url))continue;seen.add(c.url);unique.push(c)}
  candidates.length=0;candidates.push(...unique.slice(0,120));

  const verify=candidates.filter(c=>sourceById.get(c.sourceId)?.canVerifyOffer).slice(0,40);
  await pool(verify,async c=>{
    const p=await fetchPage(c.url);if(p.http<200||p.http>=300)return;
    const meta=modelMeta.get(c.model);if(!meta||!modelMatches(p.html,meta))return;
    const parsed=parseOffer(p.html),cond=conditionFrom(parsed,p.html),stock=available(parsed,p.html),pln=parsed?toPln(parsed.price,parsed.currency):null;
    if(!parsed||!cond||!pln||stock!==true)return;
    const source=sourceById.get(c.sourceId);if(!directOfferEligible(c.url,source))return;
    const peer=(base.offers||[]).find(o=>o.model===c.model&&o.condition===cond&&Number.isFinite(o.sameMarket));
    additions.push({
      id:'refresh-'+fingerprint({model:c.model,condition:cond,seller:c.source,url:c.url}).slice(0,18),
      model:c.model,category:c.category,quality:c.quality,fit:c.fit,condition:cond,
      rrp:peer?.rrp??null,newMarket:peer?.newMarket??null,sameMarket:peer?.sameMarket??null,
      price:pln,country:c.region,seller:c.source,region:c.region,status:cond==='USED'?'LIVE USED':'LIVE VERIFIED',
      original:parsed.price+' '+(parsed.currency||''),url:c.url,
      note:'Discovered and verified on direct offer page during '+mode.toUpperCase()+' refresh.',
      role:'OFFER',checked:now.slice(0,10),
      refresh:{verificationState:'DIRECT_OFFER_VERIFIED',checkedAt:now,http:p.http}
    });
    obs.push(observation({fingerprint:fingerprint({model:c.model,condition:cond,seller:c.source,url:c.url}),model:c.model,condition:cond,sourceId:c.sourceId,url:c.url,http:p.http,result:'NEW_DIRECT_OFFER_VERIFIED',pricePln:pln,currency:parsed.currency}));
  });
}

if(mode==='deep'){
  const broad=[
    'high end IEM used sale Europe',
    'audiophile TWS open box Europe',
    'closed audiophile headphones B-stock Europe',
    'premium Bluetooth speaker outlet Europe'
  ];
  await pool(broad,async query=>{
    const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(query);
    const p=await fetchPage(url);if(p.http<200||p.http>=400)return;
    const re=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let x,n=0;
    while((x=re.exec(p.html))&&n<8){
      let u=x[1];try{u=decodeURIComponent(new URL(u,'https://duckduckgo.com').searchParams.get('uddg')||u)}catch{}
      candidates.push({model:null,category:null,sourceId:'web-deep',source:'Web discovery',region:'UE/unknown',url:u,title:htmlText(x[2]).trim(),query,discoveredAt:now,status:'UNADJUDICATED',deep:true});n++;
    }
  });
}

const current={schema:1,refreshedAt:now,mode,runId,status:'COMPLETED',updates,additions};
fs.writeFileSync('data/market-current.json',JSON.stringify(current,null,2)+'\n');
fs.writeFileSync('data/market-candidates.json',JSON.stringify({schema:1,refreshedAt:now,mode,candidates},null,2)+'\n');
if(obs.length)fs.appendFileSync('data/market-observations.jsonl',obs.join('\n')+'\n');

const baseByFingerprint=new Map((base.offers||[]).map(o=>[fingerprint(o),o]));
const nextOffers=(base.offers||[]).map(o=>{
  const u=updates.find(x=>x.fingerprint===fingerprint(o));
  if(!u)return o;
  const n={...o};
  if(u.verificationState==='DEAD')n.status='STALE / REVERIFY';
  if(u.status==='HISTORICAL')n.status='HISTORICAL';
  if(u.verificationState==='DIRECT_OFFER_VERIFIED'&&Number.isFinite(u.price))n.price=u.price;
  return n;
}).concat(additions.filter(a=>!baseByFingerprint.has(fingerprint(a))));
const delta=computeDelta(previousRuntime.offers||[],nextOffers);
Object.assign(delta,{schema:1,refreshedAt:now,mode,runId,candidates:candidates.length,verifiedAdditions:additions.length});
fs.writeFileSync('data/refresh-delta.json',JSON.stringify(delta,null,2)+'\n');

const grouped=new Map();
for(const line of fs.readFileSync('data/market-observations.jsonl','utf8').split(/\r?\n/).filter(Boolean)){
  try{const o=JSON.parse(line);const k=[o.model,o.condition].join('|');if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(o)}catch{}
}
const stats=[...grouped.entries()].map(([key,rows])=>({key,...marketStats(rows)}));
fs.writeFileSync('data/market-stats.json',JSON.stringify({schema:1,refreshedAt:now,stats},null,2)+'\n');
console.log(JSON.stringify({mode,runId,updates:updates.length,candidates:candidates.length,verifiedAdditions:additions.length,delta},null,2));
