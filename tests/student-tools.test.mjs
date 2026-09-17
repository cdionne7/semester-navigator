import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan } from '../lib/plan-model.mjs';
import { calendarExport, coachingPrompt, desktopChatUrl, dueFromLocal, localDueParts, safeWebUrl } from '../lib/student-tools.mjs';

test('date entry retains unknown times and round trips student timezone, including clock changes', () => {
  assert.equal(dueFromLocal('', '', 'America/New_York'), null);
  assert.equal(dueFromLocal('2026-09-09', '', 'America/Los_Angeles'), '2026-09-09');
  assert.equal(dueFromLocal('2026-09-09', '23:59', 'America/New_York'), '2026-09-10T03:59:00.000Z');
  assert.deepEqual(localDueParts('2026-09-10T03:59:00.000Z', 'America/New_York'), { date: '2026-09-09', time: '23:59' });
  assert.throws(() => dueFromLocal('', '12:00', 'UTC'), /date/);
  assert.throws(() => dueFromLocal('2026-03-08', '02:30', 'America/New_York'), /clock change/);
  assert.throws(() => dueFromLocal('2026-11-01', '01:30', 'America/New_York'), /clock change/);
});

test('calendar export preserves actual deadlines and cannot inject extra calendar fields', () => {
  const plan = normalizePlan({profileId:'synthetic-qa', name:'QA', courses:[{id:'eng',name:'English'}], tasks:[
    {id:'date',courseId:'eng',title:'Essay\nATTENDEE:evil',dueAt:'2026-09-09'},
    {id:'time',courseId:'eng',title:'長'.repeat(60),dueAt:'2026-09-11T03:59:00Z'},
    {id:'unknown',courseId:'eng',title:'Unknown date'},
    {id:'done',courseId:'eng',title:'Already done',dueAt:'2026-09-09',state:'done'}
  ]});
  const output = calendarExport(plan, new Date('2026-09-08T12:00:00Z'));
  assert.equal(output.match(/BEGIN:VEVENT/g).length, 2);
  assert.match(output, /DTSTART;VALUE=DATE:20260909\r\nDTEND;VALUE=DATE:20260910/);
  assert.match(output, /DTSTART:20260911T035900Z/);
  assert.doesNotMatch(output, /\r\nATTENDEE:/);
  assert.doesNotMatch(output, /Unknown date|Already done/);
  assert.ok(output.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.equal(calendarExport(plan, new Date('2026-09-08T12:00:00Z')), output);
});

test('coaching handoff supplies actual rubric and profile without pretending to run tools', () => {
  const plan=normalizePlan({profileId:'casey-2026',name:'Casey',courses:[{id:'eng',name:'English'}],tasks:[{id:'essay',courseId:'eng',title:'Essay',rubric:'Use two primary sources.'}]});
  const prompt=coachingPrompt(plan,'rubric','essay');
  assert.match(prompt,/Use two primary sources/);assert.match(prompt,/approved school sources/);assert.match(prompt,/one question/);
  assert.match(coachingPrompt(plan,'import'),/casey-2026/);
  assert.match(coachingPrompt(plan,'reminders'),/verify the saved result/);
  assert.equal(safeWebUrl('javascript:alert(1)'), '');
  assert.equal(safeWebUrl('https://user:password@example.com'), '');
  assert.equal(safeWebUrl('https://example.edu/rubric'), 'https://example.edu/rubric');
});

test('desktop chat routing binds sibling student roots and selected stable IDs without copying coursework', () => {
  const plan = normalizePlan({profileId:'casey-2026',name:'Casey',courses:[{id:'eng',name:'Private course title'}],tasks:[{id:'essay',courseId:'eng',title:'Private assignment title',rubric:'Private rubric',notes:'Private draft notes'}]});
  const casey = {mode:'local',profileId:plan.profileId,workspacePath:'/Students/Casey 2026'};
  const jordanPlan = {...plan,profileId:'jordan-2026'};
  const jordan = {mode:'local',profileId:jordanPlan.profileId,workspacePath:'/Students/Jordan 2026'};
  for (const [runtime, current] of [[casey, plan], [jordan, jordanPlan]]) {
    const url = new URL(desktopChatUrl(runtime, current, 'rubric', 'essay'));
    assert.equal(url.protocol, 'codex:');
    assert.equal(url.hostname, 'new');
    assert.deepEqual([...url.searchParams.keys()], ['path', 'prompt']);
    assert.equal(url.searchParams.get('path'), runtime.workspacePath);
    const prompt = url.searchParams.get('prompt');
    assert.match(prompt, /\[@Semester Navigator\]\(plugin:\/\/semester-navigator@semester-navigator\)/);
    assert.ok(prompt.includes(JSON.stringify(current.profileId)));
    assert.match(prompt, /profile\.json.*before reading coursework/);
    assert.match(prompt, /Stop on a mismatch/);
    assert.match(prompt, /current saved plan.*API\/store/);
    assert.match(prompt, /\.semester-navigator\/playbook\/SKILL\.md/);
    assert.match(prompt, /Selected course ID: "eng"/);
    assert.match(prompt, /Selected assignment ID: "essay"/);
    assert.doesNotMatch(prompt, /Private|Astra|model=/);
  }
  assert.equal(desktopChatUrl(casey, jordanPlan, 'study'), '');
  assert.equal(desktopChatUrl(jordan, plan, 'study'), '');
});

test('desktop chat routing encodes exact POSIX, Windows drive and UNC paths and query-like IDs', () => {
  const taskId = 'essay&path=/other?prompt=change#fragment';
  const courseId = 'eng?prompt=another&path=/wrong';
  const plan = normalizePlan({profileId:'casey-2026',courses:[{id:courseId}],tasks:[{id:taskId,courseId}]});
  const paths = ['/Students/Casey + Zoë/term&path=/other?prompt=change#fragment', 'C:\\Users\\Casey Student\\Semester 2026', '\\\\school.example\\Students\\Casey 2026'];
  for (const workspacePath of paths) {
    const runtime = {mode:'local',profileId:plan.profileId,workspacePath};
    const url = new URL(desktopChatUrl(runtime, {...plan,workspacePath:'/untrusted-plan-path'}, 'research', taskId, courseId));
    assert.equal(url.searchParams.get('path'), workspacePath);
    assert.deepEqual([...url.searchParams.keys()], ['path', 'prompt']);
    assert.equal(url.hash, '');
    assert.ok(url.searchParams.get('prompt').includes(JSON.stringify(taskId)));
    assert.ok(url.searchParams.get('prompt').includes(JSON.stringify(courseId)));
  }
});

test('desktop chat routing leaves fallback available for absent or malformed runtime and invalid selections', () => {
  const plan = normalizePlan({profileId:'casey-2026',courses:[{id:'eng'},{id:'math'}],tasks:[{id:'essay',courseId:'eng'}]});
  const runtime = {mode:'local',profileId:plan.profileId,workspacePath:'/Students/Casey'};
  for (const invalid of [undefined, null, [], '', {}, {...runtime,mode:'hosted'}, {...runtime,profileId:'other'}, {...runtime,profileId:null}]) {
    assert.equal(desktopChatUrl(invalid, plan, 'plan'), '');
  }
  for (const workspacePath of ['', 'Students/Casey', 'C:Students', '\\Students', '\\\\server', '\\\\.\\device', '\\\\?\\C:\\Students', '/Students/Casey\0other', '/Students/Casey\nother', '/Students/Casey\rother', 42]) {
    assert.equal(desktopChatUrl({...runtime,workspacePath}, plan, 'plan'), '', String(workspacePath));
  }
  for (const mode of ['', '__proto__', 'constructor', 'unknown', null]) {
    assert.equal(desktopChatUrl(runtime, plan, mode), '');
  }
  for (const id of ['', 'missing', ' essay', 'essay\n', 'x'.repeat(161), null, 42]) {
    assert.equal(desktopChatUrl(runtime, plan, 'study', id), '');
    assert.equal(desktopChatUrl(runtime, plan, 'study', undefined, id), '');
  }
  assert.equal(desktopChatUrl(runtime, plan, 'study', 'essay', 'math'), '');
  assert.ok(desktopChatUrl(runtime, plan, 'study', undefined, 'eng'));
  assert.ok(desktopChatUrl(runtime, plan, 'plan'));
});
