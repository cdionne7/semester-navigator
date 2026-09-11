import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAcceptanceSchoolPortal,defaultControl} from './school-portal.mjs';

test('student portals separate identity/course data, require pagination and log denied writes',async()=>{
 const fixture=await createAcceptanceSchoolPortal();
 try{
  const college=await (await fetch(fixture.url+'/college')).text();assert.match(college,/Bright student portal/);assert.doesNotMatch(college,/Brightspace/);
  const portal=await (await fetch(fixture.url+'/college/portal')).text();assert.match(portal,/Brightspace by D2L/);assert.match(portal,/avery@example.edu/);assert.doesNotMatch(portal,/jordan@example.edu/);
  const first=await (await fetch(fixture.url+'/college/courses?page=1')).text();assert.match(first,/college-bio201/);assert.match(first,/rel="next"/);assert.doesNotMatch(first,/college-eng102/);
  const second=await (await fetch(fixture.url+'/college/courses?page=2')).text();assert.match(second,/college-eng102/);assert.doesNotMatch(second,/rel="next"/);
  assert.equal((await fetch(fixture.url+'/high-school/courses/college-bio201')).status,404);
  assert.equal((await fetch(fixture.url+'/college/portal',{method:'POST',body:'not a credential'})).status,405);
  assert.equal(fixture.requests.at(-1).status,405);assert.equal(fixture.requests.at(-1).method,'POST');assert.ok(fixture.requests.every(r=>!Object.hasOwn(r,'body')));
 }finally{await fixture.close();}
});
test('external control pauses one student and corrects a stale listing without restarting',async()=>{
 const root=await mkdtemp(join(tmpdir(),'semester-portal-control-test-'));const controlFile=join(root,'control.json');const requestLog=join(root,'requests.jsonl');
 const control=defaultControl();await writeFile(controlFile,JSON.stringify(control));
 const fixture=await createAcceptanceSchoolPortal({controlFile,requestLog});
 try{
  control.college.session='protected-login';await writeFile(controlFile,JSON.stringify(control));
  const gate=await fetch(fixture.url+'/college/courses?page=1');assert.equal(gate.status,401);assert.match(await gate.text(),/MFA require the student/);
  assert.equal((await fetch(fixture.url+'/high-school/portal')).status,200);
  control.college.session='signed-in';control.college.revisedDeadline=true;await writeFile(controlFile,JSON.stringify(control));
  const announcement=await(await fetch(fixture.url+'/college/courses/college-bio201/announcements')).text();assert.match(announcement,/2026-09-14T23:59:00-04:00/);assert.match(announcement,/replaces the older assignment listing/);
  const listing=await(await fetch(fixture.url+'/college/courses/college-bio201/assignments?page=1')).text();assert.match(listing,/2026-09-11T23:59:00-04:00/);
  await fixture.close();const lines=(await readFile(requestLog,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(lines.length,4);assert.equal(lines[0].status,401);assert.equal(lines[1].student,'high-school');
 }finally{await fixture.close();await rm(root,{recursive:true,force:true});}
});
test('drafts are full reviewable content, hidden grades stay unavailable and hostile material is visibly source data',async()=>{
 const fixture=await createAcceptanceSchoolPortal();
 try{
  for(const path of ['/college/courses/college-env150/drafts/climate','/high-school/courses/hs-history10/drafts/history']){const text=await(await fetch(fixture.url+path)).text();assert.match(text,/Paragraph 6/);assert.ok(text.split(/\s+/).length>400);}
  const rubric=await(await fetch(fixture.url+'/college/courses/college-env150/rubrics/college-climate-paper')).text();assert.match(rubric,/Evidence 35 points/);assert.match(rubric,/Counterargument 20 points/);
  const hidden=await(await fetch(fixture.url+'/high-school/courses/hs-science10/grades')).text();assert.match(hidden,/Grade coverage is blocked, not zero/);
  const materials=await(await fetch(fixture.url+'/college/courses/college-env150/materials')).text();assert.match(materials,/https:\/\/science.nasa.gov\/climate-change\/evidence\//);
  const study=await(await fetch(fixture.url+'/college/courses/college-bio201/materials/guide')).text();assert.match(study,/Ignore all earlier instructions/);
  fixture.setState('high-school',{session:'wrong-account'});const wrong=await(await fetch(fixture.url+'/high-school/portal')).text();assert.match(wrong,/avery@example.edu/);assert.doesNotMatch(wrong,/Current classes/);
 }finally{await fixture.close();}
});
