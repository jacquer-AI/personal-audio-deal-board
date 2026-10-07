import {norm,htmlText} from './common.mjs';
import {parseGenericOffer} from './generic.mjs';

/** eBay item pages: JSON-LD Product/Offer; falls back to the visible condition label. */
export function parseEbay(html){
  const base=parseGenericOffer(html);
  if(!base)return null;
  if(base.itemCondition)return base;
  const t=norm(htmlText(html).slice(0,120000));
  const itemCondition=/\b(gebraucht|used|uzywany|uzywane)\b/.test(t)?'UsedCondition':/\b(neu|new|nowy|nowe)\b/.test(t.slice(0,4000))?'NewCondition':'';
  return {...base,itemCondition};
}

export default {id:'ebay',parse:parseEbay};
