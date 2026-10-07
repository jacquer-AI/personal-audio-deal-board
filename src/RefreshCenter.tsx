import {useEffect,useMemo,useRef,useState} from 'react';
import deltaSnapshot from '../data/refresh-delta.json';

const REPO='jacquer-AI/personal-audio-deal-board';
const API='https://api.github.com/repos/'+REPO;
const WORKFLOW_URL='https://github.com/'+REPO+'/actions/workflows/refresh-market.yml';
const DISPATCHER='https://desktop-t47p2au.tail84c6f0.ts.net:8444/audio-refresh';
const RAW_DELTA='https://raw.githubusercontent.com/'+REPO+'/main/data/refresh-delta.json';
const POLL_MS=4000;
const DEPLOY_WAIT_MS=240000;

type Mode='quick'|'full'|'deep';
type Run={id:number;status:string;conclusion:string|null;created_at:string;updated_at:string;html_url:string;event?:string;display_title?:string};
type Change={type:string;model:string;from?:number;to?:number;price?:number};
type Delta={refreshedAt?:string|null;mode?:string|null;runId?:string|null;new?:number;priceChanged?:number;sold?:number;stale?:number;changes?:Change[]};
type RefreshMeta={refreshedAt?:string|null;mode?:string|null;status?:string|null};
type Phase='idle'|'dispatching'|'queued'|'running'|'deploying'|'done'|'failed';

function ageLabel(iso?:string|null){
  if(!iso)return 'brak zapisu';
  const ms=Date.now()-new Date(iso).getTime();
  if(!Number.isFinite(ms))return 'nieznany';
  const m=Math.max(0,Math.floor(ms/60000));
  if(m<60)return m+' min';
  const h=Math.floor(m/60);
  if(h<48)return h+' h';
  return Math.floor(h/24)+' d';
}
const zl=(n?:number)=>n==null?'—':Math.round(n)+' zł';
export function describeChange(c:Change){
  if(c.type==='PRICE')return c.model+' '+zl(c.from)+' → '+zl(c.to);
  if(c.type==='SOLD')return c.model+' SOLD';
  if(c.type==='STALE')return c.model+' STALE';
  return c.model+' NEW OFFER · '+zl(c.price);
}

