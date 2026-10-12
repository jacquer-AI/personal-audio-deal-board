import fs from 'node:fs';

// Exact catalog pages, NOT a general search-results scrape. A marketplace's
// model-family headline is not evidence that every offer is the same impedance.
export const SOURCES = [
  {model:'Beyerdynamic DT 880',url:'https://www.ceneo.pl/5810846',
   titleTokens:['beyerdynamic','dt880','pro'],
   variant:'DT 880 Pro (impedancja ceny indeksowej nieustalona)',
   fallback:{url:'https://supersound.pl/60737-beyerdynamic-dt-880-pro-250-ohm-studio-headphones-for-mixing-and-mastering-semi-open',
     titleTokens:['beyerdynamic','dt880','pro','250'],variant:'DT 880 Pro 250 Ω',source:'Supersound.pl',host:'supersound.pl'},
   secondary:{url:'https://www.cyfrowe.pl/sluchawki-beyerdynamic-sluchawki-polotwarte-dt-880-pro-250-ohm-p.html',
     titleTokens:['beyerdynamic','dt880','pro','250'],variant:'DT 880 Pro 250 Ω',source:'Cyfrowe.pl',host:'www.cyfrowe.pl'},
   tertiary:{url:'https://www.profi-dj.pl/dt-880-pro-250-ohm/',
     titleTokens:['dt880','pro','250'],brandToken:'beyerdynamic',
     variant:'DT 880 Pro 250 Ω',source:'Profi-dj.pl',host:'www.profi-dj.pl'}},
  {model:'AKG K702',url:'https://www.ceneo.pl/28644030',
   titleTokens:['akg','k702'],variant:'AKG K702',
   fallback:{url:'https://www.thomann.pl/akg_k702.htm',titleTokens:['akg','k702'],
     variant:'AKG K702',source:'Thomann.pl',host:'www.thomann.pl'}},
  {model:'HIFIMAN Edition XS',url:'https://www.ceneo.pl/124339502',
   titleTokens:['hifiman','editionxs'],variant:'HIFIMAN Edition XS',
   fallback:{url:'https://www.thomann.pl/hifiman_edition_xs.htm',titleTokens:['hifiman','editionxs'],
     variant:'HIFIMAN Edition XS',source:'Thomann.pl',host:'www.thomann.pl'}}
];
const decode = s => String(s||'').replace(/&nbsp;|&#160;|&#xa0;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const plain = s => decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const compact = s => plain(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');
const readPln = s => {
  const t=String(s||'').replace(/[\u00a0\u202f\s]/g,'');
  if(!/^\d{2,5}(?:[,.]\d{2})?$/.test(t))return null;
  const n=Number(t.replace(',','.'));
  return Number.isFinite(n)&&n>=150&&n<=50000?n:null;
};
function scopedAmount(fragment) {
  // Currency is mandatory; bare digits, ratings, installments and MSRP aren't prices.
  const re=/(?:^|[^0-9])(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[,.]\d{2})?)\s*(?:zł|PLN)(?![a-z])/gi;
  for(const m of plain(fragment).matchAll(re)) {
    const n=readPln(m[1]);
    if(n!==null)return n;
  }
  return null;
}
function jsonPrice(html,titleTokenString) {
  for(const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]{0,120000}?)<\/script>/gi)){
    let root;try{root=JSON.parse(match[1]);}catch{continue;}
    const stack=[root];
    for(let count=0;stack.length&&count<500;count++){
      const item=stack.pop();
      if(Array.isArray(item)){stack.push(...item);continue}
      if(!item||typeof item!=='object')continue;
      if(Array.isArray(item['@graph']))stack.push(...item['@graph']);
      const type=String(item['@type']||'').toLowerCase();
      if(!type.includes('product')||!compact(item.name).includes(titleTokenString))continue;
      const offers=Array.isArray(item.offers)?item.offers:[item.offers];
      for(const offer of offers) {
        if(!offer||typeof offer!=='object')continue;
        // Product page index, not a retailer-confirmed checkout or fixed buy-now.
        const value=offer.lowPrice??offer.price;
        if(offer.priceCurrency&&String(offer.priceCurrency).toUpperCase()!=='PLN')continue;
        const n=readPln(String(value||''));
        if(n!==null)return n;
      }
    }
  }
  return null;
}
export function parseCeneoIndex(html,config) {
  const input=String(html||'');
  if(input.length<100||/captcha|access denied|verify you are human/i.test(input.slice(0,2500)))
    return {error:'BLOCKED_OR_EMPTY'};
  const h=input.match(/<h1\b[^>]*>([\s\S]{0,1600}?)<\/h1\s*>/i);
  if(!h)return {error:'NO_PRODUCT_H1'};
  const title=plain(h[1]),code=compact(title);
  if(!config.titleTokens.every(t=>code.includes(compact(t))))
    return {error:'WRONG_PRODUCT_TITLE',title};
  if(!/ofert|sklep|sprzedawc/i.test(input))return {error:'NOT_OFFER_INDEX',title};
  // Ceneo product header is scoped from the specific H1 to the first offers H2.
  // Do not take prices from "other products", paid ads or global page footer.
  let local=input.slice(h.index+h[0].length,h.index+h[0].length+12000);
  const cut=local.search(/<h2\b/i);
  if(cut>=0)local=local.slice(0,cut);
  const fromHero=scopedAmount(local);
  const fromStructured=jsonPrice(input,config.titleTokens.map(compact).join(''));
  const value=fromHero??fromStructured;
  if(value===null)return {error:'NO_PRODUCT_SCOPED_PLN_PRICE',title};
  return {pricePln:value,title,method:fromHero!==null?'PRODUCT_HEADER_PLN':'PRODUCT_JSONLD_PLN'};
}

