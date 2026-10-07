import type {Offer,Filters,Product} from '../types';
export const modelCount=(n:number)=>n===1?'model':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'modele':'modeli';
export function percentLabel(n:number|null){
  if(n===null)return '—';
  const magnitude=Math.abs(n*100).toFixed(1);
  return (Number(magnitude)===0?'':n>0?'−':'+')+magnitude+'%';
}
export const weights:Record<string,number>={'S':120,'S-':115,'A+':110,'A':100,'A-':90,'B+':80,'B':70,'B-':60,'C':50,'D':35,'E':20};
export const buyable=(o:Offer)=>['LIVE VERIFIED','LIVE USED'].includes(o.status)&&o.price!==null&&o.price>0;
export const b4b=(o:Offer)=>buyable(o)&&o.sameMarket!==null&&o.sameMarket>0?weights[o.quality]*o.sameMarket/o.price!:null;
export const discount=(o:Offer)=>o.price!==null&&o.price>0&&o.sameMarket!==null&&o.sameMarket>0?1-o.price/o.sameMarket:null;
export const savings=(o:Offer)=>o.price!==null&&o.newMarket!==null&&o.newMarket>0?1-o.price/o.newMarket:null;
export const decision=(o:Offer)=>o.status==='HISTORICAL'?'BENCHMARK · NIE DO KUPIENIA':o.status==='NON-EU / TLC'?'WARUNKOWO · BRAK TLC':!buyable(o)?'SPRAWDŹ DOSTĘPNOŚĆ':discount(o)!<0?'PSEUDO-DEAL · POWYŻEJ RYNKU':o.model.includes('Noire X')?'TOP PICK':o.model.includes('Bose')?'INTERESTING USED DEAL':discount(o)!>=.1?'STRONG BUY':'FAIR PRICE';
export function selectCompare(ids:string[],id:string){return ids.includes(id)?{ids:ids.filter(x=>x!==id),error:''}:ids.length>=3?{ids,error:'Możesz porównać maksymalnie 3 modele.'}:{ids:[...ids,id],error:''}}
export function group(offers:Offer[]):Product[]{return [...new Set(offers.map(o=>o.model))].map(model=>{const rows=offers.filter(o=>o.model===model).sort((a,b)=>Number(buyable(b))-Number(buyable(a))||(b4b(b)??-1)-(b4b(a)??-1)||(a.price??Infinity)-(b.price??Infinity));return {model,offers:rows,best:rows[0]}})}
export function results(offers:Offer[],f:Filters){const filtered=offers.filter(o=>
(f.category==='Wszystkie'||o.category===f.category)&&
(!f.conditions.length||f.conditions.includes(o.condition)||(f.conditions.includes('HISTORICAL')&&o.status==='HISTORICAL'))&&
(f.region==='Wszystkie'||o.region===f.region)&&
(f.status==='Wszystkie'||o.status===f.status)&&
(f.history||o.status!=='HISTORICAL')&&
(!f.liveOnly||buyable(o))&&
[o.model,o.seller,o.country,o.status,o.role].join(' ').toLocaleLowerCase().includes(f.search.toLocaleLowerCase()));
const val=(o:Offer)=>f.sort==='price'?-(o.price??Infinity):f.sort==='discount'?(buyable(o)?discount(o):null)??-Infinity:f.sort==='savings'?(buyable(o)?savings(o):null)??-Infinity:f.sort==='quality'?weights[o.quality]:f.sort==='fit'?o.fit??-Infinity:b4b(o)??-Infinity;
return group(filtered).map(p=>({...p,offers:[p.best,...offers.filter(o=>o.model===p.model&&o.id!==p.best.id&&(f.history||o.status!=='HISTORICAL'))]})).sort((a,b)=>Number(buyable(b.best))-Number(buyable(a.best))||val(b.best)-val(a.best)||a.model.localeCompare(b.model));
}

