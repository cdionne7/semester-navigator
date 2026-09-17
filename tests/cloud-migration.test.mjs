import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudRepository } from '../lib/cloud-repository.mjs';
import { CLOUD_TOOLS, handleCloudMcp } from '../lib/cloud-tools.mjs';
import { normalizePlan, recordSourceCheck } from '../lib/plan-model.mjs';
import { CLOUD_ORIGIN, TEST_IDENTITIES, createCloudHarness, authorizeCloudClient, cloudTool } from './helpers/cloud-harness.mjs';

function localPlan() {
  const plan = normalizePlan({
    schemaVersion: 2, profileId: 'existing-local-profile', revision: 19,
    name: 'Casey', school: 'Example School', semester: 'Fall 2026', educationLevel: 'high-school', timezone: 'America/New_York',
    workHours: 'Practice until 5:30 PM weekdays',
    courses: [{ id: 'science', name: 'Science', gradingComponents: [{ id: 'labs', title: 'Labs', weight: 50, score: 17, possible: 20, finalized: false }] }],
    tasks: [{ id: 'lab', courseId: 'science', title: 'Lab notes', state: 'done', dueAt: '2026-09-16', notes: 'Keep my observations', rubric: 'Explain evidence' },
      { id: 'quiz', courseId: 'science', title: 'Quiz', dueAt: null, notes: 'Ask about the date' }],
    reminders: [{ id: 'desktop-reminder', title: 'Study', schedule: 'Weekdays', enabled: true, status: 'scheduled', provider: 'chatgpt', executionContext: 'desktop', toolId: 'existing-desktop-schedule', verifiedAt: '2026-09-17T12:00:00Z' }],
  });
  return recordSourceCheck(plan, { profileId: plan.profileId, source: {
    id: 'school', provider: 'google-classroom', accessMode: 'browser',
    connection: { state: 'verified', executionContext: 'desktop', tool: 'Desktop browser', evidence: 'School identity panel read', checkedAt: '2026-09-17T12:00:00Z', expectedIdentity: 'casey@example.test', observedIdentity: 'casey@example.test', identityStorageApproved: true },
    coverage: [{ courseId: 'science', scope: 'assignments', status: 'checked', checkedAt: '2026-09-17T12:00:00Z', evidence: 'All assignment pages read', pagesChecked: 2, paginationComplete: true, itemCount: 2 }],
  } });
}
const migration = (plan = localPlan()) => ({ plan, sourceConfirmation: {
  sourceDescription: 'Current saved local plan read and reviewed with Casey', profileId: plan.profileId,
  revision: plan.revision, cloudIsAuthoritative: true,
} });
async function fixture(t) {
  const h = await createCloudHarness(); t.after(() => h.close());
  const { token } = await authorizeCloudClient(h);
  return { h, token };
}
function success(result) {
  assert.equal(result.response.status, 200);
  assert.equal(result.body.error, undefined, JSON.stringify(result.body));
  assert.notEqual(result.body.result?.isError, true, JSON.stringify(result.body));
  return result.body.result.structuredContent;
}
async function direct(repository, args) {
  const request = new Request(CLOUD_ORIGIN + '/api/semester-mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'migrate_student_plan', arguments: args } }),
  });
  return (await handleCloudMcp(request, { origin: CLOUD_ORIGIN, principal: { userId: TEST_IDENTITIES.household.userId, scopes: ['semester:read', 'semester:write'] }, repository })).json();
}

test('MCP migration preserves the confirmed local profile and full content in a durable cloud readback', async t => {
  const { h, token } = await fixture(t);
  const original = localPlan();
  const saved = success(await cloudTool(h, token.access_token, 'migrate_student_plan', migration(original)));
  assert.equal(saved.profileId, original.profileId);
  assert.equal(saved.revision, 1);
  assert.equal(saved.plan.revision, 1);
  assert.equal(original.revision, 19, 'The local snapshot remains unchanged');
  for (const field of ['name', 'school', 'semester', 'educationLevel', 'timezone', 'workHours', 'courses', 'tasks', 'sources', 'reminders']) assert.deepEqual(saved.plan[field], original[field], field);
  assert.equal(saved.automaticSourceRefresh, false);
  assert.equal(saved.sourceStatus[0].executionContext, 'desktop');
  assert.equal(saved.plan.reminders[0].executionContext, 'desktop');
  assert.equal(saved.dashboardUrl, CLOUD_ORIGIN + '/cloud?profileId=' + original.profileId);
  const reopened = await createCloudRepository(h.DB).getPlan(TEST_IDENTITIES.household.userId, original.profileId);
  assert.deepEqual(reopened, { plan: saved.plan, revision: 1 });
  const browser = await h.request('/api/profile?profileId=' + original.profileId, { identity: 'household' });
  assert.equal(browser.status, 200);
  assert.deepEqual((await browser.json()).plan, saved.plan);
  const guide = await h.request('/cloud/guide', { identity: 'household' });
  assert.equal(guide.status, 200);
  const guideHtml = await guide.text();
  assert.match(guideHtml, /migrate_student_plan/);
  assert.match(guideHtml, /browser coursework import into an existing plan is not a stable-ID migration/);
  const listed = success(await cloudTool(h, token.access_token, 'list_student_plans'));
  assert.deepEqual(listed.plans.map(row => row.profileId), [original.profileId]);
  const stale = await cloudTool(h, token.access_token, 'update_assignment', { profileId: original.profileId, assignmentId: 'quiz', baseRevision: 19, patch: { notes: 'Old local revision is not a cloud revision' } });
  assert.equal(stale.body.result.isError, true);
  assert.equal((await h.repository.getPlan(TEST_IDENTITIES.household.userId, original.profileId)).revision, 1);
  const updated = success(await cloudTool(h, token.access_token, 'update_assignment', { profileId: original.profileId, assignmentId: 'quiz', baseRevision: 1, patch: { notes: 'Cloud is now authoritative' } }));
  assert.equal(updated.revision, 2);
});

