import {norm,htmlText,toNumber} from './common.mjs';
import {europeCountryFromLabel} from './europe-scope.mjs';

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
const currencyTokens=[
 ['EUR','(?:€|EUR)'],
 ['PLN','(?:PLN|zł)'],
 ['GBP','(?:£|GBP)'],
 ['NOK','NOK'],['DKK','DKK'],['SEK','SEK'],['CHF','CHF'],
 ['HUF','HUF'],['CZK','CZK'],['UAH','UAH']
];
/** The native asking price must be a whole currency amount, never a partial
 * regex prefix. Both €90 and 90 € are common on EU-localized HiFiShark.
 * Remove group separators only after capturing the complete amount. */
export function aggregatorAskingPrice(s){
 const input=String(s||'')
  .replace(/&(?:euro|#8364|#x20ac);?/gi,'€')
  .replace(/&(?:pound|#163|#xa3);?/gi,'£')
  .replace(/&(?:nbsp|#160|#xa0);?/gi,' ')
  .replace(/&amp;/gi,'&').replace(/[\u00a0\u202f]/g,' ');
 const amount='([0-9]+(?:[\\s.,][0-9]+)*)';
 for(const [currency,token] of currencyTokens){
  const head=new RegExp('(?:^|[^A-Za-z0-9])('+token+')\\s*'+amount+'(?![0-9])','i');
  const tail=new RegExp('(?:^|[^A-Za-z0-9])'+amount+'\\s*('+token+')(?![A-Za-z0-9])','i');
  const match=input.match(head)||input.match(tail);
  if(!match)continue;
  const isPrefix=Boolean(input.match(head));
  const rawAmount=isPrefix?match[2]:match[1];
  const price=toNumber(rawAmount.trim());
  if(!price)return null;
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
/** Parse ONLY an individual HiFiShark result anchor, never the whole search
 * page. HiFiShark uses <a class="search-product-row"> cards, not table <tr>.
 * The price is the <strong> inside that item's <span class="price">.
 * The country flag is per-item aggregator market-location evidence.
 */
export function discoverEuropeanHifisharkRows(html,model,limit=8){
 const results=[],seen=new Set();
 const audit={}; const trace=key=>{audit[key]=(audit[key]||0)+1};
 const rows=[...String(html).matchAll(/<a\b([^>]{0,2500})>([\s\S]{0,12000}?)<\/a\s*>/gi)].slice(0,1800);
 for(const rowMatch of rows){
  if(results.length>=limit)break;
  const attrs=rowMatch[1],body=rowMatch[2];
  if(!/\bsearch-product-row\b/i.test(attrs)){trace('NOT_CARD');continue}
  const raw=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  if(!raw){trace('NO_HREF');continue}
  let url;
  try{
   url=new URL(raw.replace(/&amp;/g,'&'),'https://www.hifishark.com/').toString();
   const u=new URL(url);
   if(u.hostname.replace(/^www\./,'')!=='hifishark.com'||!u.pathname.startsWith('/goto/')){trace('URL_REJECTED');continue}
  }catch{trace('URL_THROW');continue}
  if(seen.has(url)){trace('DUPLICATE');continue}
  const itemHtml=body.match(/<span\b[^>]*class=["'][^"']*\bsearch-product-title\b[^"']*["'][^>]*>([\s\S]{0,900}?)(?:<\/span>)/i)?.[1]||'';
  const item=htmlText(itemHtml).trim();
  if(!item||!matchModel(item,model)){trace('MODEL_NOT_MATCHED');continue}

  const siteHtml=body.match(/<div\b[^>]*class=["'][^"']*\bwebsite-grid\b[^"']*["'][^>]*>([\s\S]{0,800}?)<\/div>/i)?.[1]||'';
  const siteText=htmlText(siteHtml).trim();
  const localized=europeanMarketplace(siteText);
  const flagTags=[...body.matchAll(/<img\b[^>]{0,600}>/gi)];
  const flag=flagTags.find(m=>/\bclass\s*=\s*["'][^"']*\bflag\b/i.test(m[0]));
  const flagName=flag?.[0].match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1]||'';
  const flagCountry=flagName?europeCountryFromLabel(flagName):null;
  // The presence of an explicit outside-Europe/unknown country flag must
  // take precedence over a European marketplace domain.
  if(flagName&&!flagCountry){trace('COUNTRY_FLAG_NOT_EU');continue}
  const country=flagCountry||localized?.country;
  if(!country){trace('NO_EU_COUNTRY');continue}
  const region=country==='Polska'?'Polska':
    ['Wielka Brytania','Norwegia','Szwajcaria','Ukraina','Islandia'].includes(country)
      ?'non-EU / TLC':'UE';

  // Real HiFiShark cards sometimes place nested spans BEFORE the asking-price
  // <strong>. Stopping at the first </span> drops every price in such cards.
  // Anchor boundaries already isolate the item; search a bounded price window.
  const priceOpen=body.match(/<span\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>/i);
  const priceAt=priceOpen?body.indexOf(priceOpen[0])+priceOpen[0].length:-1;
  const priceWindow=priceAt>=0?body.slice(priceAt,priceAt+1400):'';
  const priceText=priceWindow.match(/<strong\b[^>]*>([\s\S]{0,160}?)<\/strong>/i)?.[1]||'';
  // Read text from only THIS item's price section; the discount metadata
  // and strike-through original price are not seller asking-price evidence.
  const currentPriceWindow=priceWindow.split(/<span\b[^>]*class=["'][^"']*\bprice-converted\b/i)[0];
  const price=aggregatorAskingPrice(htmlText(priceText))||
    aggregatorAskingPrice(htmlText(currentPriceWindow));
  if(!price){
    if(model?.model==='Beyerdynamic DT 880'&&!audit.PRICE_NOT_PARSED)
      console.log('HIFISHARK_PRICE_FAILURE_SAMPLE',JSON.stringify({
        open:priceOpen?.[0]||null,strong:priceText,
        window:priceWindow.slice(0,900),visible:htmlText(priceWindow).slice(0,300)
      }));
    trace('PRICE_NOT_PARSED');continue;
  }
  const date=body.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+20\d{2}\b/i)?.[0]||null;
  trace('ACCEPTED');seen.add(url);results.push({url,model:model.model,site:siteText||localized?.site||'HiFiShark',
    country,region,locationEvidence:flagCountry?'HIFISHARK_ITEM_COUNTRY_FLAG':'EUROPEAN_MARKETPLACE_NOT_SELLER',
    askingPrice:price.originalPrice,currency:price.currency,askingPriceText:price.originalPriceText,
    aggregatorListedDate:date,source:'HiFiShark',verificationState:'AGGREGATOR_PRICE_ONLY'});
 }
 if(model?.model==='Beyerdynamic DT 880')console.log('HIFISHARK_PARSER_STAGES',JSON.stringify({rows:rows.length,...audit}));
 return results;
}
