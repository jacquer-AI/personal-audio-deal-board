export type RefreshMode = 'quick' | 'full' | 'deep';

const OWNER='jacquer-AI';
const REPO='personal-audio-deal-board';
const WORKFLOW='refresh-market.yml';
const GH_TOKEN_KEY='audio-refresh-gh-token';
const REFRESH_KEY='audio-refresh-key';

export interface RefreshRun {
  id:number;
  status:string;
  conclusion:string|null;
  created_at:string;
  updated_at:string;
  html_url:string;
  event:string;
}

function env(name:string) {
  try {
    return ((import.meta as unknown as {env?:Record<string,string>}).env?.[name] || '').trim();
  } catch {
    return '';
  }
}

export function authState() {
  try {
    return {
      backendKey:Boolean(sessionStorage.getItem(REFRESH_KEY)),
      githubToken:Boolean(sessionStorage.getItem(GH_TOKEN_KEY)),
      backend:Boolean(env('VITE_REFRESH_API_URL'))
    };
  } catch {
    return {backendKey:false,githubToken:false,backend:Boolean(env('VITE_REFRESH_API_URL'))};
  }
}

export function saveSessionCredential(kind:'backend'|'github', value:string) {
  const v=value.trim();
  if(!v) return;
  if(kind==='backend') sessionStorage.setItem(REFRESH_KEY,v);
  else sessionStorage.setItem(GH_TOKEN_KEY,v);
}

export function clearSessionCredentials() {
  try {
    sessionStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(GH_TOKEN_KEY);
  } catch { /* no-op */ }
}

export async function latestRefreshRun(fetchImpl:typeof fetch=fetch):Promise<RefreshRun|null> {
  const url=`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`;
  const r=await fetchImpl(url,{headers:{Accept:'application/vnd.github+json'}});
  if(!r.ok) return null;
  const data=await r.json() as {workflow_runs?:RefreshRun[]};
  return data.workflow_runs?.[0] || null;
}

export async function dispatchRefresh(mode:RefreshMode,categories:string[],fetchImpl:typeof fetch=fetch) {
  const backendUrl=env('VITE_REFRESH_API_URL');
  const state=authState();
  if(backendUrl && state.backendKey){
    const key=sessionStorage.getItem(REFRESH_KEY) || '';
    const r=await fetchImpl(backendUrl,{
      method:'POST',
      headers:{'content-type':'application/json','x-refresh-key':key},
      body:JSON.stringify({mode,categories})
    });
    return {ok:r.ok,via:'vercel' as const,status:r.status,needsAuth:r.status===401};
  }
  if(state.githubToken){
    const token=sessionStorage.getItem(GH_TOKEN_KEY) || '';
    const url=`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
    const r=await fetchImpl(url,{
      method:'POST',
      headers:{Accept:'application/vnd.github+json','content-type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({ref:'main',inputs:{mode,categories:categories.length?categories.join(','):'all'}})
    });
    return {ok:r.status===204,via:'github' as const,status:r.status,needsAuth:r.status===401||r.status===403};
  }
  return {ok:false,via:'none' as const,status:0,needsAuth:true};
}

export const refreshWorkflowUrl=`https://github.com/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}`;
