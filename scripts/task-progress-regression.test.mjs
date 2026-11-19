import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createLoader } from './helpers/load-typescript.mjs';

const load = createLoader();
const { TaskRepository } = load('src/main-process/services/taskRepository.ts');
const { TaskProgressService } = load('src/main-process/services/taskProgressService.ts');
const { inferTaskProgress } = load('src/main-process/services/taskProgressEvidence.ts');
const { inspectTaskProgressGit } = load('src/main-process/services/taskProgressGit.ts');
const { taskProgressView, resolveTaskProgress } = load('src/shared/taskProgress.ts');
const { isTask } = load('src/utils/adeDataValidation.ts');
const { openAppDatabase, APP_SCHEMA_VERSION } = load('src/main-process/services/appDatabase.ts');
const resource = {resourceId:'repo',name:'acme/repo',mode:'worktree',sourceBranch:'main',targetBranch:'feature',originalPath:'/repo',workingPath:'/worktree'};
const base = {id:'task',title:'Task',description:'Prompt',status:'TODO',date:'2026-11-19',updatedAt:'2026-11-19T00:00:00.000Z',projectName:'repo',resources:[resource]};
const gitSample = (patch={}) => ({resourceId:'repo',branch:'feature',head:'feature-head',remoteUrl:'https://github.com/acme/repo.git',dirty:false,ahead:0,behind:0,aheadOfBase:0,landedInBase:false,onDefaultBranch:false,...patch});
const pr = (patch={}) => ({id:'pr',title:'PR',group:'PR',status:'review',host:'github.com',repository:'acme/repo',headBranch:'feature',date:'2026-11-19',...patch});

async function fixture(context, task=base, inspect=async()=>gitSample()) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'navo-progress-'));
  context.after(()=>rm(directory,{recursive:true,force:true}));
  const filename=path.join(directory,'app.db');
  const repository=new TaskRepository(filename,'test');
  await repository.create(task,[]);
  const broadcasts=[];
  const service=new TaskProgressService(repository,inspect,task=>broadcasts.push(task));
  return {directory,filename,repository,service,broadcasts};
}

test('自动进度区分探索、未跟踪／已提交开发、草稿／开放 PR 和完成', () => {
  assert.equal(inferTaskProgress(base,[gitSample()]).stage,'exploration');
  assert.equal(inferTaskProgress(base,[gitSample({dirty:true})]).stage,'development');
  assert.equal(inferTaskProgress(base,[gitSample({ahead:1})]).stage,'development');
  assert.equal(inferTaskProgress(base,[gitSample({aheadOfBase:1})]).stage,'development');
  assert.equal(inferTaskProgress({...base,links:[pr({status:'draft'})]},[gitSample()]).stage,'review');
  assert.equal(inferTaskProgress({...base,links:[pr({status:'merged'})]},[gitSample()]).stage,'done');
  assert.notEqual(inferTaskProgress({...base,links:[pr({status:'closed'})]},[gitSample()]).stage,'done');
});

test('只匹配同仓库当前分支，参考 PR 不推动工作区阶段', () => {
  assert.equal(inferTaskProgress({...base,links:[pr({repository:'another/repo'})]},[gitSample()]).stage,'exploration');
  assert.equal(inferTaskProgress({...base,links:[pr({headBranch:'other'})]},[gitSample()]).stage,'exploration');
  assert.equal(inferTaskProgress({...base,links:[pr({status:'merged'}),pr({id:'reference',headBranch:'other'})]},[gitSample()]).stage,'done');
  assert.equal(inferTaskProgress({...base,archivedLinks:[pr({status:'merged',archivedAt:'now'})]},[gitSample()]).stage,'done');
});

