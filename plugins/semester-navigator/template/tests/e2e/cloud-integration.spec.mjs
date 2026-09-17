// Real Chromium + HTTP + application routes + migrated SQLite acceptance.
// Identity injection occurs only at the synthetic loopback bridge boundary.
import { test as base, expect } from '@playwright/test';
import { createCloudBrowserServer } from '../helpers/cloud-browser-server.mjs';
import { authorizeCloudClient, cloudTool } from '../helpers/cloud-harness.mjs';
import { students } from '../acceptance/school-data.mjs';

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  cloudServer: async ({}, provide) => {
    const server = await createCloudBrowserServer();
    try { await provide(server); } finally { await server.close(); }
  },
});
test.use({ viewport: { width: 390, height: 844 } });
const fixedTime = new Date('2026-09-10T14:00:00Z');
const saved = page => expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
const focus = page => page.evaluate(() => window.dispatchEvent(new Event('focus')));
async function refreshedTask(page, assignment) {
  await focus(page);
  await expect(page.getByRole('region', { name: 'Your next action' }).getByRole('heading', { name: assignment.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All work', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Complete ' + assignment.title, exact: true })).toBeVisible();
}

async function createInBrowser(page, server, persona) {
  const student = students[persona];
  await page.goto(server.origin + '/cloud/new');
  await page.getByLabel('Your name', { exact: true }).fill(student.name);
  await page.getByLabel('School', { exact: true }).fill(student.school);
  await page.getByLabel('Term', { exact: true }).fill(student.term);
  await page.getByRole('combobox', { name: 'School level', exact: true }).selectOption(student.level);
  await page.getByLabel('Time zone', { exact: true }).fill(student.timezone);
  await page.getByRole('button', { name: 'Create my semester', exact: true }).click();
  await expect(page.getByRole('heading', { name: student.name + "'s semester", exact: true })).toBeVisible();
  await saved(page);
  return new URL(page.url()).searchParams.get('profileId');
}
async function tool(server, accessToken, name, args = {}) {
  const result = await cloudTool(server, accessToken, name, args);
  expect(result.response.status).toBe(200);
  expect(result.body.error).toBeUndefined();
  expect(result.body.result?.isError).not.toBe(true);
  return result.body.result.structuredContent;
}
async function importSchoolTask(server, token, profileId, persona) {
  // Evaluator-owned synthetic assignment, not a claim of live school coverage.
  const course = students[persona].courses[0], assignment = course.tasks[0];
  const current = await tool(server, token, 'get_semester_plan', { profileId });
  const imported = await tool(server, token, 'save_semester_plan', {
    profileId, baseRevision: current.revision,
    plan: {
      profileId, courses: [{ id: course.id, name: course.name, instructor: course.instructor }],
      tasks: [{ id: assignment.id, courseId: course.id, title: assignment.title, dueAt: assignment.due, minutes: 30, rubric: assignment.rubric, notes: 'Synthetic student outline, preserve this.' }],
    },
  });
  expect(imported.automaticSourceRefresh).toBe(false);
  return { assignment, imported };
}
async function freeze(page) { await page.clock.install({ time: fixedTime }); await page.clock.pauseAt(fixedTime); }
async function backup(page, profileId) {
  return page.evaluate(id => {
    const key = Object.keys(localStorage).find(key => key.startsWith('semester-navigator-cloud-v1:') && key.endsWith(':' + encodeURIComponent(id)));
    return key ? { key, ...JSON.parse(localStorage.getItem(key)) } : null;
  }, profileId);
}

