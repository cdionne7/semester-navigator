import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import test from 'node:test';
import {normalizePlan} from '../../lib/plan-model.mjs';
import {auditStudentResult} from './audit-student-result.mjs';
import {students} from './school-data.mjs';

const checkedAt = '2026-09-10T18:00:00Z';
function syntheticResult(student) {
 const expected = students[student], profileId = 'synthetic-audit-'+student;
 const check = (courseId,scope,status='checked') => ({courseId,scope,status,checkedAt,evidence:'Synthetic evaluator regression observation',pagesChecked:1,paginationComplete:true});
 return normalizePlan({
  profileId,name:expected.name,school:expected.school,semester:expected.term,educationLevel:expected.level,timezone:expected.timezone,
  courses:expected.courses.map(c=>({id:c.id,name:c.name,grade:(c.grades??[]).map(g=>`${g.score}/${g.possible}`).join('; ')})),
  tasks:expected.courses.flatMap(c=>c.tasks.map(t=>({id:t.id,courseId:c.id,title:t.title,state:t.status.includes('complete')?'done':'next',dueAt:t.due.startsWith('next Friday')?null:t.correction?(student==='college'?'2026-09-12T23:59:00-04:00':'2026-09-16T15:00:00-04:00'):t.due}))),
  sources:[{id:'school',provider:student==='college'?'brightspace':'google-classroom',accessMode:'browser',connection:{state:'verified',tool:'synthetic-browser',evidence:'Synthetic intended account header',checkedAt,expectedIdentity:expected.email,observedIdentity:expected.email,identityStorageApproved:true},coverage:[check(null,'course-list'),...expected.courses.flatMap(c=>['assignments','grades','materials','rubrics','announcements'].map(scope=>check(c.id,scope,scope==='grades'&&c.gradesHidden?'blocked':'checked')))]}],
 });
}
async function withSavedResult(student,run) {
 const root=await mkdtemp(join(tmpdir(),'semester-evaluator-regression-'));
 try {
  await mkdir(join(root,'.semester-navigator'));
  const plan=syntheticResult(student);
  const save=async (candidate,profileName=candidate.name)=>{
   await writeFile(join(root,'.semester-navigator/profile.json'),JSON.stringify({profile_id:candidate.profileId,display_name:profileName,approved_local_root:root}));
   await writeFile(join(root,'.semester-navigator/plan.json'),JSON.stringify({profileId:candidate.profileId,revision:1,plan:candidate}));
  };
  await save(plan);
  await run({root,plan,save});
 } finally {await rm(root,{recursive:true,force:true});}
}
const assertFailed = (report, pattern) => {
 assert.equal(report.passed,false);
 assert.ok(report.results.some(r=>!r.passed&&pattern.test(r.name)),JSON.stringify(report.results));
};

test('saved-result phases require the exact correction, retain point text and accept first or full student names',async()=>{
 for(const student of ['college','high-school']) await withSavedResult(student,async({root,plan,save})=>{
  const initial=await auditStudentResult(student,root);
  assert.equal(initial.kind,'saved-result-checks');assert.equal(initial.phase,'initial');assert.equal(initial.passed,true);
  assertFailed(await auditStudentResult(student,root,'refreshed'),/refreshed instructor correction/);
  const updated=structuredClone(plan);updated.name=students[student].name.split(' ')[0];
  updated.tasks.find(t=>t.id===(student==='college'?'college-lab-1':'hs-declaration')).dueAt=student==='college'?'2026-09-14T23:59:00-04:00':'2026-09-18T15:00:00-04:00';
  await save(updated);
  assert.equal((await auditStudentResult(student,root,'refreshed')).passed,true);
  assertFailed(await auditStudentResult(student,root),/initial instructor correction/);
  await assert.rejects(()=>auditStudentResult(student,root,'unknown'),/initial\|refreshed/);
 });
});

test('saved-result checks reject wrong names, missing or foreign work and incorrect completion',async()=>{
 await withSavedResult('college',async({root,plan,save})=>{
  const cases=[
   [candidate=>{candidate.name='Wrong Student Name';},/student name/],
   [candidate=>{candidate.tasks=candidate.tasks.filter(t=>t.id!=='college-extra-seminar');},/exact assignment set/],
   [candidate=>{candidate.tasks=candidate.tasks.filter(t=>t.id!=='college-bio-orientation');},/exact assignment set/],
   [candidate=>{candidate.tasks.push({id:'sibling-task',courseId:candidate.courses[0].id,title:'Unrelated sibling work'});},/exact assignment set/],
   [candidate=>{candidate.tasks[0].courseId='college-eng102';},/correct course/],
   [candidate=>{candidate.tasks.find(t=>t.id==='college-bio-orientation').state='next';},/completion matches/],
   [candidate=>{candidate.tasks[0].state='done';},/completion matches/],
  ];
  for(const [mutate,pattern] of cases) {
   const candidate=structuredClone(plan);mutate(candidate);await save(candidate);
   assertFailed(await auditStudentResult('college',root),pattern);
  }
  await save(plan,'Avery');assertFailed(await auditStudentResult('college',root),/student name/);
 });
});

test('saved-result checks reject unverified or wrong-account coverage and unavailable scopes presented as complete',async()=>{
 await withSavedResult('college',async({root,plan,save})=>{
  const cases=[
   [candidate=>{candidate.sources=[];},/verified school platform/],
   [candidate=>{candidate.sources[0].connection.state='unverified';candidate.sources[0].status='not-connected';candidate.sources[0].verified=false;candidate.sources[0].coverage=candidate.sources[0].coverage.map(r=>({...r,status:'unknown'}));},/verified school platform/],
   [candidate=>{candidate.sources[0].connection.expectedIdentity='sibling@example.edu';candidate.sources[0].connection.observedIdentity='sibling@example.edu';},/correct school account/],
   [candidate=>{candidate.sources[0].coverage=candidate.sources[0].coverage.filter(r=>r.scope!=='course-list');},/current course list/],
   [candidate=>{candidate.sources[0].coverage.find(r=>r.courseId==='college-bio201'&&r.scope==='materials').status='unknown';},/college-bio201 materials checked/],
   [candidate=>{candidate.sources[0].coverage.find(r=>r.courseId==='college-eng102'&&r.scope==='grades').status='checked';},/college-eng102 grades blocked/],
  ];
  for(const [mutate,pattern] of cases) {
   const candidate=structuredClone(plan);mutate(candidate);await save(candidate);
   assertFailed(await auditStudentResult('college',root),pattern);
  }
 });
});
