import {test,expect} from '@playwright/test';

test('global and research sort controls really reorder European HiFiShark asking prices',async({page})=>{
 await page.goto('/');
 const boardSort=page.getByLabel('Sortuj',{exact:true});
 const leadSort=page.getByLabel('Sortuj ogłoszenia',{exact:true});
 const heading=page.getByRole('heading',{name:/Ceny z HiFiShark:/});
 await expect(heading).toContainText('Ceny z HiFiShark');
 const cards=heading.locator('xpath=following-sibling::div[1]').getByTestId('research-lead');
 expect(await cards.count()).toBeGreaterThan(20);
 const order=async()=>cards.evaluateAll(elements=>elements
  .map(element=>element.getAttribute('data-price-pln'))
  .filter((v):v is string=>v!==null&&v!=='')
  .map(Number));
 const mainOrder=async()=>page.getByTestId('product').evaluateAll(elements=>elements
  .map(element=>element.getAttribute('data-price-pln'))
  .filter((v):v is string=>v!==null&&v!=='').map(Number));

 await boardSort.selectOption('price_desc');
 await expect(leadSort).toHaveValue('price_desc');
 const descending=await order();
 expect(descending.length).toBeGreaterThan(20);
 expect(descending).toEqual([...descending].sort((a,b)=>b-a));
 const mainDescending=await mainOrder();
 expect(mainDescending).toEqual([...mainDescending].sort((a,b)=>b-a));

 await leadSort.selectOption('price');
 await expect(boardSort).toHaveValue('price');
 const ascending=await order();
 expect(ascending).toEqual([...ascending].sort((a,b)=>a-b));
 expect(ascending[0]).toBeLessThan(descending[0]);
 const mainAscending=await mainOrder();
 expect(mainAscending).toEqual([...mainAscending].sort((a,b)=>a-b));

 await leadSort.selectOption('model');
 await expect(boardSort).toHaveValue('model');
 const models=await cards.locator('strong:first-child').allTextContents();
 expect(models).toEqual([...models].sort((a,b)=>a.localeCompare(b,'pl')));

 await boardSort.selectOption('b4b');
 await expect(leadSort).toHaveValue('b4b');
 await expect(page.locator('.research-sort-note')).toContainText('nie obliczamy');
});