test('多个仓库中仍有独立开发提交或开放 PR 阻止完成', () => {
  const task={...base,resources:[resource,{...resource,resourceId:'second',name:'acme/second'}],links:[pr({status:'merged'})]};
  const second=gitSample({resourceId:'second',remoteUrl:'https://github.com/acme/second.git',aheadOfBase:2});
  assert.equal(inferTaskProgress(task,[gitSample(),second]).stage,'development');
  assert.notEqual(inferTaskProgress(task,[gitSample(),{...second,aheadOfBase:null}]).stage,'done');
  assert.equal(inferTaskProgress({...task,links:[...task.links,pr({id:'second-pr',repository:'acme/second'})]},[gitSample(),second]).stage,'review');
  assert.equal(inferTaskProgress(task,[gitSample(),null]).complete,false);
  assert.notEqual(inferTaskProgress(task,[gitSample(),null]).stage,'done');
  const unresolved={...base,links:[pr({status:'merged'}),pr({id:'unresolved',headBranch:undefined})]};
  assert.equal(inferTaskProgress(unresolved,[gitSample()]).complete,false);
  assert.notEqual(inferTaskProgress(unresolved,[gitSample()]).stage,'done');
});

test('无 Git 工作区以直接关联 PR 判断，关闭而未合并不能算完成', () => {
  const task={...base,resources:[{...resource,mode:'folder'}]};
  assert.equal(inferTaskProgress({...task,links:[pr()]},[]).stage,'review');
  assert.equal(inferTaskProgress({...task,links:[pr({status:'merged'})]},[]).stage,'done');
  assert.notEqual(inferTaskProgress({...task,links:[pr({status:'merged'}),pr({id:'closed',status:'closed'})]},[]).stage,'done');
  assert.notEqual(inferTaskProgress({...task,links:[pr({status:'merged',fetchError:'offline'})]},[]).stage,'done');
});

test('有提交合入证据的分支完成，主分支和没有证据的空分支不算', () => {
  assert.equal(inferTaskProgress(base,[gitSample()]).stage,'exploration');
  const sample=gitSample({landedInBase:true});
  assert.equal(inferTaskProgress(base,[sample]).stage,'done');
  assert.equal(inferTaskProgress(base,[{...sample,onDefaultBranch:true}]).stage,'exploration');
});

test('临时读失败或证据消失保留上次可靠阶段，完成后的本地改动单独提示', () => {
  const task={...base,progress:{evidence:'review'}};
  assert.equal(inferTaskProgress(task,[null]).stage,'review');
  assert.equal(inferTaskProgress(task,[gitSample()]).stage,'review');
  const done={...base,links:[pr({status:'merged'})]};
  assert.equal(inferTaskProgress(done,[gitSample({dirty:true})]).localChanges,true);
});

test('手动阶段按证据变化接管，提前标记和退回阶段有不同规则', () => {
  assert.deepEqual(resolveTaskProgress({evidence:'development',manual:{stage:'done',evidence:'development'}}),{stage:'done',automatic:false});
  assert.deepEqual(resolveTaskProgress({evidence:'review',manual:{stage:'done',evidence:'development'}}),{stage:'done',automatic:false});
  assert.deepEqual(resolveTaskProgress({evidence:'done',manual:{stage:'done',evidence:'development'}}),{stage:'done',automatic:true});
  assert.deepEqual(resolveTaskProgress({evidence:'review',manual:{stage:'development',evidence:'review'}}),{stage:'development',automatic:false});
  assert.deepEqual(resolveTaskProgress({evidence:'development',manual:{stage:'exploration',evidence:'review'}}),{stage:'development',automatic:true});
  assert.equal(resolveTaskProgress({evidence:'done',manual:{stage:'development',evidence:null}}).automatic,false);
});

test('任务导入拒绝未知阶段或非法手动证据，兼容没有进度的旧记录', () => {
  assert.equal(isTask(base),true);
  assert.equal(isTask({...base,progress:{evidence:'unknown'}}),false);
  assert.equal(isTask({...base,progress:{evidence:'review',manual:{stage:'done',evidence:'unknown'}}}),false);
  assert.equal(isTask({...base,progress:{evidence:'review',manual:{stage:'done',evidence:null}}}),true);
});