test('a second cloud tab preserves a pending copy through reload and a successful recovery save', async ({page,context,cloudServer}) => {
  const profileId = await createInBrowser(page,cloudServer,'high-school');
  const other = await context.newPage();
  await other.goto(page.url());
  await saved(other);
  const {token} = await authorizeCloudClient(cloudServer.harness);
  await page.route('**/api/plan?*', route => route.request().method() === 'PUT'
    ? route.fulfill({status:503,json:{error:'Synthetic save outage'}})
    : route.continue());
  await page.getByRole('button',{name:'Preferences',exact:true}).click();
  await page.getByLabel('Work hours and availability notes').fill('Original private cloud draft');
  await page.getByRole('button',{name:'Save preferences',exact:true}).click();
  await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
  const pendingCopy = await backup(page,profileId);
  const before = await tool(cloudServer,token.access_token,'get_semester_plan',{profileId});
  await other.getByRole('button',{name:'Preferences',exact:true}).click();
  await other.getByLabel('Work hours and availability notes').fill('Keep the competing cloud form open');
  await other.getByRole('button',{name:'Save preferences',exact:true}).click();
  await expect(other.getByText(/This browser already has unsaved changes for this student/).first()).toBeVisible();
  await expect(other.getByLabel('Work hours and availability notes')).toHaveValue('Keep the competing cloud form open');
  expect(await backup(page,profileId)).toEqual(pendingCopy);
  expect((await tool(cloudServer,token.access_token,'get_semester_plan',{profileId})).revision).toBe(before.revision);
  await page.unroute('**/api/plan?*');
  await page.reload();
  await expect(page.getByText('Your availability notes: Original private cloud draft',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save pending changes',exact:true}).click();
  await saved(page);
  const durable = await tool(cloudServer,token.access_token,'get_semester_plan',{profileId});
  expect(durable).toMatchObject({revision:before.revision+1,plan:{workHours:'Original private cloud draft'}});
  expect(await backup(page,profileId)).toMatchObject({dirty:false,baseRevision:durable.revision});
  await other.getByRole('button',{name:'Close dialog',exact:true}).click();
  await focus(other);
  await expect(other.getByText('Your availability notes: Original private cloud draft',{exact:true})).toBeVisible();
  await other.getByRole('button',{name:'Preferences',exact:true}).click();
  await other.getByLabel('Work hours and availability notes').fill('Confirmed later availability');
  await other.getByRole('button',{name:'Save preferences',exact:true}).click();
  await saved(other);
  expect((await tool(cloudServer,token.access_token,'get_semester_plan',{profileId})).plan.workHours).toBe('Confirmed later availability');
});

test('simultaneous cloud first edits use the shared Web Lock and retain both the pending copy and denied form', async ({page,context,cloudServer}) => {
  const profileId = await createInBrowser(page,cloudServer,'college');
  const other = await context.newPage();
  await other.goto(page.url());
  await saved(other);
  const initial = await backup(page,profileId);
  await context.route('**/api/plan?*', route => route.request().method() === 'PUT'
    ? route.fulfill({status:503,json:{error:'Synthetic save outage'}})
    : route.continue());
  for (const [tab,note] of [[page,'First cloud draft'],[other,'Second cloud draft']]) {
    await tab.getByRole('button',{name:'Preferences',exact:true}).click();
    await tab.getByLabel('Work hours and availability notes').fill(note);
  }
  await page.evaluate(async key => {
    await new Promise(resolve => {
      navigator.locks.request(key, async () => {
        const held = new Promise(release => {window.releaseRecoveryTestLock=release;});
        resolve();
        await held;
      });
    });
  },initial.key);
  await Promise.all([page,other].map(tab => tab.getByRole('button',{name:'Save preferences',exact:true}).click()));
  expect(await backup(page,profileId)).toEqual(initial);
  await page.evaluate(() => window.releaseRecoveryTestLock());
  await expect.poll(async () => (await Promise.all([page,other].map(tab => tab.getByText('Changes waiting to save',{exact:true}).count()))).reduce((sum,count) => sum+count,0)).toBe(1);
  const pendingCopy = await backup(page,profileId);
  const winner = pendingCopy.plan.workHours === 'First cloud draft' ? page : other;
  const loser = winner === page ? other : page;
  await expect(loser.getByText(/This browser already has unsaved changes for this student/).first()).toBeVisible();
  await expect(loser.getByLabel('Work hours and availability notes')).toHaveValue(loser === page ? 'First cloud draft' : 'Second cloud draft');
  await winner.reload();
  await expect(winner.getByText('Your availability notes: '+pendingCopy.plan.workHours,{exact:true})).toBeVisible();
  expect(await backup(winner,profileId)).toEqual(pendingCopy);
  const {token} = await authorizeCloudClient(cloudServer.harness);
  expect((await tool(cloudServer,token.access_token,'get_semester_plan',{profileId})).revision).toBe(initial.baseRevision);
});

for (const persona of ['college', 'high-school']) {
  test(persona + ' at 390px: browser creation and completion round-trip through OAuth MCP with profile isolation', async ({ page, cloudServer }, testInfo) => {
    await freeze(page);
    const profileId = await createInBrowser(page, cloudServer, persona);
    const { token } = await authorizeCloudClient(cloudServer.harness);
    const { assignment, imported } = await importSchoolTask(cloudServer, token.access_token, profileId, persona);
    await refreshedTask(page, assignment);
    await saved(page);
    const screenshot = testInfo.outputPath(persona + '-cloud-dashboard-390px.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(persona + '-cloud-dashboard-390px', { path: screenshot, contentType: 'image/png' });
    expect((await backup(page, profileId)).baseRevision).toBe(imported.revision);
    await page.getByRole('button', { name: 'Complete ' + assignment.title, exact: true }).click();
    await saved(page);
    const readback = await tool(cloudServer, token.access_token, 'get_semester_plan', { profileId });
    expect(readback.revision).toBe(imported.revision + 1);
    expect(readback.plan.tasks[0]).toMatchObject({ id: assignment.id, state: 'done', notes: 'Synthetic student outline, preserve this.' });
    const otherPersona = persona === 'college' ? 'high-school' : 'college';
    const otherId = await createInBrowser(page, cloudServer, otherPersona);
    expect(otherId).not.toBe(profileId);
    await expect(page.getByText(assignment.title, { exact: true })).toHaveCount(0);
    const other = await tool(cloudServer, token.access_token, 'get_semester_plan', { profileId: otherId });
    expect(other.plan.tasks).toEqual([]);
    expect(other.plan.educationLevel).toBe(otherPersona);
    const listed = await tool(cloudServer, token.access_token, 'list_student_plans');
    expect(new Set(listed.plans.map(plan => plan.profileId))).toEqual(new Set([profileId, otherId]));
    await page.goto(cloudServer.origin + '/cloud?profileId=' + profileId);
    await saved(page);
    await page.getByRole('button', { name: 'All work', exact: true }).click();
    await page.getByLabel('Include completed', { exact: true }).check();
    await expect(page.getByRole('button', { name: 'Reopen ' + assignment.title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(cloudServer.requests.some(entry => entry.path === '/api/cloud/plans' && entry.method === 'POST' && entry.status === 303)).toBe(true);
    expect(cloudServer.requests.some(entry => entry.path === '/api/semester-mcp' && entry.method === 'POST' && entry.status === 200)).toBe(true);
    expect(cloudServer.requests.some(entry => entry.path === '/api/plan' && entry.method === 'PUT' && entry.status === 200)).toBe(true);
  });
}

test('an unsaved phone form survives a real MCP write and unresolved 409 retains the browser copy', async ({ page, cloudServer }) => {
  await freeze(page);
  const profileId = await createInBrowser(page, cloudServer, 'college');
  const { token } = await authorizeCloudClient(cloudServer.harness);
  const { assignment } = await importSchoolTask(cloudServer, token.access_token, profileId, 'college');
  await refreshedTask(page, assignment);
  await saved(page);
  const prior = await backup(page, profileId);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByLabel('Work hours and availability notes').fill('My unsaved browser availability');
  const current = await tool(cloudServer, token.access_token, 'get_semester_plan', { profileId });
  const chatSaved = await tool(cloudServer, token.access_token, 'save_semester_plan', { profileId, baseRevision: current.revision, plan: { profileId, workHours: 'Chat confirmed Saturday study time' } });
  const readCount = cloudServer.requests.filter(entry => entry.path === '/api/plan' && entry.method === 'GET').length;
  await focus(page); await page.clock.runFor(30_000);
  await expect(page.getByLabel('Work hours and availability notes')).toHaveValue('My unsaved browser availability');
  await expect.poll(async () => {
    await focus(page);
    return cloudServer.requests.filter(entry => entry.path === '/api/plan' && entry.method === 'GET').length;
  }).toBeGreaterThan(readCount);
  expect((await backup(page, profileId)).baseRevision).toBe(prior.baseRevision);
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByText('Another saved version needs review', { exact: true })).toBeVisible();
  await expect(page.getByText('Your availability notes: My unsaved browser availability', { exact: true })).toBeVisible();
  const pending = await backup(page, profileId);
  expect(pending).toMatchObject({ dirty: true, baseRevision: prior.baseRevision, plan: { workHours: 'My unsaved browser availability' } });
  expect(cloudServer.requests.some(entry => entry.path === '/api/plan' && entry.method === 'PUT' && entry.status === 409)).toBe(true);
  const later = await tool(cloudServer, token.access_token, 'update_assignment', { profileId, assignmentId: assignment.id, baseRevision: chatSaved.revision, patch: { notes: 'Later chat revision' } });
  await focus(page); await page.clock.runFor(30_000);
  await expect(page.getByText('Another saved version needs review', { exact: true })).toBeVisible();
  expect(await backup(page, profileId)).toEqual(pending);
  expect((await tool(cloudServer, token.access_token, 'get_semester_plan', { profileId })).plan).toEqual(later.plan);
  expect(later.plan.workHours).toBe('Chat confirmed Saturday study time');
});

test('lost simulated Sites sign-in clears private browser state while its SQLite plan remains intact', async ({ page, cloudServer }) => {
  await freeze(page);
  const profileId = await createInBrowser(page, cloudServer, 'high-school');
  const { token } = await authorizeCloudClient(cloudServer.harness);
  const { assignment } = await importSchoolTask(cloudServer, token.access_token, profileId, 'high-school');
  await refreshedTask(page, assignment);
  await saved(page);
  const before = await backup(page, profileId); expect(before).not.toBeNull();
  cloudServer.setIdentity(null);
  await focus(page);
  await expect(page).toHaveURL(cloudServer.origin + '/cloud');
  await expect(page.getByRole('link', { name: 'Sign in with ChatGPT', exact: true })).toBeVisible();
  await expect(page.getByText(assignment.title, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), before.key)).toBeNull();
  const durable = await tool(cloudServer, token.access_token, 'get_semester_plan', { profileId });
  expect(durable.plan.tasks[0].id).toBe(assignment.id);
  expect(durable.revision).toBe(before.baseRevision);
});

async function beginUnsettledEdit(page, server, profileId, state) {
  let release = () => {};
  let readFailure = false;
  let putStarted;
  const started = new Promise(resolve => { putStarted = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const interception = async route => {
    if (route.request().method() === 'GET' && readFailure)
      return route.fulfill({ status: 503, json: { error: 'Synthetic storage outage' } });
    if (route.request().method() !== 'PUT') return route.continue();
    if (state === 'saving') {
      putStarted();
      await held;
      return route.continue().catch(() => {});
    }
    return route.fulfill({ status: 503, json: { error: 'Synthetic storage outage' } });
  };
  if (['pending', 'saving', 'unavailable'].includes(state)) await page.route('**/api/plan?*', interception);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByLabel('Work hours and availability notes').fill('Private unsettled availability');
  if (state === 'form') return { release };
  if (state === 'conflict') {
    const { token } = await authorizeCloudClient(server.harness);
    const current = await tool(server, token.access_token, 'get_semester_plan', { profileId });
    await tool(server, token.access_token, 'save_semester_plan', {
      profileId, baseRevision: current.revision, plan: { profileId, workHours: 'Confirmed cloud availability' },
    });
  }
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  if (state === 'saving') {
    await started;
    await expect(page.getByText('Saving changes', { exact: true })).toBeVisible();
  } else if (state === 'conflict') {
    await expect(page.getByText('Another saved version needs review', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText('Changes waiting to save', { exact: true })).toBeVisible();
  }
  if (state === 'unavailable') {
    readFailure = true;
    await page.reload();
    await expect(page.getByText('Saved plan unavailable', { exact: true })).toBeVisible();
    readFailure = false;
  }
  return { release };
}

for (const state of ['pending', 'form', 'conflict', 'unavailable', 'saving']) {
  test('cloud account checks continue during ' + state + ' and clear private state after session loss', async ({ page, cloudServer }) => {
    await freeze(page);
    const profileId = await createInBrowser(page, cloudServer, 'college');
    const unsettled = await beginUnsettledEdit(page, cloudServer, profileId, state);
    try {
      const before = await backup(page, profileId);
      expect(before).not.toBeNull();
      if (state !== 'form') expect(before.dirty).toBe(true);
      const readCount = cloudServer.requests.filter(entry => entry.path === '/api/plan' && entry.method === 'GET').length;
      cloudServer.setIdentity(null);
      // Polling must work even with no further save or student interaction.
      await expect.poll(async () => {
        // A prior authentication request may still be completing. Advance the
        // periodic check again after the browser has handled that response.
        await page.clock.runFor(15_000);
        return page.url();
      }).toBe(cloudServer.origin + '/cloud');
      await expect(page).toHaveURL(cloudServer.origin + '/cloud');
      await expect(page.getByRole('link', { name: 'Sign in with ChatGPT', exact: true })).toBeVisible();
      expect(cloudServer.requests.filter(entry => entry.path === '/api/plan' && entry.method === 'GET').length).toBeGreaterThan(readCount);
      expect(await page.evaluate(key => localStorage.getItem(key), before.key)).toBeNull();
      await expect(page.getByText('Private unsettled availability', { exact: false })).toHaveCount(0);
      await expect(page.getByLabel('Work hours and availability notes')).toHaveCount(0);
    } finally {
      unsettled.release();
    }
  });
}

for (const state of ['pending', 'form', 'conflict']) {
  test('cloud ' + state + ' recovery survives background storage and network failures', async ({ page, cloudServer }) => {
    await freeze(page);
    const profileId = await createInBrowser(page, cloudServer, 'high-school');
    const unsettled = await beginUnsettledEdit(page, cloudServer, profileId, state);
    try {
      const before = await backup(page, profileId);
      let failure = 'storage';
      let failedReads = 0;
      await page.route('**/api/plan?*', async route => {
        if (route.request().method() !== 'GET') return route.fallback();
        failedReads += 1;
        if (failure === 'network') return route.abort('internetdisconnected');
        return route.fulfill({ status: 503, json: { error: 'Synthetic storage outage' } });
      });
      for (const nextFailure of ['storage', 'network']) {
        failure = nextFailure;
        const previousCount = failedReads;
        await expect.poll(async () => {
          await focus(page);
          return failedReads;
        }).toBeGreaterThan(previousCount);
        await expect(page).toHaveURL(cloudServer.origin + '/cloud?profileId=' + profileId);
        expect(await backup(page, profileId)).toEqual(before);
        if (state === 'form') {
          await expect(page.getByLabel('Work hours and availability notes')).toHaveValue('Private unsettled availability');
        } else {
          await expect(page.getByText('Your availability notes: Private unsettled availability', { exact: true })).toBeVisible();
          await expect(page.getByText(state === 'conflict' ? 'Another saved version needs review' : 'Changes waiting to save', { exact: true })).toBeVisible();
        }
        // Let this failed fetch settle before asking for the next check.
        await page.clock.runFor(1);
      }
    } finally {
      unsettled.release();
    }
  });
}
