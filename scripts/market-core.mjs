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
  if (!overlay) return base.status;
  if (overlay.verificationState === 'DEAD') return 'STALE / REVERIFY';
  if (overlay.status === 'HISTORICAL') return 'HISTORICAL';
  if (overlay.status === 'NON-EU / TLC') return 'NON-EU / TLC';
  if (LIVE_STATUSES.has(overlay.status)) {
    if (overlay.verificationState === 'DIRECT_OFFER_VERIFIED' && LIVE_STATUSES.has(base.status)) return overlay.status;
    return base.status;
  }
  return overlay.status || base.status;
}

export function mergeOffer(base, overlay) {
  if (!overlay) return {...base};
  const verified = overlay.verificationState === 'DIRECT_OFFER_VERIFIED';
  const merged = {...base};
  if (verified && Number.isFinite(overlay.price) && overlay.price > 0) merged.price = overlay.price;
  if (verified && overlay.original) merged.original = overlay.original;
  merged.status = safeStatus(base, overlay);
  merged.checked = overlay.checked || base.checked;
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
    if (!add.refresh || add.refresh.verificationState !== 'DIRECT_OFFER_VERIFIED') continue;
    if (!LIVE_STATUSES.has(add.status)) continue;
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
