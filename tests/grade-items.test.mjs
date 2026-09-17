import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, mergeImportedPlan, gradeSummary, getCourseHealth, createPlanService } from '../lib/plan-model.mjs';
import { CLOUD_TOOLS, handleCloudMcp } from '../lib/cloud-tools.mjs';

const plan = () => normalizePlan({profileId:'grade-evidence',courses:[{id:'bio',name:'Biology',gradingComponents:[{id:'labs',title:'Labs',weight:50},{id:'final',title:'Final',weight:50}],gradeItems:[{id:'practice',title:'Practice lab',category:'Labs',score:18,possible:25,sourceUrl:'https://school.example/grades',notes:'Published item, category still in progress.'}]}],tasks:[{id:'lab',courseId:'bio',title:'Lab',dueAt:'2026-10-01'}]});
const coverage = (status, extra={}) => ({id:'school',status:'manual',accessMode:'manual',verified:true,lastChecked:'2026-09-17T12:00:00Z',coverage:[{courseId:'bio',scope:'grades',status,checkedAt:'2026-09-17T12:00:00Z',evidence:status==='blocked'?'Instructor hides grades.':'Read published grades.',pagesChecked:1,paginationComplete:true}],...extra});

test('published grade items preserve actual points without inventing weighted category scores',()=>{
  const current=plan();
  assert.equal(current.courses[0].gradeItems[0].score,18);
  assert.equal(current.courses[0].gradeItems[0].possible,25);
  assert.equal(gradeSummary(current.courses[0]).current,gradeSummary({...current.courses[0],gradeItems:[]}).current);
  assert.equal(gradeSummary(current.courses[0]).current,null);
  assert.equal(current.courses[0].gradingComponents[0].score,null);
  assert.deepEqual(normalizePlan(current),current);
  for(const possible of [undefined,null,0])assert.throws(()=>normalizePlan({profileId:'x',courses:[{id:'bio',gradeItems:[{id:'item',score:18,possible}]}]}),/possible points/);
  assert.throws(()=>normalizePlan({profileId:'x',courses:[{id:'bio',gradeItems:[{id:'item'},{id:'item'}]}]}),/duplicate ID/);
  assert.throws(()=>normalizePlan({profileId:'x',courses:[{id:'bio',gradeItems:[{id:'item',sourceUrl:'javascript:alert(1)'}]}]}),/HTTP/);
  assert.deepEqual(normalizePlan({profileId:'x',courses:[{id:'bio',gradeItems:[{id:'item'}]}]}).courses[0].gradeItems[0],{id:'item',title:'',category:'',score:null,possible:null,sourceUrl:'',notes:''});
  current.courses[0].goalGrade=80;
  const summary=gradeSummary(current.courses[0]);
  assert.equal(summary.neededOnRemaining,null);
  assert.match(summary.warnings.join(' '),/Published item scores do not establish completed category weights/);
});

test('grade item imports merge by ID, preserve unknown/omitted data, and survive authoritative save/reload',async()=>{
  let row=null;
  const service=createPlanService(plan(),{read:async()=>row,write:async(next,base,isNew)=>{if(!isNew&&row.revision!==base)return false;row=structuredClone(next);return true;}});
  const loaded=await service.load();
  let merged=mergeImportedPlan(loaded.plan,{profileId:loaded.plan.profileId,courses:[{id:'bio',gradeItems:[{id:'practice',title:'Practice lab 1',score:null,possible:100},{id:'safety',title:'Safety quiz',score:7,possible:10}]}]});
  assert.deepEqual(merged.courses[0].gradeItems[0],{...loaded.plan.courses[0].gradeItems[0],title:'Practice lab 1'});
  assert.equal(merged.courses[0].gradeItems.length,2);
  merged=mergeImportedPlan(merged,JSON.parse(JSON.stringify(normalizePlan({profileId:loaded.plan.profileId,courses:[{id:'bio'}]}))));
  assert.equal(merged.courses[0].gradeItems.length,2);
  const saved=await service.save({plan:merged,baseRevision:loaded.revision});
  assert.deepEqual((await service.load()).plan.courses[0].gradeItems,saved.plan.courses[0].gradeItems);
  const corrected=mergeImportedPlan(saved.plan,{profileId:loaded.plan.profileId,courses:[{id:'bio',gradeItems:[{id:'practice',score:20,possible:25}]}]});
  assert.equal(corrected.courses[0].gradeItems[0].score,20);
  assert.equal(corrected.courses[0].gradeItems[0].possible,25);
});

