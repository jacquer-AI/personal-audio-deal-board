import type {Status} from '../types';

const conditionNames:Record<string,string>={
  'NEW':'NOWE','USED':'UŻYWANE','B-STOCK':'PO ZWROCIE / EKSPOZYCJI','OPEN-BOX':'OTWARTE OPAKOWANIE',
  'NEWCONDITION':'NOWE','USEDCONDITION':'UŻYWANE','USATO':'UŻYWANE',
  'GEBRAUCHT':'UŻYWANE','NEU':'NOWE'
};

/** Condition describes the item, never the freshness or trustworthiness of a listing. */
export function conditionLabel(value?:string|null):string {
  if(!value?.trim())return 'STAN NIEUSTALONY';
  return conditionNames[value.trim().toUpperCase()]||'STAN NIEUSTALONY';
}

/** Current direct-page evidence must be distinguished from historical source status. */
export function offerStatusLabel(status:Status,current:boolean):string {
  if(['LIVE VERIFIED','LIVE USED'].includes(status))return current?'OFERTA POTWIERDZONA':'AKTUALNOŚĆ NIEPOTWIERDZONA';
  const labels:Record<Status,string>={
    'LIVE VERIFIED':'OFERTA POTWIERDZONA','LIVE USED':'OFERTA POTWIERDZONA',
    'LEAD ONLY':'TROP DO SPRAWDZENIA','HISTORICAL':'ARCHIWALNA',
    'NON-EU / TLC':'IMPORT · KOSZT NIEZNANY','STALE / REVERIFY':'DO PONOWNEJ KONTROLI',
    'MARKET COMP':'PORÓWNANIE RYNKU','OFFICIAL':'ŹRÓDŁO OFICJALNE'
  };
  return labels[status];
}
