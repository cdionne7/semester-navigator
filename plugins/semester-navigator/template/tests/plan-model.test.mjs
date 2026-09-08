import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlan,validatePlan,normalizeDueAt,mergeImportedPlan,tasksForView,formatDue,getCourseHealth,gradeSummary,suggestStudyBlocks,createPlanService} from '../lib/plan-model.mjs';
const fixture=()=>normalizePlan({profileId:'review-student',name:'Review',school:'Example',timezone:'America/New_York',courses:[{id:'math',name:'Math'}],tasks:[{id:'hw',courseId:'math',title:'Homework',dueAt:'2026-09-09',minutes:60}]});
function memoryStore(){let row=null;return {read:async()=>row?structuredClone(row):null,write:async(next,base,isNew)=>{if(isNew?row!==null:!row||row.revision!==base)return false;row=structuredClone(next);return true;},peek:()=>row};}
test('legacy labels remain unknown; profile and malformed values fail with useful errors',()=>{
 const raw={...fixture(),tasks:[{id:'legacy',course:'Math',when:'Today'}]};const plan=normalizePlan(raw);assert.equal(plan.tasks[0].dueAt,null);assert.equal(plan.tasks[0].courseId,'math');
 assert.throws(()=>normalizePlan(raw,'another-student'),/different student/);
 for(const due of ['2026-02-30','2026-09-09T12:00:00','Tomorrow','2026-09-09T24:00:00Z'])assert.throws(()=>normalizeDueAt(due),/real YYYY-MM-DD/);
 assert.throws(()=>normalizePlan({...raw,tasks:[{id:'same'},{id:'same'}]}),/duplicate ID/);
 assert.throws(()=>normalizePlan({...raw,tasks:[{id:'x',courseId:'missing'}]}),/unknown course/);
 assert.throws(()=>normalizePlan({...raw,tasks:[{id:'x',sourceUrl:'javascript:alert(1)'}]}),/HTTP/);
 assert.throws(()=>validatePlan({...raw,schemaVersion:undefined}),/version 2/);
 assert.throws(()=>normalizePlan({...raw,reminders:[{id:'reminder',status:'scheduled',enabled:true}]}),/confirmed tool ID/);
 assert.throws(()=>normalizePlan({...raw,sources:[{id:'lms',status:'connected'}]}),/verified account check/);
});
test('views roll over at student-local midnight and date-only deadlines expire after their day',()=>{
 const plan=fixture();plan.tasks=[{...plan.tasks[0],id:'day',dueAt:'2026-09-08'},{...plan.tasks[0],id:'instant',dueAt:'2026-09-09T03:30:00Z'},{...plan.tasks[0],id:'unknown',dueAt:null}];
 const before=new Date('2026-09-09T03:00:00Z');const after=new Date('2026-09-09T04:01:00Z');
 assert.deepEqual(tasksForView(plan,'overdue',before).map(t=>t.id),[]);
 assert.equal(tasksForView(plan,'today',before).length,2);
 assert.deepEqual(tasksForView(plan,'overdue',after).map(t=>t.id),['day','instant']);
 assert.equal(tasksForView(plan,'unknown',after)[0].id,'unknown');
 assert.equal(formatDue('2026-09-08',plan.timezone,before),'Today · time not provided');
 assert.match(formatDue(null),/confirmation/);
 const health=getCourseHealth(plan,'math',after);assert.equal(health.overdue,2);assert.equal(health.unknownDeadlines,1);assert.equal(health.status,'Needs attention');
});
test('three-way seed merge updates changed source fields but preserves completion, edits and local-only tasks',()=>{
 const baseline=fixture();const current=structuredClone(baseline);current.tasks[0].state='done';current.tasks[0].notes='My work';current.tasks[0].title='My edited title';current.tasks.push({...current.tasks[0],id:'local',state:'next'});
 const incoming=structuredClone(baseline);incoming.tasks[0].title='Imported title';incoming.tasks[0].dueAt='2026-09-10';incoming.tasks.push({...incoming.tasks[0],id:'new'});
 const result=mergeImportedPlan(current,incoming,baseline);assert.equal(result.tasks.length,3);assert.equal(result.tasks[0].dueAt,'2026-09-10');assert.equal(result.tasks[0].title,'My edited title');assert.equal(result.tasks[0].state,'done');assert.equal(result.tasks[0].notes,'My work');
 assert.deepEqual(mergeImportedPlan(result,incoming,incoming),result);
});
test('service imports seed after first save, persists changes, and rejects concurrent/blind writes',async()=>{
 const store=memoryStore();const seed=fixture();seed.tasks=[];let service=createPlanService(seed,store);
 const initial=await service.load();assert.equal(initial.revision,0);assert.equal(store.peek(),null);
 const first=await service.save({plan:initial.plan,baseRevision:0});assert.equal(first.revision,1);
 service=createPlanService(fixture(),store);const imported=await service.load();assert.equal(imported.plan.tasks.length,1);assert.equal(imported.revision,2);
 imported.plan.tasks[0].state='done';const wins=await Promise.allSettled([service.save({plan:imported.plan,baseRevision:2}),service.save({plan:imported.plan,baseRevision:2})]);assert.equal(wins.filter(x=>x.status==='fulfilled').length,1);assert.equal(wins.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
 const update=fixture();update.tasks[0].dueAt='2026-09-10';const next=await createPlanService(update,store).load();assert.equal(next.plan.tasks[0].state,'done');assert.equal(next.plan.tasks[0].dueAt,'2026-09-10');
 await assert.rejects(()=>service.save(next.plan),/cannot safely save/);
 await assert.rejects(()=>service.save({plan:{...next.plan,profileId:'other'},baseRevision:next.revision}),/different student/);
});
test('unavailable storage cannot be interpreted as an empty plan or cause an automatic write',async()=>{
 let writes=0;const service=createPlanService(fixture(),{read:async()=>{throw new Error('outage')},write:async()=>{writes++;return true}});
 await assert.rejects(()=>service.load(),/outage/);assert.equal(writes,0);
});
test('grade projection uses syllabus weights, exposes missing weights, and refuses invalid totals',()=>{
 const c=fixture().courses[0];c.goalGrade=80;c.gradingComponents=[{id:'a',title:'Quiz',weight:40,score:70,possible:100,finalized:true},{id:'b',title:'Final',weight:60,score:null,possible:100}];
 let g=gradeSummary(c);assert.equal(g.current,70);assert.equal(g.remainingWeight,60);assert.ok(Math.abs(g.neededOnRemaining-86.6666667)<0.001);
 c.gradingComponents[1].weight=50;g=gradeSummary(c);assert.equal(g.neededOnRemaining,null);assert.match(g.warnings[0],/90%/);
 c.gradingComponents[1].weight=70;assert.equal(gradeSummary(c).current,null);
});
test('study suggestions disclose unavailable calendar data and never claim scheduled times',()=>{
 const plan=fixture();plan.tasks[0].minutes=150;const result=suggestStudyBlocks(plan,new Date('2026-09-08T14:00:00Z'));
 assert.equal(result.blocks.length,4);assert.ok(result.blocks.every(b=>b.minutes<=45&&b.start===null&&b.end===null));
 const counts={};for(const block of result.blocks)counts[block.date]=(counts[block.date]||0)+1;assert.ok(Object.values(counts).every(n=>n<=2));assert.match(result.limitations[0],/No calendar/);
});
test('source redeploys do not resurrect a task the student deleted',()=>{
 const baseline=fixture();const current=structuredClone(baseline);current.tasks=[];
 const incoming=structuredClone(baseline);incoming.school='Updated school label';
 assert.deepEqual(mergeImportedPlan(current,incoming,baseline).tasks,[]);
});
test('equal-day timestamps with different offsets sort by actual deadline instant',()=>{
 const plan=fixture();plan.tasks=[{...plan.tasks[0],id:'later',dueAt:'2026-09-09T09:00:00-07:00'},{...plan.tasks[0],id:'earlier',dueAt:'2026-09-09T10:00:00-04:00'}];
 assert.deepEqual(tasksForView(plan,'semester',new Date('2026-09-09T12:00:00Z')).map(t=>t.id),['earlier','later']);
});
test('a new source assignment for a locally removed course remains reviewable without reviving the course',()=>{
 const baseline=fixture();const current=structuredClone(baseline);current.courses=[];current.tasks=[];
 const incoming=structuredClone(baseline);incoming.tasks.push({...incoming.tasks[0],id:'new-task'});
 const merged=mergeImportedPlan(current,incoming,baseline);assert.equal(merged.courses.length,0);assert.equal(merged.tasks.length,1);assert.equal(merged.tasks[0].courseId,'');assert.match(merged.tasks[0].reason,/Confirm the course/);
});
test('near deadlines remain ahead of distant high-priority work, and reported grade goals affect status', () => {
  const plan=normalizePlan({profileId:'priority-check',name:'QA',courses:[{id:'math',name:'Math',grade:'62%',goalGrade:80}],tasks:[
    {id:'later',courseId:'math',title:'Later project',dueAt:'2026-12-01',priority:'high'},
    {id:'first',courseId:'math',title:'Due tomorrow',dueAt:'2026-09-09'}
  ]});
  assert.equal(tasksForView(plan,'semester',new Date('2026-09-08T12:00:00Z'))[0].id,'first');
  assert.equal(getCourseHealth(plan,'math',new Date('2026-09-08T12:00:00Z')).status,'Needs attention');
  plan.courses[0].grade='B';
  assert.equal(getCourseHealth(plan,'math',new Date('2026-09-08T12:00:00Z')).status,'On track');
});
test('web-generated ISO microseconds and nanoseconds import and normalize idempotently',async()=>{
 const artifact={schemaVersion:2,profileId:'avery-chen-fall-2026',name:'Avery Chen',school:'Example High School',semester:'Fall 2026',educationLevel:'high-school',timezone:'America/New_York',courses:[{id:'english-10',name:'English 10'}],tasks:[{id:'response',courseId:'english-10',title:'Reading response',dueAt:'2026-09-11T15:00:00.123456789-04:00',minutes:0,state:'next'}],sources:[{id:'attachment',title:'English course material',url:'',type:'uploaded-course-materials',status:'manual',verified:true,lastChecked:'2026-09-08T14:25:30.654321Z',verificationNote:'Read the supplied attachment.'}]};
 const normalized=normalizePlan(artifact);assert.equal(normalized.sources[0].lastChecked,'2026-09-08T14:25:30.654Z');assert.equal(normalized.tasks[0].dueAt,'2026-09-11T19:00:00.123Z');assert.deepEqual(normalizePlan(normalized),normalized);
 const store=memoryStore();const service=createPlanService({...normalized,courses:[],tasks:[],sources:[]},store);const initial=await service.load();const saved=await service.save({plan:mergeImportedPlan(initial.plan,artifact),baseRevision:initial.revision});assert.equal(saved.revision,1);assert.equal((await service.load()).plan.sources[0].lastChecked,'2026-09-08T14:25:30.654Z');
});
test('provisional category averages cannot consume final course weight or imply a remaining-score target',()=>{
 const input={...fixture(),courses:[{id:'math',name:'Math',goalGrade:85,gradingComponents:[{id:'labs',title:'Labs',weight:50,score:88,possible:100},{id:'exam',title:'Final exam',weight:50,score:null,possible:100}]}]};
 const course=normalizePlan(input).courses[0];assert.equal(course.gradingComponents[0].finalized,false);
 let summary=gradeSummary(course);assert.equal(summary.current,88);assert.equal(summary.remainingWeight,100);assert.equal(summary.neededOnRemaining,null);assert.match(summary.warnings.join(' '),/provisional averages for unfinished work/);
 course.gradingComponents[0].finalized=true;summary=gradeSummary(course);assert.equal(summary.current,88);assert.equal(summary.remainingWeight,50);assert.equal(summary.neededOnRemaining,82);assert.deepEqual(summary.warnings,[]);
});
test('only finalized scored components reduce remaining weight when a second scored category is provisional',()=>{
 const course=normalizePlan({...fixture(),courses:[{id:'math',name:'Math',goalGrade:85,gradingComponents:[{id:'quiz',title:'Completed quiz',weight:20,score:90,possible:100,finalized:true},{id:'labs',title:'Labs average',weight:30,score:88,possible:100,finalized:false},{id:'exam',title:'Final exam',weight:50,score:null,possible:100,finalized:true}]}]}).courses[0];
 const summary=gradeSummary(course);assert.ok(Math.abs(summary.current-88.8)<0.00001);assert.equal(summary.remainingWeight,80);assert.equal(summary.neededOnRemaining,null);
 assert.throws(()=>normalizePlan({...fixture(),courses:[{id:'math',gradingComponents:[{id:'bad',finalized:'true'}]}]}),/Grade component finalized must be true or false/);
});
test('a normalized partial source refresh preserves known course and assignment facts through save and reload',async()=>{
 const seed=normalizePlan({profileId:'partial-refresh',name:'Synthetic',courses:[{id:'math',name:'Math',instructor:'Known instructor',officeHours:'Tuesday 2 PM',grade:'88%',goalGrade:90,resources:[{id:'tutor',title:'Tutoring',url:'https://example.edu/tutor',kind:'support'}],gradingComponents:[{id:'exam',title:'Exam',weight:100,score:44,possible:50,finalized:true}]}],tasks:[{id:'hw',courseId:'math',title:'Homework',dueAt:'2026-09-11',minutes:45,state:'done',priority:'high',rubric:'Show each step',sourceUrl:'https://example.edu/homework',reason:'Start with problem 1',notes:'My saved work'}]});
 const store=memoryStore();const service=createPlanService(seed,store);const loaded=await service.load();
 const incoming=normalizePlan({profileId:seed.profileId,courses:[{id:'math',name:'Math'}],tasks:[{id:'hw',courseId:'math',title:'Homework',dueAt:'2026-09-12'}]});
 const merged=mergeImportedPlan(loaded.plan,incoming);assert.deepEqual(merged.courses,loaded.plan.courses);assert.deepEqual(merged.tasks[0],{...loaded.plan.tasks[0],dueAt:'2026-09-12'});
 // A generated JSON artifact may include normalized empty placeholders as well.
 const fromArtifact=mergeImportedPlan(loaded.plan,JSON.parse(JSON.stringify(incoming)));assert.deepEqual(fromArtifact.courses,loaded.plan.courses);assert.deepEqual(fromArtifact.tasks,merged.tasks);
 await service.save({plan:merged,baseRevision:loaded.revision});const reloaded=await service.load();assert.equal(reloaded.revision,1);assert.deepEqual(reloaded.plan.courses,seed.courses);assert.equal(reloaded.plan.tasks[0].dueAt,'2026-09-12');
 const unknown=mergeImportedPlan(reloaded.plan,{profileId:seed.profileId,tasks:[{id:'hw',dueAt:null}]});assert.deepEqual(unknown.tasks,reloaded.plan.tasks);
 const cleared={...reloaded.plan,tasks:reloaded.plan.tasks.map(t=>({...t,dueAt:null}))};await service.save({plan:cleared,baseRevision:reloaded.revision});assert.equal((await service.load()).plan.tasks[0].dueAt,null);
});
test('partial nested source records merge by ID without erasing denominators, scores, resources, or omitted finalization',()=>{
 const current=normalizePlan({profileId:'nested-refresh',courses:[{id:'math',name:'Math',resources:[{id:'tutor',title:'Tutoring',url:'https://example.edu/tutor',kind:'support'},{id:'book',title:'Book',url:'https://example.edu/book'}],gradingComponents:[{id:'exam',title:'Exam',weight:40,score:18,possible:20,finalized:true},{id:'final',title:'Final',weight:60,score:null,possible:100}]}],tasks:[]});
 const partial=normalizePlan({profileId:current.profileId,courses:[{id:'math',resources:[{id:'tutor',title:'Updated tutoring title'}],gradingComponents:[{id:'exam',title:'Exam 1',score:null},{id:'new',title:'Extra category',weight:0,score:null}]}]});
 let merged=mergeImportedPlan(current,partial);assert.deepEqual(merged.courses[0].resources,[{...current.courses[0].resources[0],title:'Updated tutoring title'},current.courses[0].resources[1]]);
 assert.deepEqual(merged.courses[0].gradingComponents[0],{...current.courses[0].gradingComponents[0],title:'Exam 1'});assert.equal(merged.courses[0].gradingComponents.length,3);
 assert.throws(()=>normalizePlan({profileId:current.profileId,courses:[{id:'math',gradingComponents:[{id:'exam',score:19}]}]}),/actual possible points/);
 const revisedScore=normalizePlan({profileId:current.profileId,courses:[{id:'math',gradingComponents:[{id:'exam',score:19,possible:20}]}]});merged=mergeImportedPlan(current,revisedScore);assert.equal(merged.courses[0].gradingComponents[0].score,19);assert.equal(merged.courses[0].gradingComponents[0].possible,20);assert.equal(merged.courses[0].gradingComponents[0].finalized,true);
 const changedSeed=structuredClone(current);changedSeed.courses[0].grade='';changedSeed.courses[0].resources=[];changedSeed.courses[0].gradingComponents=[];
 merged=mergeImportedPlan(current,changedSeed,current);assert.deepEqual(merged.courses[0].resources,[]);assert.deepEqual(merged.courses[0].gradingComponents,[]);
});
