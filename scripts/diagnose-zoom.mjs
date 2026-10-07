import {chromium} from '@playwright/test';
const browser=await chromium.launch();
const page=await browser.newPage();
await page.goto(process.env.BASE_URL||'https://jacquer-ai.github.io/personal-audio-deal-board/');
for(const width of [1440,1024,390,320]){
await page.setViewportSize({width,height:900});
await page.evaluate(()=>{document.body.style.zoom='200%'});
console.log(JSON.stringify(await page.evaluate(()=>({texts:[...document.querySelectorAll('body *')].flatMap(e=>[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>{const r=document.createRange();r.selectNodeContents(n);return {text:n.textContent,right:r.getBoundingClientRect().right,parent:e.tagName,cls:e.className}})).filter(t=>t.right>innerWidth+1),width:innerWidth,scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,body:document.body.getBoundingClientRect().width,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))})),null,2));
}
await browser.close();