/** Read a matched product page's local retail price. Does not establish stock. */
export function parseVendorReference(html, config) {
  const input=String(html||'');
  if(input.length<100||/captcha|access denied|verify you are human/i.test(input.slice(0,2000)))
    return {error:'BLOCKED_OR_EMPTY'};
  const h=input.match(/<h1\b[^>]*>([\s\S]{0,1800}?)<\/h1\s*>/i);
  if(!h)return {error:'NO_PRODUCT_H1'};
  const title=plain(h[1]),code=compact(title);
  if(!config.titleTokens.every(token=>code.includes(compact(token))))
    return {error:'WRONG_PRODUCT_TITLE',title};
  if(config.brandToken && !compact(input.slice(0,20000)).includes(compact(config.brandToken)))
    return {error:'BRAND_NOT_CONFIRMED',title};
  const after=input.slice(h.index+h[0].length,h.index+h[0].length+65000);
  const structured=jsonPrice(input,config.titleTokens.map(compact).join(''));
  let price=null,method=null;
  if(config.host==='www.thomann.pl'){
    const marker=after.search(/Ceny z podatkiem VAT/i);
    if(marker>=0){
      // The price closest to the retail VAT marker, not recommended products.
      const window=plain(after.slice(Math.max(0,marker-900),marker));
      const candidates=[...window.matchAll(/(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[,.]\d{2})?)\s*(?:zł|PLN)(?![a-z])/gi)]
        .map(x=>readPln(x[1])).filter(x=>x!==null);
      if(candidates.length){price=candidates.at(-1);method='THOMANN_PRICE_BEFORE_VAT';}
    }
  }else if(config.host==='supersound.pl'){
    const marker=after.search(/Cena brutto/i);
    if(marker>=0){
      price=scopedAmount(after.slice(marker,marker+1700));
      if(price!==null)method='SUPER_SOUND_GROSS_PRICE';
    }
  }else if(config.host==='www.cyfrowe.pl'){
    // A site-specific, bounded hero price: NOT installments, bundles or related offers.
    // The product heading must explicitly identify the 250-ohm PRO revision.
    const hero=after.slice(0,7000).split(/Wybierz swój zestaw|Zestawy promocyjne|Akcesoria|<h2\b/i)[0];
    // Preserve HTML block boundaries; product SKU ending in 250 must not
    // concatenate with next product price (e.g. "250 826,00 zł").
    const productArea=plain(hero.replace(/<\/[^>]+>/g,' | '));
    const candidates=[...productArea.matchAll(/(?:^|[^\d])(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[,.]\d{2})?)\s*(?:zł|PLN)(?![a-z])/gi)]
      .map(m=>readPln(m[1])).filter(n=>n!==null);
    if(candidates.length && /Kod produktu|Cena:|Do koszyka|price/i.test(productArea)){
      price=candidates[0]; method='CYFROWE_PRODUCT_HERO';
    }
  }
  if(price===null&&structured!==null){price=structured;method='RETAILER_PRODUCT_JSONLD';}
  if(price===null)return {error:'NO_PRODUCT_SCOPED_PLN_PRICE',title};
  return {pricePln:price,title,method};
}
export function applyRetailChecks(previous, checks, observedAt, minRenewHours=24) {
  const doc=structuredClone(previous),t=Date.parse(observedAt);
  if(!Number.isFinite(t))throw new Error('invalid observedAt');
  let changed=false;
  const audit=[];
  for(const source of SOURCES){
    const prev=doc.references.find(r=>r.model===source.model);
    const check=checks.get(source.model);
    if(!prev){audit.push({model:source.model,status:'SOURCE_NOT_CONFIGURED'});continue}
    if(!check?.pricePln){audit.push({model:source.model,status:check?.error||'NO_EVIDENCE_KEEP_OLD'});continue}
    // Unexpected magnitude changes need human review, not automated promotion.
    if(check.pricePln<prev.pricePln*0.55 || check.pricePln>prev.pricePln*1.75){
      audit.push({model:source.model,status:'PRICE_ANOMALY_KEEP_OLD',observed:check.pricePln,previous:prev.pricePln});
      continue;
    }
    const oldTime=Date.parse(prev.observedAt||'');
    const renew=!Number.isFinite(oldTime)||t-oldTime>=minRenewHours*3600000;
    const priceChanged=Math.abs(prev.pricePln-check.pricePln)>=0.005;
    const variantChanged=prev.variant!==(check.variant||source.variant);
    const sourceChanged=prev.url!==(check.url||source.url)||prev.source!==(check.source||'Ceneo.pl');
    if(renew||priceChanged||variantChanged||sourceChanged){
      prev.pricePln=check.pricePln;
      prev.variant=check.variant||source.variant;
      prev.url=check.url||source.url;
      prev.observedAt=observedAt;
      prev.evidence='INDEXED_RETAIL_ASKING_PRICE';
      prev.source=check.source||'Ceneo.pl';
      changed=true;
    }
    audit.push({model:source.model,status:priceChanged?'PRICE_UPDATED':renew||variantChanged||sourceChanged?'RECONFIRMED':'UNCHANGED',
      pricePln:check.pricePln,method:check.method,source:check.source||'Ceneo.pl'});
  }
  return {doc,changed,audit};
}
export async function refreshRetail({fetcher=fetch,now=new Date().toISOString(),dryRun=false,readPath='data/retail-price-references.json'}={}) {
  const before=JSON.parse(fs.readFileSync(readPath,'utf8'));
  const checked=new Map();

  for(const s of SOURCES) {
    let verified=null;
    for(const endpoint of [{...s,source:'Ceneo.pl',kind:'CENEO'}, {...s.fallback,kind:'VENDOR'}, ...(s.secondary?[{...s.secondary,kind:'VENDOR'}]:[]), ...(s.tertiary?[{...s.tertiary,kind:'VENDOR'}]:[])]){
      if(verified?.pricePln)break;
      try{
        const response=await fetcher(endpoint.url,{signal:AbortSignal.timeout(11000),redirect:'follow',
          headers:{'user-agent':'Mozilla/5.0 (compatible; AudioDealBoard/1.0)','accept':'text/html','accept-language':'pl-PL,pl;q=0.9,en;q=0.5'}});
        const u=new URL(response.url||endpoint.url),wanted=new URL(endpoint.url);
        if(u.protocol!=='https:'||u.hostname!==wanted.hostname||u.pathname!==wanted.pathname)throw new Error('REDIRECT_CHANGED_PRODUCT');
        if(response.status!==200)throw new Error('HTTP_'+response.status);
        const type=response.headers?.get?.('content-type')||'text/html';
        if(!type.includes('text/html'))throw new Error('NOT_HTML');
        const body=(await response.text()).slice(0,2_000_000);
        const parsed=endpoint.kind==='CENEO'?parseCeneoIndex(body,endpoint):parseVendorReference(body,endpoint);
        if(parsed.pricePln)verified={...parsed,url:endpoint.url,variant:endpoint.variant,source:endpoint.source};
        else{
          console.log('RETAIL_SOURCE_DIAGNOSTIC',JSON.stringify({model:s.model,
            source:endpoint.kind,http:response.status,bytes:body.length,
            hasH1:body.toLowerCase().includes('<h1'),hasJsonLd:body.includes('ld+json'),
            failure:parsed.error}));
          checked.set(s.model,{error:parsed.error});
        }
      }catch(e){checked.set(s.model,{error:String(e?.message||e).slice(0,100)});}
    }
    if(verified)checked.set(s.model,verified);
  }
  const result=applyRetailChecks(before,checked,now);
  if(result.changed&&!dryRun)fs.writeFileSync(readPath,JSON.stringify(result.doc,null,2)+'\n');
  return {...result,changed:result.changed&&!dryRun};
}
const self=process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1];
if(self){
  const dryRun=process.argv.includes('--dry-run')||process.env.REFRESH_RETAIL_DRY==='1';
  const result=await refreshRetail({dryRun});
  console.log('RETAIL_REFERENCE_AUDIT',JSON.stringify({changed:result.changed,dryRun,audit:result.audit}));
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'retail_changed='+result.changed+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### Retail references · Ceneo / exact retailers (research only)\n\n'+result.audit.map(a=>
        '- '+a.model+': '+a.status+(a.pricePln?' · '+a.pricePln+' PLN':'')).join('\n')+'\n\n');
}
