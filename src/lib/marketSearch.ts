import {vintedSearchUrl} from './vinted';

/** Marketplace entry points are discovery links, never verified inventory. */
export const marketplaces = [
  {id:'vinted', label:'Vinted', url:(q:string)=>vintedSearchUrl(q)},
  {id:'olx', label:'OLX', url:(q:string)=>'https://www.olx.pl/oferty/q-'+encodeURIComponent(q.trim()||'słuchawki')+'/'},
  {id:'allegro', label:'Allegro', url:(q:string)=>'https://allegro.pl/listing?string='+encodeURIComponent(q.trim()||'słuchawki')},
  {id:'ebay', label:'eBay DE', url:(q:string)=>'https://www.ebay.de/sch/i.html?_nkw='+encodeURIComponent(q.trim()||'headphones')},
  {id:'kleinanzeigen', label:'Kleinanzeigen', url:(q:string)=>'https://www.kleinanzeigen.de/s-'+encodeURIComponent(q.trim()||'Kopfhörer')+'/k0'}
] as const;

/** Models to actively search for — not offers or quality/price recommendations.
 * No fabricated inventory, quality grades, rankings or benchmark prices. */
export const additionalWatchModels = [
  'Etymotic ER4P', 'Etymotic ER4S', 'Etymotic ER4XR',
  'Beyerdynamic DT 880', 'Sony MDR-SA5000',
  'Thieaudio Monarch MkII', 'Thieaudio Monarch MkIII',
  'Sennheiser IE 600', 'Sennheiser IE 900',
  'Sony IER-Z1R', '64 Audio U4s',
  'Moondrop S8', 'DUNU SA6 Ultra', 'HIFIMAN Arya Stealth',
  'Dan Clark Audio E3', 'Focal Clear MG'
] as const;

export const uniqueWatchModels=(existing:string[]) =>
  additionalWatchModels.filter(m=>!existing.some(x=>x.toLocaleLowerCase()===m.toLocaleLowerCase()));
