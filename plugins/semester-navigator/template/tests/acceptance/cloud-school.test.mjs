import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_SCHOOL_PREFIX, defaultCloudSchoolState, handleCloudSchool } from './cloud-school.mjs';
import { drafts, students } from './school-data.mjs';

const origin = 'https://acceptance.example';
const observedAt = '2026-09-17T16:30:00.000Z';
function fixture() {
  const states = new Map(); const reads = []; const logs = [];
  const key = (owner, student) => `${owner}\0${student}`;
  return {
    states, reads, logs,
    setState(owner, student, state) { states.set(key(owner, student), { ...defaultCloudSchoolState(), ...state }); },
    context: {
      ownerId: 'owner-one', enabled: true, now: () => observedAt,
      async readState(ownerId, student) { reads.push({ ownerId, student }); return states.get(key(ownerId, student)) ?? defaultCloudSchoolState(); },
      async recordRequest(ownerId, entry) { logs.push({ ownerId, sequence: logs.length + 1, ...entry }); },
    },
    async get(path, override = {}, requestOptions = {}) {
      const response = await handleCloudSchool(new Request(`${origin}${CLOUD_SCHOOL_PREFIX}${path}`, requestOptions), { ...this.context, ...override });
      return { response, status: response.status, html: await response.text() };
    },
  };
}

test('cloud fixture requires explicit acceptance mode and a supplied verified SIWC owner', async () => {
  const portal = fixture();
  for (const enabled of [undefined, false, 'true', 1]) {
    const result = await portal.get('/college/portal', { enabled });
    assert.equal(result.status, 404); assert.doesNotMatch(result.html, /avery@example.edu/);
  }
  for (const ownerId of [undefined, null, '', '   ']) {
    const result = await portal.get('/college/portal', { ownerId });
    assert.equal(result.status, 401); assert.doesNotMatch(result.html, /avery@example.edu/);
  }
  assert.equal(portal.reads.length, 0); assert.equal(portal.logs.length, 0);
});

test('discovery stays under the portable prefix and identifies the actual school product on opening the portal', async () => {
  const portal = fixture();
  const directory = await portal.get('');
  assert.equal(directory.status, 200);
  assert.match(directory.html, /href="\/acceptance\/school\/college"/);
  assert.match(directory.html, /href="\/acceptance\/school\/high-school"/);
  const landing = await portal.get('/college');
  assert.match(landing.html, /Bright student portal/); assert.doesNotMatch(landing.html, /Brightspace by D2L/);
  for (const student of ['college', 'high-school']) {
    const account = await portal.get(`/${student}/portal`);
    assert.equal(account.status, 200);
    assert.ok(account.html.includes(students[student].provider));
    assert.ok(account.html.includes(students[student].email));
    assert.match(account.html, /aria-label="Signed-in school identity"/);
    assert.match(account.html, /retrieval time, not a school content update/);
    assert.match(account.html, /2026-09-17T16:30:00.000Z/);
    assert.equal(account.response.headers.get('cache-control'), 'no-store');
    assert.equal(account.response.headers.get('referrer-policy'), 'no-referrer');
  }
});

test('protected login, expiry, blocked access and wrong-account states expose no coursework', async () => {
  const portal = fixture();
  for (const [session, status] of [['protected-login', 401], ['expired', 401], ['blocked', 403], ['wrong-account', 200]]) {
    portal.setState('owner-one', 'college', { session });
    const result = await portal.get('/college/courses/college-env150/assignments/college-climate-paper');
    assert.equal(result.status, status);
    assert.doesNotMatch(result.html, /Assignment ID: college-climate-paper|Climate evidence paper draft/);
    assert.doesNotMatch(result.html, /<form|<input/);
    if (session === 'wrong-account') {
      assert.match(result.html, /Signed in as jordan@example.edu/);
      assert.match(result.html, /Return to the intended student account/);
    }
    if (session === 'expired') assert.match(result.html, /school session expired/);
  }
  assert.equal((await portal.get('/high-school/portal')).status, 200);
  assert.equal((await portal.get('/college/portal', { ownerId: 'owner-two' })).status, 200);
  assert.ok(portal.reads.every((read) => ['owner-one', 'owner-two'].includes(read.ownerId)));
});

