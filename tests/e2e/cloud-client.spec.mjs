// Client-contract tests only. The mocked account responses do not establish
// hosted authentication, OAuth registration, or native phone acceptance.
import { test, expect, changeAvailability, saved } from './fixtures.mjs';
import { normalizePlan } from '../../lib/plan-model.mjs';

const recoveryKey = (accountKey, profileId) =>
  'semester-navigator-cloud-v1:' + encodeURIComponent(accountKey) + ':' + encodeURIComponent(profileId);

async function cloudFixture(page, request, workspace) {
  const state = {
    accountKey: 'opaque-account-a',
    plan: normalizePlan(workspace.seed),
    revision: 0,
    getFailure: null,
    putFailure: null,
    replyAccountKey: undefined,
    omitAccountKey: false,
    profileFailure: null,
    apiUrl: '/api/plan?profileId=' + encodeURIComponent(workspace.seed.profileId),
  };
  const requests = [];
  const html = await (await request.get(workspace.url)).text();
  const cloudUrl = workspace.url + '/cloud?profileId=' + encodeURIComponent(workspace.seed.profileId);
  await page.route('**/cloud**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/cloud') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: url.searchParams.has('profileId') ? html : '<h1>Choose student</h1>',
    });
  });
  await page.route('**/api/profile**', async route => {
    if (state.profileFailure)
      return route.fulfill({ status: state.profileFailure, json: { error: 'Profile unavailable' } });
    return route.fulfill({ json: {
      plan: state.plan,
      cloud: {
        apiUrl: state.apiUrl,
        accountKey: state.accountKey,
        dashboardUrl: cloudUrl,
        serviceUrl: workspace.url,
      },
    } });
  });
  await page.route('**/api/plan**', async route => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url(), headers: request.headers() });
    const failure = request.method() === 'PUT' ? state.putFailure : state.getFailure;
    if (failure) return route.fulfill({ status: failure, json: { error: 'Simulated cloud failure' } });
    if (request.headers()['x-semester-account-key'] !== state.accountKey)
      return route.fulfill({ status: 403, json: { error: 'Account changed' } });
    if (request.method() === 'PUT') {
      const input = request.postDataJSON();
      if (input.baseRevision !== state.revision)
        return route.fulfill({ status: 409, json: { error: 'Newer plan saved' } });
      state.revision += 1;
      state.plan = normalizePlan({ ...input.plan, revision: state.revision });
    }
    return route.fulfill({ json: {
      plan: state.plan,
      revision: state.revision,
      ...(state.omitAccountKey ? {} : { accountKey: state.replyAccountKey ?? state.accountKey }),
    } });
  });
  await page.clock.setFixedTime(new Date('2026-09-08T14:00:00Z'));
  return { state, requests, cloudUrl };
}

async function expectSignedOut(page, storageKey) {
  await expect(page).toHaveURL(/\/cloud$/);
  await expect(page.getByRole('heading', { name: 'Choose student' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await expect(page.getByText('Private pending edit', { exact: false })).toHaveCount(0);
}

test('cloud load and saves use the captured profile endpoint and account key', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  await page.goto(fixture.cloudUrl);
  await saved(page);
  await changeAvailability(page, 'Tuesday work 4–9 PM');
  await saved(page);
  expect(fixture.state.plan.workHours).toBe('Tuesday work 4–9 PM');
  expect(fixture.state.revision).toBe(1);
  expect(fixture.requests.some(entry => entry.method === 'PUT')).toBe(true);
  for (const entry of fixture.requests) {
    expect(new URL(entry.url).searchParams.get('profileId')).toBe(workspace.seed.profileId);
    expect(entry.headers['x-semester-account-key']).toBe('opaque-account-a');
  }
  const backup = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), recoveryKey('opaque-account-a', workspace.seed.profileId));
  expect(backup.accountKey).toBe('opaque-account-a');
  expect(backup.plan.workHours).toBe('Tuesday work 4–9 PM');
  expect(backup.dirty).toBe(false);
  await page.reload();
  await saved(page);
  await expect(page.getByText('Your availability notes: Tuesday work 4–9 PM', { exact: true })).toBeVisible();
});

test('cloud bootstrap 401 provides a phone sign-in link without local setup instructions', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  fixture.state.profileFailure = 401;
  await page.goto(fixture.cloudUrl);
  const signIn = page.getByRole('link', { name: 'Sign in with ChatGPT', exact: true });
  await expect(signIn).toBeVisible();
  const href = new URL(await signIn.getAttribute('href'), workspace.url);
  expect(href.pathname).toBe('/signin-with-chatgpt');
  expect(href.searchParams.get('return_to')).toBe('/cloud?profileId=' + workspace.seed.profileId);
  await expect(page.getByText('Keep your workspace open', { exact: false })).toHaveCount(0);
  expect(fixture.requests).toEqual([]);
});

