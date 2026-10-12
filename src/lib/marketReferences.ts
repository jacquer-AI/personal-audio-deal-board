import type {Offer} from '../types';

export interface MarketSample {
  key: string;
  n: number;
  confidence: string;
  median: number | null;
  min: number | null;
  max: number | null;
}
export interface MarketStatsDocument {refreshedAt: string; stats: MarketSample[]}
export interface IndexedRetailReference {
  model: string;
  variant: string;
  condition: 'NEW';
  pricePln: number;
  source: string;
  url: string;
  observedAt: string;
  evidence: 'INDEXED_RETAIL_ASKING_PRICE';
}
export interface RetailReferenceDocument {references: IndexedRetailReference[]}
export type PricePoint = {
  value: number | null;
  basis: 'SHEET_BENCHMARK' | 'VERIFIED_SELLER_SAMPLE' | 'RETAIL_INDEX' | 'MISSING';
  explanation: string;
  url?: string;
  variant?: string;
  observedAt?: string;
  stale: boolean;
};
const valid = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;
const ageStale = (date: string | undefined, now: number, maxDays: number): boolean => {
  const t = Date.parse(date || '');
  return !Number.isFinite(t) || now < t || now - t > maxDays * 86400000;
};
const none = (): PricePoint => ({value: null, basis: 'MISSING', explanation: 'Brak wiarygodnej próbki', stale: true});
const fromSample = (s: MarketSample | undefined, date: string, now: number): PricePoint => {
  if (!s || !Number.isInteger(s.n) || s.n < 1 || !valid(s.min)) return none();
  const isMedian = s.n >= 3 && valid(s.median);
  return {
    value: isMedian ? s.median : s.min,
    basis: 'VERIFIED_SELLER_SAMPLE',
    explanation: isMedian ? 'mediana ' + s.n + ' cen ofertowych' :
      s.n === 1 ? '1 odczytana cena ofertowa' : 'od ' + s.n + ' odczytanych cen ofertowych',
    observedAt: date,
    stale: ageStale(date, now, 7)
  };
};
/** Informational references NEVER mutate Offer, the eligibility gate, discounts, or B4B.
 * Ceneo index entries are not direct stock or checkout-price confirmations.
 * Samples are model-family asking prices, not proven variant-/impedance-matched comparisons.
 */
export function priceReferences(
  offer: Pick<Offer, 'model' | 'condition' | 'sameMarket' | 'newMarket'>,
  statistics: MarketStatsDocument,
  retail: RetailReferenceDocument,
  now = Date.now()
): {same: PricePoint; newest: PricePoint} {
  const sample = (condition: string) =>
    statistics.stats.find(s => s.key === offer.model + '|' + condition);
  const sheet = (value: number): PricePoint => ({
    value, basis: 'SHEET_BENCHMARK', explanation: 'benchmark z arkusza', stale: false
  });
  const same = valid(offer.sameMarket) ? sheet(offer.sameMarket) :
    fromSample(sample(offer.condition), statistics.refreshedAt, now);
  let newest: PricePoint;
  if (valid(offer.newMarket)) newest = sheet(offer.newMarket);
  else {
    const listing = retail.references.find(x => x.model === offer.model && x.condition === 'NEW' &&
      valid(x.pricePln) && /^https:\/\//.test(x.url) && x.evidence === 'INDEXED_RETAIL_ASKING_PRICE');
    newest = listing ? {
      value: listing.pricePln, basis: 'RETAIL_INDEX',
      explanation: 'indeks ceny nowej (niepotwierdzona dostępność)',
      url: listing.url, variant: listing.variant, observedAt: listing.observedAt,
      stale: ageStale(listing.observedAt, now, 7)
    } : fromSample(sample('NEW'), statistics.refreshedAt, now);
  }
  return {same, newest};
}
