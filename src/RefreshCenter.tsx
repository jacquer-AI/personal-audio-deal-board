import {useEffect,useMemo,useRef,useState} from 'react';
import deltaSnapshot from '../data/refresh-delta.json';

const REPO='jacquer-AI/personal-audio-deal-board';
const API='https://api.github.com/repos/'+REPO;
const WORKFLOW_URL='https://github.com/'+REPO+'/actions/workflows/refresh-market.yml';
const TOKEN_URL='https://github.com/settings/personal-access-tokens/new';
const TOKEN_KEY='audio-refresh-gh-token';
const POLL_MS=4000;
const DEPLOY_WAIT_MS=240000;

type Mode='quick'|'full'|'deep';
type Run={id:number;status:string;conclusion:string|null;created_at:string;updated_at:string;html_url:string};
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

const readToken=()=>{try{return sessionStorage.getItem(TOKEN_KEY)}catch{return null}};
async function gh(path:string,init:RequestInit={},raw=false){
  const token=readToken();
  const headers:Record<string,string>={Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(token)headers.Authorization='Bearer '+token;
  return fetch(API+path,{...init,headers:{...headers,...(init.headers as Record<string,string>|undefined)}});
}

export default function RefreshCenter({refresh}:{refresh?:RefreshMeta}){
  const dialog=useRef<HTMLDialogElement>(null);
  const tokenInput=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>('quick');
  const [category,setCategory]=useState('all');
  const [lastRun,setLastRun]=useState<Run|null>(null);
  const [phase,setPhase]=useState<Phase>('idle');
  const [step,setStep]=useState('');
  const [runUrl,setRunUrl]=useState('');
  const [track,setTrack]=useState<number|null>(null);
  const [delta,setDelta]=useState<Delta>(deltaSnapshot as Delta);
  const [connected,setConnected]=useState(()=>Boolean(readToken()));
  const [outcome,setOutcome]=useState<'NONE'|'CHANGED'|''>('');
  const [error,setError]=useState('');

  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open]);

  useEffect(()=>{
    let alive=true;
    gh('/actions/workflows/refresh-market.yml/runs?per_page=1').then(async r=>{
      if(!r.ok||!alive)return;
      const body=await r.json() as {workflow_runs?:Run[]};
      if(alive)setLastRun(body.workflow_runs?.[0]||null);
    }).catch(()=>undefined);
    return()=>{alive=false};
  },[]);

  // Truthful workflow-level progress: refresh run (steps are named "Phase: X"), then the Pages deploy run.
  useEffect(()=>{
    if(track===null)return;
    let stopped=false,busy=false,runId:number|null=null,refreshRun:Run|null=null,doneAt=0;
    const finish=(p:Phase,msg='')=>{stopped=true;setPhase(p);setStep('');if(msg)setError(msg)};
    const tick=async()=>{
      if(busy||stopped)return;
      busy=true;
      try{
        if(runId===null){
          const r=await gh('/actions/workflows/refresh-market.yml/runs?event=workflow_dispatch&per_page=5');
          if(!r.ok)throw new Error('GitHub API '+r.status);
          const found=((await r.json()) as {workflow_runs?:Run[]}).workflow_runs?.find(x=>Date.parse(x.created_at)>=track-15000);
          if(!found){setPhase('queued');return}
          runId=found.id;setRunUrl(found.html_url);
        }
        if(!refreshRun||refreshRun.status!=='completed'){
          const r=await gh('/actions/runs/'+runId);
          if(!r.ok)throw new Error('GitHub API '+r.status);
          refreshRun=await r.json() as Run;setLastRun(refreshRun);
          if(refreshRun.status==='queued'||refreshRun.status==='waiting'||refreshRun.status==='pending'){setPhase('queued');return}
          if(refreshRun.status!=='completed'){
            setPhase('running');
            const j=await gh('/actions/runs/'+runId+'/jobs');
            if(j.ok){
              const jobs=(await j.json() as {jobs?:{steps?:{name:string;status:string}[]}[]}).jobs||[];
              const active=jobs.flatMap(x=>x.steps||[]).find(s=>s.status==='in_progress'&&/^Phase: /.test(s.name));
              setStep(active?active.name.replace(/^Phase: (\w+).*/,'$1'):'');
            }
            return;
          }
          if(refreshRun.conclusion!=='success'){finish('failed','Refresh zakończony: '+refreshRun.conclusion);return}
          doneAt=Date.now();
        }
        const d=await gh('/contents/data/refresh-delta.json?ref=main',{},true);
        const fresh=d.ok?await d.json() as Delta:null;
        const changed=Boolean(fresh&&String(fresh.runId)===String(runId));
        if(fresh)setDelta(fresh);
        setOutcome(changed?'CHANGED':'NONE');
        if(!changed){finish('done');return}
        setPhase('deploying');
        const p=await gh('/actions/workflows/pages.yml/runs?per_page=3');
        const pages=p.ok?((await p.json()) as {workflow_runs?:Run[]}).workflow_runs?.find(x=>Date.parse(x.created_at)>=Date.parse((refreshRun as Run).created_at)):undefined;
        if(pages?.status==='completed'){
          if(pages.conclusion==='success')finish('done');else finish('failed','Deploy zakończony: '+pages.conclusion);
        }else if(!pages&&Date.now()-doneAt>DEPLOY_WAIT_MS)finish('done');
      }catch(e){setError(e instanceof Error?e.message:'Status niedostępny')}
      finally{busy=false}
    };
    void tick();
    const id=window.setInterval(()=>void tick(),POLL_MS);
    return()=>{stopped=true;window.clearInterval(id)};
  },[track]);

  function saveToken(){
    const v=tokenInput.current?.value.trim()||'';
    if(!v)return;
    try{sessionStorage.setItem(TOKEN_KEY,v)}catch{setError('Przeglądarka blokuje sessionStorage');return}
    if(tokenInput.current)tokenInput.current.value='';
    setConnected(true);setError('');
  }
  function forgetToken(){try{sessionStorage.removeItem(TOKEN_KEY)}catch{/* storage unavailable */}setConnected(false)}

  async function start(){
    setError('');setPhase('dispatching');setOutcome('');
    const t0=Date.now();
    try{
      const res=await gh('/actions/workflows/refresh-market.yml/dispatches',{method:'POST',body:JSON.stringify({ref:'main',inputs:{mode,categories:category}})});
      if(res.status===204){setRunUrl('');setPhase('queued');setTrack(t0);return}
      if([401,403,404].includes(res.status)){forgetToken();setError('Token odrzucony ('+res.status+'). Wymagane: repo '+REPO.split('/')[1]+', Actions: Read and write.')}
      else setError('Dispatch nieudany: HTTP '+res.status);
    }catch(e){setError(e instanceof Error?e.message:'Dispatch nieudany')}
    setPhase('failed');
  }

  const busy=phase==='dispatching'||phase==='queued'||phase==='running'||phase==='deploying';
  const state=busy?(phase==='running'&&step?'RUNNING · '+step:phase.toUpperCase()):phase==='failed'?'FAILED':phase==='done'?'OK':lastRun?(lastRun.status==='completed'?(lastRun.conclusion==='success'?'OK':'FAILED'):lastRun.status.toUpperCase()):(refresh?.status==='COMPLETED'?'OK':refresh?.status||'NEVER');
  const freshness=useMemo(()=> 'Rynek: '+ageLabel(lastRun?.updated_at||refresh?.refreshedAt||null)+' · '+state,[lastRun,refresh,state]);
  const changes=(delta.changes||[]).slice(0,6);

  return <>
    <div className="refresh-entry">
      <button className="refresh-button" onClick={()=>setOpen(true)} aria-haspopup="dialog">↻ Odśwież</button>
      <span className="freshness" data-testid="freshness">{freshness}</span>
    </div>
    <dialog ref={dialog} className="refresh-dialog" aria-labelledby="refresh-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
      <header className="dialog-header">
        <div><h2 id="refresh-title">Refresh rynku</h2><p>Weryfikacja cen i dostępności bez zmiany ocen jakości.</p></div>
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
          <p data-testid="refresh-state" role="status"><b>{state}</b>{lastRun&&!busy?' · '+new Date(lastRun.updated_at).toLocaleString('pl-PL'):''}</p>
          {(runUrl||lastRun)&&<a href={runUrl||lastRun?.html_url} target="_blank" rel="noopener noreferrer">Otwórz run ↗</a>}
          <div className="delta-strip" data-testid="delta" aria-label="Delta ostatniej zmiany rynku">
            <span>nowe <b>{delta.new||0}</b></span><span>cena <b>{delta.priceChanged||0}</b></span><span>sold <b>{delta.sold||0}</b></span><span>stale <b>{delta.stale||0}</b></span>
          </div>
          {outcome==='NONE'&&phase==='done'&&<p className="mode-help" data-testid="delta-none"><b>DELTA=NONE</b> — ten run nie zmienił rynku{changes.length>0?'. Ostatnia zapisana zmiana:':'.'}</p>}
          {changes.length>0?<ul className="delta-list" data-testid="delta-list">{changes.map((c,i)=><li key={i}>{describeChange(c)}</li>)}</ul>
            :outcome!=='NONE'&&<p className="mode-help">Brak zapisanych zmian.</p>}
        </section>
      </div>
      <p className="verification-note"><b>LIVE</b> powstaje tylko po weryfikacji finalnej strony konkretnej oferty. Snippet, listing i agregator pozostają LEAD.</p>
      <section className="dispatch-box">
        <button className="run-button" onClick={()=>void start()} disabled={!connected||busy}>{busy?phase==='dispatching'?'Uruchamiam…':'W toku…':'URUCHOM '+mode.toUpperCase()}</button>
        {phase==='done'&&<button className="reload-button" onClick={()=>location.reload()}>Wczytaj najnowsze dane</button>}
        {error&&<p className="refresh-error" role="alert">{error}</p>}
        {connected
          ?<p className="mode-help">GitHub połączony na tę sesję. <button className="link-button" onClick={forgetToken}>Rozłącz</button></p>
          :<div className="token-box">
            <label>Token GitHub (tylko ta sesja karty)
              <input ref={tokenInput} type="password" autoComplete="off" spellCheck={false} aria-label="Token GitHub" placeholder="fine-grained, Actions: read/write"/>
            </label>
            <button onClick={saveToken}>Zapisz</button>
            <p className="mode-help">Token fine-grained dla repo <b>personal-audio-deal-board</b>, uprawnienie <b>Actions: Read and write</b>, krótka ważność. Trzymany wyłącznie w sessionStorage, wysyłany tylko do api.github.com. <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">Utwórz token ↗</a></p>
          </div>}
        <p className="mode-help"><a className="dispatch-link" href={WORKFLOW_URL} target="_blank" rel="noopener noreferrer">Awaryjnie: uruchom ręcznie na GitHubie ↗</a></p>
      </section>
    </dialog>
  </>;
}
