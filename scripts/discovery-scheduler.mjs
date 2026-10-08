/**
 * Fair breadth-first discovery: rotate search providers per model on every pass.
 * A truncated FULL/DEEP budget still covers all models and multiple providers.
 */
export function planDiscoveryJobs(models, sources, maxJobs) {
  if (!Array.isArray(models) || !Array.isArray(sources) || !models.length || !sources.length || maxJobs <= 0) return [];
  const jobs = [];
  for (let pass = 0; pass < sources.length && jobs.length < maxJobs; pass++) {
    for (let i = 0; i < models.length && jobs.length < maxJobs; i++) {
      const m = models[i];
      const s = sources[(i + pass) % sources.length];
      const term = (s.queryTerms || [])[0] || '';
      const query = [m.model, term].filter(Boolean).join(' ');
      jobs.push({m, s, query, url:s.searchUrlTemplate.replace('{q}',encodeURIComponent(query))});
    }
  }
  return jobs;
}
