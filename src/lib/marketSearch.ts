import {vintedSearchUrl} from './vinted';
import registry from '../../config/model-registry.json';

/** Marketplace entry points are discovery links, never verified inventory. */
export const marketplaces = [
  {id:'hifishark', label:'HiFiShark', url:(q:string)=>'https://www.hifishark.com/search?q='+encodeURIComponent(q.trim()||'headphones')},
  {id:'vinted', label:'Vinted', url:(q:string)=>vintedSearchUrl(q)},
  {id:'olx', label:'OLX', url:(q:string)=>'https://www.olx.pl/oferty/q-'+encodeURIComponent(q.trim()||'słuchawki')+'/'},
  {id:'allegro', label:'Allegro', url:(q:string)=>'https://allegro.pl/listing?string='+encodeURIComponent(q.trim()||'słuchawki')},
  {id:'subito', label:'Subito', url:(q:string)=>'https://www.subito.it/annunci-italia/vendita/usato/?q='+encodeURIComponent(q.trim()||'cuffie')},
  {id:'marktplaats', label:'Marktplaats', url:(q:string)=>'https://www.marktplaats.nl/q/'+encodeURIComponent(q.trim()||'koptelefoon')+'/'},
  {id:'ebay', label:'eBay DE', url:(q:string)=>'https://www.ebay.de/sch/i.html?_nkw='+encodeURIComponent(q.trim()||'headphones')},
  {id:'kleinanzeigen', label:'Kleinanzeigen', url:(q:string)=>'https://www.kleinanzeigen.de/s-'+encodeURIComponent(q.trim()||'Kopfhörer')+'/k0'}
] as const;

/** ONE canonical watch scope: no separate hard-coded 16-model browser list.
 * Search-only entries do not create offers, ratings or fictitious benchmarks. */
export const additionalWatchModels=registry.models.filter(m=>m.enabled!==false)
  .sort((a,b)=>(('priority' in a&&typeof a.priority==='number')?a.priority:99)-(('priority' in b&&typeof b.priority==='number')?b.priority:99))
  .map(m=>m.model);
export const trackedModelCount=additionalWatchModels.length;
export const uniqueWatchModels=(existing:string[]) =>
  additionalWatchModels.filter(m=>!existing.some(x=>x.toLocaleLowerCase()===m.toLocaleLowerCase()));

/** Manual shortcuts for models without a recorded seller listing. */
export const watchMarketplaces=marketplaces.filter(m=>['hifishark','vinted','subito','marktplaats'].includes(m.id));
