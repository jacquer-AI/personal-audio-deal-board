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
  return titles.some(t=>{
    const words=' '+norm(t)+' ',compact=norm(t).replace(/\s+/g,'');
    return expected.some(n=>words.includes(' '+n+' ')||(n.replace(/\s+/g,'').length>=6&&compact.includes(n.replace(/\s+/g,''))));
  });
}
/** The listing can be a bid/offer without a guaranteed buy-now price.
 * Price parsed from page metadata is only an indicative research signal. */
export function priceBasis(source){
  return source?.id==='marktplaats-nl'?'METADATA_MAY_BE_BID':'SELLER_PAGE_PRICE';
}
