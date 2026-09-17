import {test,expect,openDashboard,saved,changeAvailability,readPlan} from './fixtures.mjs';

const fixedTime = new Date('2026-09-08T14:00:00Z');
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
async function focusDashboard(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function setVisibility(page, value) {
  await page.evaluate(visibility => {
    Object.defineProperty(document, 'visibilityState', {configurable:true, value:visibility});
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
async function externalEdit(request, workspace, workHours) {
  const current = await readPlan(request, workspace);
  current.plan.workHours = workHours;
  const response = await request.put(workspace.url+'/api/plan', {
    data:{plan:current.plan, baseRevision:current.revision},
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function browserBackup(page, workspace) {
  return page.evaluate(profileId => JSON.parse(localStorage.getItem('semester-navigator-v2:'+profileId)), workspace.seed.profileId);
}
async function frozenDashboard(page, workspace) {
  await page.clock.install({time:fixedTime});
  await page.clock.pauseAt(fixedTime);
  await openDashboard(page, workspace);
}

test('saved assistant edits arrive on focus, visible polling, and returning to the dashboard', async({page,request,workspace}) => {
  await frozenDashboard(page, workspace);
  const first = await externalEdit(request, workspace, 'Assistant added Tuesday study time');
  const held = deferred();
  const intercepted = deferred();
  let reads = 0;
  await page.route('**/api/plan', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    reads++;
    const response = await route.fetch();
    if (reads === 1) { intercepted.resolve(); await held.promise; }
    await route.fulfill({response});
  });
  try {
    await focusDashboard(page);
    await intercepted.promise;
    await saved(page);
    await expect(page.getByRole('button',{name:'Preferences',exact:true})).toBeEnabled();
    held.resolve();
    await expect(page.getByText('Your availability notes: '+first.plan.workHours,{exact:true})).toBeVisible();
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:first.revision, dirty:false});

    const second = await externalEdit(request, workspace, 'Assistant revised Wednesday study time');
    await page.clock.runFor(15_000);
    await expect(page.getByText('Your availability notes: '+second.plan.workHours,{exact:true})).toBeVisible();
    expect(reads).toBe(2);

    await setVisibility(page, 'hidden');
    const third = await externalEdit(request, workspace, 'Assistant checked Thursday availability');
    await page.clock.runFor(30_000);
    expect(reads).toBe(2);
    await setVisibility(page, 'visible');
    await expect(page.getByText('Your availability notes: '+third.plan.workHours,{exact:true})).toBeVisible();
    await saved(page);
    expect(reads).toBe(3);
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:third.revision, dirty:false, plan:{workHours:third.plan.workHours}});

    await page.getByRole('button',{name:'Preferences',exact:true}).click();
    const fourth = await externalEdit(request, workspace, 'Assistant checked Friday availability');
    await focusDashboard(page);
    await page.clock.runFor(15_000);
    expect(reads).toBe(3);
    await page.keyboard.press('Escape');
    await expect(page.getByText('Your availability notes: '+fourth.plan.workHours,{exact:true})).toBeVisible();
    expect(reads).toBe(4);
  } finally { held.resolve(); }
});

test('an open form pauses a held refresh and preserves a draft against a newer assistant save', async({page,request,workspace}) => {
  await frozenDashboard(page, workspace);
  const latest = await externalEdit(request, workspace, 'Assistant changed the shared availability');
  const held = deferred();
  const intercepted = deferred();
  const returned = deferred();
  let reads = 0;
  await page.route('**/api/plan', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    reads++;
    const response = await route.fetch();
    intercepted.resolve();
    await held.promise;
    try { await route.fulfill({response}); } finally { returned.resolve(); }
  });
  try {
    await focusDashboard(page);
    await intercepted.promise;
    await page.getByRole('button',{name:'Preferences',exact:true}).click();
    await page.getByLabel('Work hours and availability notes').fill('My form draft remains unsaved');
    held.resolve();
    await returned.promise;
    await focusDashboard(page);
    await page.clock.runFor(30_000);
    await expect(page.getByLabel('Work hours and availability notes')).toHaveValue('My form draft remains unsaved');
    expect(reads).toBe(1);
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:0, dirty:false});

    await page.getByRole('button',{name:'Save preferences',exact:true}).click();
    await expect(page.getByText('Another saved version needs review',{exact:true})).toBeVisible();
    await expect(page.getByText('Your availability notes: My form draft remains unsaved',{exact:true})).toBeVisible();
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:0, dirty:true, plan:{workHours:'My form draft remains unsaved'}});
    expect((await readPlan(request, workspace)).plan.workHours).toBe(latest.plan.workHours);
  } finally { held.resolve(); }
});

