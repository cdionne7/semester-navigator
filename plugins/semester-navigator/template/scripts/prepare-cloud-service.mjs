#!/usr/bin/env node
// Maintainer deployment staging. This never creates or migrates student data.
import {cp,mkdir,readFile,writeFile,realpath,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2];
if(!destination)throw new Error('Supply the dedicated cloud service checkout, outside the canonical repository.');
const target=await realpath(resolve(destination));
const rel=relative(source,target);
if(!rel || (!rel.startsWith('..')&&!isAbsolute(rel)))throw new Error('Cloud service must use a separate checkout.');
const binding=JSON.parse(await readFile(resolve(target,'.openai/hosting.json'),'utf8'));
if(!binding.project_id || binding.d1!=='DB' || binding.r2)throw new Error('Create the dedicated owner-only Site and its DB binding first.');
const seed=JSON.parse(await readFile(resolve(source,'app/student-seed.json'),'utf8'));
if(seed.profileId!=='template-preview'||seed.courses.length||seed.tasks.length||seed.sources.length)throw new Error('The canonical source must contain an empty template, not student records.');
try{const original=JSON.parse(await readFile(resolve(source,'.openai/hosting.json'),'utf8'));if(original.project_id===binding.project_id)throw new Error('Never reuse the canonical Site binding.');}catch(error){if(error.code!=='ENOENT')throw error;}
// These files are generated dashboard assets, never student records. Remove the
// previous build so obsolete hashed bundles do not accumulate in deployments.
await rm(resolve(target,'public/dashboard'),{recursive:true,force:true});
for(const name of ['app','build','dashboard','db','drizzle','lib','public','worker'])await cp(resolve(source,name),resolve(target,name),{recursive:true});
for(const name of ['.gitignore','cloudflare-env.d.ts','drizzle.config.ts','eslint.config.mjs','next-env.d.ts','next.config.ts','package.json','package-lock.json','postcss.config.mjs','tsconfig.json','vite.config.ts','vite.dashboard.config.ts'])await cp(resolve(source,name),resolve(target,name));
await mkdir(resolve(target,'tests/acceptance'),{recursive:true});
for(const name of ['school-data.mjs','cloud-school.mjs'])await cp(resolve(source,'tests/acceptance',name),resolve(target,'tests/acceptance',name));
await writeFile(resolve(target,'AGENTS.md'),'# Semester Navigator cloud service\n\nThis is the dedicated service deployment, not a student workspace. Preserve its hosting manifest and database. Never bootstrap a student here. Student plans belong to the authenticated owner and explicit profile in D1. Source changes originate in the canonical Semester Navigator repository. Do not deploy the canonical checkout or copy another Site binding.\n');
console.log('Prepared dedicated cloud service source. Existing hosting binding and database preserved.');
