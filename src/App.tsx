import {useState, useEffect, useRef} from 'react';
import snapshot from '../data/offers.json';
import type {Offer, Filters, Product, Status} from './types';
import {results, group, b4b, discount, savings, decision, selectCompare, buyable, percentLabel, modelCount} from './lib/board';
import RefreshCenter from './RefreshCenter';
import BuildFreshness from './BuildFreshness';

const offers = snapshot.offers as Offer[];
const categories = ['Wszystkie', 'IEM', 'TWS', 'Closed', 'Głośniki BT'];
const defaults: Filters = {search:'', category:'Wszystkie', conditions:[], region:'Wszystkie', status:'Wszystkie', liveOnly:true, history:false, sort:'b4b'};
function read() {
  try { return {...defaults, ...JSON.parse(localStorage.getItem('audio-board') || '{}')}; }
  catch { return defaults; }
}
function readDensity() {
  try { return localStorage.getItem('audio-density') === 'Comfortable' ? 'Comfortable' : 'Compact'; }
  catch { return 'Compact'; }
}
const money = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('pl-PL', {
  style:'currency', currency:'PLN', minimumFractionDigits:0, maximumFractionDigits:2
}).format(n);
// Price position: cheaper offers use a minus sign.
const pct = percentLabel;
const countryLabel = (country:string) => country === 'Poland' ? 'Polska' : country;
const statusText: Record<Status, string> = {
  'LIVE VERIFIED':'LIVE', 'LIVE USED':'LIVE USED', 'LEAD ONLY':'LEAD', 'HISTORICAL':'HISTORIA',
  'NON-EU / TLC':'TLC', 'STALE / REVERIFY':'SPRAWDŹ', 'MARKET COMP':'COMP', 'OFFICIAL':'OFFICIAL'
};
function Source({offer, primary = false}: {offer: Offer; primary?: boolean}) {
  const role = !buyable(offer) ? statusText[offer.status] : primary ? 'LIVE' : offer.condition+' COMP';
  return <div className={'source ' + (offer.status === 'HISTORICAL' ? 'historical' : !buyable(offer) ? 'unverified' : '')} data-testid="source-row">
    <span className="source-role" title={offer.status} aria-label={offer.status}>{role}</span><strong>{money(offer.price)}</strong>
    <span className="source-seller">{offer.seller}<small>{countryLabel(offer.country)}</small></span><span>{offer.condition}</span>
    <a href={offer.url} target="_blank" rel="noopener noreferrer" aria-label={'Otwórz źródło: ' + offer.model + ' · ' + offer.seller + ' · ' + offer.condition}>↗</a>
  </div>;
}
function Price({offer}: {offer: Offer}) {
  return <div className="price-position">
    <div className="offer-price"><span className="sr-only">Oferta</span><strong>{money(offer.price)}</strong></div>
    <div className="market"><span>Rynek stanu <b>{money(offer.sameMarket)}</b></span><span>Nowe <b>{money(offer.newMarket)}</b></span></div>
    <div className="metrics"><span><b>{pct(discount(offer))}</b> vs stan</span><span><b>{pct(savings(offer))}</b> vs nowe</span></div>
  </div>;
}
function OfferDetails({product}: {product: Product}) {
  return <details className="offer-details">
    <summary>Więcej ofert ({product.offers.length})</summary>
    <p className="source-legend">LIVE — oferta zweryfikowana według zapisu. LEAD — trop do sprawdzenia. COMP — oferta porównawcza. NEW — nowe, USED — używane, B-STOCK — towar ze zwrotu lub ekspozycji.</p>
    <div className="source-list">{product.offers.map(o => <Source key={o.id} offer={o} primary={o.id === product.best.id}/>)}</div>
    <details className="notes"><summary>Uwagi</summary>
      {product.offers.map(o => <p key={o.id}><b>{o.seller} · {o.condition}</b> — {o.note}<small>Cena oryginalna: {o.original} · Zapis SSOT: {o.checked}</small></p>)}
      <p>MSRP / RRP: {money(product.best.rrp)} · Fit: {product.best.fit ?? '—'}/5</p>
    </details>
  </details>;
}
export default function App() {
  const [f, setF] = useState<Filters>(read);
  const [density, setDensity] = useState(readDensity);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [comparison, setComparison] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const compareButton = useRef<HTMLButtonElement>(null);
  const filters = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem('audio-board', JSON.stringify({category:f.category, sort:f.sort, liveOnly:f.liveOnly}));
      localStorage.setItem('audio-density', density);
    } catch { /* Storage can be unavailable in private browsing. */ }
  }, [f, density]);
  useEffect(() => {
    if (comparison) dialog.current?.showModal(); else dialog.current?.close();
  }, [comparison]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (filters.current?.open && !filters.current.contains(e.target as Node)) filters.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const change = <K extends keyof Filters>(key: K, value: Filters[K]) => setF(x => ({...x, [key]:value}));
  const products = results(offers, f);
  const compare = group(offers).filter(p => selected.includes(p.model));
  const filterCount = f.conditions.length + Number(f.status !== 'Wszystkie') + Number(f.history) + Number(!f.liveOnly);
  function toggle(model: string) {
    const next = selectCompare(selected, model); setSelected(next.ids); setMessage(next.error);
  }
  function product(p: Product, i: number) {
    const o = p.best;
    return <article key={p.model} className="product" data-testid="product">
      <header className="product-header">
        <span className="rank">#{i + 1}</span><h2>{p.model}</h2>
        <span className="product-meta">{o.category} · <b aria-label={'Jakość ' + o.quality}>{o.quality.replace('-', '−')}</b></span>
        <span className="score" title="B4B: jakość × rynek tego samego stanu / cena oferty. Wyżej = lepszy stosunek jakości do ceny.">B4B <b>{b4b(o)?.toFixed(1) ?? '—'}</b></span>
        <label className="compare-select"><input type="checkbox" checked={selected.includes(p.model)} onChange={() => toggle(p.model)}/>Porównaj<span className="sr-only"> {p.model}</span></label>
      </header>
      <p className="decision-line"><span>{o.condition}</span><span title={o.status} aria-label={o.status}>{statusText[o.status]}</span><strong>{decision(o)}</strong></p>
      <p className="offer-provenance">Weryfikacja według zapisu: {o.checked}. Potwierdź cenę i dostępność u sprzedawcy.</p>
      <div className="record-body"><Price offer={o}/><div className="seller-action">
        <p>{o.seller}<span> · {countryLabel(o.country)}</span></p>
        <a className="primary-link" data-testid="primary-link" href={o.url} target="_blank" rel="noopener noreferrer"
          aria-label={(buyable(o) ? 'Otwórz ofertę: ' : 'Otwórz źródło: ') + o.model + ' · ' + o.seller + ' · ' + o.condition}>
          {buyable(o) ? 'Otwórz ofertę ↗' : 'Otwórz źródło ↗'}
        </a>
      </div></div><OfferDetails product={p}/>
    </article>;
  }
  return <div className={'app ' + density.toLowerCase()}>
    <BuildFreshness/>
    <a className="skip" href="#results">Przejdź do wyników</a>
    <header className="masthead"><div><h1>PERSONAL AUDIO <span>— Deal Board</span></h1>
      <p>PLN · Polska/UE-first · NEW/USED/B-stock porównywane do właściwego rynku</p></div>
      <div className="masthead-actions">
        <RefreshCenter refresh={(snapshot as {refresh?:{refreshedAt?:string|null;mode?:string|null;status?:string|null}}).refresh}/>
        <a className="ssot-link" href={snapshot.source} target="_blank" rel="noopener noreferrer" aria-label="Otwórz Google Sheets — źródło danych">Arkusz ↗</a>
      </div>
    </header>
    <section className="toolbar" aria-label="Filtry i sortowanie">
      <input className="search" aria-label="Szukaj modelu, sprzedawcy, kraju lub źródła" type="search" value={f.search} onChange={e => change('search', e.target.value)} placeholder="Szukaj modelu, sprzedawcy…"/>
      <div className="tabs" role="group" aria-label="Kategoria">{categories.map(c =>
        <button key={c} aria-pressed={f.category === c} onClick={() => change('category', c)}>{c}</button>)}</div>
      <select className="region-control" aria-label="Region" value={f.region} onChange={e => change('region', e.target.value)}>
        <option value="Wszystkie">Region: wszystkie</option><option>Polska</option><option>UE</option><option>non-EU / TLC</option>
      </select>
      <select className="sort-control" aria-label="Sortuj" value={f.sort} onChange={e => change('sort', e.target.value)}>
        <option value="b4b">B4B ↓</option><option value="discount">vs stan ↓</option><option value="savings">vs nowe ↓</option><option value="price">Cena ↑</option><option value="quality">Jakość ↓</option><option value="fit">Fit ↓</option>
      </select>
      <details className="more-filters" ref={filters} onKeyDown={e => {
        if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); }
      }}>
        <summary aria-label="Filtry">Filtry{filterCount > 0 && <span> · {filterCount}</span>}</summary>
        <div className="filter-panel">
          <fieldset><legend className="sr-only">Stan</legend>{['NEW', 'USED', 'B-STOCK', 'OPEN-BOX', 'HISTORICAL'].map(c => <label key={c}>
            <input type="checkbox" checked={f.conditions.includes(c)} onChange={() => {
              change('conditions', f.conditions.includes(c) ? f.conditions.filter(x => x !== c) : [...f.conditions, c]);
              if (c === 'HISTORICAL') { change('history', true); change('liveOnly', false); }
            }}/>{c === 'HISTORICAL' ? 'Historyczne' : c}</label>)}
          </fieldset>
          <label className="status-control">Status<select aria-label="Status" value={f.status} onChange={e => {
            change('status', e.target.value); if (e.target.value === 'HISTORICAL') { change('history', true); change('liveOnly', false); }
          }}>{['Wszystkie', 'LIVE VERIFIED', 'LIVE USED', 'LEAD ONLY', 'HISTORICAL', 'NON-EU / TLC', 'STALE / REVERIFY'].map(s => <option key={s}>{s}</option>)}</select></label>
          <div className="filter-options">
            <label><input type="checkbox" checked={f.liveOnly} onChange={e => {change('liveOnly', e.target.checked); if (e.target.checked) change('history', false);}}/>Live</label>
            <label><input type="checkbox" checked={f.history} onChange={e => {change('history', e.target.checked); if (e.target.checked) change('liveOnly', false);}}/>Historia</label>
            <label>Widok<select aria-label="Gęstość" value={density} onChange={e => setDensity(e.target.value)}><option>Compact</option><option>Comfortable</option></select></label>
          </div><button className="reset" onClick={() => setF(defaults)}>Wyczyść filtry</button>
        </div>
      </details>
    </section>
    <main id="results" tabIndex={-1}>
      <div className="results-heading"><span><b>{products.length}</b> {modelCount(products.length)}</span><small>Stan arkusza: {snapshot.snapshot}</small></div>
      <p role="status" className="message">{message}</p>
      {products.length ? products.map(product) : <div className="empty"><h2>Brak wyników</h2><button onClick={() => setF(defaults)}>Wyczyść filtry</button></div>}
    </main>
    <footer><details className="methodology"><summary>Jak liczymy ceny i B4B?</summary>
      <p>NEW porównujemy z NEW, USED z USED, B-STOCK z B-STOCK. Rynek stanu i oszczędność względem nowych to osobne punkty odniesienia. Minus oznacza ofertę tańszą od wskazanego rynku; plus — droższą.</p>
      <p>B4B = QualityWeight × (rynek tego samego stanu / oferta). S 120 · S− 115 · A+ 110 · A 100 · A− 90 · B+ 80 · B 70 · B− 60 · C 50 · D 35 · E 20. Brak benchmarku oznacza brak B4B. MSRP jest wyłącznie odniesieniem.</p>
      <p>B4B łączy jakość i cenę — pierwsze miejsce nie musi oznaczać najniższej ceny. FAIR PRICE: cena zbliżona do rynku. STRONG BUY: atrakcyjna cena względem rynku stanu. PSEUDO-DEAL: drożej niż rynek stanu. TLC oznacza pełny koszt importu, z dostawą i opłatami.</p>
      <p>Lead, import bez TLC i historia nie uczestniczą w rankingu Live. Fit: 1–5 z SSOT. Rynek PLN ma pierwszeństwo przed starszymi zakładkami. DUNU LIVE/RECENT STORE pozostaje LEAD ONLY do ponownej weryfikacji.</p>
      <p>Ceny i dostępność według arkusza: {snapshot.snapshot}, bez monitoringu na żywo. FX: EUR/PLN 4.37111 · GBP/PLN 5.15290 · USD/PLN 3.88344 · {snapshot.fx.timestamp}.</p>
    </details></footer>
    {selected.length > 0 && <aside className="compare-dock" aria-label="Wybrane modele"><div><b>Porównanie {selected.length}/3</b><span>{selected.join(' · ')}</span></div>
      <button ref={compareButton} onClick={() => setComparison(true)}>Otwórz porównanie</button><button onClick={() => {setSelected([]); setMessage('');}}>Wyczyść</button>
    </aside>}
    <dialog ref={dialog} onCancel={() => setComparison(false)} onClose={() => {setComparison(false); compareButton.current?.focus();}} aria-labelledby="compare-title">
      <header className="dialog-header"><h2 id="compare-title">Porównanie modeli</h2><button onClick={() => setComparison(false)} autoFocus>Zamknij</button></header>
      <div className="comparison-grid">{compare.map(p => <section key={p.model}>
        <h3>{p.model}</h3><p>{p.best.category} · {p.best.quality} · Fit {p.best.fit ?? '—'}/5</p><p>B4B <b>{b4b(p.best)?.toFixed(1) ?? '—'}</b> · {decision(p.best)}</p>
        <Price offer={p.best}/><p>{p.best.condition} · {p.best.region}</p>
        {p.offers.filter(o => o.status !== 'HISTORICAL' || f.history).map(o => <Source key={o.id} offer={o} primary={o.id === p.best.id}/>)}
      </section>)}</div>
    </dialog>
  </div>;
}

