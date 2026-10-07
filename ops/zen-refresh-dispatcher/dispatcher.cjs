#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const http = require('http');
const { execFile } = require('child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.AUDIO_REFRESH_PORT || '8791');
const REPO = 'jacquer-AI/personal-audio-deal-board';
const WORKFLOW = 'refresh-market.yml';
const ALLOWED_ORIGIN = 'https://jacquer-ai.github.io';
const ALLOWED_LOGIN = String(process.env.AUDIO_REFRESH_TAILSCALE_LOGIN || '').toLowerCase();
const GH = process.env.AUDIO_REFRESH_GH || 'C:\\Program Files\\GitHub CLI\\gh.exe';
const VALID_MODES = new Set(['quick','full','deep']);
const VALID_CATEGORIES = new Set(['all','IEM','TWS','Closed','Głośniki BT']);
const MAX_BODY = 4096;
const COOLDOWN_MS = 30000;

let busy = false;
let lastDispatch = 0;

function gh(args, timeout = 25000) {
  return new Promise((resolve, reject) => {
    execFile(GH, args, { timeout, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || 'gh failed').trim().slice(0,500)));
      resolve(String(stdout || '').trim());
    });
  });
}

async function latestRun() {
  const raw = await gh(['run','list','--repo',REPO,'--workflow',WORKFLOW,'--limit','1',
    '--json','databaseId,status,conclusion,url,createdAt,updatedAt,event,displayTitle']);
  const a = JSON.parse(raw || '[]');
  if (!a.length) return null;
  const r = a[0];
  return {
    id:r.databaseId, status:r.status, conclusion:r.conclusion || null,
    html_url:r.url, created_at:r.createdAt, updated_at:r.updatedAt,
    event:r.event, display_title:r.displayTitle
  };
}

function cors(req, res) {
  if (req.headers.origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary','Origin');
  }
}

function json(req, res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.statusCode = status;
  cors(req,res);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Length',String(body.length));
  res.setHeader('Cache-Control','no-store');
  res.end(body);
}

function originOk(req, allowEmpty = true) {
  const o = req.headers.origin || '';
  return o === ALLOWED_ORIGIN || (allowEmpty && o === '');
}

function identityOk(req) {
  if (!req.headers.origin) {
    const a = req.socket.remoteAddress || '';
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  }
  const login = String(req.headers['tailscale-user-login'] || '').toLowerCase();
  return !!ALLOWED_LOGIN && login === ALLOWED_LOGIN;
}

const server = http.createServer(async (req,res) => {
  const u = new URL(req.url,'http://127.0.0.1');
  let p = u.pathname.replace(/\/$/,'') || '/';
  if (p === '/audio-refresh') p = '/';
  else if (p.startsWith('/audio-refresh/')) p = p.slice('/audio-refresh'.length) || '/';

  if (req.method === 'OPTIONS') {
    if (req.headers.origin !== ALLOWED_ORIGIN) return json(req,res,403,{ok:false,error:'origin_not_allowed'});
    res.statusCode = 204;
    cors(req,res);
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    res.setHeader('Access-Control-Max-Age','600');
    return res.end();
  }

  if (req.method === 'GET' && p === '/health') {
    if (!originOk(req)) return json(req,res,403,{ok:false,error:'origin_not_allowed'});
    return json(req,res,200,{ok:true,service:'personal-audio-refresh-dispatcher',repo:REPO,tailnetOnly:true,port:PORT});
  }

  if (req.method === 'GET' && p === '/status') {
    if (!originOk(req)) return json(req,res,403,{ok:false,error:'origin_not_allowed'});
    if (!identityOk(req)) return json(req,res,401,{ok:false,error:'tailscale_identity_required',received:String(req.headers['tailscale-user-login']||'')});
    try { return json(req,res,200,{ok:true,run:await latestRun()}); }
    catch(e) { return json(req,res,502,{ok:false,error:String(e.message||e).slice(0,300)}); }
  }

  if (req.method === 'POST' && p === '/refresh') {
    if (req.headers.origin !== ALLOWED_ORIGIN) return json(req,res,403,{ok:false,error:'origin_not_allowed'});
    if (!identityOk(req)) return json(req,res,401,{ok:false,error:'tailscale_identity_required',received:String(req.headers['tailscale-user-login']||'')});
    if (busy) return json(req,res,409,{ok:false,error:'dispatch_busy'});
    if (Date.now()-lastDispatch < COOLDOWN_MS) return json(req,res,429,{ok:false,error:'cooldown'});

    let chunks=[], size=0;
    req.on('data',c=>{ size+=c.length; if(size<=MAX_BODY) chunks.push(c); });
    req.on('end', async()=>{
      if (!size || size>MAX_BODY) return json(req,res,413,{ok:false,error:'invalid_body_size'});
      let payload;
      try { payload=JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json(req,res,400,{ok:false,error:'invalid_json'}); }
      const mode=String(payload.mode||'').trim(), categories=String(payload.categories||'').trim();
      if(!VALID_MODES.has(mode)||!VALID_CATEGORIES.has(categories)) return json(req,res,400,{ok:false,error:'invalid_request'});
      busy=true;
      try {
        let cur=null; try{cur=await latestRun();}catch{}
        if(cur && ['queued','in_progress','waiting','pending','requested'].includes(cur.status))
          return json(req,res,409,{ok:false,error:'refresh_already_running',run:cur});
        await gh(['workflow','run',WORKFLOW,'--repo',REPO,'--ref','main','-f','mode='+mode,'-f','categories='+categories]);
        lastDispatch=Date.now();
        let run=null;
        for(let i=0;i<8;i++){ await new Promise(r=>setTimeout(r,1000)); try{const x=await latestRun(); if(x&&x.event==='workflow_dispatch'){run=x;break;}}catch{} }
        return json(req,res,202,{ok:true,queued:true,mode,categories,run});
      } catch(e) { return json(req,res,502,{ok:false,error:'github_dispatch_failed',detail:String(e.message||e).slice(0,300)}); }
      finally { busy=false; }
    });
    return;
  }

  return json(req,res,404,{ok:false,error:'not_found'});
});

server.listen(PORT,HOST,()=>{
  process.stdout.write(JSON.stringify({ok:true,service:'personal-audio-refresh-dispatcher',host:HOST,port:PORT})+'\n');
});
