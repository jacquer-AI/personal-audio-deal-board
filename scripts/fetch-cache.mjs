/**
 * Deduplicate identical direct seller HTTP fetches within one scan, including
 * concurrent calls. This does not re-use evidence across runs or sources:
 * all per-item identity, condition, availability and fixed-price checks still
 * execute separately on the returned HTML.
 */
export function memoizeScanFetch(fetchPage) {
  const pending=new Map();
  return url=>{
    if(pending.has(url))return pending.get(url);
    const task=Promise.resolve().then(()=>fetchPage(url));
    pending.set(url,task);
    // An exception must not poison the cache for later checks in this scan.
    task.catch(()=>{if(pending.get(url)===task)pending.delete(url)});
    return task;
  };
}