test('保存、自动接管与重新打开同步看板，重启保持选择；无变化不刷新活动', async context => {
  let current=gitSample({dirty:true});
  const {repository,service,filename,broadcasts}=await fixture(context,base,async()=>current);
  const development=await service.refresh(base.id);
  assert.equal(taskProgressView(development).stage,'development');
  assert.equal(development.status,'TODO');
  const done=await service.setStage(base.id,'done');
  assert.equal(done.status,'DONE');
  const reopened=await service.setStage(base.id,'reopen');
  assert.deepEqual(taskProgressView(reopened),{stage:'development',automatic:true});
  const manual=await service.setStage(base.id,'review');
  const reloaded=(await new TaskRepository(filename,'test').load())[0];
  assert.deepEqual(reloaded.progress,manual.progress);
  const oldUpdated=manual.updatedAt;
  current={...current,head:'another-head',aheadOfBase:1};
  assert.equal((await service.refresh(base.id)).updatedAt,oldUpdated);
  assert.ok(broadcasts.length>0);
  assert.equal((await repository.load())[0].promptVersion,1);
});

test('首次探索检查、重复检查和临时失败不制造任务活动', async context => {
  let current=gitSample();
  const {service}=await fixture(context,base,async()=>current);
  assert.equal((await service.refresh(base.id)).updatedAt,base.updatedAt);
  assert.equal((await service.refresh(base.id)).updatedAt,base.updatedAt);
  current=null;
  assert.equal((await service.refresh(base.id)).updatedAt,base.updatedAt);
});

test('自动完成后重新打开保持开发中，手动模式可以显式恢复自动', async context => {
  const {service}=await fixture(context,{...base,links:[pr({status:'merged'})]});
  assert.equal((await service.refresh(base.id)).status,'DONE');
  const reopened=await service.setStage(base.id,'reopen');
  assert.deepEqual(taskProgressView(reopened),{stage:'development',automatic:false});
  assert.equal((await service.refresh(base.id)).status,'TODO');
  assert.equal((await service.setStage(base.id,null)).status,'DONE');
});

test('同一任务并发检查合并，资源在检查期间替换时丢弃旧证据', async context => {
  let release; let started;
  const ready=new Promise(resolve=>{started=resolve;});
  const {service,filename}=await fixture(context,base,()=>{started();return new Promise(resolve=>{release=resolve;});});
  const first=service.refresh(base.id);
  assert.equal(first,service.refresh(base.id));
  await ready;
  const database=await openAppDatabase(filename);
  database.prepare('UPDATE task_resources SET data=? WHERE task_id=?').run(JSON.stringify({...resource,workingPath:'/replacement'}),base.id);
  database.close();
  release(gitSample({dirty:true}));
  assert.equal(taskProgressView(await first).stage,'exploration');
});

test('归档／删除中的任务禁止改进度，拒绝非法输入', async context => {
  const {service,repository}=await fixture(context);
  await assert.rejects(service.setStage(base.id,'invalid'),/TASK_INVALID/);
  await repository.update(tasks=>tasks.map(task=>({...task,status:'ARCHIVED',archivedFrom:'TODO'})));
  await assert.rejects(service.setStage(base.id,'done'),/TASK_ARCHIVED/);
  assert.equal(await service.refresh(base.id),null);
  await repository.update(tasks=>tasks.map(task=>({...task,status:'TODO'})));
  await repository.recordDeletion(base.id,{resourceId:'repo',worktree:'pending'});
  await assert.rejects(service.setStage(base.id,'done'),/TASK_BUSY/);
});

test('Git 检查期间开始清理时拒绝提交，不复活或修改清理中的任务', async context => {
  let release; let started;
  const ready=new Promise(resolve=>{started=resolve;});
  const {service,repository}=await fixture(context,base,()=>{started();return new Promise(resolve=>{release=resolve;});});
  const operation=service.refresh(base.id);await ready;
  await repository.recordDeletion(base.id,{resourceId:'repo',worktree:'pending'});
  release(gitSample({dirty:true}));
  await assert.rejects(operation,/TASK_BUSY/);
  assert.equal((await repository.load())[0].progress,undefined);
});

