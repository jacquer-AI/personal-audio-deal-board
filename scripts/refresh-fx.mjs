import fs from 'node:fs';

export const SOURCE='https://api.nbp.pl/api/exchangerates/tables/A/last/1/?format=json';
export function validatedNbpTable(payload){
  const t=Array.isArray(payload)?payload[0]:null;
  if(!t||t.table!=='A'||!/^\d{4}-\d{2}-\d{2}$/.test(t.effectiveDate||'')||!Array.isArray(t.rates))throw Error('NBP_TABLE_INVALID');
  const codes=['EUR','GBP','USD'];
  const rates={};
  for(const code of codes){
    const hit=t.rates.find(x=>x.code===code);
    if(!hit||!Number.isFinite(hit.mid)||hit.mid<=0||hit.mid>=100)throw Error('NBP_RATE_INVALID_'+code);
    rates[code]=hit.mid;
  }
  const published=Date.parse(t.effectiveDate+'T00:00:00Z');
  const age=Date.now()-published;
  if(!Number.isFinite(age)||age<0||age>8*86400000)throw Error('NBP_TABLE_STALE');
  return {schema:1,source:'NBP_TABLE_A',table:t.no,effectiveDate:t.effectiveDate,rates};
}
export async function refreshRates({target='data/fx-latest.json',fetchFn=fetch}={}){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
  try{
    const res=await fetchFn(SOURCE,{signal:ctrl.signal,headers:{accept:'application/json'}});
    if(!res.ok)throw Error('NBP_HTTP_'+res.status);
    const doc=validatedNbpTable(await res.json());
    const content=JSON.stringify(doc,null,2)+'\n';
    const current=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
    if(current!==content){fs.mkdirSync('data',{recursive:true});fs.writeFileSync(target,content);}
    console.log('FX_NBP_OK',doc.effectiveDate,doc.table,doc.rates);
    return doc;
  }finally{clearTimeout(timer)}
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].replace(/\\/g,'/').split('/').pop())){
  refreshRates().catch(e=>{console.warn('FX_NBP_UNAVAILABLE',String(e?.message||e),'— prior FX retained, no fabricated rate');});
}
