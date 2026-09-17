import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync, execFile} from 'node:child_process';
import {promisify} from 'node:util';
const cli=resolve('bin/dsh-bigfish.mjs'), name='dsh-bigfish-pet-maker';
const exec=promisify(execFile);
const run=(home:string,...args:string[])=>spawnSync(process.execPath,[cli,...args],{env:{...process.env,DSH_HOME:home},encoding:'utf8'});
test('Skill CLI installs complete resources, validates starter and is idempotent',async()=>{
 const home=await mkdtemp(join(tmpdir(),'bigfish-skill-'));
 try{
  assert.equal(run(home,'install-skill').status,0);
  const target=join(home,'skills',name);
  assert.equal(await readFile(join(target,'SKILL.md'),'utf8'),await readFile('skills/'+name+'/SKILL.md','utf8'));
  const check=spawnSync(process.execPath,[join(target,'scripts/pet-tool.mjs'),'validate',join(target,'assets/starter')],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  assert.match(run(home,'install-skill').stdout,/已是相同版本/);
  assert.deepEqual(await readdir(join(home,'skills')),[name]);
 }finally{await rm(home,{recursive:true,force:true});}
});
test('Skill CLI preserves user changes and supports an alternate skills directory',async()=>{
 const home=await mkdtemp(join(tmpdir(),'bigfish-skill-'));
 try{
  assert.equal(run(home,'install-skill').status,0);
  const file=join(home,'skills',name,'SKILL.md');await writeFile(file,'my edited skill');
  assert.equal(run(home,'install-skill').status,1);assert.equal(await readFile(file,'utf8'),'my edited skill');
  const alternate=join(home,'another-agent');assert.equal(run(home,'install-skill','--skills-dir',alternate).status,0);
  assert.match(await readFile(join(alternate,name,'SKILL.md'),'utf8'),/name: dsh-bigfish-pet-maker/);
 }finally{await rm(home,{recursive:true,force:true});}
});
test('concurrent Skill installations finish consistently',async()=>{
 const home=await mkdtemp(join(tmpdir(),'bigfish-skill-'));
 try{
  const results=await Promise.all([1,2].map(()=>exec(process.execPath,[cli,'install-skill'],{env:{...process.env,DSH_HOME:home}})));
  assert.equal(results.filter(r=>r.stdout.startsWith('已安装')).length,1);
  assert.deepEqual(await readdir(join(home,'skills')),[name]);
 }finally{await rm(home,{recursive:true,force:true});}
});
test('unknown flags do not write files and existing symlinks are preserved',async()=>{
 const home=await mkdtemp(join(tmpdir(),'bigfish-skill-'));
 try{
  assert.equal(run(home,'install-skill','--force').status,1);assert.deepEqual(await readdir(home),[]);
  assert.equal(run(home,'--help').status,0);assert.deepEqual(await readdir(home),[]);
  assert.equal(run(home,'install-skill').status,0);
  const target=join(home,'skills',name);await rm(target,{recursive:true});await symlink(resolve('skills/'+name),target,'dir');
  assert.equal(run(home,'install-skill').status,1);assert.ok((await readFile(join(target,'SKILL.md'),'utf8')).length>100);
 }finally{await rm(home,{recursive:true,force:true});}
});
