import {test,expect} from '@playwright/test';
import {mockGitHub} from './github-mock';
import AxeBuilder from '@axe-core/playwright';

const dispatcher='https://desktop-t47p2au.tail84c6f0.ts.net:8444/audio-refresh';
const activeRun={id:123,status:'in_progress',conclusion:null,get created_at(){return new Date().toISOString()},get updated_at(){return new Date().toISOString()},html_url:'https://github.com/jacquer-AI/personal-audio-deal-board/actions/runs/123',display_title:'Refresh quick · all'};
test('a newer build does not reload and close an active dialog',async({page})=>{
  test.skip(!process.env.GITHUB_SHA&&!process.env.VITE_BUILD_SHA,'Requires a versioned production build');
  await mockGitHub(page);await page.clock.install();await page.goto('./');
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  await page.route('**/version.json*',route=>route.fulfill({json:{sha:'a-newer-build'}}));
  await page.clock.runFor(31000);
  await expect(page.getByText('Dostępna jest nowsza wersja danych lub aplikacji.')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button',{name:'Wczytaj nową wersję'})).toBeAttached();
});

test('a completed run recovered after reload still verifies its outcome',async({page})=>{
  await mockGitHub(page,{noop:true});await page.goto('./');
  await page.evaluate(()=>sessionStorage.setItem('audio-refresh-progress',JSON.stringify({id:123,at:Date.now()})));
  await page.route(dispatcher+'/status',route=>route.fulfill({json:{ok:true,run:{...activeRun,created_at:new Date().toISOString(),status:'completed',conclusion:'success'}}}));
  await page.reload();await page.getByRole('button',{name:'↻ Odśwież'}).click();
  await expect(page.getByTestId('delta-none')).toContainText('Rynek się nie zmienił');
});
async function open(page:import('@playwright/test').Page){
  await page.goto('./');await page.getByRole('button',{name:'↻ Odśwież'}).click();
  await expect(page.getByTestId('dispatcher-status')).toContainText('ZEN połączony');
}

test('cooldown remains online and gives a useful retry instruction without HTTP jargon',async({page})=>{
  await mockGitHub(page,{dispatchStatus:429});await open(page);
  await page.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect(page.getByRole('alert')).toContainText('Odczekaj 30 sekund');
  await expect(page.getByRole('alert')).not.toContainText(/HTTP|JSON|rejected|CORS/);
  await expect(page.getByTestId('dispatcher-status')).toContainText('ZEN połączony');
  await expect(page.getByRole('button',{name:'URUCHOM QUICK'})).toBeEnabled();
});

test('busy response without a run follows the existing run instead of reporting Tailscale failure',async({page})=>{
  await mockGitHub(page,{dispatchStatus:409});
  let active=false;
  await page.route(dispatcher+'/refresh',route=>{active=true;return route.fulfill({status:409,json:{ok:false,error:'dispatch_busy'}})});
  await page.route(dispatcher+'/status',route=>route.fulfill({json:{ok:true,run:active?activeRun:null}}));
  await open(page);await page.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect(page.getByTestId('refresh-state')).toContainText('RUNNING');
  await expect(page.getByRole('button',{name:'W toku…'})).toBeDisabled();
  await expect(page.getByTestId('dispatcher-status')).toContainText('ZEN połączony');
});

test('dispatch timeout is bounded and does not display backend details',async({page})=>{
  await mockGitHub(page);let unblock:()=>void=()=>{};
  await page.route(dispatcher+'/refresh',async route=>{await new Promise<void>(resolve=>{unblock=resolve});await route.abort().catch(()=>{})});
  await open(page);await page.clock.install();
  await page.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect(page.getByTestId('refresh-state')).toContainText('DISPATCHING');
  await page.clock.runFor(16000);
  await expect(page.getByTestId('refresh-state')).toContainText('FAILED');
  await expect(page.getByRole('alert')).toContainText('przed kolejną próbą');
  await expect(page.getByRole('alert')).not.toContainText(/HTTP|AbortError|fetch|JSON/);unblock();
});

test('failed GitHub run explains the next action',async({page})=>{
  const gh=await mockGitHub(page);await open(page);
  await page.route(dispatcher+'/status',route=>route.fulfill({json:{ok:true,run:{...activeRun,status:'completed',conclusion:'failure'}}}));
  await page.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect.poll(()=>gh.dispatcherRequests.length).toBe(1);
  await expect(page.getByTestId('refresh-state')).toContainText('FAILED');
  await expect(page.getByRole('alert')).toContainText('Sprawdź szczegóły');
});

test('closing dialog preserves polling and failed private network can use the exact public run',async({page})=>{
  await mockGitHub(page,{noop:true});await open(page);await page.clock.install();
  await page.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect(page.getByTestId('refresh-state')).toContainText(/QUEUED|RUNNING/);
  await page.route(dispatcher+'/status',route=>route.abort());
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  let publicRunChecks=0;
  await page.route('https://api.github.com/**/actions/runs/123',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    publicRunChecks++;
    return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({...activeRun,status:'completed',conclusion:'success'})});
  });
  await page.route('https://api.github.com/**/actions/runs/123/jobs',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    return route.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify({jobs:[{steps:[{name:'No material change',conclusion:'success'}]}]})});
  });
  await page.getByRole('button',{name:'Zamknij',exact:true}).click();
  await page.clock.runFor(5000);
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  // Drive the fake clock through subsequent polls; CI/network scheduling may delay the first fallback.
  for(let attempt=0;attempt<8;attempt++){
    if((await page.getByTestId('refresh-state').innerText()).includes('OK'))break;
    await page.clock.runFor(4500);
  }
  await expect(page.getByTestId('refresh-state')).toContainText('OK');
  expect(publicRunChecks).toBeGreaterThan(0);
  await expect(page.getByTestId('delta-none')).toContainText('Rynek się nie zmienił');
  await expect(page.getByRole('link',{name:'Otwórz run ↗'})).toHaveAttribute('href',activeRun.html_url);
});

