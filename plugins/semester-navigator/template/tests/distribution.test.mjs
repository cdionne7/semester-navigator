import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, rename, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
async function execJson(script,args,options) {
  const result=await exec(process.execPath,[script,...args],{timeout:30000,...options});
  assert.ok(result.stdout.trim(),`${script} exited without its required JSON result. stderr: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('release ZIP boots two independent students after its source bundle is removed', async context => {
  const temporary=await mkdtemp(join(tmpdir(),'semester-release-'));
  context.after(()=>rm(temporary,{recursive:true,force:true}));
  const version=JSON.parse(await readFile('package.json','utf8')).version;
  const archivePath=`artifacts/semester-navigator-plugin-v${version}.zip`;
  const archive=await readFile(archivePath);
  const checksum=(await readFile(archivePath+'.sha256','utf8')).split(' ')[0];
  assert.equal(createHash('sha256').update(archive).digest('hex'),checksum);
  let position=0, count=0;
  while(archive.readUInt32LE(position)===0x04034b50) {
    const method=archive.readUInt16LE(position+8),size=archive.readUInt32LE(position+18),length=archive.readUInt16LE(position+26),extra=archive.readUInt16LE(position+28);
    const name=archive.subarray(position+30,position+30+length).toString();
    assert.match(name,/^semester-navigator\//);assert.ok(!name.split('/').includes('..'));
    assert.doesNotMatch(name, /(?:^|\/)(?:node_modules|\.git|\.semester-navigator|\.env)(?:\/|$)|\.openai\/hosting\.json$/);
    const start=position+30+length+extra,compressed=archive.subarray(start,start+size);
    assert.equal(method,8);const bytes=inflateRawSync(compressed);
    assert.equal(bytes.length,archive.readUInt32LE(position+22));
    const destination=join(temporary,name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes);
    position=start+size;count++;
  }
  assert.ok(count>50);
  const marketplace=join(temporary,'semester-navigator');
  const plugin=join(marketplace,'plugins/semester-navigator');
  const found=await execJson(join(plugin,'scripts/resolve-template.mjs'),[],{cwd:temporary});
  assert.equal(found.source,'bundled');
  const roots=[];
  for(const [id,level] of [['avery-college','college'],['jordan-highschool','high-school']]) {
    const root=join(temporary,id);roots.push(root);
    const plan={profileId:id,name:id,school:'Synthetic school',semester:'Fall 2026',educationLevel:level,timezone:'America/New_York',courses:[{id:'science',name:'Science'}],tasks:[{id:'lab',courseId:'science',title:'Lab report',dueAt:null,notes:'Date not supplied'}]};
    const intake=join(temporary,id+'.json');await writeFile(intake,JSON.stringify({schema_version:1,verified:true,plan}));
    const result=await execJson(join(found.template_root,'scripts/bootstrap-student-site.mjs'),['--student-root',root,'--profile-id',id,'--display-name',id,'--school',plan.school,'--semester',plan.semester,'--timezone',plan.timezone,'--age-eligible','yes','--intake-file',intake],{cwd:temporary});
    assert.equal(result.prepared,false);
    const saved=JSON.parse(await readFile(join(root,'app/student-seed.json'),'utf8'));assert.equal(saved.educationLevel,level);assert.equal(saved.tasks[0].dueAt,null);
    await assert.rejects(()=>access(join(root,'.openai/hosting.json')));
    assert.equal(JSON.parse(await readFile(join(root,'.openai/hosting.example.json'),'utf8')).d1,'DB');
    await assert.rejects(()=>access(join(root,'node_modules')));
    await assert.rejects(()=>access(join(root,'.git')));
    await access(join(root,'.semester-navigator/playbook/SKILL.md'));
  }
  await rename(marketplace,marketplace+'-unavailable');
  for(const root of roots) {
    const result=await execJson(join(root,'scripts/serve-student.mjs'),['--root',root,'--check'],{cwd:resolve(root)});
    assert.equal(result.ready,true);
  }
});
