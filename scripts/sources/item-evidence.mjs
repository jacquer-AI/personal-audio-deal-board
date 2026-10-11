import {norm,htmlText,jsonLdBlocks,walk} from './common.mjs';

const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ');
const bounded=html=>String(html||'').slice(0,2000000);

/** Only evidence from this item's own title, not seller recommendations or
 * a site-wide product suggestion. Fail closed if product title is missing. */
export function itemTitleEvidence(html){
  const src=bounded(html),names=[];
  const title=src.match(/<title\b[^>]*>([\s\S]{0,400}?)<\/title>/i)?.[1];
  if(title)names.push(decode(htmlText(title)));
  for(const m of src.matchAll(/<meta\b[^>]{0,600}>/gi)){
    const tag=m[0],id=tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]||'';
    if(!['og:title','twitter:title'].includes(id.toLowerCase()))continue;
    const value=tag.match(/\bcontent\s*=\s*["']([^"']{1,350})["']/i)?.[1];
    if(value)names.push(decode(value));
  }
  for(const ld of jsonLdBlocks(src)){
    walk(ld,obj=>{
      const type=String(obj['@type']||'');
      if(/Product/i.test(type)&&typeof obj.name==='string')names.push(obj.name.slice(0,350));
    });
  }
  return names.slice(0,12);
}
export function itemTitleMatchesModel(html,model){
  const expected=[model?.model,...(model?.aliases||[])].map(norm).filter(n=>n.length>=5);
  const titles=itemTitleEvidence(html);
  // A family-name prefix is not evidence of the exact commercial variant.
  // These are distinct products, with different specifications and prices.
  const knownVariantConflicts={
    'hifiman svanar wireless':/\bsvanar wireless (?:jr|le)\b/,
    'focal clear mg':/\bclear mg (?:professional|pro)\b/,
    'thieaudio monarch mkii':/\bmonarch (?:mk ?iii|iii|3)\b/,
    'thieaudio monarch mkiii':/\bmonarch (?:mk ?ii|ii|2)\b/,
    'etymotic er4s':/\ber4sr\b/,
    'beyerdynamic dt 1990 pro':/\bdt\s?1990\s?pro\s?(?:mk\s?ii|mkii|mk2|2nd|ii)\b/
    'sony mdr m1':/\bmdr m1st\b/,
    'beyerdynamic dt 48 25 ohm':/\bdt\s?48(?:\s?[a-z])?\s?(?:200|250|5)\s?(?:ohm|ohms)?\b/,
  };
  const conflict=knownVariantConflicts[norm(model?.model)];
  return titles.some(t=>{
    const normalized=norm(t);
    if(conflict?.test(normalized))return false;
    const words=' '+normalized+' ',compact=normalized.replace(/\s+/g,'');
    return expected.some(n=>words.includes(' '+n+' ')||(n.replace(/\s+/g,'').length>=6&&compact.includes(n.replace(/\s+/g,''))));
  });
}
/** The listing can be a bid/offer without a guaranteed buy-now price.
 * Price parsed from page metadata is only an indicative research signal. */
export function priceBasis(source){
  return source?.id==='marktplaats-nl'?'METADATA_MAY_BE_BID':'SELLER_PAGE_PRICE';
}
