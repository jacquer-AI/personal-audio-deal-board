import type {Page} from '@playwright/test';

type Options={noop?:boolean;dispatcherOffline?:boolean;dispatchStatus?:number};

const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
const DISPATCHER='https://desktop-t47p2au.tail84c6f0.ts.net:8444/audio-refresh';
const RAW_DELTA='https://raw.githubusercontent.com/jacquer-AI/personal-audio-deal-board/main/data/refresh-delta.json';

/** In-test private dispatcher + public GitHub API. No real network writes. */
export async function mockGitHub(page:Page,opts:Options={}){
  const dispatcherRequests:{body:unknown}[]=[];
  const nonGithubAuthRequests:string[]=[];
  let runPolls=0,pagesPolls=0,dispatched=false;
  const created=()=>new Date().toISOString();
  const hoursAgo=new Date(Date.now()-3*3600*1000).toISOString();
  const run=(id:number,status:string,conclusion:string|null)=>({id,status,conclusion,created_at:created(),updated_at:created(),html_url:'https://github.com/jacquer-AI/personal-audio-deal-board/actions/runs/'+id,event:'workflow_dispatch',display_title:'Refresh full · TWS'});

  await page.route(/^(?!https:\/\/api\.github\.com)(?!https:\/\/raw\.githubusercontent\.com)(?!https:\/\/desktop-t47p2au\.tail84c6f0\.ts\.net:8444).*$/,route=>{
    const h=route.request().headers();
    if(h.authorization)nonGithubAuthRequests.push(route.request().url());
    return route.fallback();
  });

  await page.route(DISPATCHER+'/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',headers:CORS,body:JSON.stringify(body)});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
    if(opts.dispatcherOffline)return route.abort('failed');
    if(url.pathname.endsWith('/health'))return json({ok:true,service:'test-dispatcher',tailnetOnly:true});
    if(url.pathname.endsWith('/refresh')&&req.method()==='POST'){
      dispatcherRequests.push({body:JSON.parse(req.postData()||'{}')});
      if(opts.dispatchStatus)return json({ok:false,error:'rejected'},opts.dispatchStatus);
      dispatched=true;runPolls=0;
      return json({ok:true,queued:true,run:run(123,'queued',null)},202);
    }
    if(url.pathname.endsWith('/status')){
      if(!dispatched)return json({ok:true,run:{...run(100,'completed','success'),updated_at:hoursAgo,created_at:hoursAgo,display_title:'Refresh quick · all'}});
      runPolls++;
      const current=runPolls<=1?run(123,'queued',null):runPolls===2?run(123,'in_progress',null):run(123,'completed','success');
      return json({ok:true,run:current});
    }
    return json({ok:false,error:'not_found'},404);
  });

  await page.route(RAW_DELTA+'**',route=>route.fulfill({
    status:200,contentType:'application/json',headers:CORS,
    body:JSON.stringify({
      schema:1,refreshedAt:created(),mode:'full',runId:opts.noop?'99':'123',new:1,priceChanged:1,sold:1,stale:0,
      changes:[{type:'PRICE',model:'Dan Clark Audio Noire X',from:4799,to:4499},{type:'SOLD',model:'Technics EAH-AZ100'},{type:'NEW',model:'Bose SoundLink Max',price:750}]
    })
  }));

  await page.route('https://api.github.com/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',headers:CORS,body:JSON.stringify(body)});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
    const path=url.pathname.replace('/repos/jacquer-AI/personal-audio-deal-board','');
    if(path==='/actions/runs'){
      pagesPolls++;
      const pages=run(124,pagesPolls<2?'in_progress':'completed',pagesPolls<2?null:'success');
      pages.display_title='Verify and deploy audio board';
      return json({workflow_runs:[pages]});
    }
    return json({workflow_runs:[]});
  });
  return {dispatcherRequests,nonGithubAuthRequests,pagesPolls:()=>pagesPolls};
}
