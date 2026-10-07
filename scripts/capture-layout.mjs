import {chromium} from '@playwright/test';
import fs from 'node:fs';
const url=process.env.BASE_URL||'https://jacquer-ai.github.io/personal-audio-deal-board/';
const dir=process.env.CAPTURE_DIR||'test-results/layout';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch();
const metrics=[];
for(const [width,height] of [[1440,900],[1024,768],[390,844],[320,720]]){
const page=await browser.newPage({viewport:{width,height}});
await page.goto(url);
await page.getByRole('heading',{level:1}).waitFor();
await page.screenshot({path:dir+'/'+width+'.png'});
metrics.push(await page.evaluate(({width,height})=>{
const toolbar=document.querySelector('.toolbar').getBoundingClientRect();
const records=[...document.querySelectorAll('[data-testid="product"]')].map(e=>{const r=e.getBoundingClientRect();return {y:r.y,height:r.height,bottom:r.bottom}});
return {width,height,toolbarHeight:toolbar.height,firstResultY:records[0].y,firstRecordHeight:records[0].height,fullRecords:records.filter(r=>r.bottom<=height).length,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,density:document.querySelector('.app').className,records:records.slice(0,5)};
},{width,height}));
await page.close();
}
await browser.close();
fs.writeFileSync(dir+'/metrics.json',JSON.stringify({url,checked:new Date().toISOString(),metrics},null,2));
console.log(JSON.stringify(metrics,null,2));
