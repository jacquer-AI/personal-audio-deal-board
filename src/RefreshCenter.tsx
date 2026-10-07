import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import deltaSnapshot from '../data/refresh-delta.json';

const WORKFLOW_URL='https://github.com/jacquer-AI/personal-audio-deal-board/actions/workflows/pages.yml';
const RUNS_API='https://api.github.com/repos/jacquer-AI/personal-audio-deal-board/actions/workflows/pages.yml/runs?per_page=1';

type Mode='quick'|'full'|'deep';
type Run={status:string;conclusion:string|null;updated_at:string;html_url:string};
type RefreshMeta={refreshedAt?:string|null;mode?:string|null;status?:string|null};

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

export default function RefreshCenter({refresh}:{refresh?:RefreshMeta}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>('quick');
  const [category,setCategory]=useState('all');
  const [run,setRun]=useState<Run|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open]);

  const readLatest=useCallback(async()=>{
    if(location.hostname==='127.0.0.1'||location.hostname==='localhost')return;
    try{
      const res=await fetch(RUNS_API,{headers:{Accept:'application/vnd.github+json'}});
      if(!res.ok)throw new Error('GitHub API '+res.status);
      const body=await res.json() as {workflow_runs?:Run[]};
      setRun(body.workflow_runs?.[0]||null);
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Status niedostępny')}
  },[]);

  useEffect(()=>{void readLatest()},[readLatest]);
  useEffect(()=>{
    if(!open)return;
    void readLatest();
    const timer=window.setInterval(()=>void readLatest(),5000);
    return()=>window.clearInterval(timer);
  },[open,readLatest]);

  const state=run?(run.status==='completed'?(run.conclusion==='success'?'COMPLETED':'FAILED'):run.status.toUpperCase()):(refresh?.status||'NEVER');
  const freshness=useMemo(()=> 'Rynek: '+ageLabel(run?.updated_at||refresh?.refreshedAt||null)+' · '+state,[run,refresh,state]);
  const d=deltaSnapshot as {new:number;priceChanged:number;sold:number;stale:number};

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
            {(['quick','full','deep'] as Mode[]).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m.toUpperCase()}</button>)}
          </div>
          <p className="mode-help">{mode==='quick'?'Bieżące bezpośrednie URL-e.':mode==='full'?'QUICK + nowe oferty znanych modeli.':'FULL + nieadjudykowane challengery.'}</p>
          <label>Kategoria
            <select aria-label="Kategoria refreshu" value={category} onChange={e=>setCategory(e.target.value)}>
              <option value="all">Wszystkie</option><option>IEM</option><option>TWS</option><option>Closed</option><option>Głośniki BT</option>
            </select>
          </label>
        </section>
        <section>
          <h3>Status</h3>
          <p data-testid="refresh-state"><b>{state}</b>{run?' · '+new Date(run.updated_at).toLocaleString('pl-PL'):''}</p>
          {run&&<a href={run.html_url} target="_blank" rel="noopener noreferrer">Otwórz ostatni run ↗</a>}
          <div className="delta-strip" aria-label="Delta ostatniego zapisanego odświeżenia">
            <span>nowe <b>{d.new||0}</b></span><span>cena <b>{d.priceChanged||0}</b></span><span>sold <b>{d.sold||0}</b></span><span>stale <b>{d.stale||0}</b></span>
          </div>
        </section>
      </div>
      <p className="verification-note"><b>LIVE</b> powstaje tylko po weryfikacji finalnej strony konkretnej oferty. Snippet, listing i agregator pozostają LEAD.</p>
      <section className="dispatch-box">
        <h3>Uruchom teraz</h3>
        <p>Na GitHub wybierz <b>Run workflow</b>, ustaw <b>{mode.toUpperCase()}</b> i kategorię <b>{category}</b>. Nie trzeba podawać żadnego tokenu tej stronie.</p>
        <a className="dispatch-link" href={WORKFLOW_URL} target="_blank" rel="noopener noreferrer">Otwórz bezpieczny Run workflow ↗</a>
        {error&&<p className="refresh-error" role="alert">{error}</p>}
        {state==='COMPLETED'&&<button className="reload-button" onClick={()=>location.reload()}>Wczytaj najnowsze dane</button>}
      </section>
    </dialog>
  </>;
}
