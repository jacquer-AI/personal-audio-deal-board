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

/** An accessory can mention the exact model without being the headphones. */
export function accessoryOnlyListing(html){
  const src=bounded(html),descriptions=[];
  for(const m of src.matchAll(/<meta\b[^>]{0,1200}>/gi)){
    const tag=m[0];
    const id=tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if(!['description','og:description','twitter:description'].includes(id))continue;
    const value=tag.match(/\bcontent\s*=\s*["']([^"']{1,900})["']/i)?.[1];
    if(value)descriptions.push(norm(decode(value)));
  }
  for(const block of jsonLdBlocks(src)){
    walk(block,obj=>{
      if(/Product/i.test(String(obj['@type']||''))&&typeof obj.description==='string')
        descriptions.push(norm(obj.description.slice(0,900)));
    });
  }
  const descriptionsAreParts=descriptions.some(d=>
    /^(?:vendo|vendesi|selling|verkaufe|sprzedam|for sale|in vendita)\s+(?:(?:un|una|uno|il|la|a|the|solo|only)\s+){0,3}(?:cavo|cable|kabel|pads?|earpads?|cuscinett[oi]|nauszniki|custodia|case|stand|headband|adapter|adattatore)\b/.test(d));
  const titlesAreParts=itemTitleEvidence(src).map(norm).some(t=>
    /\b(?:cavo|cable|kabel|earpads?|pads?|custodia|case|headband|adapter|adattatore)\s+(?:per|for|fur|fuer|do|para|pour)\s+/.test(t)||
    /\b(?:only|solo|nur|replacement|ricambio|ersatz)\s+(?:cavo|cable|kabel|earpads?|pads?|custodia|case|headband)\b/.test(t));
  return descriptionsAreParts||titlesAreParts;
}

export function itemTitleMatchesModel(html,model){
  const expected=[model?.model,...(model?.aliases||[])].map(norm).filter(n=>n.length>=5);
  const titles=itemTitleEvidence(html);
  if(accessoryOnlyListing(html))return false;
  // A family-name prefix is not evidence of the exact commercial variant.
  // These are distinct products, with different specifications and prices.
  const knownVariantConflicts={
    'hifiman svanar wireless':/\bsvanar wireless (?:jr|le)\b/,
    'focal clear mg':/\bclear mg (?:professional|pro)\b/,
    'thieaudio monarch mkii':/\bmonarch (?:mk ?iii|iii|3)\b/,
    'thieaudio monarch mkiii':/\bmonarch (?:mk ?ii|ii|2)\b/,
    'etymotic er4s':/\ber4sr\b/,
    'beyerdynamic dt 1990 pro':/\bdt\s?1990\s?pro\s?(?:mk\s?ii|mkii|mk2|2nd|ii)\b/,
    // A single shared price for DT 700 and DT 900 is not an exact per-model quote.
    'beyerdynamic dt 900 pro x':/\bdt\s?700\s?pro\s?x\b/,
    'beyerdynamic dt 700 pro x':/\bdt\s?900\s?pro\s?x\b/,
    'sony mdr m1':/\bmdr m1st\b/,
    'beyerdynamic dt 48 25 ohm':/\bdt\s?48(?:\s?[a-z])?\s?(?:200|250|5)\s?(?:ohm|ohms)?\b/,
    '7hz timeless':/\b(?:7hz|7hertz)\s*timeless\s*(?:ae|anniversary edition|x ae)\b/,
    // HD 800 (original) and HD 800 S have materially different tuning/value.
    'sennheiser hd 800':/\bhd\s?800\s?s\b/,
  };
  const conflict=knownVariantConflicts[norm(model?.model)];
  // Conflicting evidence in ANY item-title channel blocks promotion. A generic
  // Product JSON-LD name must not override a more precise OG title (e.g. Timeless AE).
  const normalizedTitles=titles.map(norm);
  if(conflict&&normalizedTitles.some(t=>conflict.test(t)))return false;
  return normalizedTitles.some(normalized=>{
    const words=' '+normalized+' ',compact=normalized.replace(/\s+/g,'');
    return expected.some(n=>words.includes(' '+n+' ')||(n.replace(/\s+/g,'').length>=6&&compact.includes(n.replace(/\s+/g,''))));
  });
}
/** The listing can be a bid/offer without a guaranteed buy-now price.
 * Price parsed from page metadata is only an indicative research signal. */
/**
 * Marktplaats public ad state associates the exact itemId with priceInfo:
 * {priceCents: 24000, priceType:"FIXED"}. Both FIXED and BID may contain a
 * numerical price. Accept only one item-bound FIXED quote consistent with the
 * parsed EUR seller-page price; all ambiguous and unsupported states fail closed.
 * https://api.marktplaats.nl/docs/v2/reference/price-models.html
 */
export function marktplaatsFixedPriceEvidence(html, itemUrl, parsed){
  if(parsed?.currency!=='EUR'||!Number.isFinite(parsed?.price)||parsed.price<=0)return false;
  const id=String(itemUrl||'').match(/\/(m\d+)(?:[-/?#]|$)/)?.[1];
  if(!id)return false;
  const body=String(html||'').slice(0,2000000);
  const items=[...body.matchAll(/"itemId"\s*:\s*"(m\d+)"/gi)];
  const priceInfos=[...body.matchAll(/"priceInfo"\s*:\s*\{\s*"priceCents"\s*:\s*(\d{1,12})\s*,\s*"priceType"\s*:\s*"([^"]{1,30})"\s*\}/gi)];
  // One primary item and one explicit price model only. Related-price blocks
  // or contradictory item ids are never grounds for a LIVE promotion.
  if(items.length!==1||priceInfos.length!==1)return false;
  if(items[0][1].toLowerCase()!==id.toLowerCase())return false;
  const info=priceInfos[0];
  if(info[2]!=='FIXED')return false;
  if(info.index<items[0].index||info.index-items[0].index>650)return false;
  // itemId and priceInfo must be sibling keys in the SAME item object,
  // not merely two occurrences near an unrelated recommendation.
  let depth=0,quoted=false,escaped=false;
  for(const ch of body.slice(items[0].index+items[0][0].length,info.index)){
    if(escaped){escaped=false;continue}
    if(ch==='\\'&&quoted){escaped=true;continue}
    if(ch==='"'){quoted=!quoted;continue}
    if(quoted)continue;
    if(ch==='{')depth++;
    else if(ch==='}'){depth--;if(depth<0)return false}
  }
  if(depth!==0||quoted)return false;
  const cents=Number(info[1]);
  return Number.isSafeInteger(cents)&&cents>0&&Math.round(parsed.price*100)===cents;
}
/** No marketplace-wide exemption: Marktplaats becomes SELLER_PAGE_PRICE
 * solely after fresh, item-bound, exact-EUR fixed-price proof. */
export function priceBasis(source,html='',itemUrl='',parsed=null){
  if(source?.id!=='marktplaats-nl')return 'SELLER_PAGE_PRICE';
  return marktplaatsFixedPriceEvidence(html,itemUrl,parsed)
    ?'SELLER_PAGE_PRICE':'METADATA_MAY_BE_BID';
}
