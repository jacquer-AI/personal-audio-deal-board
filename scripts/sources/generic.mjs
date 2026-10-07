import {toNumber} from './common.mjs';
import {parseJsonLdOffer} from './retailer-jsonld.mjs';

function meta(html,name){
  const re=new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']'+name+'["\'][^>]+content=["\']([^"\']+)','i');
  return html.match(re)?.[1]||null;
}

/** JSON-LD first, then product/og meta tags. Never guesses a price from body text. */
export function parseGenericOffer(html){
  const ld=parseJsonLdOffer(html);
  if(ld)return ld;
  const price=toNumber(meta(html,'product:price:amount')||meta(html,'price')||meta(html,'og:price:amount'));
  if(!price)return null;
  const currency=String(meta(html,'product:price:currency')||meta(html,'priceCurrency')||meta(html,'og:price:currency')||'').toUpperCase();
  return {price,currency,availability:'',itemCondition:'',via:'META'};
}

export default {id:'generic',parse:parseGenericOffer};
