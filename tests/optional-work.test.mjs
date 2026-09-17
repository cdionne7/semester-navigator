import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, mergeImportedPlan, tasksForView, getCourseHealth, suggestStudyBlocks, createPlanService } from '../lib/plan-model.mjs';
import { calendarExport, coachingPrompt } from '../lib/student-tools.mjs';
import { CLOUD_SKILL_TEXT, CLOUD_TOOLS } from '../lib/cloud-tools.mjs';
import { TEST_IDENTITIES, createCloudHarness, authorizeCloudClient, cloudTool } from './helpers/cloud-harness.mjs';

const now = new Date('2026-09-08T14:00:00Z');
function examplePlan() {
  return normalizePlan({
    profileId: 'optional-work-fixture', name: 'Jordan Fixture', school: 'Example High School', semester: 'Fall 2026', educationLevel: 'high-school', timezone: 'America/New_York',
    courses: [{ id: 'math', name: 'Algebra II' }],
    tasks: [
      { id: 'required', courseId: 'math', title: 'Required problem set', dueAt: '2026-09-09', minutes: 30 },
      { id: 'completed', courseId: 'math', title: 'Required reflection', dueAt: '2026-09-07', state: 'done' },
      { id: 'practice', courseId: 'math', title: 'Optional practice', dueAt: '2026-09-07', minutes: 90, optional: true },
      { id: 'enrichment', courseId: 'math', title: 'Optional enrichment', dueAt: null, optional: true },
      { id: 'today', courseId: 'math', title: 'Optional challenge', dueAt: '2026-09-08', minutes: 60, optional: true },
      { id: 'optional-done', courseId: 'math', title: 'Finished optional exercise', dueAt: '2026-09-07', state: 'done', optional: true },
    ],
  });
}

test('optional assignments default false and survive partial imports, export and durable reload', async () => {
  const plan = examplePlan();
  assert.equal(plan.tasks[0].optional, false);
  for (const optional of ['true', 1, null]) {
    assert.throws(() => normalizePlan({ ...plan, tasks: [{ id: 'invalid', optional }] }), /Task optional must be true or false/);
  }
  const partial = { profileId: plan.profileId, tasks: [{ id: 'practice', title: 'Updated practice title' }] };
  for (const incoming of [partial, normalizePlan(partial)]) {
    const merged = mergeImportedPlan(plan, incoming);
    assert.equal(merged.tasks.find(task => task.id === 'practice').optional, true);
    assert.equal(merged.tasks.find(task => task.id === 'practice').title, 'Updated practice title');
  }
  const changed = mergeImportedPlan(plan, { profileId: plan.profileId, tasks: [{ id: 'practice', optional: false }] });
  assert.equal(changed.tasks.find(task => task.id === 'practice').optional, false);
  let row = null;
  const store = {
    read: async () => row ? structuredClone(row) : null,
    write: async next => { row = structuredClone(next); return true; },
  };
  const service = createPlanService(plan, store);
  const loaded = await service.load();
  await service.save({ plan: loaded.plan, baseRevision: loaded.revision });
  const reloaded = await createPlanService(plan, store).load();
  assert.deepEqual(reloaded.plan.tasks.map(task => task.optional), [false, false, true, true, true, true]);
  assert.deepEqual(normalizePlan(JSON.parse(JSON.stringify(reloaded.plan))).tasks, reloaded.plan.tasks);
});

test('optional work remains visible without inflating required progress, overdue warnings or study proposals', () => {
  const plan = examplePlan();
  assert.deepEqual(tasksForView(plan, 'overdue', now), []);
  assert.ok(tasksForView(plan, 'semester', now).some(task => task.id === 'practice'));
  assert.ok(tasksForView(plan, 'today', now).some(task => task.id === 'today'));
  assert.ok(tasksForView(plan, 'unknown', now).some(task => task.id === 'enrichment'));
  const health = getCourseHealth(plan, 'math', now);
  assert.equal(health.total, 2);
  assert.equal(health.completed, 1);
  assert.equal(health.overdue, 0);
  assert.equal(health.unknownDeadlines, 0);
  assert.doesNotMatch(health.reason, /unfinished items? (?:is|are) overdue|deadlines? needs? confirmation/);
  const onlyOptional = getCourseHealth({ ...plan, tasks: plan.tasks.filter(task => task.optional) }, 'math', now);
  assert.equal(onlyOptional.total, 0);
  assert.equal(onlyOptional.completed, 0);
  assert.doesNotMatch(onlyOptional.reason, /No assignments have been added/);
  const study = suggestStudyBlocks(plan, now);
  assert.deepEqual(study.blocks.map(block => block.taskId), ['required']);
  assert.equal(study.blocks[0].minutes, 30);
  assert.deepEqual(study.unscheduled, []);
  assert.match(study.limitations.join(' '), /Optional work is excluded/);
  const requiredAgain = mergeImportedPlan(plan, { profileId: plan.profileId, tasks: [{ id: 'practice', optional: false }] });
  assert.deepEqual(tasksForView(requiredAgain, 'overdue', now).map(task => task.id), ['practice']);
});

