import {test,expect,openDashboard,saved,changeAvailability,readPlan} from './fixtures.mjs';

test('a clean tab refresh preserves another tab’s pending recovery copy until explicit discard', async({page,context,request,workspace}) => {
  const observer = await context.newPage();
  await openDashboard(page, workspace);
  await openDashboard(observer, workspace);
  await page.route('**/api/plan', route => route.request().method() === 'PUT'
    ? route.fulfill({status:503, contentType:'application/json', body:JSON.stringify({error:'Simulated save outage'})})
    : route.continue());

  await changeAvailability(page, 'My pending draft from the first tab');
  await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
  const backup = () => page.evaluate(profileId => JSON.parse(localStorage.getItem('semester-navigator-v2:'+profileId)), workspace.seed.profileId);
  expect(await backup()).toMatchObject({baseRevision:0, dirty:true, plan:{workHours:'My pending draft from the first tab'}});

  const current = await readPlan(request, workspace);
  current.plan.workHours = 'Assistant update to the shared plan';
  const response = await request.put(workspace.url+'/api/plan', {data:{plan:current.plan, baseRevision:current.revision}});
  expect(response.status()).toBe(200);
  await observer.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(observer.getByText('Your availability notes: Assistant update to the shared plan',{exact:true})).toBeVisible();
  await saved(observer);
  expect(await backup()).toMatchObject({baseRevision:0, dirty:true, plan:{workHours:'My pending draft from the first tab'}});

  await page.reload();
  await expect(page.getByText('Another saved version needs review',{exact:true})).toBeVisible();
  await expect(page.getByText('Your availability notes: My pending draft from the first tab',{exact:true})).toBeVisible();
  expect(await backup()).toMatchObject({baseRevision:0, dirty:true});

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'Load latest saved plan',exact:true}).click();
  await saved(page);
  await expect(page.getByText('Your availability notes: Assistant update to the shared plan',{exact:true})).toBeVisible();
  expect(await backup()).toMatchObject({baseRevision:1, dirty:false, plan:{workHours:'Assistant update to the shared plan'}});
});