test('legacy zero-weight records remain separate evidence and cannot affect weighted calculations',()=>{
  const current=plan().courses[0];
  current.gradingComponents[0]={...current.gradingComponents[0],score:88,possible:100,finalized:true};
  current.goalGrade=85;
  const before=gradeSummary(current);
  current.gradingComponents.push({id:'legacy-item',title:'Legacy practice score',weight:0,score:18,possible:25,finalized:false});
  assert.deepEqual(gradeSummary(current),before);
  const normalized=normalizePlan({profileId:'legacy',courses:[current]}).courses[0];
  assert.equal(normalized.gradingComponents.at(-1).id,'legacy-item');
  assert.equal(normalized.gradeItems.length,1);
});

test('recorded blocked, incomplete, and stale source checks prevent an On track headline',()=>{
  const current=plan();const now='2026-09-17T12:00:00Z';
  for(const status of ['blocked','missing','unknown']){
    current.sources=[coverage(status)];
    const health=getCourseHealth(current,'bio',now);
    assert.equal(health.status,'Missing information');
    assert.match(health.reason,/Grades/);
    assert.equal(health.sourceGaps.length,1);
  }
  current.sources=[coverage('checked',{accessMode:'browser',verified:false,connection:{state:'needs-sign-in',checkedAt:'2026-09-17T12:00:00Z',lastVerifiedAt:'2026-09-16T12:00:00Z'}})];
  assert.match(getCourseHealth(current,'bio',now).reason,/need rechecking/);
  current.sources=[coverage('blocked')];current.tasks[0].dueAt='2026-09-16';
  assert.equal(getCourseHealth(current,'bio',now).status,'Needs attention');
  assert.match(getCourseHealth(current,'bio',now).reason,/overdue.*Grades are blocked/);
  current.tasks[0].dueAt='2026-10-01';
  current.sources.push(coverage('checked',{id:'another-approved-source'}));
  assert.equal(getCourseHealth(current,'bio',now).status,'On track');
  current.sources=[{...coverage('blocked'),coverage:[{...coverage('blocked').coverage[0],courseId:'other'}]}];
  current.courses.push({id:'other'});
  assert.equal(getCourseHealth(current,'bio',now).status,'On track');
});

test('cloud plan tools accept and return separate published item scores',async()=>{
  const schema=CLOUD_TOOLS.find(tool=>tool.name==='save_semester_plan').inputSchema.properties.plan.properties.courses.items.properties.gradeItems;
  assert.ok(schema.items.properties.possible);assert.equal(schema.items.properties.weight,undefined);
  let savedPlan=plan();savedPlan.revision=1;
  const repository={getPlan:async()=>({plan:savedPlan,revision:savedPlan.revision}),savePlan:async(_user,_profile,input)=>{savedPlan=normalizePlan(input.plan);savedPlan.revision=input.baseRevision+1;return {plan:savedPlan,revision:savedPlan.revision};}};
  const request=new Request('https://semester.example/api/semester-mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'save_semester_plan',arguments:{profileId:savedPlan.profileId,baseRevision:1,plan:{profileId:savedPlan.profileId,courses:[{id:'bio',gradeItems:[{id:'practice',score:20,possible:25}]}]}}}})});
  const result=await (await handleCloudMcp(request,{origin:'https://semester.example',principal:{userId:'owner',scopes:['semester:read','semester:write']},repository})).json();
  assert.equal(result.result.isError,undefined);
  assert.equal(result.result.structuredContent.plan.courses[0].gradeItems[0].score,20);
  assert.equal(result.result.structuredContent.plan.courses[0].gradeItems[0].possible,25);
  assert.equal(result.result.structuredContent.plan.courses[0].gradingComponents[0].score,null);
});
