import type {Page} from '@playwright/test';

type Options={noop?:boolean;dispatchStatus?:number};

const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};

/** In-test GitHub API: no real network, stateful run lifecycle (queued → in_progress → completed → pages deploy). */
export async function mockGitHub(page:Page,opts:Options={}){
  const dispatches:{body:unknown;authorization:string|undefined}[]=[];
  const nonGithubAuthRequests:string[]=[];
  let runPolls=0,pagesPolls=0,dispatched=false;
  const created=()=>new Date().toISOString();
  const hoursAgo=new Date(Date.now()-3*3600*1000).toISOString();
  const run=(id:number,status:string,conclusion:string|null)=>({id,status,conclusion,created_at:created(),updated_at:created(),html_url:'https://github.com/jacquer-AI/personal-audio-deal-board/actions/runs/'+id});

  await page.route(/^(?!https:\/\/api\.github\.com).*$/,route=>{
    const h=route.request().headers();
    if(h.authorization)nonGithubAuthRequests.push(route.request().url());
    return route.fallback();
  });
  await page.route('https://api.github.com/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',headers:CORS,body:JSON.stringify(body)});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:CORS});
    const path=url.pathname.replace('/repos/jacquer-AI/personal-audio-deal-board','');
    if(req.method()==='POST'&&path.endsWith('/refresh-market.yml/dispatches')){
      dispatches.push({body:JSON.parse(req.postData()||'{}'),authorization:req.headers().authorization});
      if(opts.dispatchStatus)return json({message:'rejected'},opts.dispatchStatus);
      dispatched=true;
      return route.fulfill({status:204,headers:CORS});
    }
    if(path.endsWith('/refresh-market.yml/runs')){
      if(url.searchParams.get('per_page')==='1')return json({workflow_runs:dispatched?[run(123,'queued',null)]:[{...run(100,'completed','success'),updated_at:hoursAgo,created_at:hoursAgo}]});
      return json({workflow_runs:dispatched?[run(123,'queued',null)]:[]});
    }
    if(path==='/actions/runs/123'){
      runPolls++;
      return json(runPolls<=1?run(123,'queued',null):runPolls===2?run(123,'in_progress',null):run(123,'completed','success'));
    }
    if(path==='/actions/runs/123/jobs')return json({jobs:[{steps:[{name:'Phase: PLAN (validate mode and scope)',status:'completed'},{name:'Phase: REFRESH (discovery and direct-page verification)',status:'in_progress'}]}]});
    if(path==='/contents/data/refresh-delta.json')return json({
      schema:1,refreshedAt:created(),mode:'full',runId:opts.noop?'99':'123',new:1,priceChanged:1,sold:1,stale:0,
      changes:[{type:'PRICE',model:'Dan Clark Audio Noire X',from:4799,to:4499},{type:'SOLD',model:'Technics EAH-AZ100'},{type:'NEW',model:'Bose SoundLink Max',price:750}]
    });
    if(path.endsWith('/pages.yml/runs')){
      pagesPolls++;
      return json({workflow_runs:[run(124,pagesPolls<2?'in_progress':'completed',pagesPolls<2?null:'success')]});
    }
    return json({workflow_runs:[]});
  });
  return {dispatches,nonGithubAuthRequests,pagesPolls:()=>pagesPolls};
}
