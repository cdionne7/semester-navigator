import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCloudRepository, createOAuthD1Store } from '../lib/cloud-repository.mjs';
import { normalizePlan } from '../lib/plan-model.mjs';
import { CLOUD_ORIGIN, TEST_IDENTITIES, createCloudHarness, authorizeCloudClient, cloudRpc, cloudTool } from './helpers/cloud-harness.mjs';

const avery = { name: 'Avery Fixture', school: 'Example University', semester: 'Fall 2026', educationLevel: 'college', timezone: 'America/New_York' };
const jordan = { name: 'Jordan Fixture', school: 'Example High School', semester: 'Fall 2026', educationLevel: 'high-school', timezone: 'America/New_York' };
async function fixture(t) {
  const harness = await createCloudHarness();
  t.after(() => harness.close());
  return harness;
}
async function createStudent(harness, intake = avery, identity = 'household') {
  const listing = await harness.request('/api/cloud/plans', { identity });
  assert.equal(listing.status, 200);
  const { accountKey } = await listing.json();
  const response = await harness.request('/api/cloud/plans', {
    identity, method: 'POST', headers: { origin: CLOUD_ORIGIN, 'x-semester-account-key': accountKey }, json: intake,
  });
  assert.equal(response.status, 201);
  return response.json();
}
async function browserRead(harness, saved, identity = 'household') {
  const response = await harness.request('/api/plan?profileId=' + saved.plan.profileId, { identity, headers: { 'x-semester-account-key': saved.accountKey } });
  assert.equal(response.status, 200);
  return response.json();
}
async function browserSave(harness, saved, plan, { identity = 'household', headers = {} } = {}) {
  return harness.request('/api/plan?profileId=' + saved.plan.profileId, {
    identity, method: 'PUT', headers: { origin: CLOUD_ORIGIN, 'x-semester-account-key': saved.accountKey, ...headers },
    json: { plan, baseRevision: saved.revision },
  });
}
function successfulTool(result) {
  assert.equal(result.response.status, 200);
  assert.equal(result.body.error, undefined, JSON.stringify(result.body));
  assert.notEqual(result.body.result?.isError, true, JSON.stringify(result.body));
  assert.ok(result.body.result?.structuredContent);
  return result.body.result.structuredContent;
}
function coursework(plan, title = 'Evidence draft') {
  return normalizePlan({ ...plan,
    courses: [{ id: 'writing', name: 'Writing', instructor: 'Fixture Instructor' }],
    tasks: [{ id: 'draft', courseId: 'writing', title, dueAt: '2026-10-02', minutes: 30, notes: 'Keep my outline', rubric: 'Use two supported examples.' }],
  });
}
function decodeHtml(text) {
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]);
}

test('real SQLite migrations and D1 adapter preserve data between repository instances', async t => {
  const h = await fixture(t);
  assert.ok(h.migrations.some(name => name.includes('plan_revisions')));
  assert.deepEqual(h.migrations, [...h.migrations].sort());
  const tables = h.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
  for (const name of ['semester_plans', 'cloud_student_plans', 'cloud_oauth_records']) assert.ok(tables.includes(name));
  const saved = await h.repository.createPlan(TEST_IDENTITIES.household.userId, avery);
  const reopened = createCloudRepository(h.DB);
  assert.deepEqual(await reopened.getPlan(TEST_IDENTITIES.household.userId, saved.plan.profileId), saved);
  assert.equal(await reopened.getPlan(TEST_IDENTITIES.other.userId, saved.plan.profileId), null);
  const listed = await reopened.listPlans(TEST_IDENTITIES.household.userId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].profileId, saved.plan.profileId);
  assert.equal(listed[0].timezone, 'America/New_York');
  const store = createOAuthD1Store(h.DB);
  await store.put({ kind: 'fixture', key: 'atomic', value: 'first', expiresAt: 123 });
  await store.put({ kind: 'fixture', key: 'atomic', value: 'second', expiresAt: 456 });
  assert.deepEqual(await store.get('fixture', 'atomic'), { kind: 'fixture', key: 'atomic', value: 'second', expiresAt: 456 });
  assert.equal(await store.consume('fixture', 'atomic', 'first'), false);
  assert.equal(await store.consume('fixture', 'atomic', 'second'), true);
  assert.equal(await store.consume('fixture', 'atomic', 'second'), false);
});

