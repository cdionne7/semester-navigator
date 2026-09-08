import { test as base, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { normalizePlan } from '../../lib/plan-model.mjs';
export const test=base.extend({
  educationLevel: ['college',{option:true}],
  empty: [false,{option:true}],
  workspace: async({educationLevel,empty},provide)=>{
    const root=await mkdtemp(join(tmpdir(),'semester-browser-fixture-'));
    const name=educationLevel==='high-school'?'High School Fixture':'College Fixture';
    const seed=normalizePlan({profileId:educationLevel==='high-school'?'high-school-fixture':'college-fixture',name,school:'Example School',semester:'Fall 2026',timezone:'America/New_York',educationLevel,courses:empty?[]:[{id:'math',name:educationLevel==='high-school'?'Algebra II':'Calculus',instructor:'Example Instructor'}],tasks:empty?[]:[{id:'homework',courseId:'math',title:'Problem set',dueAt:'2026-09-09',minutes:30,rubric:'Show the reasoning for each answer.'}]});
    let child;let reader;
    try {
      for(const directory of ['app','.semester-navigator','lib','scripts'])await mkdir(join(root,directory),{recursive:true});
      await writeFile(join(root,'.semester-navigator/profile.json'),JSON.stringify({schema_version:2,profile_id:seed.profileId,display_name:seed.name,approved_local_root:root,setup:{status:'source_ready',intake_verified:true,last_completed_stage:'intake'}}));
      await writeFile(join(root,'app/student-seed.json'),JSON.stringify(seed));
      await cp(resolve('public/dashboard'),join(root,'public/dashboard'),{recursive:true});
      for(const path of ['lib/plan-model.mjs','lib/plan-store.mjs','scripts/serve-student.mjs'])await cp(resolve(path),join(root,path));
      child=spawn(process.execPath,[join(root,'scripts/serve-student.mjs'),'--root',root,'--port','0'],{stdio:['ignore','pipe','pipe']});
      let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);reader=createInterface({input:child.stdout});
      const ready=await Promise.race([once(reader,'line').then(([line])=>JSON.parse(line)),once(child,'exit').then(([code])=>{throw new Error(`Student runtime exited ${code}: ${stderr}`)})]);
      await provide({root,seed,url:ready.url});
    } finally {if(child && child.exitCode===null && child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}reader?.close();await rm(root,{recursive:true,force:true});}
  },
});
export {expect};
export async function openDashboard(page,workspace){await page.clock.setFixedTime(new Date('2026-09-08T14:00:00Z'));await page.goto(workspace.url);await expect(page.getByRole('heading',{level:1,name:workspace.seed.name+"'s semester"})).toBeVisible();await expect(page.getByText('All changes saved',{exact:true})).toBeVisible();}
export async function saved(page){await expect(page.getByText('All changes saved',{exact:true})).toBeVisible();}
export async function changeAvailability(page,value){await page.getByRole('button',{name:'Preferences',exact:true}).click();await page.getByLabel('Work hours and availability notes').fill(value);await page.getByRole('button',{name:'Save preferences',exact:true}).click();}
export async function readPlan(request,workspace){const response=await request.get(workspace.url+'/api/plan');expect(response.status()).toBe(200);return response.json();}
