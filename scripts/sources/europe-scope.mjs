/** Geographic admission is based on seller/listing location, NOT the search
 * portal's TLD or the global aggregator's headquarters. Fail closed on unknown.
 * European non-EU countries (UK, Norway, Switzerland) remain in Europe.
 */
const europeCountries=[
  ['Polska',/\b(?:poland|polska|polen|polonia|pl)\b/i],
  ['Niemcy',/\b(?:germany|deutschland|niemcy|de)\b/i],
  ['Włochy',/\b(?:italy|italia|włochy|italien|it)\b/i],
  ['Wielka Brytania',/\b(?:united kingdom|great britain|england|scotland|wales|uk|gb)\b/i],
  ['Norwegia',/\b(?:norway|norge|norwegen|no)\b/i],
  ['Szwajcaria',/\b(?:switzerland|schweiz|suisse|ch)\b/i],
  ['Holandia',/\b(?:netherlands|nederland|holland|nl)\b/i],
  ['Francja',/\b(?:france|frankreich|fr)\b/i],
  ['Hiszpania',/\b(?:spain|españa|espana|es)\b/i],
  ['Austria',/\b(?:austria|österreich|osterreich|at)\b/i],
  ['Belgia',/\b(?:belgium|belgie|belgique|be)\b/i],
  ['Finlandia',/\b(?:finland|suomi|fi)\b/i],
  ['Szwecja',/\b(?:sweden|sverige|se)\b/i],
  ['Dania',/\b(?:denmark|danmark|dk)\b/i],
  ['Czechy',/\b(?:czechia|czech republic|česko|cz)\b/i],
  ['Słowacja',/\b(?:slovakia|slovensko|sk)\b/i],
  ['Węgry',/\b(?:hungary|magyarország|magyarorszag|hu)\b/i],
  ['Portugalia',/\b(?:portugal|pt)\b/i],
  ['Irlandia',/\b(?:ireland|éire|ie)\b/i],
  ['Grecja',/\b(?:greece|hellas|gr)\b/i],
  ['Rumunia',/\b(?:romania|ro)\b/i],
  ['Bułgaria',/\b(?:bulgaria|bg)\b/i],
  ['Chorwacja',/\b(?:croatia|hrvatska|hr)\b/i],
  ['Słowenia',/\b(?:slovenia|si)\b/i],
  ['Estonia',/\b(?:estonia|ee)\b/i],
  ['Łotwa',/\b(?:latvia|lv)\b/i],
  ['Litwa',/\b(?:lithuania|lt)\b/i],
  ['Ukraina',/\b(?:ukraine|україна|ua)\b/i],
  ['Islandia',/\b(?:iceland|ísland|island|is)\b/i]
];
const outside=/\b(?:japan|japonia|china|chiny|usa|united states|u\.s\.a\.|hong kong|singapore|kazakhstan|brazil|brasil|australia|canada|india|korea|taiwan|turkey|türkiye)\b/i;
const localized=new Map([
 ['olx-pl','Polska'],['allegro-pl','Polska'],['allegro-lokalnie','Polska'],
 ['subito-it','Włochy'],['kleinanzeigen-de','Niemcy'],
 ['marktplaats-nl','Holandia'],['vinted-pl','Polska'],
 ['mediaexpert-outlet','Polska'],['tophifi-outlet','Polska'],
 ['amazon-de-resale','Niemcy'],['wallapop-es','Hiszpania'],
 ['beyerdynamic-outlet','Niemcy'],['thomann-pl','Niemcy'],
 ['mp3store-pl','Polska'],['nt-global-de','Niemcy'],
 ['muzix-eu','Węgry'],['technics-pl','Polska'],
 ['jbl-pl','Polska'],['marshall-pl','Polska']
]);
export function europeCountryFromLabel(value){
 const text=String(value||'').trim();
 if(!text||outside.test(text))return null;
 return europeCountries.find(([,rx])=>rx.test(text))?.[0]||null;
}
export function geographicEvidence(source,html=''){
 const id=String(source?.id||'');
 // Geographical server suffix proves *site* market, not seller location on
 // global marketplaces such as eBay. JSON-LD location takes precedence.
 const structured=String(html).match(/["'](?:addressCountry|sellerCountry|itemLocation)["']\s*:\s*["']([^"']{2,80})["']/i)?.[1];
 const country=structured?europeCountryFromLabel(structured):null;
 if(structured&&!country)return null;
 if(country)return {country,region:country==='Polska'?'Polska':['Wielka Brytania','Norwegia','Szwajcaria'].includes(country)?'non-EU / TLC':'UE',basis:'SELLER_LOCATION'};
 if(id.startsWith('ebay-')||id==='headfi-classifieds'||id==='hifishark')return null;
 const local=localized.get(id);
 if(!local)return null;
 return {country:local,region:local==='Polska'?'Polska':'UE',basis:'LOCAL_MARKETPLACE'};
}
export function isEuropeRecordedOffer(o){
 const country=String(o?.country||'');
 if(outside.test(country))return false;
 if(/nie podano|unknown|nieustalon/i.test(country))return false;
 if(o?.region==='Polska'||o?.region==='UE')return true;
 return Boolean(europeCountryFromLabel(country));
}
