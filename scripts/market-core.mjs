export const LIVE_STATUSES = new Set(['LIVE VERIFIED','LIVE USED']);

export function canonicalUrl(input='') {
  try {
    const u = new URL(input);
    u.hash = '';
    ['utm_source','utm_medium','utm_campaign','fbclid','gclid','ref'].forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return input;
  }
}

export function fingerprint(o) {
  return [
    String(o.model || '').trim().toLowerCase(),
    String(o.revision || '').trim().toLowerCase(),
    String(o.condition || '').trim().toUpperCase(),
    String(o.seller || '').trim().toLowerCase(),
    canonicalUrl(String(o.url || ''))
  ].join('|');
}

export function median(values) {
  const a = values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if (!a.length) return null;
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
}

export function marketStats(observations) {
  const prices = observations.map(x=>Number(x.pricePln)).filter(x=>Number.isFinite(x) && x>0);
  if (prices.length <= 2) return {n:prices.length,confidence:'INSUFFICIENT MARKET SAMPLE',median:null,min:prices.length?Math.min(...prices):null,max:prices.length?Math.max(...prices):null};
  return {n:prices.length,confidence:prices.length>=5?'ROBUST':'PROVISIONAL',median:median(prices),min:Math.min(...prices),max:Math.max(...prices)};
}

export function verificationFromHttp(http) {
  if ([404,410].includes(http)) return 'DEAD';
  if ([401,403,429,451].includes(http)) return 'ACCESS_RESTRICTED_REVERIFY';
  if (http >= 200 && http < 300) return 'REACHABLE';
  if (http >= 500) return 'REMOTE_ERROR';
  return 'UNVERIFIED';
}

export function safeStatus(base, overlay) {
  if (base.status === 'HISTORICAL') return 'HISTORICAL';
  if (!overlay) return LIVE_STATUSES.has(base.status) ? 'STALE / REVERIFY' : base.status;
  if (overlay.verificationState === 'DEAD') return 'STALE / REVERIFY';
  if (overlay.status === 'HISTORICAL') return 'HISTORICAL';
  if (overlay.status === 'NON-EU / TLC') return 'NON-EU / TLC';
  // Seller could not establish availability, condition and price.
  // A previous spreadsheet LIVE label must never survive an unverified search.
  if (LIVE_STATUSES.has(base.status) && overlay.verificationState !== 'DIRECT_OFFER_VERIFIED')
    return 'STALE / REVERIFY';
  if (LIVE_STATUSES.has(overlay.status)) {
    if (overlay.verificationState === 'DIRECT_OFFER_VERIFIED' && LIVE_STATUSES.has(base.status)) return overlay.status;
    return base.status;
  }
  return overlay.status || base.status;
}

export function mergeOffer(base, overlay) {
  if (!overlay) return {...base,status:safeStatus(base,null)};
  const verified = overlay.verificationState === 'DIRECT_OFFER_VERIFIED';
  const merged = {...base};
  if (verified && Number.isFinite(overlay.price) && overlay.price > 0) merged.price = overlay.price;
  if (verified && overlay.original) merged.original = overlay.original;
  merged.status = safeStatus(base, overlay);
  if (merged.status === 'HISTORICAL') merged.role = 'HISTORICAL';
  // A blocked/ambiguous HTTP check is not a fresh seller confirmation.
  merged.checked = verified ? (overlay.checked || base.checked) : base.checked;
  merged.note = [base.note, overlay.note].filter(Boolean).join(' · ');
  merged.refresh = {verificationState:overlay.verificationState || 'UNVERIFIED',http:overlay.http ?? null,checkedAt:overlay.checkedAt || null};
  return merged;
}

export function mergeOverlay(baseDoc, currentDoc) {
  const updates = new Map((currentDoc?.updates || []).map(x=>[x.fingerprint,x]));
  const offers = (baseDoc.offers || []).map(o=>mergeOffer(o,updates.get(fingerprint(o))));
  const seen = new Set(offers.map(fingerprint));
  for (const add of (currentDoc?.additions || [])) {
    const fp=fingerprint(add);
    if (seen.has(fp)) continue;
    if (!add.refresh) continue;
    const verifiedNow = add.refresh.verificationState === 'DIRECT_OFFER_VERIFIED' && LIVE_STATUSES.has(add.status);
    // A previously verified addition may later turn stale/sold; it is never admitted without a first verification.
    const downgraded = Boolean(add.refresh.firstVerifiedAt) && ['STALE / REVERIFY','HISTORICAL'].includes(add.status);
    if (!verifiedNow && !downgraded) continue;
    offers.push(add); seen.add(fp);
  }
  return {...baseDoc,refresh:{refreshedAt:currentDoc?.refreshedAt || null,mode:currentDoc?.mode || null,runId:currentDoc?.runId || null,status:currentDoc?.status || 'NEVER'},offers};
}