test('cloud bootstrap rejects a foreign API endpoint before making a plan request', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  fixture.state.apiUrl = 'https://other-service.invalid/api/plan?profileId=' + workspace.seed.profileId;
  await page.goto(fixture.cloudUrl);
  await expect(page.getByRole('heading', { name: 'Your semester could not be opened' })).toBeVisible();
  expect(fixture.requests).toEqual([]);
});

for (const failure of [401, 403, 'missing-account-key']) {
  test('initial cloud plan ' + failure + ' clears its recovery copy instead of displaying it', async ({ page, request, workspace }) => {
    const fixture = await cloudFixture(page, request, workspace);
    const key = recoveryKey(fixture.state.accountKey, workspace.seed.profileId);
    await page.addInitScript(({ key, plan }) => {
      if (new URL(window.location.href).searchParams.has('profileId'))
        localStorage.setItem(key, JSON.stringify({
          plan: { ...plan, workHours: 'Private pending edit' },
          baseRevision: 0, dirty: true, accountKey: 'opaque-account-a',
        }));
    }, { key, plan: workspace.seed });
    if (typeof failure === 'number') fixture.state.getFailure = failure;
    else fixture.state.omitAccountKey = true;
    await page.goto(fixture.cloudUrl);
    await expectSignedOut(page, key);
  });
}

test('a background cloud reply from another account removes the displayed private plan', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  await page.goto(fixture.cloudUrl);
  await saved(page);
  fixture.state.replyAccountKey = 'opaque-account-b';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectSignedOut(page, recoveryKey('opaque-account-a', workspace.seed.profileId));
});

test('an open draft cannot hide a mismatched account key in a successful background reply', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  await page.goto(fixture.cloudUrl);
  await saved(page);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByLabel('Work hours and availability notes').fill('Private pending edit');
  fixture.state.replyAccountKey = 'opaque-account-b';
  await expect.poll(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    return new URL(page.url()).pathname + new URL(page.url()).search;
  }).toBe('/cloud');
  await expectSignedOut(page, recoveryKey('opaque-account-a', workspace.seed.profileId));
  await expect(page.getByLabel('Work hours and availability notes')).toHaveCount(0);
});

test('authentication lost during a save cannot recreate the removed dirty backup', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  await page.goto(fixture.cloudUrl);
  await saved(page);
  fixture.state.putFailure = 401;
  await changeAvailability(page, 'Private pending edit');
  await expectSignedOut(page, recoveryKey('opaque-account-a', workspace.seed.profileId));
  expect(fixture.state.revision).toBe(0);
  expect(fixture.state.plan.workHours).toBe('');
});

test('temporary cloud save and load failures retain pending edits for the same account', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  await page.goto(fixture.cloudUrl);
  await saved(page);
  fixture.state.putFailure = 503;
  await changeAvailability(page, 'Private pending edit');
  await expect(page.getByText('Changes waiting to save', { exact: true })).toBeVisible();
  fixture.state.getFailure = 503;
  await page.reload();
  await expect(page.getByText('Saved plan unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Your availability notes: Private pending edit', { exact: true })).toBeVisible();
  expect(fixture.state.revision).toBe(0);
  fixture.state.getFailure = null;
  fixture.state.putFailure = null;
  await page.getByRole('button', { name: 'Load latest saved plan', exact: true }).click();
  await expect(page.getByText('Changes waiting to save', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save pending changes', exact: true }).click();
  await saved(page);
  expect(fixture.state.plan.workHours).toBe('Private pending edit');
});

test('a different account with the same profile ID never restores the previous account backup', async ({ page, request, workspace }) => {
  const fixture = await cloudFixture(page, request, workspace);
  await page.goto(fixture.cloudUrl);
  await saved(page);
  fixture.state.putFailure = 503;
  await changeAvailability(page, 'Private pending edit');
  await expect(page.getByText('Changes waiting to save', { exact: true })).toBeVisible();
  fixture.state.accountKey = 'opaque-account-b';
  fixture.state.getFailure = 503;
  await page.reload();
  await expect(page.getByText('Saved plan unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Private pending edit', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).dirty, recoveryKey('opaque-account-a', workspace.seed.profileId))).toBe(true);
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey('opaque-account-b', workspace.seed.profileId))).toBeNull();
});
