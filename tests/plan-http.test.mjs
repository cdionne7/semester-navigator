import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { normalizePlan } from '../lib/plan-model.mjs';
import { startStudentServer } from '../scripts/serve-student.mjs';
const script=resolve('scripts/serve-student.mjs');
async function fixture(context) {
 const root=await mkdtemp(join(tmpdir(),'semester-http-test-'));context.after(()=>rm(root,{recursive:true,force:true}));
 for(const dir of ['.semester-navigator','app','public/dashboard/assets'])await mkdir(join(root,dir),{recursive:true});
 const plan=normalizePlan({profileId:'review-http',name:'Review',school:'Example',timezone:'America/New_York',courses:[{id:'math',name:'Math'}],tasks:[{id:'hw',courseId:'math',title:'Homework',dueAt:'2026-09-09',minutes:30}]});
 await writeFile(join(root,'.semester-navigator/profile.json'),JSON.stringify({profile_id:plan.profileId,display_name:plan.name,approved_local_root:root}));
 await writeFile(join(root,'app/student-seed.json'),JSON.stringify(plan));
 await writeFile(join(root,'public/dashboard/index.html'),'<!doctype html><title>Student dashboard</title>');
 await writeFile(join(root,'public/dashboard/assets/test.js'),'window.fixture=true;');
 return {root,plan};
}
async function childServer(root,context) {
 const child=spawn(process.execPath,[script,'--root',root,'--port','0'],{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d);
 const reader=createInterface({input:child.stdout});
 const ready=await Promise.race([once(reader,'line').then(([line])=>JSON.parse(line)),once(child,'exit').then(([code])=>{throw new Error(`Server exited ${code}: ${stderr}`)}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);timer.unref()})]);
 const stop=async()=>{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}reader.close();};context.after(stop);
 return {...ready,stop};
}
const put=(url,input,headers={})=>fetch(`${url}/api/plan`,{method:'PUT',headers:{'content-type':'application/json',...headers},body:JSON.stringify(input)});
test('real local server saves, rejects competing revisions, survives restart, and imports changed seeds',async context=>{
 const {root,plan}=await fixture(context);let runtime=await childServer(root,context);
 assert.match(await (await fetch(runtime.url)).text(),/Student dashboard/);
 const initial=await (await fetch(`${runtime.url}/api/plan`)).json();assert.equal(initial.revision,0);
 initial.plan.tasks[0].notes='Saved draft notes';initial.plan.tasks[0].state='done';
 const races=await Promise.all([put(runtime.url,{plan:initial.plan,baseRevision:0}),put(runtime.url,{plan:initial.plan,baseRevision:0})]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 let saved=await (await fetch(`${runtime.url}/api/plan`)).json();assert.equal(saved.revision,1);assert.equal(saved.plan.tasks[0].notes,'Saved draft notes');
 assert.equal((await put(runtime.url,saved.plan)).status,409);
 assert.equal((await put(runtime.url,{plan:saved.plan,baseRevision:1},{origin:'https://untrusted.example'})).status,403);
 assert.equal(await new Promise((resolve,reject)=>{const request=httpRequest(`${runtime.url}/api/plan`,{headers:{host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject);request.end();}),403);
 assert.equal((await fetch(`${runtime.url}/.semester-navigator/profile.json`)).status,404);
 assert.equal((await fetch(`${runtime.url}/%2e%2e%2f.semester-navigator%2fprofile.json`)).status,404);
 await runtime.stop();runtime=await childServer(root,context);
 saved=await (await fetch(`${runtime.url}/api/plan`)).json();assert.equal(saved.plan.tasks[0].state,'done');
 plan.tasks[0].dueAt='2026-09-10';plan.tasks.push({...plan.tasks[0],id:'new-hw',title:'New homework'});await writeFile(join(root,'app/student-seed.json'),JSON.stringify(plan));
 const imported=await (await fetch(`${runtime.url}/api/plan`)).json();assert.equal(imported.revision,2);assert.equal(imported.plan.tasks.length,2);assert.equal(imported.plan.tasks[0].dueAt,'2026-09-10');assert.equal(imported.plan.tasks[0].notes,'Saved draft notes');assert.equal(imported.plan.tasks[0].state,'done');
 const envelope=JSON.parse(await readFile(join(root,'.semester-navigator/plan.json'),'utf8'));assert.equal(envelope.schemaVersion,1);assert.equal(envelope.revision,2);assert.equal(envelope.seedBaseline.tasks.length,2);
});
test('startup checks reject canonical, wrong profile, wrong root, and escaping assets',async context=>{
 const {root,plan}=await fixture(context);
 const check=await startStudentServer({root,check:true});assert.equal(check.ready,true);
 const canonical=await mkdtemp(join(tmpdir(),'semester-empty-template-'));context.after(()=>rm(canonical,{recursive:true,force:true}));
 await assert.rejects(()=>startStudentServer({root:canonical,check:true}),/canonical template/);
 await writeFile(join(root,'app/student-seed.json'),JSON.stringify({...plan,profileId:'different-student'}));await assert.rejects(()=>startStudentServer({root,check:true}),/different student/);
 await writeFile(join(root,'app/student-seed.json'),JSON.stringify(plan));
 await writeFile(join(root,'.semester-navigator/profile.json'),JSON.stringify({profile_id:plan.profileId,display_name:plan.name,approved_local_root:process.cwd()}));await assert.rejects(()=>startStudentServer({root,check:true}),/does not match/);
});
test('server binds loopback and refuses malformed saves without touching durable state',async context=>{
 const {root}=await fixture(context);const runtime=await startStudentServer({root,port:0});context.after(()=>new Promise(resolve=>runtime.server.close(resolve)));
 assert.equal(runtime.server.address().address,'127.0.0.1');
 const first=await (await fetch(`${runtime.url}/api/plan`)).json();
 assert.equal((await put(runtime.url,{plan:{...first.plan,profileId:'other'},baseRevision:0})).status,400);
 assert.equal((await fetch(`${runtime.url}/api/plan`,{method:'PUT',headers:{'content-type':'application/json'},body:'{bad json'})).status,400);
 assert.equal((await fetch(`${runtime.url}/api/plan`,{method:'PUT',body:'{}'})).status,415);
 await assert.rejects(()=>readFile(join(root,'.semester-navigator/plan.json')),{code:'ENOENT'});
});
test('runtime profile binds the shared bundle to this student without reading damaged durable storage',async context=>{
 const {root,plan}=await fixture(context);const runtime=await startStudentServer({root,port:0});context.after(()=>new Promise(resolve=>runtime.server.close(resolve)));
 await writeFile(join(root,'.semester-navigator/plan.json'),'{damaged');
 const response=await fetch(`${runtime.url}/api/profile`);assert.equal(response.status,200);
 const identity=await response.json();assert.equal(identity.plan.profileId,plan.profileId);assert.equal(identity.plan.name,plan.name);assert.equal(identity.plan.timezone,plan.timezone);assert.deepEqual(identity.plan.tasks,[]);assert.deepEqual(identity.plan.courses,[]);
 assert.equal((await fetch(`${runtime.url}/api/plan`)).status,500);
 assert.equal((await fetch(`${runtime.url}/api/profile`,{method:'PUT'})).status,405);
});
test('a confirmed dead same-host lock is recovered after server crash; live and foreign locks are retained',async context=>{
 const {root}=await fixture(context);
 const {hostname}=await import('node:os');const {randomUUID}=await import('node:crypto');const {createFilePlanStore}=await import('../lib/plan-store.mjs');
 const dead=spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'});const deadPid=dead.pid;await once(dead,'exit');
 const lockPath=join(root,'.semester-navigator/plan.lock');
 const record={pid:deadPid,host:hostname(),token:randomUUID(),createdAt:new Date().toISOString()};await writeFile(lockPath,JSON.stringify(record));
 const runtime=await childServer(root,context);await assert.rejects(()=>readFile(lockPath),{code:'ENOENT'});
 const initial=await(await fetch(`${runtime.url}/api/plan`)).json();assert.equal((await put(runtime.url,{plan:initial.plan,baseRevision:0})).status,200);
 const store=createFilePlanStore(root,initial.plan.profileId);
 await writeFile(lockPath,JSON.stringify({...record,pid:process.pid}));assert.equal(store.recoverDeadLock(),false);assert.ok(await readFile(lockPath));
 await writeFile(lockPath,JSON.stringify({...record,host:'another-machine'}));assert.equal(store.recoverDeadLock(),false);assert.ok(await readFile(lockPath));
 await writeFile(lockPath,'{partial lock metadata');assert.equal(store.recoverDeadLock(),false);assert.ok(await readFile(lockPath));
});
test('resume checkpoints distinguish starting the dashboard from a confirmed saved plan',async context=>{
 const {root}=await fixture(context);const profilePath=join(root,'.semester-navigator/profile.json');const initialProfile=JSON.parse(await readFile(profilePath,'utf8'));initialProfile.setup={status:'source_ready',intake_verified:true,last_completed_stage:'intake'};await writeFile(profilePath,JSON.stringify(initialProfile));
 const runtime=await startStudentServer({root,port:0});context.after(()=>new Promise(resolve=>runtime.server.close(resolve)));
 let profile=JSON.parse(await readFile(profilePath,'utf8'));assert.equal(profile.setup.status,'dashboard_ready');assert.equal(profile.setup.last_completed_stage,'dashboard');assert.equal(profile.setup.intake_verified,true);assert.ok(profile.setup.dashboard_started_at);assert.equal(profile.setup.first_plan_saved_at,undefined);
 const initial=await(await fetch(`${runtime.url}/api/plan`)).json();assert.equal((await put(runtime.url,{plan:initial.plan,baseRevision:0})).status,200);
 profile=JSON.parse(await readFile(profilePath,'utf8'));assert.equal(profile.setup.status,'active');assert.equal(profile.setup.last_completed_stage,'plan_saved');assert.equal(profile.setup.intake_verified,true);assert.ok(profile.setup.first_plan_saved_at);assert.ok(profile.setup.last_plan_saved_at);assert.equal(profile.profile_id,initialProfile.profile_id);assert.equal(profile.setup.tasks,undefined);
});
