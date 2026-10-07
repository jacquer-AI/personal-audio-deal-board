export const norm=s=>String(s||'').toLowerCase().replace(/ł/g,'l').normalize('NFKD').replace(/\p{M}+/gu,'').replace(/[^a-z0-9]+/g,' ').trim();

export function htmlText(html){
  return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');
}

const listingHints=['/listing','/kategoria/','/sch/','/search','/szukaj','/s?k=','/q/','/oferty/q-','/app/search'];
export function isListingUrl(url){
  try{const u=new URL(url);const s=(u.pathname+u.search).toLowerCase();return listingHints.some(x=>s.includes(x));}catch{return true}
}

export function modelMatches(html,meta){
  const t=norm(htmlText(html).slice(0,300000));
  const names=[meta.model,...(meta.aliases||[])].map(norm).filter(Boolean);
  return names.some(n=>n.length>3&&t.includes(n));
}

export function jsonLdBlocks(html){
  const out=[];const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;
  while((m=re.exec(html))){try{out.push(JSON.parse(m[1].trim()))}catch{/* malformed block is ignored */}}
  return out;
}

export function walk(x,fn){
  if(Array.isArray(x)){for(const v of x)walk(v,fn);return}
  if(x&&typeof x==='object'){fn(x);for(const v of Object.values(x))walk(v,fn)}
}

export function toNumber(v){
  const n=Number(String(v??'').replace(/[^0-9.,]/g,'').replace(',','.'));
  return Number.isFinite(n)&&n>0?n:null;
}

export function conditionFrom(parsed,html){
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

export function available(parsed,html){
  const a=String(parsed?.availability||'').toLowerCase();
  if(/outofstock|soldout|discontinued/.test(a))return false;
  if(/instock|preorder|limitedavailability/.test(a))return true;
  // Microdata (itemprop availability href) when JSON-LD carries no availability.
  const micro=html.match(/schema\.org\/(InStock|OutOfStock|SoldOut|Discontinued|PreOrder|LimitedAvailability)/i)?.[1]?.toLowerCase();
  if(micro)return /^(instock|preorder|limitedavailability)$/.test(micro);
  // Free text counts only for explicit listing-ended phrases; generic "unavailable" text is boilerplate on shop pages.
  const t=norm(htmlText(html).slice(0,100000));
  if(/ogloszenie (jest )?nieaktywne|angebot beendet|dieser artikel ist nicht mehr verfugbar|this listing has ended|listing ended|ten przedmiot nie jest juz dostepny/.test(t))return false;
  return null;
}

export function toPln(price,currency,fx={EUR:4.3,GBP:5.1,USD:3.9}){
  if(!Number.isFinite(price))return null;
  if(!currency||currency==='PLN')return Math.round(price*100)/100;
  const rate=fx[currency];
  return Number.isFinite(rate)?Math.round(price*rate*100)/100:null;
}

const BLOCK_MARKERS=/captcha|datadome|cf-chl|just a moment|access denied|are you a robot|verify you are human|px-captcha|robot check|pardon our interruption/i;
export function looksBlocked(html,http){
  if([401,403,429,451].includes(http))return true;
  return http===200&&html.length<60000&&BLOCK_MARKERS.test(html)&&!/application\/ld\+json/i.test(html);
}

/** Discovery hrefs that can plausibly be a concrete offer page: not an asset, not a site root/category stub. */
export function isPlausibleOfferLink(url){
  try{
    const u=new URL(url);
    if(/\.(svg|ico|png|jpe?g|gif|webp|css|js|json|xml|woff2?|pdf)$/i.test(u.pathname))return false;
    return u.pathname.replace(/\/+$/,'').length>=12;
  }catch{return false}
}
