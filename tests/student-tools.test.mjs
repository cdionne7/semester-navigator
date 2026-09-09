import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan } from '../lib/plan-model.mjs';
import { calendarExport, coachingPrompt, dueFromLocal, localDueParts, safeWebUrl } from '../lib/student-tools.mjs';

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
