import {weights} from './board';

export type ResearchSortable={
  model:string;url:string;pricePln?:number|null;price?:number|null;currency?:string;
  originalPrice?:number;quality?:string;fit?:number|null;
};
/** Indexed HiFiShark prices have no reliable B4B or same-state/new-price benchmark.
 * Compare native PLN only when rate conversion is missing; never compare raw
 * EUR/GBP numbers with PLN as if currencies were interchangeable. */
export function pricePln(c:ResearchSortable):number|null {
 const converted=c.pricePln??c.price;
 if(typeof converted==='number'&&Number.isFinite(converted)&&converted>0)return converted;
 if(c.currency==='PLN'&&typeof c.originalPrice==='number'&&Number.isFinite(c.originalPrice)&&c.originalPrice>0)return c.originalPrice;
 return null;
}
export function researchSortExplanation(sort:string):string {
 if(['b4b','discount','savings'].includes(sort))
   return 'HiFiShark: cena rosnąco. B4B i rabatów nie obliczamy bez zweryfikowanych cen porównawczych.';
 if(sort==='quality'||sort==='fit')
   return 'HiFiShark: ocena przypisana modelowi; brakujące oceny na końcu. To nie ocena stanu ogłoszenia.';
 if(sort==='price_desc')return 'HiFiShark: cena malejąco; bez kursu PLN — na końcu.';
 if(sort==='price')return 'HiFiShark: cena rosnąco; bez kursu PLN — na końcu.';
 return 'HiFiShark: alfabetycznie według modelu.';
}
export function compareResearch(a:ResearchSortable,b:ResearchSortable,sort:string):number {
 if(sort==='model')return a.model.localeCompare(b.model,'pl')||a.url.localeCompare(b.url);
 const quality=(c:ResearchSortable)=>typeof c.quality==='string'&&Number.isFinite(weights[c.quality])?weights[c.quality]:null;
 const fit=(c:ResearchSortable)=>typeof c.fit==='number'&&Number.isFinite(c.fit)?c.fit:null;
 if(sort==='quality'||sort==='fit'){
   const av=sort==='quality'?quality(a):fit(a),bv=sort==='quality'?quality(b):fit(b);
   if(av===null&&bv!==null)return 1;
   if(av!==null&&bv===null)return -1;
   if(av!==null&&bv!==null&&av!==bv)return bv-av;
 }
 const av=pricePln(a),bv=pricePln(b);
 if(av===null&&bv!==null)return 1;
 if(av!==null&&bv===null)return -1;
 if(av!==null&&bv!==null&&av!==bv)return sort==='price_desc'?bv-av:av-bv;
 return a.model.localeCompare(b.model,'pl')||a.url.localeCompare(b.url);
}
export function sortResearch<T extends ResearchSortable>(leads:T[],sort:string):T[]{
 return [...leads].sort((a,b)=>compareResearch(a,b,sort));
}