async function dispatcher(path:string,init:RequestInit={}){
  return fetch(DISPATCHER+path,{
    ...init,
    headers:{...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers as Record<string,string>|undefined)}
  });
}
async function dispatcherHealthy(){
  const r=await dispatcher('/health',{cache:'no-store'});
  if(!r.ok)return false;
  const body=await r.json().catch(()=>null) as {ok?:boolean;service?:string}|null;
  return body?.ok===true&&body.service==='personal-audio-refresh-dispatcher';
}
async function publicGh(path:string){
  return fetch(API+path,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
}
async function publicLatest(){
  const r=await publicGh('/actions/runs?per_page=20');
  if(!r.ok)return null;
  const body=await r.json() as {workflow_runs?:Array<Run&{name?:string}>};
  return body.workflow_runs?.find(x=>(x.display_title||x.name||'').startsWith('Refresh '))||null;
}
async function readDelta(){
  const r=await fetch(RAW_DELTA+'?ts='+Date.now(),{cache:'no-store'});
  if(!r.ok)return null;
  return r.json() as Promise<Delta>;
}

export default function RefreshCenter({refresh}:{refresh?:RefreshMeta}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>('quick');
  const [category,setCategory]=useState('all');
  const [lastRun,setLastRun]=useState<Run|null>(null);
  const [phase,setPhase]=useState<Phase>('idle');
  const [runUrl,setRunUrl]=useState('');
  const [track,setTrack]=useState(false);
  const [delta,setDelta]=useState<Delta>(deltaSnapshot as Delta);
  const [dispatcherOnline,setDispatcherOnline]=useState<boolean|null>(null);
  const [outcome,setOutcome]=useState<'NONE'|'CHANGED'|''>('');
  const [error,setError]=useState('');

  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open]);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        if(!await dispatcherHealthy())throw new Error('dispatcher health mismatch');
        if(!alive)return;
        setDispatcherOnline(true);
        const s=await dispatcher('/status',{cache:'no-store'});
        if(s.ok){
          const body=await s.json() as {run?:Run|null};
          if(alive&&body.run)setLastRun(body.run);
        }
      }catch{
        if(!alive)return;
        setDispatcherOnline(false);
        const fallback=await publicLatest().catch(()=>null);
        if(alive&&fallback)setLastRun(fallback);
      }
    })();
    return()=>{alive=false};
  },[]);

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    (async()=>{
      try{
        const healthy=await dispatcherHealthy();
        if(cancelled)return;
        if(healthy){
          setDispatcherOnline(true);setError('');
          const s=await dispatcher('/status',{cache:'no-store'});
          if(s.ok){
            const body=await s.json() as {run?:Run|null};
            if(body.run)setLastRun(body.run);
          }
        }else setDispatcherOnline(false);
      }catch{if(!cancelled)setDispatcherOnline(false)}
    })();
    return()=>{cancelled=true};
  },[open]);

  useEffect(()=>{
    if(!track)return;
    let stopped=false,busy=false,doneAt=0;
    const finish=(p:Phase,msg='')=>{stopped=true;setTrack(false);setPhase(p);if(msg)setError(msg)};
    const tick=async()=>{
      if(stopped||busy)return;
      busy=true;
      try{
        const s=await dispatcher('/status',{cache:'no-store'});
        if(!s.ok)throw new Error('Dispatcher status '+s.status);
        const body=await s.json() as {run?:Run|null};
        const run=body.run||null;
        if(!run){setPhase('queued');return}
        setLastRun(run);setRunUrl(run.html_url||'');
        if(['queued','waiting','pending','requested'].includes(run.status)){setPhase('queued');return}
        if(run.status!=='completed'){setPhase('running');return}
        if(run.conclusion!=='success'){finish('failed','Refresh zakończony: '+run.conclusion);return}

        const fresh=await readDelta().catch(()=>null);
        const changed=Boolean(fresh&&String(fresh.runId)===String(run.id));
        if(fresh)setDelta(fresh);
        setOutcome(changed?'CHANGED':'NONE');
        if(!changed){finish('done');return}

        if(!doneAt)doneAt=Date.now();
        setPhase('deploying');
        const p=await publicGh('/actions/runs?per_page=20');
        if(p.ok){
          const list=(await p.json() as {workflow_runs?:Array<Run&{name?:string}>}).workflow_runs||[];
          const pages=list.find(x=>(x.display_title||x.name||'').includes('Verify and deploy audio board')&&Date.parse(x.created_at)>=Date.parse(run.created_at));
          if(pages?.status==='completed'){
            if(pages.conclusion==='success')finish('done');else finish('failed','Deploy zakończony: '+pages.conclusion);
            return;
          }
        }
        if(Date.now()-doneAt>DEPLOY_WAIT_MS)finish('done');
      }catch(e){
        setError(e instanceof Error?e.message:'Status niedostępny');
      }finally{busy=false}
    };
    void tick();
    const id=window.setInterval(()=>void tick(),POLL_MS);
    return()=>{stopped=true;window.clearInterval(id)};
  },[track]);

  async function start(){
    if(!dispatcherOnline){setError('Dispatcher ZEN niedostępny — połącz Tailscale.');return}
    setError('');setPhase('dispatching');setOutcome('');
    try{
      const res=await dispatcher('/refresh',{method:'POST',body:JSON.stringify({mode,categories:category})});
      const body=await res.json().catch(()=>({})) as {ok?:boolean;queued?:boolean;error?:string;run?:Run|null};
      if(res.status===202&&body.ok&&body.queued){
        if(body.run){setLastRun(body.run);setRunUrl(body.run.html_url||'')}
        setPhase('queued');setTrack(true);return;
      }
      if(res.status===409&&body.run){
        setLastRun(body.run);setRunUrl(body.run.html_url||'');setPhase('queued');setTrack(true);return;
      }
      throw new Error(body.error||('Dispatch HTTP '+res.status));
    }catch(e){
      setDispatcherOnline(false);
      setPhase('failed');
      setError('Dispatcher ZEN niedostępny — połącz Tailscale. '+(e instanceof Error?e.message:''));
    }
  }

  const busy=phase==='dispatching'||phase==='queued'||phase==='running'||phase==='deploying';
  const state=busy?phase.toUpperCase():phase==='failed'?'FAILED':phase==='done'?'OK':lastRun?(lastRun.status==='completed'?(lastRun.conclusion==='success'?'OK':'FAILED'):lastRun.status.toUpperCase()):(refresh?.status==='COMPLETED'?'OK':refresh?.status||'NEVER');
  const freshness=useMemo(()=> 'Rynek: '+ageLabel(lastRun?.updated_at||refresh?.refreshedAt||null)+' · '+state,[lastRun,refresh,state]);
  const changes=(delta.changes||[]).slice(0,6);

  return <>
    <div className="refresh-entry">
      <button className="refresh-button" onClick={()=>setOpen(true)} aria-haspopup="dialog">↻ Odśwież</button>
      <span className="freshness" data-testid="freshness">{freshness}</span>
    </div>
    <dialog ref={dialog} className="refresh-dialog" aria-labelledby="refresh-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
      <header className="dialog-header">
        <div><h2 id="refresh-title">Refresh rynku</h2><p>QUICK / FULL / DEEP bez tokena w przeglądarce.</p></div>
        <button onClick={()=>setOpen(false)}>Zamknij</button>
      </header>
      <div className="refresh-grid">
        <section>
          <h3>Tryb</h3>
          <div className="mode-buttons" role="group" aria-label="Tryb refreshu">
            {(['quick','full','deep'] as Mode[]).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)} disabled={busy}>{m.toUpperCase()}</button>)}
          </div>
          <p className="mode-help">{mode==='quick'?'Bieżące bezpośrednie URL-e.':mode==='full'?'QUICK + nowe oferty znanych modeli.':'FULL + nieadjudykowane challengery.'}</p>
          <label>Zakres
            <select aria-label="Kategoria refreshu" value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}>
              <option value="all">Wszystkie</option><option value="IEM">IEM</option><option value="TWS">TWS</option><option value="Closed">Closed</option><option value="Głośniki BT">Głośniki BT</option>
            </select>
          </label>
        </section>
        <section>
          <h3>Status</h3>
          <p data-testid="dispatcher-status"><b>{dispatcherOnline===true?'ZEN połączony':dispatcherOnline===false?'ZEN niedostępny':'Sprawdzam ZEN…'}</b></p>
          <p data-testid="refresh-state" role="status"><b>{state}</b>{lastRun&&!busy?' · '+new Date(lastRun.updated_at).toLocaleString('pl-PL'):''}</p>
          {(runUrl||lastRun)&&<a href={runUrl||lastRun?.html_url} target="_blank" rel="noopener noreferrer">Otwórz run ↗</a>}
          <div className="delta-strip" data-testid="delta" aria-label="Delta ostatniej zmiany rynku">
            <span>nowe <b>{delta.new||0}</b></span><span>cena <b>{delta.priceChanged||0}</b></span><span>sold <b>{delta.sold||0}</b></span><span>stale <b>{delta.stale||0}</b></span>
          </div>
          {outcome==='NONE'&&phase==='done'&&<p className="mode-help" data-testid="delta-none"><b>DELTA=NONE</b> — ten run nie zmienił rynku.</p>}
          {changes.length>0&&<ul className="delta-list" data-testid="delta-list">{changes.map((c,i)=><li key={i}>{describeChange(c)}</li>)}</ul>}
        </section>
      </div>
      <p className="verification-note"><b>LIVE</b> tylko po weryfikacji finalnej strony konkretnej oferty. Listing/agregator pozostaje LEAD.</p>
      <section className="dispatch-box">
        <button className="run-button" onClick={()=>void start()} disabled={dispatcherOnline!==true||busy}>{busy?'W toku…':'URUCHOM '+mode.toUpperCase()}</button>
        {phase==='done'&&<button className="reload-button" onClick={()=>location.reload()}>Wczytaj najnowsze dane</button>}
        {error&&<p className="refresh-error" role="alert">{error}</p>}
        {dispatcherOnline===false&&<p className="mode-help">Dispatcher jest prywatny w tailnecie. Połącz Tailscale na tym urządzeniu. <a className="dispatch-link" href={WORKFLOW_URL} target="_blank" rel="noopener noreferrer">Awaryjnie: GitHub ↗</a></p>}
      </section>
    </dialog>
  </>;
}
