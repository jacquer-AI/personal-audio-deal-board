import {norm,htmlText,urlMatchesModel,isListingUrl,isPlausibleOfferLink} from './common.mjs';

function decodeEntities(s=''){
  return String(s)
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=> {
      const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);
      return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
    });
}
function nameEvidence(label,model){
  const t=norm(decodeEntities(htmlText(String(label).slice(0,500))));
  if(!t||t.length>350)return false;
  const joined=t.replace(/\s+/g,'');
  return [model?.model,...(model?.aliases||[])].some(name=>{
    const n=norm(name);
    return n.length>=5 && ((' '+t+' ').includes(' '+n+' ') || (n.replace(/\s+/g,'').length>=6&&joined.includes(n.replace(/\s+/g,''))));
  });
}
function belongsToSource(url,source){
  try{
    const host=new URL(url).hostname.replace(/^www\./,'').toLowerCase();
    return (source?.domains||[]).some(d=>host===d || host.endsWith('.'+d));
  }catch{return false}
}

/** Discover concrete listing URLs from anchored result cards. Name evidence can
 * come from the item URL or that item's own anchor, never unrelated page text.
 * All outputs are UNVERIFIED leads until the seller page is checked. */
export function discoverPageLinks(html,pageUrl,source,model,known=new Set(),limit=6){
  const candidates=[];
  const seen=new Set();
  // Bounded extraction prevents huge pages from monopolizing this run.
  const re=/<a\b([^>]{0,2000})>([\s\S]{0,3000}?)<\/a\s*>/gi;
  let match; let scanned=0;
  while((match=re.exec(String(html))) && scanned++<2500 && candidates.length<limit){
    const attrs=match[1];
    const raw=attrs.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if(!raw)continue;
    try{
      const url=new URL(decodeEntities(raw[1]||raw[2]||raw[3]),pageUrl).toString();
      if(!belongsToSource(url,source)||isListingUrl(url)||!isPlausibleOfferLink(url,source)||known.has(url)||seen.has(url))continue;
      const label=[match[2],attrs.match(/\b(?:aria-label|title)\s*=\s*["']([^"']+)["']/i)?.[1]||''].join(' ');
      if(!urlMatchesModel(url,model)&&!nameEvidence(label,model))continue;
      seen.add(url);candidates.push(url);
    }catch{/* reject malformed href */}
  }
  return candidates;
}
