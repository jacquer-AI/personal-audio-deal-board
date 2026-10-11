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