test('rapid repeated click creates only one request',async({page})=>{
  const gh=await mockGitHub(page);await open(page);
  await page.getByRole('button',{name:'URUCHOM QUICK'}).dblclick();
  await expect.poll(()=>gh.dispatcherRequests.length).toBe(1);
});

test('slow polling times out and recovers through the public run without duplicate dispatch',async({page})=>{
  const gh=await mockGitHub(page,{noop:true});await open(page);await page.clock.install();
  await page.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect(page.getByTestId('refresh-state')).toContainText(/QUEUED|RUNNING/);
  let unblock:()=>void=()=>{};
  await page.route(dispatcher+'/status',async route=>{await new Promise<void>(resolve=>{unblock=resolve});await route.abort().catch(()=>{})});
  await page.route('https://api.github.com/**/actions/runs/123',route=>route.fulfill({json:{...activeRun,status:'completed',conclusion:'success'}}));
  await page.clock.runFor(21000);
  await expect(page.getByTestId('delta-none')).toContainText('Rynek się nie zmienił');
  expect(gh.dispatcherRequests).toHaveLength(1);unblock();
});

test('expanded offer distinguishes unverified lead and explains snapshot verification',async({page})=>{
  await mockGitHub(page);await page.goto('./');
  const product=page.getByTestId('product').filter({hasText:'Technics EAH-AZ100'});
  await product.locator('.offer-details > summary').click();
  await expect(product.locator('.unverified')).toContainText('LEAD');
  await expect(product.locator('.source-legend')).toContainText('LEAD — trop do sprawdzenia');
  await expect(product.locator('.offer-provenance')).toContainText('według zapisu');
});

