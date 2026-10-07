import fs from 'node:fs';
import assert from 'node:assert/strict';
const url='https://jacquer-ai.github.io/personal-audio-deal-board/';
for(let attempt=1;attempt<=6;attempt++){
  const probe=await fetch(url+'?rb='+Date.now(),{signal:AbortSignal.timeout(30000)});
  const h=await probe.text();
  const a=h.match(/<script[^>]+src="([^"]+)"/)?.[1];
  if(a&&fs.existsSync('dist/'+a.replace(/^\.\//,''))&&fs.readFileSync('dist/'+a.replace(/^\.\//,''),'utf8')===await fetch(new URL(a,url).href).then(r=>r.text()))break;
  if(attempt===6)break;
  await new Promise(r=>setTimeout(r,10000));
}
const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
assert(response.ok,'Production HTML HTTP '+response.status);
const html=await response.text();
const asset=html.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert(asset,'Missing production script');
const scriptUrl=new URL(asset,url).href;
const scriptResponse=await fetch(scriptUrl,{signal:AbortSignal.timeout(30000)});
assert(scriptResponse.ok,'Production JS HTTP '+scriptResponse.status);
const js=await scriptResponse.text();
const needles=['PERSONAL AUDIO','Deal Board','Technics EAH-AZ100','Dan Clark Audio Noire X','Bose SoundLink Max','JBL Charge 6'];
for(const text of needles)assert((html+js).includes(text),'Production content missing: '+text);
const local=fs.readFileSync('dist/'+asset.replace(/^\.\//,''),'utf8');
assert.equal(js,local,'Public app differs from current production build');
console.log(JSON.stringify({url,http:response.status,script:scriptUrl,scriptHttp:scriptResponse.status,content:needles,buildMatch:true,checked:new Date().toISOString()},null,2));
