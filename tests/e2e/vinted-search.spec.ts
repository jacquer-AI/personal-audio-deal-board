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
