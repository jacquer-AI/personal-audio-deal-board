import {useEffect,useState} from 'react';

const CURRENT_BUILD = ((import.meta as unknown as {env?:{VITE_BUILD_SHA?:string}}).env?.VITE_BUILD_SHA) || '';

export default function BuildFreshness(){
  const [available,setAvailable]=useState(false);
  useEffect(()=>{
    if(!CURRENT_BUILD)return;
    let stopped=false;
    const check=async()=>{
      try{
        const url=new URL('version.json', window.location.href);
        url.searchParams.set('ts',String(Date.now()));
        const r=await fetch(url.toString(),{cache:'no-store'});
        if(!r.ok)return;
        const body=await r.json() as {sha?:string};
        if(!stopped&&body.sha&&body.sha!==CURRENT_BUILD){
          setAvailable(true);
        }
      }catch{}
    };
    const timer=window.setInterval(()=>void check(),30000);
    const onVisible=()=>{if(document.visibilityState==='visible')void check()};
    document.addEventListener('visibilitychange',onVisible);
    void check();
    return()=>{stopped=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)};
  },[]);
  return available?<aside className="build-update" role="status">Dostępna jest nowsza wersja danych lub aplikacji. <button onClick={()=>window.location.reload()}>Wczytaj nową wersję</button></aside>:null;
}
