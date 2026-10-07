import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import snapshot from '../../data/offers.json' with {type:'json'};
import {mockGitHub} from './github-mock';
test.beforeEach(async({page})=>{await mockGitHub(page);await page.goto('./');await expect(page.getByRole('heading',{level:1})).toContainText('PERSONAL AUDIO')});
test('categories and speakers',async({page})=>{for(const c of ['IEM','TWS','Closed','Głośniki BT']){await page.getByRole('button',{name:c,exact:true}).click();await expect(page.getByTestId('product').first()).toBeVisible()}for(const model of ['Bose SoundLink Max','Marshall Middleton II','JBL Charge 6'])await expect(page.getByRole('heading',{name:model,exact:true})).toBeVisible();await expect(page.getByTestId('product')).toHaveCount(3)});
test('search model seller country and empty',async({page})=>{const s=page.getByRole('searchbox');await s.fill('AZ100');await expect(page.getByTestId('product')).toHaveCount(1);await s.fill('Thomann');await expect(page.getByRole('heading',{name:'Dan Clark Audio Noire X',exact:true})).toBeVisible();await s.fill('Niemcy');await expect(page.getByTestId('product').first()).toBeVisible();await s.fill('does-not-exist');await expect(page.getByRole('heading',{name:'Brak wyników'})).toBeVisible()});
test('sorting',async({page})=>{await page.getByLabel('Sortuj',{exact:true}).selectOption('price');await expect(page.getByTestId('product').first().getByRole('heading',{level:2})).toHaveText('JBL Charge 6')});
test('region condition status reset',async({page})=>{await page.getByLabel('Region',{exact:true}).selectOption('UE');await expect(page.getByRole('heading',{name:'Bose SoundLink Max',exact:true})).toHaveCount(0);await page.locator('.more-filters > summary').click();await page.getByLabel('B-STOCK',{exact:true}).check();await expect(page.getByTestId('product')).toHaveCount(1);await page.getByLabel('Status',{exact:true}).selectOption('LEAD ONLY');await expect(page.getByTestId('product')).toHaveCount(0);await page.getByRole('button',{name:'Wyczyść filtry'}).first().click();await expect(page.getByTestId('product').first()).toBeVisible()});
test('history and live exclusive',async({page})=>{await expect(page.getByRole('heading',{name:'HIFIMAN Svanar Wireless',exact:true})).toHaveCount(0);await page.locator('.more-filters > summary').click();await page.getByLabel('Historia',{exact:true}).check();await expect(page.getByRole('heading',{name:'HIFIMAN Svanar Wireless',exact:true})).toBeVisible();await page.getByLabel('Live',{exact:true}).check();await expect(page.getByRole('heading',{name:'HIFIMAN Svanar Wireless',exact:true})).toHaveCount(0)});
test('compare three reject fourth close and focus',async({page})=>{const boxes=page.getByRole('checkbox',{name:/Porównaj/});for(let i=0;i<3;i++)await boxes.nth(i).check();await boxes.nth(3).click();await expect(boxes.nth(3)).not.toBeChecked();await expect(page.getByRole('status')).toContainText('maksymalnie 3');await page.getByRole('button',{name:'Otwórz porównanie'}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.comparison-grid > section')).toHaveCount(3);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Otwórz porównanie'})).toBeFocused()});
test('source links exact and secure',async({page})=>{const allowed=new Set(snapshot.offers.map(o=>o.url));for(const summary of await page.locator('main .offer-details > summary').all())await summary.click();const links=page.locator('main .source a,main .primary-link');expect(await links.count()).toBeGreaterThan(10);for(const link of await links.all()){expect(allowed.has((await link.getAttribute('href'))!)).toBe(true);await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer')}await page.getByRole('searchbox').fill('JBL');await expect(page.getByTestId('primary-link')).toHaveAttribute('href','https://pl.jbl.com/CHARGE-6.html')});
test('compact default and independent disclosures',async({page})=>{await expect(page.locator('.app')).toHaveClass(/compact/);await expect(page.locator('.more-filters')).not.toHaveAttribute('open','');const first=page.getByTestId('product').first();await expect(first.getByTestId('primary-link')).toBeVisible();await expect(first.getByTestId('source-row').first()).not.toBeVisible();await first.locator('.offer-details > summary').click();await expect(first.getByTestId('source-row').first()).toBeVisible();await expect(first.locator('.notes p').first()).not.toBeVisible();await first.locator('.notes > summary').click();await expect(first.locator('.notes p').first()).toBeVisible();await first.locator('.offer-details > summary').click();await expect(first.getByTestId('source-row').first()).not.toBeVisible();await expect(page.locator('.methodology')).not.toHaveAttribute('open','');await expect(page.locator('.methodology p').first()).not.toBeVisible();await page.locator('.methodology > summary').click();await expect(page.locator('.methodology p').first()).toBeVisible()});
test('desktop density budget single row and visible action',async({page})=>{await page.setViewportSize({width:1440,height:900});const m=await page.evaluate(()=>{const rs=[...document.querySelectorAll('.product')].map(e=>e.getBoundingClientRect());return{toolbar:document.querySelector('.toolbar')!.getBoundingClientRect().height,y:rs[0].y,height:rs[0].height,full:rs.filter(r=>r.bottom<=900).length,primary:document.querySelector('.primary-link')!.getBoundingClientRect().bottom}});expect(m.toolbar).toBeLessThanOrEqual(140);expect(m.y).toBeLessThanOrEqual(553.296875*.6);expect(m.height).toBeLessThan(448.34375*.6);expect(m.full).toBeGreaterThanOrEqual(3);expect(m.primary).toBeLessThan(900);const ys=await page.locator('.search,.tabs,.region-control,.sort-control,.more-filters').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));expect(Math.max(...ys)-Math.min(...ys)).toBeLessThan(3)});
for(const [width,height] of [[1440,900],[1024,768],[390,844],[320,720]])test('reflow disclosures history comparison '+width,async({page})=>{await page.setViewportSize({width,height});const check=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await check();await page.locator('.more-filters > summary').click();await check();await page.getByLabel('Historia',{exact:true}).check();await check();await page.keyboard.press('Escape');await expect(page.locator('.more-filters > summary')).toBeFocused();const first=page.getByTestId('product').first();await first.locator('.offer-details > summary').click();await check();await first.locator('.notes > summary').click();await check();for(let i=0;i<3;i++)await page.getByRole('checkbox',{name:/Porównaj/}).nth(i).check();await page.getByRole('button',{name:'Otwórz porównanie'}).click();await check();expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true)});
test('200 and 400 percent equivalent reflow',async({page})=>{for(const width of [720,360]){await page.setViewportSize({width,height:450});expect(await page.evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth)).toBe(true)}});
test('200 percent CSS zoom',async({page})=>{for(const width of [1440,1024,390,320]){await page.setViewportSize({width,height:900});await page.evaluate(()=>{document.body.style.zoom='200%'});await expect(page.getByRole('searchbox')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth)).toBe(true);await page.getByRole('button',{name:'Głośniki BT',exact:true}).click();await expect(page.getByTestId('product')).toHaveCount(3)}});
test('keyboard skip and search',async({page})=>{await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Przejdź do wyników'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();await page.getByRole('searchbox').focus();await page.keyboard.type('JBL');await expect(page.getByTestId('product')).toHaveCount(1)});
test('WCAG axe default and filters',async({page})=>{for(let i=0;i<2;i++){if(i)await page.locator('.more-filters > summary').click();expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([])}});
test('no console errors',async({page})=>{const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));await page.reload();await page.getByRole('button',{name:'Głośniki BT',exact:true}).click();await page.getByRole('searchbox').fill('Bose');await expect(page.getByTestId('product')).toHaveCount(1);expect(errors).toEqual([])});
test('preferences persist including comfortable and compact',async({page})=>{await page.getByRole('button',{name:'Głośniki BT',exact:true}).click();await page.locator('.more-filters > summary').click();await page.getByLabel('Gęstość').selectOption('Comfortable');await page.getByLabel('Sortuj',{exact:true}).selectOption('price');await page.reload();await expect(page.getByRole('button',{name:'Głośniki BT',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.app')).toHaveClass(/comfortable/);await expect(page.getByLabel('Sortuj',{exact:true})).toHaveValue('price');await page.locator('.more-filters > summary').click();await page.getByLabel('Gęstość').selectOption('Compact');await page.reload();await expect(page.locator('.app')).toHaveClass(/compact/)});

test('refresh center reflows on narrow mobile',async({page})=>{
  await page.setViewportSize({width:320,height:720});
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  await expect(page.getByRole('dialog',{name:'Refresh rynku'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth)).toBe(true);
  expect(await page.getByRole('dialog',{name:'Refresh rynku'}).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

async function advanceUntil(page:import('@playwright/test').Page,state:import('@playwright/test').Locator,text:string){
  await expect.poll(async()=>{await page.clock.runFor(4100);return (await state.textContent())||''},{timeout:20000,intervals:[150]}).toContain(text);
}
async function openRefresh(page:import('@playwright/test').Page){
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  const dialog=page.getByRole('dialog',{name:'Refresh rynku'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('dispatcher-status')).toContainText('ZEN połączony');
  return dialog;
}
test('refresh center modes scope and one-click readiness',async({page})=>{
  const dialog=await openRefresh(page);
  for(const m of ['QUICK','FULL','DEEP']){
    await dialog.getByRole('button',{name:m,exact:true}).click();
    await expect(dialog.getByRole('button',{name:m,exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await expect(dialog.getByText(/nieadjudykowane challengery/)).toBeVisible();
  await dialog.getByLabel('Kategoria refreshu').selectOption('Głośniki BT');
  await expect(dialog.getByLabel('Kategoria refreshu')).toHaveValue('Głośniki BT');
  await expect(dialog.getByRole('button',{name:/URUCHOM DEEP/})).toBeEnabled();
  await expect(dialog.getByText(/bez tokena w przeglądarce/)).toBeVisible();
});
test('refresh center is keyboard usable',async({page})=>{
  await page.getByRole('button',{name:'↻ Odśwież'}).focus();
  await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Refresh rynku'});
  await dialog.getByRole('button',{name:'FULL',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button',{name:'FULL',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
test('refresh uses no browser credential input',async({page})=>{
  const dialog=await openRefresh(page);
  await expect(dialog.getByRole('button',{name:/URUCHOM QUICK/})).toBeEnabled();
  expect(await page.evaluate(()=>sessionStorage.length)).toBe(0);
});
test('one-click private dispatcher shows queued running deploying delta and reloads data',async({page})=>{
  const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
  const gh=await mockGitHub(page);
  await page.reload();
  await page.clock.install();
  const dialog=await openRefresh(page);
  await dialog.getByRole('button',{name:'FULL',exact:true}).click();
  await dialog.getByLabel('Kategoria refreshu').selectOption('TWS');
  await dialog.getByRole('button',{name:'URUCHOM FULL'}).click();
  await expect.poll(()=>gh.dispatcherRequests.length).toBe(1);
  expect(gh.dispatcherRequests[0]).toMatchObject({body:{mode:'full',categories:'TWS'}});
  expect(gh.nonGithubAuthRequests).toEqual([]);
  const state=dialog.getByTestId('refresh-state');
  await expect(state).toContainText('QUEUED');
  await advanceUntil(page,state,'RUNNING');
  await advanceUntil(page,state,'DEPLOYING');
  await advanceUntil(page,state,'OK');
  const list=dialog.getByTestId('delta-list');
  await expect(list).toContainText('Dan Clark Audio Noire X 4799 zł → 4499 zł');
  await expect(list).toContainText('Technics EAH-AZ100 SOLD');
  await expect(list).toContainText('Bose SoundLink Max NEW OFFER · 750 zł');
  await expect(dialog.getByTestId('delta')).toContainText('nowe 1');
  await expect(page.getByTestId('freshness')).toContainText('· OK');
  const nav=page.waitForEvent('load');
  await dialog.getByRole('button',{name:'Wczytaj najnowsze dane'}).click();
  await nav;
  expect(errors).toEqual([]);
});
test('no-op refresh reports DELTA=NONE without waiting for a deploy',async({page})=>{
  const gh=await mockGitHub(page,{noop:true});
  await page.reload();
  await page.clock.install();
  const dialog=await openRefresh(page);
  await dialog.getByRole('button',{name:'URUCHOM QUICK'}).click();
  await expect.poll(()=>gh.dispatcherRequests.length).toBe(1);
  await advanceUntil(page,dialog.getByTestId('refresh-state'),'OK');
  await expect(dialog.getByTestId('delta-none')).toContainText('DELTA=NONE');
  expect(gh.pagesPolls()).toBe(0);
});
test('dispatcher offline gives concise Tailscale fallback',async({page})=>{
  await mockGitHub(page,{dispatcherOffline:true});
  await page.reload();
  await page.getByRole('button',{name:'↻ Odśwież'}).click();
  const dialog=page.getByRole('dialog',{name:'Refresh rynku'});
  await expect(dialog.getByTestId('dispatcher-status')).toContainText('ZEN niedostępny');
  await expect(dialog.getByRole('button',{name:/URUCHOM QUICK/})).toBeDisabled();
  await expect(dialog.getByText(/połącz Tailscale/i)).toBeVisible();
  await expect(dialog.getByRole('link',{name:/Awaryjnie: GitHub/})).toHaveAttribute('href',/actions\/workflows\/refresh-market\.yml/);
});
for(const width of [390,320]){
  test('refresh center has no horizontal overflow at '+width+' while running',async({page})=>{
    const gh=await mockGitHub(page);
    await page.reload();
    await page.setViewportSize({width,height:720});
    const dialog=await openRefresh(page);
    const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth===document.documentElement.clientWidth&&document.querySelector('dialog')!.scrollWidth<=document.querySelector('dialog')!.clientWidth);
    expect(await fits()).toBe(true);
    await dialog.getByRole('button',{name:'URUCHOM QUICK'}).click();
    await expect.poll(()=>gh.dispatcherRequests.length).toBe(1);
    await expect(dialog.getByTestId('refresh-state')).toContainText(/QUEUED|RUNNING/);
    expect(await fits()).toBe(true);
  });
}