test('an edit begun during a held refresh keeps its pending and conflicting browser copies', async({page,request,workspace}) => {
  await frozenDashboard(page, workspace);
  await externalEdit(request, workspace, 'Assistant saved a newer plan');
  const held = deferred();
  const intercepted = deferred();
  const returned = deferred();
  let reads = 0;
  let writes = 0;
  await page.route('**/api/plan', async route => {
    if (route.request().method() === 'PUT') {
      writes++;
      if (writes === 1) return route.fulfill({status:503, contentType:'application/json', body:JSON.stringify({error:'Simulated save outage'})});
      return route.continue();
    }
    reads++;
    const response = await route.fetch();
    intercepted.resolve();
    await held.promise;
    try { await route.fulfill({response}); } finally { returned.resolve(); }
  });
  try {
    await focusDashboard(page);
    await intercepted.promise;
    await changeAvailability(page, 'My unsaved study time');
    await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
    held.resolve();
    await returned.promise;
    await focusDashboard(page);
    await page.clock.runFor(30_000);
    await expect(page.getByText('Your availability notes: My unsaved study time',{exact:true})).toBeVisible();
    await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
    expect(reads).toBe(1);
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:0, dirty:true, plan:{workHours:'My unsaved study time'}});

    await page.getByRole('button',{name:'Save pending changes',exact:true}).click();
    await expect(page.getByText('Another saved version needs review',{exact:true})).toBeVisible();
    await externalEdit(request, workspace, 'Assistant saved another newer plan');
    await focusDashboard(page);
    await setVisibility(page, 'visible');
    await page.clock.runFor(30_000);
    await expect(page.getByText('Another saved version needs review',{exact:true})).toBeVisible();
    await expect(page.getByText('Your availability notes: My unsaved study time',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Preferences',exact:true})).toBeDisabled();
    expect(reads).toBe(1);
    expect(writes).toBe(2);
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:0, dirty:true, plan:{workHours:'My unsaved study time'}});
    expect((await readPlan(request, workspace)).plan.workHours).toBe('Assistant saved another newer plan');
  } finally { held.resolve(); }
});

test('an obsolete refresh cannot overwrite an edit that has already finished saving', async({page,request,workspace}) => {
  await openDashboard(page, workspace);
  const held = deferred();
  const intercepted = deferred();
  const returned = deferred();
  await page.route('**/api/plan', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    intercepted.resolve();
    await held.promise;
    try { await route.fulfill({response}); } finally { returned.resolve(); }
  });
  try {
    await focusDashboard(page);
    await intercepted.promise;
    await changeAvailability(page, 'My edit completed while the read waited');
    await saved(page);
    held.resolve();
    await returned.promise;
    await expect(page.getByText('Your availability notes: My edit completed while the read waited',{exact:true})).toBeVisible();
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:1, dirty:false, plan:{workHours:'My edit completed while the read waited'}});
    expect((await readPlan(request, workspace)).revision).toBe(1);
  } finally { held.resolve(); }
});

test('failed, foreign-profile, and older refreshes preserve the confirmed view and later checks recover', async({page,request,workspace}) => {
  const older = await readPlan(request, workspace);
  const confirmed = await externalEdit(request, workspace, 'Confirmed student availability');
  await frozenDashboard(page, workspace);
  let reads = 0;
  await page.route('**/api/plan', async route => {
    reads++;
    if (reads === 1) return route.fulfill({status:503, contentType:'application/json', body:JSON.stringify({error:'Simulated refresh outage'})});
    if (reads === 2) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({...confirmed, revision:99, plan:{...confirmed.plan, profileId:'other-student', workHours:'Wrong student'}})});
    if (reads === 3) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(older)});
    return route.continue();
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = page.waitForResponse(result => result.url() === workspace.url+'/api/plan');
    await focusDashboard(page);
    await (await response).finished();
    // Drain the read's JSON/React work before making the next focused check.
    await page.clock.runFor(1);
    await saved(page);
    await expect(page.getByText('Your availability notes: '+confirmed.plan.workHours,{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Preferences',exact:true})).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await browserBackup(page, workspace)).toMatchObject({baseRevision:confirmed.revision, dirty:false, plan:{workHours:confirmed.plan.workHours}});
    expect(reads).toBe(attempt);
  }
  const latest = await externalEdit(request, workspace, 'Assistant update after connection recovered');
  await focusDashboard(page);
  await expect(page.getByText('Your availability notes: '+latest.plan.workHours,{exact:true})).toBeVisible();
  await saved(page);
  expect(reads).toBe(4);
});