test('parallel OAuth limit requests share an atomic persisted cap across D1 store instances', async t => {
  const h = await fixture(t);
  const stores = [createOAuthD1Store(h.DB), createOAuthD1Store(h.DB)];
  const bucket = { key: 'registration:fixture-window', limit: 5, expiresAt: 10_000 };
  const attempts = await Promise.all(Array.from({ length: 24 }, (_, index) => stores[index % stores.length].takeLimit(bucket)));
  assert.equal(attempts.filter(Boolean).length, 5);
  assert.equal(attempts.filter(accepted => !accepted).length, 19);
  assert.deepEqual({ ...h.sqlite.prepare('SELECT count, expires_at FROM cloud_oauth_limits WHERE key = ?').get(bucket.key) }, {
    count: 5, expires_at: bucket.expiresAt,
  });
  assert.equal(await createOAuthD1Store(h.DB).takeLimit(bucket), false, 'Reopening the store cannot reset a consumed limit.');
  assert.equal(await stores[0].takeLimit({ ...bucket, key: 'registration:next-fixture-window' }), true);
  assert.equal(h.sqlite.prepare('SELECT count FROM cloud_oauth_limits WHERE key = ?').get(bucket.key).count, 5);
});

test('OAuth expiry cleanup removes only bounded expired rows and preserves permanent and future records', async t => {
  const h = await fixture(t);
  const store = createOAuthD1Store(h.DB);
  const now = 10_000;
  for (let index = 0; index < 105; index++) {
    await store.put({ kind: 'authorization-code', key: 'expired-code-' + index, value: 'fixture-code-hash', expiresAt: now - index });
    await store.takeLimit({ key: 'expired-limit-' + index, limit: 5, expiresAt: now - index });
  }
  const permanent = { kind: 'client', key: 'permanent-client', value: 'fixture-registration', expiresAt: null };
  const future = { kind: 'access-token', key: 'future-access', value: 'fixture-access-hash', expiresAt: now + 1 };
  await store.put(permanent);
  await store.put(future);
  await store.takeLimit({ key: 'permanent-limit', limit: 5, expiresAt: null });
  await store.takeLimit({ key: 'future-limit', limit: 5, expiresAt: now + 1 });
  const expiredCounts = () => ({
    records: h.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_oauth_records WHERE expires_at <= ?').get(now).count,
    limits: h.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_oauth_limits WHERE expires_at <= ?').get(now).count,
  });
  await store.cleanupExpired(now, 2);
  assert.deepEqual(expiredCounts(), { records: 103, limits: 103 });
  await store.cleanupExpired(now, 10_000);
  assert.deepEqual(expiredCounts(), { records: 3, limits: 3 }, 'Even an oversized request must delete at most 100 rows per table.');
  await store.cleanupExpired(now, 10);
  assert.deepEqual(expiredCounts(), { records: 0, limits: 0 });
  assert.deepEqual(await store.get(permanent.kind, permanent.key), permanent);
  assert.deepEqual(await store.get(future.kind, future.key), future);
  assert.deepEqual(h.sqlite.prepare('SELECT key FROM cloud_oauth_limits ORDER BY key').all().map(row => row.key), ['future-limit', 'permanent-limit']);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_oauth_records').get().count, 2);
});

