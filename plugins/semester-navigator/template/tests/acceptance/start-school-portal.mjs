#!/usr/bin/env node
import {mkdtemp,mkdir,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createAcceptanceSchoolPortal,defaultControl} from './school-portal.mjs';
const args=process.argv.slice(2);const options={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1])throw Error('Use --evidence-dir PATH or --port NUMBER');options[args[i].slice(2)]=args[i+1];}
const evidenceDir=options['evidence-dir']?resolve(options['evidence-dir']):await mkdtemp(join(tmpdir(),'semester-autonomous-school-'));
await mkdir(evidenceDir,{recursive:true});
const controlFile=join(evidenceDir,'control.json');const requestLog=join(evidenceDir,'requests.jsonl');
try{await access(controlFile);}catch{await writeFile(controlFile,JSON.stringify(defaultControl(),null,2)+'\n');}
const fixture=await createAcceptanceSchoolPortal({port:Number(options.port??0),controlFile,requestLog});
const metadata={url:fixture.url,college:fixture.url+'/college',highSchool:fixture.url+'/high-school',evidenceDir,controlFile,requestLog,pid:process.pid,syntheticOnly:true};
await writeFile(join(evidenceDir,'server.json'),JSON.stringify(metadata,null,2)+'\n');
process.stdout.write(JSON.stringify(metadata)+'\n');
let closing=false;const close=async()=>{if(closing)return;closing=true;await fixture.close();process.exitCode=0;};
process.on('SIGTERM',close);process.on('SIGINT',close);