export function computeDelta(before=[], after=[]) {
  const prior = new Map(before.map(o=>[fingerprint(o),o]));
  const out = {new:0,priceChanged:0,sold:0,stale:0,changes:[]};
  for (const o of after) {
    const prev = prior.get(fingerprint(o));
    if (!prev) { out.new++; out.changes.push({type:'NEW',model:o.model,price:o.price,url:o.url}); continue; }
    if (Number.isFinite(o.price) && Number.isFinite(prev.price) && o.price !== prev.price) { out.priceChanged++; out.changes.push({type:'PRICE',model:o.model,from:prev.price,to:o.price,url:o.url}); }
    if (prev.status !== 'HISTORICAL' && o.status === 'HISTORICAL') { out.sold++; out.changes.push({type:'SOLD',model:o.model,url:o.url}); }
    if (prev.status !== 'STALE / REVERIFY' && o.status === 'STALE / REVERIFY') { out.stale++; out.changes.push({type:'STALE',model:o.model,url:o.url}); }
  }
  return out;
}

export function directOfferEligible(url, source) {
  if (!source?.canVerifyOffer) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./,'');
    return (source.domains || []).some(d=>host===d || host.endsWith('.'+d));
  } catch {
    return false;
  }
}

const VOLATILE_KEYS = new Set(['checkedAt','checked','refreshedAt','runId','observedAt','discoveredAt','generatedAt']);

/** Deep copy without timestamps/run ids, so two runs can be compared for material change. */
export function stripVolatile(x) {
  if (Array.isArray(x)) return x.map(stripVolatile);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k])=>!VOLATILE_KEYS.has(k)).map(([k,v])=>[k,stripVolatile(v)]));
  return x;
}

export function materiallyEqual(a, b) {
  return JSON.stringify(stripVolatile(a)) === JSON.stringify(stripVolatile(b));
}

/** Observation is appended only when its state differs from the last recorded state for that offer. */
export function isMaterialObservation(prev, next) {
  if (!prev) return true;
  return prev.result !== next.result || prev.pricePln !== next.pricePln || prev.condition !== next.condition || prev.url !== next.url;
}

export function lastObservations(lines) {
  const last = new Map();
  for (const line of lines) {
    if (!line) continue;
    try { const o = JSON.parse(line); if (o.fingerprint) last.set(o.fingerprint, o); } catch { /* skip corrupt ledger line */ }
  }
  return last;
}

export function dedupeObservations(candidates, last) {
  const state = new Map(last);
  const out = [];
  for (const o of candidates) {
    if (!isMaterialObservation(state.get(o.fingerprint), o)) continue;
    state.set(o.fingerprint, o); out.push(o);
  }
  return out;
}

const VERIFIED_RESULTS = new Set(['DIRECT_OFFER_VERIFIED','NEW_DIRECT_OFFER_VERIFIED']);
/** Same-condition market sample = distinct directly-verified offers (latest observation each). */
export function statsFromLedger(last) {
  const groups = new Map();
  for (const o of last.values()) {
    if (!VERIFIED_RESULTS.has(o.result)) continue;
    const k = [o.model, o.condition].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  return [...groups.entries()].map(([key, rows]) => ({ key, ...marketStats(rows) }));
}

/** Overlay of a partial (category-scoped) run over the previous overlay; offers not re-checked keep their state. */
export function mergeCurrent(prev, next) {
  const nextFps = new Set(next.updates.map(u=>u.fingerprint));
  const keptUpdates = (prev?.updates || []).filter(u => !nextFps.has(u.fingerprint));
  const additions = new Map((prev?.additions || []).map(a=>[fingerprint(a),a]));
  for (const a of next.additions) additions.set(fingerprint(a), a);
  // Deterministic order, so a skipped (transient) check does not read as a material change.
  const byFp = (a, b) => (a.fingerprint || fingerprint(a)).localeCompare(b.fingerprint || fingerprint(b));
  return { ...next, updates: [...keptUpdates, ...next.updates].sort(byFp), additions: [...additions.values()].sort(byFp) };
}

export function noopDelta(delta, observationChanges) {
  return delta.changes.length === 0 && observationChanges === 0;
}

/**
 * Red-team gate before a newly discovered offer may be promoted to LIVE.
 * block=true keeps it out of the dashboard (stays a lead in market-candidates.json).
 */
export function redTeam(addition, source, peer) {
  const flags = [];
  let block = false;
  if (String(source?.region || '').startsWith('non-EU')) { flags.push('NON_EU_VAT_CUSTOMS_BROKERAGE'); block = true; }
  const ref = peer?.sameMarket;
  if (Number.isFinite(ref) && Number.isFinite(addition.price) && addition.price < ref * 0.4) { flags.push('PRICE_FAR_BELOW_MARKET_CHECK_VARIANT_OR_COUNTERFEIT'); block = true; }
  if (['TWS','Głośniki BT'].includes(addition.category) && addition.condition !== 'NEW') flags.push('BATTERY_HEALTH_UNVERIFIED');
  if (addition.condition !== 'NEW') flags.push('WARRANTY_AND_ACCESSORIES_UNVERIFIED');
  // No promotion to a purchasable LIVE deal while the final landed cost is unknown.
  flags.push('SHIPPING_NOT_INCLUDED');
  block = true;
  return { block, flags };
}
