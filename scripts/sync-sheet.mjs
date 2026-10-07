import fs from 'node:fs';
const path=process.argv[2]||'data/sheet-snapshot.json';
const raw=JSON.parse(fs.readFileSync(path,'utf8'));
const num=v=>v==null||v===''?null:Number(String(v).replace(/[\s\u00a0]/g,'').replace(',','.'));
const fit=new Map(['IEM','TWS','Closed Portable','Wireless Speakers'].flatMap(s=>raw[s].values.slice(1).map(r=>[r[0],num(r[2])])));
const rows=raw['Rynek PLN'].values.slice(5).filter(r=>r[1]);
const offers=rows.map((r,i)=>{
const historical=/HISTORICAL|SOLD/.test(r[12]); const nonEU=/NON-EU/.test(r[12]);
const condition=r[3].startsWith('B-STOCK')?'B-STOCK':r[3].startsWith('USED')?'USED':'NEW';
const status=historical?'HISTORICAL':nonEU?'NON-EU / TLC':r[12]==='LIVE VERIFIED'?(condition==='USED'?'LIVE USED':'LIVE VERIFIED'):'LEAD ONLY';
const location=r[8].replace(/^[^\p{L}]+/u,'').split(' · ');
return {id:'market-'+i,model:r[1],category:r[0]==='Speaker'?'Głośniki BT':r[0],quality:r[2].replace('−','-'),fit:fit.get(r[1])??null,condition,rrp:num(r[4]),newMarket:num(r[5]),sameMarket:num(r[6]),price:num(r[7]),country:location[0],seller:location.slice(1).join(' · ')||location[0],region:nonEU?'non-EU / TLC':r[8].includes('Polska')?'Polska':'UE',status,original:r[13]||'',url:r[14],note:r[15]||'',role:historical?'HISTORICAL':status==='LEAD ONLY'?'LEAD':'OFFER',checked:'2026-10-07'};
});
const sv=raw['B4B Ranking'].values.find(r=>r[1]==='HIFIMAN Svanar Wireless');
offers.push({id:'svanar-history',model:sv[1],category:'TWS',quality:'A-',fit:4,condition:'OPEN-BOX',rrp:null,newMarket:null,sameMarket:null,price:Math.round(109*4.37111),country:'EU storefront',seller:'HIFIMAN Europe',region:'UE',status:'HISTORICAL',original:'€109',url:sv[15],note:'SOLD OUT · historyczny benchmark, nie oferta zakupu. Przeliczenie: zapisany FX 4.37111.',role:'HISTORICAL',checked:'2026-10-07'});
// Supplementary current sources only where the newer PLN market tab has no exact source.
for(const r of raw['Live Deals'].values.slice(1)){
if(offers.some(o=>o.url===r[10])||r[1]==='DUNU SA6 MkII'||(r[1]==='Dan Clark Audio Noire X'&&r[2]==='B-Stock'))continue;
const currency=r[4], rate=currency==='EUR'?4.37111:currency==='USD'?3.88344:currency==='GBP'?5.15290:1;
const meta=['IEM','TWS','Closed Portable','Wireless Speakers'].flatMap(s=>raw[s].values.slice(1)).find(x=>x[0]===r[1]);
const nonEU=/Non-EU/.test(r[8]);
offers.push({id:'supplement-'+offers.length,model:r[1],category:r[0]==='Speaker'?'Głośniki BT':r[0],quality:meta?.[1]||'',fit:fit.get(r[1])??null,condition:'NEW',rrp:null,newMarket:null,sameMarket:null,price:Math.round(num(r[3])*rate*100)/100,country:nonEU?'Non-EU':r[5],seller:r[5],region:nonEU?'non-EU / TLC':currency==='PLN'?'Polska':'UE',status:nonEU?'NON-EU / TLC':r[6],original:r[3]+' '+currency,url:r[10],note:r[7]+' · '+r[8],role:r[6]==='LEAD ONLY'?'LEAD':'OFFER',checked:r[9]});
}
// Current-market references are allowed only when ranking explicitly labels them current, not MSRP.
for(const o of offers){
const peers=offers.find(p=>p.id.startsWith('market-')&&p.model===o.model&&p.condition===o.condition&&p.region===o.region);
if(!o.id.startsWith('market-')&&peers){o.newMarket=peers.newMarket;o.sameMarket=peers.sameMarket;o.rrp=peers.rrp;}
if(o.sameMarket===null&&o.status!=='HISTORICAL'&&o.region!=='non-EU / TLC'){
const r=raw['B4B Ranking'].values.find(r=>r[1]===o.model&&r[2]==='New'&&r[6]==='PLN'&&/current regular market|current retailer price/.test(r[8]));
if(r){o.sameMarket=num(r[7]);o.newMarket=num(r[7]);}
}
}
if(fs.existsSync('data/link-validation.json')){
const links=JSON.parse(fs.readFileSync('data/link-validation.json','utf8')).results;
for(const o of offers){const link=links.find(l=>l.url===o.url);if(link?.result==='STALE / REVERIFY'){o.status='STALE / REVERIFY';o.note+=' · Link check: HTTP '+link.http+' — STALE / REVERIFY';}}
}
fs.writeFileSync('data/offers.json',JSON.stringify({source:'https://docs.google.com/spreadsheets/d/1LhS3CPng5nrwFE2O-xG46TJJZbmfSs7wpW1xKkQPmTs/edit',snapshot:'2026-10-07',fx:{EUR:4.37111,GBP:5.15290,USD:3.88344,timestamp:'2026-10-07 ~01:23 CEST'},offers},null,2));
console.log('Generated',offers.length,'sources; no live FX requests.');

