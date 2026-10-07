import {toNumber,norm,htmlText} from './common.mjs';
import {parseGenericOffer} from './generic.mjs';

/** OLX ad pages: JSON-LD when present, otherwise the embedded ad-state price; condition from the "Stan" parameter. */
export function parseOlx(html){
  const base=parseGenericOffer(html);
  const t=norm(htmlText(html).slice(0,120000));
  const itemCondition=/\bstan\s+(nowe|nowy)\b/.test(t)?'NewCondition':/\bstan\s+uzywane\b/.test(t)?'UsedCondition':'';
  if(base)return {...base,itemCondition:base.itemCondition||itemCondition};
  const m=html.match(/"price"\s*:\s*\{[^}]*?"value"\s*:\s*([0-9.]+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/);
  const price=m&&toNumber(m[1]);
  return price?{price,currency:m[2],availability:'',itemCondition,via:'OLX_STATE'}:null;
}

export default {id:'olx',parse:parseOlx};
