import {test,expect} from '@playwright/test';

test('Vinted search uses typed model without changing existing verified offers',async({page})=>{
  await page.goto('/');
  const box=page.getByRole('searchbox');
  const vinted=page.getByRole('link',{name:'Szukaj na Vinted: słuchawki'});
  await expect(vinted).toHaveAttribute('href','https://www.vinted.pl/catalog?search_text=s%C5%82uchawki');
  await box.fill('Sony MDR-SA5000');
  const scoped=page.getByRole('link',{name:'Szukaj na Vinted: Sony MDR-SA5000'});
  await expect(scoped).toHaveAttribute('href','https://www.vinted.pl/catalog?search_text=Sony%20MDR-SA5000');
  await expect(scoped).toHaveAttribute('target','_blank');
  await expect(scoped).toHaveAttribute('rel','noopener noreferrer');
  await box.fill('');
  const first=page.getByTestId('product').first();
  const model=await first.locator('h2').textContent();
  await first.locator('.offer-details > summary').click();
  await expect(first.getByRole('link',{name:'Szukaj modelu '+model+' na Vinted'}))
    .toHaveAttribute('href','https://www.vinted.pl/catalog?search_text='+encodeURIComponent(model!));
  await expect(first.getByTestId('primary-link')).toBeVisible();
});

test('default view exposes recorded offers and clearly separates leads from LIVE',async({page})=>{
  await page.goto('/');
  const live=page.getByLabel('Live',{exact:true});
  await page.locator('.more-filters > summary').click();
  await expect(live).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('.coverage-notice')).toContainText('potwierdzone LIVE');
  await expect(page.getByRole('link',{name:'Szukaj na OLX: słuchawki'}))
    .toHaveAttribute('href','https://www.olx.pl/oferty/q-s%C5%82uchawki/');
  await expect(page.locator('.research-leads h2')).toContainText('Ogłoszenia znalezione na rynku');
  await expect(page.locator('.research-leads')).toContainText('Priorytet: potwierdzona cena samych słuchawek.');
  await expect(page.locator('.research-leads')).toContainText('Brak kwoty wysyłki nie dyskwalifikuje oferty');
  await expect(page.locator('.research-leads')).toContainText('wysyłki');
  const items=page.locator('.research-item');
  if(!(await items.first().isVisible()))await page.locator('.research-more > summary').click();
  await expect(items.first()).toBeVisible();
  await page.getByRole('button',{name:/Pokaż \d+ dodatkowych modeli/}).click();
  await expect(page.locator('.watchlist')).toContainText('Etymotic ER4P');
  await expect(page.locator('.watchlist')).toContainText('Sony MDR-SA5000');
  await page.getByRole('button',{name:'Pokaż tylko LIVE'}).click();
  await expect(live).toBeChecked();
});
