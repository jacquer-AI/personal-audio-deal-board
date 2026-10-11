/**
 * Model-first source coverage. Always query the proven direct-listing sites
 * for every tracked model before spending a bounded budget on exploratory sites.
 * No credential, proxy, anti-bot bypass or unverifiable listing promotion.
 */
export function planDiscoveryJobs(models, sources, maxJobs, coreIds=[]) {
  if(!Array.isArray(models)||!Array.isArray(sources)||!models.length||!sources.length||maxJobs<=0)return [];
  const jobs=[],used=new Set();
  const add=(m,s)=>{
    if(!m||!s||jobs.length>=maxJobs)return;
    const key=m.model+'|'+s.id;
    if(used.has(key))return;
    used.add(key);
    const term=(s.queryTerms||[])[0]||'';
    const query=[m.model,term].filter(Boolean).join(' ');
    jobs.push({m,s,query,url:s.searchUrlTemplate.replace('{q}',encodeURIComponent(query))});
  };
  // A full pass over models precedes the next core provider, preventing
  // truncation from favoring only the first few headphones.
  for(const id of coreIds){
    const source=sources.find(s=>s.id===id);
    if(!source)continue;
    for(const m of models)add(m,source);
  }
  for(let pass=0;pass<sources.length&&jobs.length<maxJobs;pass++){
    for(let i=0;i<models.length&&jobs.length<maxJobs;i++){
      add(models[i],sources[(i+pass)%sources.length]);
    }
  }
  return jobs;
}

/** Source rotation based on observed direct-page yield, not the number of search hits.
 * Last FULL: Marktplaats 23 verified, OLX 0/48 reachable, Allegro 0/48.
 * HiFiShark is indexed-price research only; Vinted remains Polish discovery.
 * Prioritize Marktplaats/Subito daily, retain one rotating exploratory slot,
 * including blocked Polish sources so access recovery remains observable.
 * This is a transparent fixed policy until adaptive verified-yield statistics exist.
 */
export function coreSourceIdsForDate(isoDate) {
  const baseline=['hifishark','vinted-pl','marktplaats-nl','subito-it'];
  const rotation=['allegro-pl','olx-pl','kleinanzeigen-de','mediaexpert-outlet','ebay-de'];
  const day=Math.floor(Date.parse(String(isoDate).slice(0,10)+'T00:00:00Z')/86400000);
  const offset=Number.isFinite(day)?((day%rotation.length)+rotation.length)%rotation.length:0;
  return [...baseline,rotation[offset]];
}