test('mobile region and every category stay readable without a hidden horizontal menu',async({page})=>{
  await mockGitHub(page);await page.setViewportSize({width:320,height:720});await page.goto('./');
  for(const category of ['Wszystkie','IEM','TWS','Closed','Głośniki BT']){
    const box=await page.getByRole('button',{name:category,exact:true}).boundingBox();
    expect(box!.x+box!.width).toBeLessThanOrEqual(320);expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect((await page.getByLabel('Region',{exact:true}).boundingBox())!.width).toBeGreaterThan(200);
});

test('keyboard traps focus in refresh dialog and Escape returns to opener',async({page})=>{
  await mockGitHub(page);await open(page);
  const dialog=page.getByRole('dialog');
  for(let i=0;i<14;i++){
    await page.keyboard.press(i%2?'Shift+Tab':'Tab');
    expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
  }
  await page.getByRole('button',{name:'FULL',exact:true}).focus();await page.keyboard.press('Space');
  await expect(page.getByRole('button',{name:'FULL',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await expect(page.getByRole('button',{name:'↻ Odśwież'})).toBeFocused();
});

test('refresh dialog passes axe',async({page})=>{
  await mockGitHub(page);await open(page);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

for(const [width,height] of [[1920,1080],[1440,900],[1280,800],[430,932],[390,844],[360,800],[320,720]])test('review visual viewport '+width,async({page})=>{
  await mockGitHub(page);await page.setViewportSize({width,height});await page.goto('./');
  await expect(page.getByTestId('product')).toHaveCount(8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../../outputs/landing-'+width+'.png'});
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth&&e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
  await page.screenshot({path:'../../outputs/refresh-'+width+'.png'});
});

test('all sorts match independent visible numeric order',async({page})=>{
  await mockGitHub(page);await page.goto('./');
  for(const sort of ['b4b','price','quality','fit','discount','savings']){
    await page.getByLabel('Sortuj',{exact:true}).selectOption(sort);
    const cards=await page.getByTestId('product').allTextContents();
    if(sort==='price')expect(cards[0]).toContain('JBL Charge 6');
    if(sort==='quality')expect(cards[0]).toContain('64 Audio U12t');
    if(sort==='fit')expect(cards[0]).toContain('Dan Clark Audio Noire X');
    if(sort==='discount'||sort==='savings')expect(cards[0]).toContain('Bose SoundLink Max');
    if(sort==='b4b'){
      const scores=cards.map(c=>Number(c.match(/B4B ([\d.]+)/)?.[1]));
      expect(scores).toEqual([...scores].sort((a,b)=>b-a));
    }
  }
});

test('completed changed run must not claim NONE while its delta publication is delayed',async({page})=>{
  await mockGitHub(page,{noop:true});
  await page.route('https://api.github.com/**/actions/runs/123/jobs',route=>route.fulfill({json:{jobs:[{steps:[{name:'No material change',status:'completed',conclusion:'skipped'}]}]}}));
  await page.goto('./'); await page.clock.install();
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  await page.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect(page.getByTestId('refresh-state')).toContainText(/QUEUED|RUNNING/);
  for(let i=0;i<5;i++)await page.clock.runFor(4100);
  await expect(page.getByTestId('refresh-state')).toContainText('DEPLOYING');
  await expect(page.getByTestId('delta-none')).toHaveCount(0);
});

test('reload recovers an active run and prevents a duplicate refresh',async({page})=>{
  await mockGitHub(page);
  await page.route('https://desktop-t47p2au.tail84c6f0.ts.net:8444/audio-refresh/status',route=>route.fulfill({json:{ok:true,run:{id:123,status:'in_progress',conclusion:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),html_url:'https://github.com/jacquer-AI/personal-audio-deal-board/actions/runs/123',display_title:'Refresh deep · all'}}}));
  await page.goto('./');
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  await expect(page.getByRole('button',{name:'W toku…'})).toBeDisabled();
  await expect(page.getByTestId('refresh-state')).toContainText('RUNNING');
  await page.reload(); await page.getByRole('button',{name:'↻ Odśwież'}).click();
  await expect(page.getByRole('button',{name:'W toku…'})).toBeDisabled();
});