test('migration requires explicit matching source confirmation and a complete source snapshot before inserting', async t => {
  const { h, token } = await fixture(t);
  const args = migration();
  for (const input of [
    { plan: args.plan },
    { ...args, sourceConfirmation: { ...args.sourceConfirmation, cloudIsAuthoritative: false } },
    { ...args, sourceConfirmation: { ...args.sourceConfirmation, sourceDescription: ' ' } },
    { ...args, sourceConfirmation: { ...args.sourceConfirmation, profileId: 'different-student' } },
    { ...args, sourceConfirmation: { ...args.sourceConfirmation, revision: 18 } },
    { ...args, plan: { ...args.plan, tasks: undefined } },
    { ...args, plan: { ...args.plan, name: '' } },
    { ...args, ownerId: TEST_IDENTITIES.other.userId },
    { ...args, plan: { ...args.plan, ownerId: TEST_IDENTITIES.other.userId } },
  ]) {
    const result = await cloudTool(h, token.access_token, 'migrate_student_plan', input);
    assert.ok(result.body.error || result.body.result?.isError, JSON.stringify(input));
    assert.deepEqual(await h.repository.listPlans(TEST_IDENTITIES.household.userId), []);
  }
});

test('migration enforces both OAuth scopes and does not access persistence with a single scope', async t => {
  const h = await createCloudHarness(); t.after(() => h.close());
  const descriptor = CLOUD_TOOLS.find(tool => tool.name === 'migrate_student_plan');
  assert.deepEqual(descriptor.securitySchemes[0].scopes, ['semester:read', 'semester:write']);
  assert.equal(descriptor.annotations.destructiveHint, false);
  for (const scope of ['semester:read', 'semester:write']) {
    const { token } = await authorizeCloudClient(h, { scope });
    const denied = await cloudTool(h, token.access_token, 'migrate_student_plan', migration());
    assert.equal(denied.response.status, 403);
    assert.match(denied.response.headers.get('www-authenticate'), /scope="semester:read semester:write"/);
    assert.deepEqual(await h.repository.listPlans(TEST_IDENTITIES.household.userId), []);
  }
});

test('duplicate and concurrent migration attempts never overwrite an existing owner profile', async t => {
  const { h, token } = await fixture(t);
  const first = migration(); const second = migration(); second.plan.tasks[0].notes = 'Different snapshot';
  const results = await Promise.all([first, second].map(args => cloudTool(h, token.access_token, 'migrate_student_plan', args)));
  const winners = results.filter(result => result.body.result?.structuredContent);
  assert.equal(winners.length, 1);
  assert.equal(results.filter(result => result.body.result?.isError).length, 1);
  const saved = success(winners[0]);
  const retry = await cloudTool(h, token.access_token, 'migrate_student_plan', { ...first, plan: { ...first.plan, tasks: [] } });
  assert.equal(retry.body.result.isError, true);
  assert.match(retry.body.result.content[0].text, /already has a cloud plan/);
  assert.deepEqual((await h.repository.getPlan(TEST_IDENTITIES.household.userId, first.plan.profileId)).plan, saved.plan);
  assert.equal((await h.repository.getPlan(TEST_IDENTITIES.household.userId, first.plan.profileId)).revision, 1);
});

test('migration derives ownership only from OAuth and never reads or overwrites another account', async t => {
  const { h, token } = await fixture(t);
  const args = migration();
  const otherPlan = normalizePlan({ ...args.plan, name: 'Other student', tasks: [{ id: 'private', title: 'Private other-owner work' }] });
  const otherSaved = await h.repository.importPlan(TEST_IDENTITIES.other.userId, otherPlan);
  const saved = success(await cloudTool(h, token.access_token, 'migrate_student_plan', args, { identity: 'other' }));
  assert.equal(saved.plan.name, 'Casey');
  assert.equal(saved.plan.tasks.some(task => task.id === 'private'), false);
  assert.deepEqual(await h.repository.getPlan(TEST_IDENTITIES.other.userId, args.plan.profileId), otherSaved);
  assert.deepEqual((await h.repository.getPlan(TEST_IDENTITIES.household.userId, args.plan.profileId)).plan, saved.plan);
});

test('unavailable or concurrently changed migration readback never claims verified migration', async t => {
  for (const mode of ['missing', 'changed']) {
    const h = await createCloudHarness(); t.after(() => h.close());
    const repository = { ...h.repository, async getPlan(userId, profileId) {
      if (mode === 'missing') return null;
      const current = await h.repository.getPlan(userId, profileId);
      return h.repository.savePlan(userId, profileId, { baseRevision: current.revision, plan: { ...current.plan, workHours: 'Another tab saved first' } });
    } };
    const result = await direct(repository, migration());
    assert.equal(result.result.isError, true);
    assert.equal(result.result.structuredContent, undefined);
    assert.doesNotMatch(result.result.content[0].text, /verified the persisted readback/);
    if (mode === 'missing') assert.match(result.result.content[0].text, /insert may have succeeded/);
    assert.equal((await h.repository.listPlans(TEST_IDENTITIES.household.userId)).length, 1, 'An uncertain readback is not permission to create a different profile');
  }
});
