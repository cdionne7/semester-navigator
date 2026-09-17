import {test,expect,openDashboard,saved,changeAvailability,readPlan} from './fixtures.mjs';

const blockedEdit = page => expect(page.getByText(/This browser already has unsaved changes for this student/).first()).toBeVisible();

test('a second tab cannot replace a pending local copy and the original survives reload and retry', async({page,context,request,workspace}) => {
  const other = await context.newPage();
  await openDashboard(page, workspace);
  await openDashboard(other, workspace);
  await page.route('**/api/plan', route => route.request().method() === 'PUT'
    ? route.fulfill({status:503, json:{error:'Simulated save outage'}})
    : route.continue());
  await changeAvailability(page, 'Original unsaved availability');
  await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
  const backup = () => page.evaluate(id => localStorage.getItem('semester-navigator-v2:'+id), workspace.seed.profileId);
  const pendingCopy = await backup();

  await changeAvailability(other, 'Competing form must remain open');
  await blockedEdit(other);
  await expect(other.getByLabel('Work hours and availability notes')).toHaveValue('Competing form must remain open');
  expect(await backup()).toBe(pendingCopy);
  expect((await readPlan(request, workspace)).revision).toBe(0);

  await page.unroute('**/api/plan');
  await page.reload();
  await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
  await expect(page.getByText('Your availability notes: Original unsaved availability',{exact:true})).toBeVisible();
  await changeAvailability(page, 'Recovered copy cannot be replaced before saving');
  await blockedEdit(page);
  expect(await backup()).toBe(pendingCopy);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Save pending changes',exact:true}).click();
  await saved(page);
  expect((await readPlan(request, workspace)).plan.workHours).toBe('Original unsaved availability');
  expect(JSON.parse(await backup())).toMatchObject({dirty:false,baseRevision:1});

  await other.getByRole('button',{name:'Close dialog',exact:true}).click();
  await other.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(other.getByText('Your availability notes: Original unsaved availability',{exact:true})).toBeVisible();
  await changeAvailability(other, 'Second tab may edit after recovery is saved');
  await saved(other);
  expect((await readPlan(request, workspace)).plan.workHours).toBe('Second tab may edit after recovery is saved');
});

test('simultaneous local first edits reserve one recovery slot atomically and retain the denied form', async({page,context,request,workspace}) => {
  const other = await context.newPage();
  await openDashboard(page, workspace);
  await openDashboard(other, workspace);
  await context.route('**/api/plan', route => route.request().method() === 'PUT'
    ? route.fulfill({status:503, json:{error:'Simulated save outage'}})
    : route.continue());
  for (const [tab, note] of [[page,'First concurrent draft'],[other,'Second concurrent draft']]) {
    await tab.getByRole('button',{name:'Preferences',exact:true}).click();
    await tab.getByLabel('Work hours and availability notes').fill(note);
  }
  const key = 'semester-navigator-v2:'+workspace.seed.profileId;
  // Queue both submissions behind the same real browser lock. This forces the
  // contended first-edit path instead of relying on timing between two clicks.
  await page.evaluate(async key => {
    await new Promise(resolve => {
      navigator.locks.request(key, async () => {
        const held = new Promise(release => { window.releaseRecoveryTestLock = release; });
        resolve();
        await held;
      });
    });
  }, key);
  await Promise.all([page,other].map(tab => tab.getByRole('button',{name:'Save preferences',exact:true}).click()));
  expect((await readPlan(request,workspace)).revision).toBe(0);
  await page.evaluate(() => window.releaseRecoveryTestLock());
  await expect.poll(async () => (await Promise.all([page,other].map(tab => tab.getByText('Changes waiting to save',{exact:true}).count()))).reduce((sum,count) => sum+count,0)).toBe(1);
  const copy = JSON.parse(await page.evaluate(key => localStorage.getItem(key),key));
  const winner = copy.plan.workHours === 'First concurrent draft' ? page : other;
  const loser = winner === page ? other : page;
  await blockedEdit(loser);
  await expect(loser.getByLabel('Work hours and availability notes')).toHaveValue(loser === page ? 'First concurrent draft' : 'Second concurrent draft');
  await winner.reload();
  await expect(winner.getByText('Your availability notes: '+copy.plan.workHours,{exact:true})).toBeVisible();
  expect((await readPlan(request,workspace)).revision).toBe(0);
});

test('a browser without Web Locks refuses edits clearly instead of using a racy recovery slot', async({page,request,workspace}) => {
  await page.addInitScript(() => Object.defineProperty(navigator,'locks',{value:undefined}));
  await page.goto(workspace.url);
  await expect(page.getByText(/This browser cannot safely coordinate saved copies between tabs/)).toBeVisible();
  await expect(page.getByText('Saved plan unavailable',{exact:true})).toBeVisible();
  expect((await readPlan(request,workspace)).revision).toBe(0);
});

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