test('calendar and coaching exports label optional work without changing its actual deadline', () => {
  const plan = examplePlan();
  const calendar = calendarExport(plan, now).replace(/\r\n /g, '');
  const events = calendar.split('BEGIN:VEVENT').slice(1);
  const practice = events.find(event => event.includes('optional-work-fixture-practice@semester-navigator'));
  assert.ok(practice);
  assert.match(practice, /SUMMARY:\[Optional\] Algebra II: Optional practice/);
  assert.match(practice, /DTSTART;VALUE=DATE:20260907/);
  assert.match(practice, /Not required coursework/);
  assert.match(practice, /DESCRIPTION:Upcoming optional assignment/);
  assert.doesNotMatch(calendar, /Optional enrichment|Finished optional exercise/);
  const required = events.find(event => event.includes('optional-work-fixture-required@semester-navigator'));
  assert.match(required, /SUMMARY:Algebra II: Required problem set/);
  assert.doesNotMatch(required, /\[Optional\]/);
  assert.match(coachingPrompt(plan, 'study', 'practice'), /This assignment is optional/);
  assert.doesNotMatch(coachingPrompt(plan, 'study', 'required'), /This assignment is optional/);
});

test('real OAuth imports and assignment updates preserve and explicitly change optional status in the shared plan', async t => {
  const h = await createCloudHarness();
  t.after(() => h.close());
  const plan = examplePlan();
  let saved = await h.repository.importPlan(TEST_IDENTITIES.household.userId, plan);
  const token = (await authorizeCloudClient(h)).token.access_token;
  const call = async (name, args) => {
    const result = await cloudTool(h, token, name, args);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.error, undefined, JSON.stringify(result.body));
    assert.notEqual(result.body.result.isError, true, JSON.stringify(result.body));
    return result.body.result.structuredContent;
  };
  saved = await call('save_semester_plan', {
    profileId: plan.profileId, baseRevision: saved.revision,
    plan: { profileId: plan.profileId, tasks: [{ id: 'practice', title: 'Updated optional practice' }, { id: 'new-optional', title: 'Extra credit', optional: true }] },
  });
  assert.equal(saved.plan.tasks.find(task => task.id === 'practice').optional, true);
  assert.equal(saved.plan.tasks.find(task => task.id === 'new-optional').optional, true);
  const updated = await call('update_assignment', {
    profileId: plan.profileId, baseRevision: saved.revision, assignmentId: 'practice', patch: { optional: false },
  });
  assert.equal(updated.assignment.optional, false);
  const bootstrap = await (await h.request('/api/profile?profileId=' + plan.profileId, { identity: 'household' })).json();
  const browser = await h.request('/api/plan?profileId=' + plan.profileId, {
    identity: 'household', headers: { 'x-semester-account-key': bootstrap.cloud.accountKey },
  });
  assert.equal(browser.status, 200);
  assert.deepEqual((await browser.json()).plan.tasks, updated.plan.tasks);
  assert.equal(CLOUD_TOOLS.find(tool => tool.name === 'save_semester_plan').inputSchema.properties.plan.properties.tasks.items.properties.optional.type, 'boolean');
  assert.equal(CLOUD_TOOLS.find(tool => tool.name === 'update_assignment').inputSchema.properties.patch.properties.optional.type, 'boolean');
  assert.match(CLOUD_SKILL_TEXT, /optional: true only when the source or student confirms/);
});