test('authenticated cloud guide publishes a literal import contract for identity, execution context and school scopes', async t => {
  const h = await fixture(t);
  const response = await h.request('/cloud/guide', { identity: 'household' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  const blocks = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map(match => decodeHtml(match[1]));
  assert.equal(blocks.length, 2, 'The guide must expose readable planning instructions and the JSON contract.');
  const contract = JSON.parse(blocks[1]);
  assert.deepEqual(contract.required, ['profileId']);
  assert.equal(contract.properties.profileId.type, 'string');
  const source = contract.properties.sources.items.properties;
  assert.deepEqual(source.connection.properties.executionContext.enum, ['unknown', 'desktop', 'cloud']);
  assert.deepEqual(source.coverage.items.required, ['courseId', 'scope']);
  assert.deepEqual(source.coverage.items.properties.scope.enum, ['course-list', 'assignments', 'grades', 'materials', 'rubrics', 'announcements']);
  assert.deepEqual(source.coverage.items.properties.courseId.type, ['string', 'null']);
  assert.match(html, /Verify the signed-in account/);
  assert.match(html, /Import plan/);
  assert.match(html, /reload the selected profile/);
  assert.doesNotMatch(html, /(?:must|need to|required to) (?:create|open|choose) (?:a |your )?(?:local |private )?(?:folder|directory)/i);
});

test('selected cloud connection instructions carry the exact dashboard and guide URLs without local setup', async t => {
  const h = await fixture(t);
  const selected = await createStudent(h, avery);
  await createStudent(h, jordan);
  const path = '/cloud/connect?profileId=' + encodeURIComponent(selected.plan.profileId);
  const response = await h.request(path, { identity: 'household' });
  assert.equal(response.status, 200);
  const html = await response.text();
  const prompt = decodeHtml(html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? '');
  assert.ok(prompt.includes(CLOUD_ORIGIN + '/cloud?profileId=' + encodeURIComponent(selected.plan.profileId)));
  assert.ok(prompt.includes(CLOUD_ORIGIN + '/cloud/guide?profileId=' + encodeURIComponent(selected.plan.profileId)));
  assert.ok(prompt.includes(`Select profile ${JSON.stringify(selected.plan.profileId)} for ${avery.name}, ${avery.semester}.`));
  assert.match(prompt, /My computer may be off/);
  assert.match(prompt, /Do not create a separate local plan or require Remote/);
  assert.doesNotMatch(prompt, /run (?:npm|node)|open (?:a|your) local folder|keep (?:your|the) computer (?:awake|on)/i);
  assert.doesNotMatch(html, /Jordan Fixture|Example High School/);
  assert.ok(html.includes(CLOUD_ORIGIN + '/api/semester-mcp'));
  for (const [target, identity] of [[path, 'other'], ['/cloud/connect?profileId=student-does-not-exist', 'household']]) {
    const denied = await h.request(target, { identity });
    assert.equal(denied.status, 404);
    assert.doesNotMatch(await denied.text(), /Avery Fixture|Jordan Fixture|Example University/);
  }
});

test('selected guide exposes only the current owned plan for browser recovery without a download', async t => {
  const h = await fixture(t);
  let saved = await createStudent(h);
  const sibling = await createStudent(h, jordan);
  const content = coursework(saved.plan, 'Saved evidence draft');
  content.tasks[0].notes = '<script>not executable</script> & preserve my exact notes';
  const updated = await browserSave(h, saved, content);
  assert.equal(updated.status, 200);
  saved = await updated.json();
  const path = '/cloud/guide?profileId=' + encodeURIComponent(saved.plan.profileId);
  const response = await h.request(path, { identity: 'household' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.match(html, /read-only snapshot/);
  assert.doesNotMatch(html, /<script>not executable/);
  assert.doesNotMatch(html, /Jordan Fixture|Example High School/);
  const blocks = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map(match => decodeHtml(match[1]));
  assert.deepEqual(JSON.parse(blocks[0]), saved.plan);
  assert.equal((await h.repository.getPlan(TEST_IDENTITIES.household.userId, sibling.plan.profileId)).plan.tasks.length, 0);
  for (const [target, identity] of [[path, 'other'], ['/cloud/guide?profileId=student-missing', 'household']]) {
    const denied = await h.request(target, { identity });
    assert.equal(denied.status, 404);
    assert.doesNotMatch(await denied.text(), /Saved evidence draft|Avery Fixture|preserve my exact notes/);
  }
});

test('anonymous cloud guide requires ChatGPT sign-in without exposing private student facts or the import guide', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  for (const path of ['/cloud/guide', '/cloud/guide?profileId=' + encodeURIComponent(saved.plan.profileId)]) {
    const response = await h.request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.match(html, /href="\/signin-with-chatgpt\?return_to=/);
    assert.match(html, /Sign in with ChatGPT/);
    assert.doesNotMatch(html, /Avery Fixture|Example University|household@example\.test|JSON import contract|Assistant setup reference/);
  }
});

test('browser form, bootstrap, plan saves and OAuth MCP writes use the same durable plan', async t => {
  const h = await fixture(t);
  const setup = await h.request('/cloud/new', { identity: 'household' });
  assert.equal(setup.status, 200);
  const accountKey = (await setup.text()).match(/name="accountKey" value="([a-f0-9]+)"/)?.[1];
  assert.ok(accountKey);
  const created = await h.request('/api/cloud/plans', { identity: 'household', method: 'POST', headers: { origin: CLOUD_ORIGIN }, form: { ...avery, accountKey } });
  assert.equal(created.status, 303);
  const target = new URL(created.headers.get('location'), CLOUD_ORIGIN);
  const profileId = target.searchParams.get('profileId');
  assert.ok(profileId?.startsWith('student-'));
  const bootstrap = await h.request('/api/profile?profileId=' + profileId, { identity: 'household' });
  assert.equal(bootstrap.status, 200);
  const initialized = await bootstrap.json();
  assert.equal(initialized.cloud.apiUrl, '/api/plan?profileId=' + profileId);
  assert.match(initialized.cloud.accountKey, /^[a-f0-9]{64}$/);
  assert.equal(initialized.cloud.dashboardUrl, target.href);
  let saved = await browserRead(h, { plan: initialized.plan, accountKey: initialized.cloud.accountKey });
  assert.equal(saved.revision, 1);
  const write = await browserSave(h, saved, coursework(saved.plan));
  assert.equal(write.status, 200);
  saved = await write.json();
  assert.equal(saved.revision, 2);
  const { token } = await authorizeCloudClient(h);
  const initializedMcp = await cloudRpc(h, token.access_token, 'initialize', {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Integration fixture', version: '1.0' },
  });
  assert.equal(initializedMcp.body.result.protocolVersion, '2025-11-25');
  const listing = successfulTool(await cloudTool(h, token.access_token, 'list_student_plans'));
  assert.deepEqual(listing.plans.map(plan => plan.profileId), [profileId]);
  assert.equal(listing.plans[0].timezone, avery.timezone);
  const read = successfulTool(await cloudTool(h, token.access_token, 'get_semester_plan', { profileId }));
  assert.deepEqual(read.plan, saved.plan);
  assert.equal(read.automaticSourceRefresh, false);
  const updated = successfulTool(await cloudTool(h, token.access_token, 'update_assignment', {
    profileId, assignmentId: 'draft', baseRevision: read.revision, patch: { state: 'done', notes: 'Rechecked both examples' },
  }));
  assert.equal(updated.revision, 3);
  assert.equal(updated.assignment.dueAt, '2026-10-02');
  const browser = await browserRead(h, saved);
  assert.deepEqual(browser.plan, updated.plan);
  assert.equal(browser.revision, updated.revision);
  assert.equal(browser.plan.tasks[0].state, 'done');
  const durable = h.sqlite.prepare('SELECT revision, payload FROM cloud_student_plans WHERE owner_id = ? AND profile_id = ?')
    .get(TEST_IDENTITIES.household.userId, profileId);
  assert.equal(durable.revision, browser.revision);
  assert.deepEqual(JSON.parse(durable.payload), browser.plan);
});

test('two student personas on one account require explicit profile targets and never share saves', async t => {
  const h = await fixture(t);
  const college = await createStudent(h, avery);
  const highSchool = await createStudent(h, jordan);
  assert.notEqual(college.plan.profileId, highSchool.plan.profileId);
  assert.equal(college.accountKey, highSchool.accountKey);
  const { token } = await authorizeCloudClient(h);
  const plans = successfulTool(await cloudTool(h, token.access_token, 'list_student_plans')).plans;
  assert.deepEqual(new Set(plans.map(plan => plan.name)), new Set([avery.name, jordan.name]));
  const saved = successfulTool(await cloudTool(h, token.access_token, 'save_semester_plan', {
    profileId: college.plan.profileId, baseRevision: college.revision,
    plan: { profileId: college.plan.profileId, tasks: [{ id: 'college-only', title: 'Avery private note', dueAt: null }] },
  }));
  assert.equal(saved.plan.name, avery.name);
  assert.equal((await browserRead(h, highSchool)).revision, 1);
  assert.deepEqual((await browserRead(h, highSchool)).plan.tasks, []);
  const mismatch = await browserSave(h, college, { ...college.plan, profileId: highSchool.plan.profileId });
  assert.equal(mismatch.status, 400);
  const changedStudent = await browserSave(h, { ...college, revision: saved.revision }, { ...saved.plan, name: jordan.name });
  assert.equal(changedStudent.status, 409);
  const after = await browserRead(h, college);
  assert.equal(after.revision, saved.revision);
  assert.equal(after.plan.name, avery.name);
  const chooser = await (await h.request('/cloud', { identity: 'household' })).text();
  assert.match(chooser, /People sharing this account can open its student plans/);
  assert.ok(chooser.includes(college.plan.profileId));
  assert.ok(chooser.includes(highSchool.plan.profileId));
});

test('another account and unauthenticated callers cannot read or mutate a selected student', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  const other = await createStudent(h, jordan, 'other');
  for (const path of ['/api/profile', '/api/plan', '/api/runtime']) {
    const target = path + '?profileId=' + saved.plan.profileId;
    const missing = await h.request(target);
    assert.equal(missing.status, 401);
    assert.doesNotMatch(await missing.text(), /Avery Fixture|Example University/);
    const foreign = await h.request(target, { identity: 'other', headers: { 'x-semester-account-key': other.accountKey } });
    assert.equal(foreign.status, 404);
    assert.doesNotMatch(await foreign.text(), /Avery Fixture|Example University/);
  }
  assert.equal((await h.request('/api/cloud/plans')).status, 401);
  const page = await (await h.request('/cloud?profileId=' + saved.plan.profileId)).text();
  assert.match(page, /Sign in with ChatGPT/);
  assert.doesNotMatch(page, /Avery Fixture|Example University/);
  const missingToken = await cloudTool(h, null, 'get_semester_plan', { profileId: saved.plan.profileId });
  assert.equal(missingToken.response.status, 401);
  assert.match(missingToken.response.headers.get('www-authenticate'), /oauth-protected-resource/);
  const { token } = await authorizeCloudClient(h, { identity: 'other' });
  // A browser session for the owner does not override the bearer token owner.
  const denied = await cloudTool(h, token.access_token, 'get_semester_plan', { profileId: saved.plan.profileId }, { identity: 'household' });
  assert.equal(denied.body.result.isError, true);
  assert.equal(denied.body.result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(denied.body), /Avery Fixture|Example University/);
  const write = await browserSave(h, { ...saved, accountKey: other.accountKey }, { ...saved.plan, workHours: 'Unauthorized overwrite' }, { identity: 'other' });
  assert.equal(write.status, 404);
  assert.deepEqual(await browserRead(h, saved), saved);
});

test('wrong account key and cross-origin browser saves fail before mutation', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  const updated = { ...saved.plan, workHours: 'Must never be saved' };
  for (const key of ['', 'wrong-account-hash']) {
    const response = await browserSave(h, saved, updated, { headers: { 'x-semester-account-key': key } });
    assert.equal(response.status, 403);
  }
  for (const headers of [
    { origin: 'https://untrusted.invalid' },
    { origin: '' },
    { 'sec-fetch-site': 'cross-site' },
  ]) assert.equal((await browserSave(h, saved, updated, { headers })).status, 403);
  for (const origin of ['https://untrusted.invalid', '']) {
    const create = await h.request('/api/cloud/plans', { identity: 'household', method: 'POST', headers: { origin, 'x-semester-account-key': saved.accountKey }, json: jordan });
    assert.equal(create.status, 403);
  }
  assert.deepEqual(await browserRead(h, saved), saved);
  assert.equal((await h.repository.listPlans(TEST_IDENTITIES.household.userId)).length, 1);
});

test('rejected methods and cross-origin saves cannot trigger saved-seed reconciliation', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  const owner = TEST_IDENTITIES.household.userId;
  const profileId = saved.plan.profileId;
  const changedSeed = normalizePlan({ ...saved.plan, tasks: [{ id: 'seed-correction', title: 'New seed assignment', dueAt: null }] });
  h.sqlite.prepare('UPDATE cloud_student_plans SET seed_payload = ? WHERE owner_id = ? AND profile_id = ?')
    .run(JSON.stringify(changedSeed), owner, profileId);
  const snapshot = () => ({
    row: { ...h.sqlite.prepare('SELECT * FROM cloud_student_plans WHERE owner_id = ? AND profile_id = ?').get(owner, profileId) },
    changes: h.sqlite.prepare('SELECT total_changes() AS total').get().total,
  });
  const before = snapshot();
  for (const [path, method] of [
    ['/api/profile', 'POST'], ['/api/profile', 'PUT'], ['/api/runtime', 'POST'],
    ['/api/plan', 'POST'], ['/api/plan', 'PATCH'], ['/api/plan', 'DELETE'],
  ]) {
    const response = await h.request(path + '?profileId=' + profileId, {
      identity: 'household', method,
      headers: { origin: CLOUD_ORIGIN, 'x-semester-account-key': saved.accountKey },
      json: { plan: saved.plan, baseRevision: saved.revision },
    });
    assert.equal(response.status, 405, path + ' ' + method);
    assert.deepEqual(snapshot(), before, 'Rejected method must not call a reconciling plan read.');
  }
  for (const headers of [{ origin: 'https://untrusted.invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
    const response = await browserSave(h, saved, saved.plan, { headers });
    assert.equal(response.status, 403);
    assert.deepEqual(snapshot(), before, 'Rejected origin must not call a reconciling plan read.');
  }
  const acceptedRead = await browserRead(h, saved);
  assert.equal(acceptedRead.revision, saved.revision + 1, 'Control read proves the seed would otherwise have reconciled.');
  assert.equal(snapshot().changes, before.changes + 1);
});

test('retried initial creation returns the same student and existing saved work', async t => {
  const h = await fixture(t);
  let saved = await createStudent(h);
  saved = await (await browserSave(h, saved, { ...coursework(saved.plan), workHours: 'Keep this existing availability' })).json();
  for (const intake of [avery, { ...avery, name: '  AVERY Fixture  ', school: 'EXAMPLE UNIVERSITY', semester: 'fall 2026' }]) {
    const retried = await createStudent(h, intake);
    assert.equal(retried.plan.profileId, saved.plan.profileId);
    assert.deepEqual(retried, saved);
  }
  const token = (await authorizeCloudClient(h)).token.access_token;
  const fromTool = successfulTool(await cloudTool(h, token, 'create_student_plan', avery));
  assert.equal(fromTool.profileId, saved.plan.profileId);
  assert.equal(fromTool.revision, saved.revision);
  assert.deepEqual(fromTool.plan, saved.plan);
  assert.equal((await h.repository.listPlans(TEST_IDENTITIES.household.userId)).length, 1);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_student_plans').get().count, 1);
});

test('initial create retry with a different education level returns conflict without changing the plan', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  const intake = { ...avery, educationLevel: 'high-school' };
  const response = await h.request('/api/cloud/plans', {
    identity: 'household', method: 'POST',
    headers: { origin: CLOUD_ORIGIN, 'x-semester-account-key': saved.accountKey }, json: intake,
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /different school level/);
  const token = (await authorizeCloudClient(h)).token.access_token;
  const fromTool = await cloudTool(h, token, 'create_student_plan', intake);
  assert.equal(fromTool.body.result.isError, true);
  assert.equal(fromTool.body.result._meta['semester/error'], 'revision_conflict');
  assert.deepEqual(await browserRead(h, saved), saved);
  assert.equal((await h.repository.listPlans(TEST_IDENTITIES.household.userId)).length, 1);
});

test('concurrent browser saves perform real SQLite compare-and-swap with one winner', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  const responses = await Promise.all([
    browserSave(h, saved, { ...saved.plan, workHours: 'First competing note' }),
    browserSave(h, saved, { ...saved.plan, workHours: 'Second competing note' }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const accepted = await responses.find(response => response.status === 200).json();
  const current = await browserRead(h, saved);
  assert.equal(current.revision, saved.revision + 1);
  assert.deepEqual(current, accepted);
});

test('concurrent browser and OAuth tool saves cannot overwrite a newer revision', async t => {
  const h = await fixture(t);
  let saved = await createStudent(h);
  saved = await (await browserSave(h, saved, coursework(saved.plan))).json();
  const { token } = await authorizeCloudClient(h);
  const [browserResponse, tool] = await Promise.all([
    browserSave(h, saved, { ...saved.plan, workHours: 'Browser wins when first' }),
    cloudTool(h, token.access_token, 'update_assignment', {
      profileId: saved.plan.profileId, assignmentId: 'draft', baseRevision: saved.revision, patch: { notes: 'Tool wins when first' },
    }),
  ]);
  const browserSucceeded = browserResponse.status === 200;
  const toolSucceeded = tool.body.result?.isError !== true && !!tool.body.result?.structuredContent;
  assert.notEqual(browserSucceeded, toolSucceeded);
  if (!browserSucceeded) assert.equal(browserResponse.status, 409);
  if (!toolSucceeded) assert.equal(tool.body.result._meta['semester/error'], 'revision_conflict');
  const current = await browserRead(h, saved);
  assert.equal(current.revision, saved.revision + 1);
  assert.equal(current.plan.workHours, browserSucceeded ? 'Browser wins when first' : '');
  assert.equal(current.plan.tasks[0].notes, toolSucceeded ? 'Tool wins when first' : 'Keep my outline');
});

test('one-time local migration retains stable identity and cannot overwrite an existing cloud plan', async t => {
  const h = await fixture(t);
  const account = await createStudent(h);
  const imported = normalizePlan({ ...avery, profileId: 'stable-local-student', revision: 19,
    courses: [{ id: 'biology', name: 'Biology' }],
    tasks: [{ id: 'lab', courseId: 'biology', title: 'Finished lab', dueAt: null, state: 'done', notes: 'My saved evidence' }],
  });
  const response = await h.request('/api/cloud/import', {
    identity: 'household', method: 'POST', headers: { origin: CLOUD_ORIGIN, 'x-semester-account-key': account.accountKey }, json: imported,
  });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.plan.profileId, imported.profileId);
  assert.deepEqual(saved.plan.tasks, imported.tasks);
  assert.equal(saved.revision, 1);
  const reopened = createCloudRepository(h.DB);
  assert.deepEqual((await reopened.getPlan(TEST_IDENTITIES.household.userId, imported.profileId)).plan, saved.plan);
  const duplicate = await h.request('/api/cloud/import', {
    identity: 'household', method: 'POST', headers: { origin: CLOUD_ORIGIN, 'x-semester-account-key': account.accountKey },
    json: { ...imported, tasks: [] },
  });
  assert.equal(duplicate.status, 409);
  assert.deepEqual((await reopened.getPlan(TEST_IDENTITIES.household.userId, imported.profileId)).plan.tasks, imported.tasks);
  const otherOwner = await reopened.importPlan(TEST_IDENTITIES.other.userId, { ...imported, name: jordan.name, tasks: [] });
  assert.equal(otherOwner.plan.profileId, imported.profileId);
  assert.deepEqual((await reopened.getPlan(TEST_IDENTITIES.other.userId, imported.profileId)).plan.tasks, []);
  assert.deepEqual((await reopened.getPlan(TEST_IDENTITIES.household.userId, imported.profileId)).plan.tasks, imported.tasks);
});

test('OAuth read scope and durable revocation are enforced at the real MCP route', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  const { client, token } = await authorizeCloudClient(h, { scope: 'semester:read' });
  successfulTool(await cloudTool(h, token.access_token, 'get_semester_plan', { profileId: saved.plan.profileId }));
  const denied = await cloudTool(h, token.access_token, 'save_semester_plan', {
    profileId: saved.plan.profileId, baseRevision: saved.revision, plan: { profileId: saved.plan.profileId },
  });
  assert.equal(denied.response.status, 403);
  assert.match(denied.response.headers.get('www-authenticate'), /insufficient_scope/);
  const revoke = await h.request('/oauth/revoke', { method: 'POST', form: {
    client_id: client.client_id, token: token.access_token, resource: CLOUD_ORIGIN + '/api/semester-mcp',
  } });
  assert.equal(revoke.status, 200);
  const after = await cloudTool(h, token.access_token, 'get_semester_plan', { profileId: saved.plan.profileId });
  assert.equal(after.response.status, 401);
  assert.deepEqual(await browserRead(h, saved), saved);
  const stored = JSON.stringify(h.sqlite.prepare('SELECT kind, key, value FROM cloud_oauth_records').all());
  assert.ok(!stored.includes(token.access_token));
  assert.ok(!stored.includes(token.refresh_token));
});

test('private cloud dashboard serves the bundled cloud bootstrap and its mapped assets', async t => {
  const h = await fixture(t);
  const saved = await createStudent(h);
  const response = await h.request('/cloud?profileId=' + saved.plan.profileId, { identity: 'household' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.equal(html, await readFile(new URL('../public/dashboard/index.html', import.meta.url), 'utf8'));
  assert.deepEqual(h.assetRequests, ['/dashboard/index.html']);
  const script = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
  assert.ok(script, 'The served dashboard must have its real module entry.');
  const source = await h.request(new URL(script, CLOUD_ORIGIN + '/cloud').pathname);
  assert.equal(source.status, 200);
  assert.match(source.headers.get('content-type'), /javascript/);
  const builtClient = await source.text();
  assert.match(builtClient, /\/api\/profile/);
  assert.match(builtClient, /profileId/);
  assert.match(builtClient, /x-semester-account-key/);
  assert.match(builtClient, /semester-navigator-cloud-v1/);
  const profile = await h.request('/api/profile?profileId=' + saved.plan.profileId, { identity: 'household' });
  assert.equal((await profile.json()).cloud.apiUrl, '/api/plan?profileId=' + saved.plan.profileId);
  const unrelated = await h.request('/cloud?profileId=' + saved.plan.profileId, { identity: 'other' });
  assert.equal(unrelated.status, 404);
  assert.doesNotMatch(await unrelated.text(), /Avery Fixture/);
});