test('看板跨列操作同步手动进度，归档及恢复保留开发阶段', async context => {
  const {directory,repository}=await fixture(context);
  const {TaskService}=load('src/main-process/services/taskService.ts');
  const tasks=new TaskService(directory,'test',()=>({}));
  let [task]=await tasks.move(base.id,'DONE',null);
  assert.deepEqual(taskProgressView(task),{stage:'done',automatic:false});
  [task]=await tasks.move(base.id,'TODO',null);
  assert.deepEqual(taskProgressView(task),{stage:'exploration',automatic:true});
  await repository.update(items=>items.map(item=>({...item,progress:{evidence:'review',manual:{stage:'review',evidence:'review'}}})));
  await repository.completeArchival(base.id);
  [task]=await tasks.restore(base.id);
  assert.equal(task.status,'TODO');
  assert.deepEqual(taskProgressView(task),{stage:'review',automatic:false});
});

test('从 v19 升级保留完成／归档前完成，未伪造活动或正文版本', async context => {
  const {filename,repository}=await fixture(context,{...base,status:'DONE'});
  const database=await openAppDatabase(filename);
  database.exec('ALTER TABLE tasks DROP COLUMN progress; PRAGMA user_version=19');
  database.close();
  const [task]=await repository.load();
  assert.equal(APP_SCHEMA_VERSION,20);
  assert.deepEqual(taskProgressView(task),{stage:'done',automatic:false});
  assert.equal(task.updatedAt,base.updatedAt);
  assert.equal(task.promptVersion,1);
});

const gitEnv={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid',GIT_TERMINAL_PROMPT:'0'};
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',env:gitEnv,stdio:['ignore','pipe','pipe']}).trim();

test('真实 Git 从新分支、未跟踪文件、提交到合并自动推进，禁止网络／写入副作用', async context => {
  const {directory,filename}=await fixture(context,{...base,resources:[]});
  const repo=path.join(directory,'repo');await mkdir(repo);
  git(repo,['init','-b','main']);git(repo,['config','commit.gpgsign','false']);
  await writeFile(path.join(repo,'base.txt'),'base\n');git(repo,['add','.']);git(repo,['commit','-m','base']);
  git(repo,['checkout','-b','feature']);
  const bound={...resource,originalPath:repo,workingPath:repo};
  const database=await openAppDatabase(filename);
  database.prepare('INSERT INTO task_resources VALUES(?,?,?,?)').run('test',base.id,0,JSON.stringify(bound));database.close();
  const repository=new TaskRepository(filename,'test');const service=new TaskProgressService(repository);
  assert.equal(taskProgressView(await service.refresh(base.id)).stage,'exploration');
  await writeFile(path.join(repo,'new.txt'),'new\n');
  assert.equal(taskProgressView(await service.refresh(base.id)).stage,'development');
  git(repo,['add','.']);git(repo,['commit','-m','feature']);
  const committed=await service.refresh(base.id);assert.equal(taskProgressView(committed).stage,'development');
  git(repo,['checkout','main']);git(repo,['merge','--no-ff','feature','-m','merge']);git(repo,['checkout','feature']);
  assert.equal(taskProgressView(await service.refresh(base.id)).stage,'done');
  // 首次接入时已经合入的分支也能从真实 reflog 识别，不依赖 Navo 曾观察过开发过程。
  const landed=await inspectTaskProgressGit(bound);assert.equal(landed.landedInBase,true);
  assert.equal(inferTaskProgress({...base,resources:[bound]},[landed]).stage,'done');
  assert.equal(git(repo,['branch','--show-current']),'feature');
  assert.equal(git(repo,['status','--porcelain']),'');
  assert.equal(await inspectTaskProgressGit({...bound,workingPath:path.join(directory,'missing')}),null);
});