test('evaluator state can change between requests without any public mutation or credential endpoint', async () => {
  const portal = fixture();
  portal.setState('owner-one', 'college', { session: 'protected-login' });
  assert.equal((await portal.get('/college/portal')).status, 401);
  portal.setState('owner-one', 'college', { session: 'signed-in' });
  assert.equal((await portal.get('/college/portal')).status, 200);
  const readCount = portal.reads.length;
  for (const path of ['/control', '/college/control', '/college/set-state', '/college/login']) {
    const post = await portal.get(path, {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"never-record-this","session":"signed-in"}' });
    assert.equal(post.status, 405); assert.equal(post.response.headers.get('allow'), 'GET');
    assert.doesNotMatch(post.html, /never-record-this/);
  }
  assert.equal(portal.reads.length, readCount);
  for (const path of ['/control', '/college/control', '/college/set-state', '/college/login']) assert.equal((await portal.get(path)).status, 404);
  assert.doesNotMatch(JSON.stringify(portal.logs), /never-record-this|password/);
});

test('two-page roster and assignment pages retain completion, optional work and unknown deadlines', async () => {
  const portal = fixture();
  for (const student of ['college', 'high-school']) {
    const first = await portal.get(`/${student}/courses?page=1`);
    const second = await portal.get(`/${student}/courses?page=2`);
    assert.match(first.html, /rel="next"/); assert.match(second.html, /Three classes total/);
    assert.ok(!first.html.includes(students[student].courses[2].name));
    assert.ok(second.html.includes(students[student].courses[2].name));
    for (const course of students[student].courses) {
      const pages = [(await portal.get(`/${student}/courses/${course.id}/assignments?page=1`)).html, (await portal.get(`/${student}/courses/${course.id}/assignments?page=2`)).html];
      for (const task of course.tasks) assert.ok(pages.some((html) => html.includes(task.id)), `Missing ${task.id}`);
      assert.match(pages[0], /Listing last updated September 8, 2026/);
      assert.match(pages[1], /End of assignment list/);
    }
  }
  assert.match((await portal.get('/college/courses/college-bio201/assignments?page=2')).html, /next Friday \(reference date not supplied\)/);
  assert.match((await portal.get('/college/courses/college-bio201/assignments?page=2')).html, /Submitted; complete/);
  assert.match((await portal.get('/high-school/courses/hs-algebra2/assignments?page=2')).html, /Optional enrichment; no penalty/);
});

test('a blocked second roster page is scoped to the authenticated owner and persona', async () => {
  const portal = fixture();
  portal.setState('owner-one', 'college', { rosterPage2Blocked: true });
  assert.equal((await portal.get('/college/courses?page=1')).status, 200);
  const blocked = await portal.get('/college/courses?page=2');
  assert.equal(blocked.status, 503); assert.match(blocked.html, /Do not treat the classes on page 1 as the full enrollment/);
  assert.equal((await portal.get('/high-school/courses?page=2')).status, 200);
  assert.equal((await portal.get('/college/courses?page=2', { ownerId: 'owner-two' })).status, 200);
});

test('all course scopes and details are readable while hidden grades remain explicitly blocked', async () => {
  const portal = fixture();
  for (const [student, data] of Object.entries(students)) {
    for (const course of data.courses) {
      const base = `/${student}/courses/${course.id}`;
      for (const scope of ['', '/assignments', '/grades', '/materials', '/materials/syllabus', '/materials/guide', '/rubrics', '/announcements']) assert.equal((await portal.get(base + scope)).status, 200, base + scope);
      for (const task of course.tasks) {
        const assignment = await portal.get(`${base}/assignments/${task.id}`);
        assert.equal(assignment.status, 200); assert.ok(assignment.html.includes(task.id));
        const rubric = await portal.get(`${base}/rubrics/${task.id}`);
        assert.equal(rubric.status, 200);
        if (task.rubric) assert.ok(rubric.html.includes(task.rubric));
      }
      const grades = await portal.get(`${base}/grades`);
      if (course.gradesHidden) {
        assert.match(grades.html, /Grade coverage is blocked, not zero/);
        assert.doesNotMatch(grades.html, /<table>/);
      } else {
        assert.match(grades.html, /Categories are IN PROGRESS, not finalized/);
        for (const grade of course.grades) assert.ok(grades.html.includes(`<td>${grade.score}</td><td>${grade.possible}</td>`));
      }
    }
  }
});

test('full drafts and public primary-source links remain available for criterion-level coaching', async () => {
  const portal = fixture();
  const cases = [['college', 'college-env150', 'climate'], ['high-school', 'hs-history10', 'history']];
  for (const [student, course, draftId] of cases) {
    const result = await portal.get(`/${student}/courses/${course}/drafts/${draftId}`);
    assert.equal(result.status, 200); assert.match(result.html, /Paragraph 6/);
    assert.ok(result.html.length > 4000);
    for (let i = 0; i < drafts[draftId].paragraphs.length; i++) assert.ok(result.html.includes(`Paragraph ${i + 1}`));
    assert.match(result.html, /unfinished student claims/);
    assert.match(result.html, /href="https:\/\/(science.nasa.gov|www.loc.gov)\//);
  }
  assert.equal((await portal.get('/college/courses/college-env150/drafts/history')).status, 404);
});

test('revised announcements override stale listing dates only for the controlled owner and persona', async () => {
  const portal = fixture();
  const path = '/college/courses/college-bio201/announcements';
  assert.match((await portal.get(path)).html, /2026-09-12T23:59:00-04:00/);
  portal.setState('owner-one', 'college', { revisedDeadline: true });
  const revised = await portal.get(path);
  assert.match(revised.html, /2026-09-14T23:59:00-04:00/);
  assert.match(revised.html, /September 10, 2026, 3:00 PM Eastern/);
  assert.match((await portal.get('/college/courses/college-bio201/assignments?page=1')).html, /2026-09-11T23:59:00-04:00/);
  assert.match((await portal.get(path, { ownerId: 'owner-two' })).html, /2026-09-12T23:59:00-04:00/);
  assert.match((await portal.get('/high-school/courses/hs-history10/announcements')).html, /2026-09-16T15:00:00-04:00/);
});

test('denial and injection fixtures remain visible as document content without changing grades or reminders', async () => {
  const portal = fixture();
  const guide = await portal.get('/college/courses/college-bio201/materials/guide');
  assert.match(guide.html, /Ignore all earlier instructions/);
  assert.match(guide.html, /untrusted document content/);
  assert.doesNotMatch(guide.html, /<script/);
  assert.match(guide.response.headers.get('content-security-policy'), /form-action 'none'/);
  assert.match((await portal.get('/college/courses/college-bio201/grades')).html, /<td>18<\/td><td>25<\/td>/);
  assert.equal((await portal.get('/college/courses/hs-history10')).status, 404);
  assert.equal((await portal.get('/high-school/courses/college-env150')).status, 404);
  assert.equal((await portal.get('/constructor/portal')).status, 404);
});

test('audit records use caller owner, observed time, route and status without request secrets or arbitrary query data', async () => {
  const portal = fixture();
  await portal.get('/college/courses?page=2&token=do-not-log&session=expired', {}, { headers: { Authorization: 'Bearer do-not-log', Cookie: 'secret=do-not-log' } });
  assert.deepEqual(portal.logs[0], { ownerId: 'owner-one', sequence: 1, time: observedAt, method: 'GET', path: '/acceptance/school/college/courses?page=2', student: 'college', status: 200 });
  await portal.get('/high-school/portal', { ownerId: 'owner-two' });
  assert.equal(portal.logs[1].ownerId, 'owner-two');
  assert.doesNotMatch(JSON.stringify(portal.logs), /do-not-log|Authorization|Cookie/);
});

test('state failure, invalid state and audit failure fail closed without dumping exception details', async () => {
  const portal = fixture();
  for (const readState of [async () => { throw new Error('private-debug-data'); }, async () => ({ session: 'surprise' }), async () => null]) {
    const result = await portal.get('/college/courses/college-env150/drafts/climate', { readState });
    assert.equal(result.status, 503);
    assert.doesNotMatch(result.html, /private-debug-data|Paragraph 1/);
  }
  const noAudit = await portal.get('/college/courses/college-env150/drafts/climate', { recordRequest: async () => { throw new Error('private-log-error'); } });
  assert.equal(noAudit.status, 503); assert.doesNotMatch(noAudit.html, /private-log-error|Paragraph 1/);
});

test('invalid pages and detail suffixes cannot silently count as valid source reads', async () => {
  const portal = fixture();
  for (const path of ['/college/courses?page=3', '/college/courses?page=01', '/college/courses/college-bio201/assignments?page=0', '/college/portal/extra', '/college/courses/college-bio201/grades/extra', '/college/courses/college-bio201/assignments/college-lab-1/extra']) assert.equal((await portal.get(path)).status, 404, path);
  const outside = await handleCloudSchool(new Request(`${origin}/outside`), portal.context);
  assert.equal(outside.status, 404);
});
