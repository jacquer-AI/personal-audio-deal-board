import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('data/offers.json','utf8'));
const results=[];
for(let i=0;i<data.offers.length;i+=4){
await Promise.all(data.offers.slice(i,i+4).map(async o=>{
try{const r=await fetch(o.url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mozilla/5.0 (compatible; AudioBoardLinkCheck/1.0)'}});await r.body?.cancel();results.push({id:o.id,url:o.url,http:r.status,result:[404,410].includes(r.status)?'STALE / REVERIFY':r.ok?'HTTP_REACHABLE_NOT_STOCK_VERIFICATION':'ACCESS_RESTRICTED_REVERIFY'});}
catch(e){results.push({id:o.id,url:o.url,result:'NETWORK_UNVERIFIED',error:e.message})}
}));
}
fs.writeFileSync('data/link-validation.json',JSON.stringify({checked:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results.map(r=>({id:r.id,http:r.http,result:r.result})),null,2));
