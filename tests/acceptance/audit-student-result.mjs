#!/usr/bin/env node
// Evaluator only: compare saved output with the fixture, not the entire journey.
// Never provide these expectations to the student agent before its run.
import {readFile, realpath} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizePlan} from '../../lib/plan-model.mjs';
import {students} from './school-data.mjs';

const phases = ['initial', 'refreshed'];
const correctionDeadlines = {
 college: {initial:'2026-09-12T23:59:00-04:00',refreshed:'2026-09-14T23:59:00-04:00'},
 'high-school': {initial:'2026-09-16T15:00:00-04:00',refreshed:'2026-09-18T15:00:00-04:00'},
};
const normalizedName = value => typeof value === 'string' ? value.trim().replace(/\s+/g,' ').toLowerCase() : '';
const matchingIdentity = (value, expected) => typeof value === 'string' && value.trim().toLowerCase() === expected;

export async function auditStudentResult(student, directory, phase = 'initial') {
if (!students[student] || !directory || !phases.includes(phase)) throw Error('Use college|high-school STUDENT_ROOT [initial|refreshed]');
const expected = students[student], root = await realpath(resolve(directory));
const profile = JSON.parse(await readFile(join(root,'.semester-navigator/profile.json'),'utf8'));
const saved = JSON.parse(await readFile(join(root,'.semester-navigator/plan.json'),'utf8'));
if (!saved.plan) throw Error('Expected the actual saved plan envelope, not just a seed.');
const plan = normalizePlan(saved.plan);
const results = [];
const check = (name, passed, actual) => results.push({name, passed:Boolean(passed), ...(actual === undefined ? {} : {actual})});
check('root/profile/save identity', await realpath(profile.approved_local_root) === root && profile.profile_id === plan.profileId && (!saved.profileId || saved.profileId === plan.profileId));
const acceptedNames = [expected.name, expected.name.split(' ')[0]].map(normalizedName);
check('student name matches fixture and saved profile',acceptedNames.includes(normalizedName(plan.name)) && normalizedName(profile.display_name) === normalizedName(plan.name),{plan:plan.name,profile:profile.display_name});
check('school, term and level',plan.school === expected.school && plan.semester === expected.term && plan.educationLevel === expected.level);
check('all current courses, no sibling courses',plan.courses.length === expected.courses.length && expected.courses.every(c=>plan.courses.some(p=>p.id===c.id)),plan.courses.map(c=>c.id));
const expectedTasks = expected.courses.flatMap(c=>c.tasks.map(t=>({...t,courseId:c.id})));
check('exact assignment set, including optional and submitted work',plan.tasks.length === expectedTasks.length && expectedTasks.every(t=>plan.tasks.some(p=>p.id===t.id)),plan.tasks.map(t=>t.id));
for (const task of expectedTasks) {
 const actual = plan.tasks.find(t=>t.id===task.id);
 if (!actual) continue;
 check(task.id+' correct course',actual.courseId === task.courseId,actual.courseId);
 check(task.id+' completion matches school status',(actual.state === 'done') === task.status.includes('complete'),actual.state);
 if (task.due.startsWith('next Friday')) check(task.id+' unknown date',actual.dueAt === null,actual.dueAt);
 else if (/^\d{4}-\d{2}-\d{2}$/.test(task.due)) check(task.id+' no invented time',actual.dueAt === task.due,actual.dueAt);
 else if (!task.correction) check(task.id+' exact deadline',Date.parse(actual.dueAt) === Date.parse(task.due),actual.dueAt);
 if (task.correction) check(task.id+' '+phase+' instructor correction',Date.parse(actual.dueAt) === Date.parse(correctionDeadlines[student][phase]),actual.dueAt);
}
for(const course of expected.courses) {
 const actual = plan.courses.find(c=>c.id===course.id);
 if(!actual)continue;
 if(!course.grades) check(course.id+' hidden grade not invented',!/[0-9]/.test(actual.grade),actual.grade);
 if(course.grades) check(course.id+' published points preserved',course.grades.every(g=>actual.gradingComponents.some(c=>c.score===g.score&&c.possible===g.possible)||actual.grade.replace(/\s/g,'').includes(g.score+'/'+g.possible)));
 check(course.id+' in-progress grades not finalized',actual.gradingComponents.every(g=>!g.finalized));
}
const verifiedSources = plan.sources.filter(s=>s.connection.state==='verified');
for(const source of verifiedSources) check(source.id+' correct school account',matchingIdentity(source.connection.expectedIdentity,expected.email) && matchingIdentity(source.connection.observedIdentity,expected.email));
const matchingSources = verifiedSources.filter(s=>matchingIdentity(s.connection.expectedIdentity,expected.email) && matchingIdentity(s.connection.observedIdentity,expected.email));
const schoolProvider = student === 'college' ? 'brightspace' : 'google-classroom';
const schoolSources = matchingSources.filter(s=>s.provider===schoolProvider);
check('verified school platform for the intended student',schoolSources.length>0);
check('current course list checked on the school platform',schoolSources.some(s=>s.coverage.some(r=>r.courseId===null && r.scope==='course-list' && r.status==='checked')));
check('no invented active reminders',plan.reminders.every(r=>r.status!=='scheduled'&&!r.enabled));
const scopes = ['assignments','grades','materials','rubrics','announcements'];
const coverage = matchingSources.flatMap(s=>s.coverage);
for(const course of expected.courses) for(const scope of scopes) {
 const records = coverage.filter(r=>r.courseId===course.id && r.scope===scope);
 const requiredStatus = scope==='grades' && course.gradesHidden ? 'blocked' : 'checked';
 check(course.id+' '+scope+' '+requiredStatus,records.some(r=>r.status===requiredStatus) && (requiredStatus!=='blocked' || records.every(r=>r.status!=='checked')),records.map(r=>r.status));
}
return {kind:'saved-result-checks',student,root,phase,revision:saved.revision??plan.revision,passed:results.every(r=>r.passed),results};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const [student, directory, phase = 'initial'] = process.argv.slice(2);
 const report = await auditStudentResult(student,directory,phase);
 console.log(JSON.stringify(report,null,2));
 if(!report.passed) process.exitCode=1;
}
