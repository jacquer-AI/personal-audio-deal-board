import {norm,htmlText,toNumber} from './common.mjs';

/** Strict geographic marketplace identity. HiFiShark is worldwide; a currency
 * or a .de mirror alone does not locate the merchant. This allowlist admits
 * European locally scoped marketplaces, but labels seller location unconfirmed.
 * Global marketplaces (eBay, Head-Fi, Reverb) have no geographic proof. */
const LOCAL_SITES=[
 ['OLX Poland','Polska','Polska',/^olx\s+poland$/i],
 ['Subito','Włochy','UE',/^subito$/i],
 ['Kleinanzeigen','Niemcy','UE',/^kleinanzeigen$/i],
 ['willhaben.at','Austria','UE',/^willhaben\.at$/i],
 ['Marktplaats','Holandia','UE',/^marktplaats$/i],
 ['tori.fi','Finlandia','UE',/^tori\.fi$/i],
 ['Jófogás','Węgry','UE',/^j[oó]fog[aá]s$/i],
 ['Bazos Slovakia','Słowacja','UE',/^bazos\s+slovakia$/i],
 ['2dehands BE','Belgia','UE',/^2dehands\s+be$/i],
 ['2ememain','Belgia','UE',/^2ememain$/i],
 ['Den Blå Avis','Dania','UE',/^den\s+bl[aå]\s+avis$/i],
 ['Finn','Norwegia','non-EU / TLC',/^finn$/i],
 ['SpringAir','Niemcy','UE',/^springair$/i],
 ['il Gazeboaudiofilo','Włochy','UE',/^il\s+gazeboaudiofilo$/i],
 ['OLX Ukraine','Ukraina','non-EU / TLC',/^olx\s+ukraine$/i]
];
export function europeanMarketplace(label){
 const site=String(label||'').trim();
 const row=LOCAL_SITES.find(entry=>entry[3].test(site));
 return row?{site:row[0],country:row[1],region:row[2],locationEvidence:'EUROPEAN_MARKETPLACE_NOT_SELLER'}:null;
}
const patterns=[
 /(?:€|EUR)\s*([0-9][0-9\s.,]*)/i,
 /(?:PLN|zł)\s*([0-9][0-9\s.,]*)/i,
 /(?:£|GBP)\s*([0-9][0-9\s.,]*)/i,
 /(?:NOK|DKK|SEK|CHF|HUF|CZK|UAH)\s*([0-9][0-9\s.,]*)/i
];
const currencyOf=['EUR','PLN','GBP','OTHER'];
export function aggregatorAskingPrice(s){
 const input=String(s||'');
 for(let i=0;i<patterns.length;i++){
  const match=input.match(patterns[i]);
  if(!match)continue;
  const price=toNumber(match[1].trim());
  if(!price)return null;
  const currency=i===3?match[0].slice(0,3).toUpperCase():currencyOf[i];
  return {originalPrice:price,currency,originalPriceText:match[0].trim()};
 }
 return null;
}
function matchModel(value,model){
 const full=norm(value);
 const compact=full.replace(/\s/g,'');
 const options=[model?.model,...(model?.aliases||[])].filter(Boolean).map(norm).filter(x=>x.length>4);
 if(!options.some(x=>(' '+full+' ').includes(' '+x+' ')||(x.replace(/\s/g,'').length>=6&&compact.includes(x.replace(/\s/g,'')))))return false;
 if(norm(model?.model)==='etymotic er4s' && /\ber4sr\b/.test(full))return false;
 if(norm(model?.model)==='beyerdynamic dt 1990 pro' && /dt 1990 pro (?:mk\s?ii|mkii|mk2|ii)\b/.test(full))return false;
 return true;
}
/** Parse only a complete result row with one /goto item link, known European
 * marketplace label and its OWN asking price. Never infer price from global
 * page text, recommendation links, sidebar or unrelated rows.
 * Optional date is the listing's index date, NOT live seller verification.
 */
export function discoverEuropeanHifisharkRows(html,model,limit=8){
 const results=[],seen=new Set();
 const rows=[...String(html).matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].slice(0,1200);
 for(const rowMatch of rows){
  if(results.length>=limit)break;
  const row=rowMatch[0];
  const goto=[...row.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*\/goto\/[^"']+)["'][^>]*>/gi)];
  if(goto.length!==1)continue;
  let url;
  try{url=new URL(goto[0][1].replace(/&amp;/g,'&'),'https://www.hifishark.com/').toString();
   if(new URL(url).hostname.replace(/^www\./,'')!=='hifishark.com'||!new URL(url).pathname.startsWith('/goto/'))continue;
  }catch{continue}
  if(seen.has(url))continue;
  const anchors=[...row.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)].map(a=>htmlText(a[1]).trim());
  const item=anchors.find(a=>matchModel(a,model));
  if(!item)continue;
  // Only named European marketplace cells may locate an aggregator lead.
  const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(m=>htmlText(m[1]).trim());
  const site=cells.map(europeanMarketplace).find(Boolean)||anchors.map(europeanMarketplace).find(Boolean);
  if(!site)continue;
  const price=cells.map(aggregatorAskingPrice).find(Boolean);
  if(!price)continue;
  const date=row.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+20\d{2}\b/i)?.[0]||null;
  seen.add(url);results.push({url,model:model.model,site:site.site,country:site.country,region:site.region,
    locationEvidence:site.locationEvidence,askingPrice:price.originalPrice,
    currency:price.currency,askingPriceText:price.originalPriceText,
    aggregatorListedDate:date,source:'HiFiShark',verificationState:'AGGREGATOR_PRICE_ONLY'});
 }
 return results;
}
