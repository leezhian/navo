import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLoader } from './helpers/load-typescript.mjs';

const load=createLoader();
const {TaskRepository}=load('src/main-process/services/taskRepository.ts');
const {TaskNoteRepository}=load('src/main-process/services/taskNoteRepository.ts');
const {TaskContentRepository}=load('src/main-process/services/taskContentRepository.ts');
const {TaskResourceBindings}=load('src/main-process/services/taskResourceBindings.ts');
const {openAppDatabase}=load('src/main-process/services/appDatabase.ts');
const {locateNoteComment,toggleNoteChecklist}=load('src/utils/taskNoteAnchors.ts');
const {parseTaskLink,taskLink}=load('src/shared/taskLinks.ts');
const base={id:'task',title:'Task',description:'Initial prompt',date:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',projectName:'',status:'TODO'};
async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'navo-notes-parity-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'app.db'),tasks=new TaskRepository(file,'test'),notes=new TaskNoteRepository(file,'test'),bindings=new TaskResourceBindings(tasks,file,'test');
 await tasks.create(base,[]);await tasks.create({...base,id:'other'},[]);
 const note={id:randomUUID(),title:'Note',content:'# Heading\n\n- [ ] check\n\nReference'};
 await bindings.add(base.id,{requestId:randomUUID(),notes:[note],links:[],webLinks:[],fileIds:[]},1);
 return {dir,file,tasks,notes,bindings,note,current:async()=> (await tasks.load()).find(item=>item.id===base.id),content:new TaskContentRepository(file,'test')};
}

test('历史记录创建、编辑、Agent 作者和恢复新版本；无变化不制造版本，陈旧版本不能恢复',async t=>{
 const f=await fixture(t);let current=(await f.current()).notes[0];
 assert.deepEqual((await f.notes.history(base.id,f.note.id)).map(v=>[v.version,v.kind,v.actor]),[[1,'create','user']]);
 await f.notes.update(base.id,{...f.note,content:'Agent edit'},1,undefined,'agent-session');
 current=(await f.current()).notes[0];assert.equal(current.lastEditor,'agent');assert.equal(current.lastEditorSessionId,'agent-session');assert.equal(current.origin,'user');
 await f.notes.update(base.id,{...f.note,content:'Agent edit'},2);assert.equal((await f.notes.history(base.id,f.note.id)).length,2);
 await assert.rejects(f.notes.restore(base.id,f.note.id,1,1),/TASK_CONTENT_CHANGED/);
 await f.notes.restore(base.id,f.note.id,1,2);current=(await f.current()).notes[0];assert.equal(current.version,3);assert.equal(current.content,f.note.content);assert.equal(current.lastEditor,'user');
 const history=await f.notes.history(base.id,f.note.id);assert.equal(history[0].kind,'restore');assert.equal(history[0].restoredFrom,1);assert.equal(history[1].content,'Agent edit');
 assert.deepEqual(await f.notes.history('other',f.note.id),[]);
 await f.tasks.update(tasks=>tasks.map(task=>({...task,status:task.id===base.id?'ARCHIVED':task.status})));
 await assert.rejects(f.notes.restore(base.id,f.note.id,2,3),/TASK_BUSY/);
});

test('正文独立版本、历史恢复和 ABA 并发检查，不随其他笔记变动刷新正文版本',async t=>{
 const f=await fixture(t);
 await f.content.updatePrompt(base.id,'Second','Initial prompt',1);let task=await f.current();assert.equal(task.promptVersion,2);
 const promptTime=task.promptMetadata.updatedAt;
 await f.notes.update(base.id,{...f.note,content:'Another note edit'},1);task=await f.current();assert.equal(task.promptVersion,2);assert.equal(task.promptMetadata.updatedAt,promptTime);
 await f.notes.restore(base.id,'task-prompt',1,2);task=await f.current();assert.equal(task.description,'Initial prompt');assert.equal(task.promptVersion,3);
 await assert.rejects(f.content.updatePrompt(base.id,'Stale change','Initial prompt',1),/TASK_CONTENT_CHANGED/);
 assert.equal((await f.notes.history(base.id,'task-prompt')).length,3);
});

test('评论保存真实引用、幂等、回复过期线程、并发编辑、解决及删除不修改笔记正文版本',async t=>{
 const f=await fixture(t),id=randomUUID();
 const input={id,noteId:f.note.id,noteVersion:1,startLine:3,endLine:3,quote:'- [ ] check',body:'Please verify'};
 await f.notes.comment(base.id,input);await f.notes.comment(base.id,input);
 let note=(await f.current()).notes[0];assert.equal(note.comments.length,1);assert.equal(note.version,1);assert.equal(note.content,f.note.content);
 await assert.rejects(f.notes.comment(base.id,{...input,body:'Different request'}),/TASK_CONTENT_CHANGED/);
 await assert.rejects(f.notes.comment(base.id,{...input,id:randomUUID(),quote:'Not the real source'}),/TASK_CONTENT_CHANGED/);
 const updated=toggleNoteChecklist(f.note.content,3,true);await f.notes.update(base.id,{...f.note,content:updated},1);
 await f.notes.comment(base.id,{...input,id:randomUUID(),parentId:id,noteVersion:2,body:'Reply to original quote'},undefined,'agent-session');
 note=(await f.current()).notes[0];assert.equal(note.comments[1].actor,'agent');assert.equal(note.comments[1].quote,'- [ ] check');assert.equal(note.comments[1].noteVersion,1);
 const comment=note.comments[0];await f.notes.changeComment(base.id,id,comment.updatedAt,{resolved:true});
 const resolved=(await f.current()).notes[0].comments[0];assert.ok(resolved.resolvedAt);assert.notEqual(resolved.updatedAt,comment.updatedAt);
 await assert.rejects(f.notes.changeComment(base.id,id,comment.updatedAt,{body:'Stale'}),/TASK_CONTENT_CHANGED/);
 await f.notes.changeComment(base.id,id,resolved.updatedAt,{remove:true});assert.equal((await f.current()).notes[0].comments.length,0);
 await f.notes.comment(base.id,{...input,id:randomUUID(),noteVersion:2,quote:'- [x] check'});
 await f.notes.remove(base.id,f.note.id,2);assert.deepEqual(await f.notes.history(base.id,f.note.id),[]);
 const db=await openAppDatabase(f.file);assert.equal(db.prepare('SELECT COUNT(*) n FROM task_note_comments WHERE note_id=?').get(f.note.id).n,0);db.close();
});

test('升级旧笔记只保留当前基线和原更新时间，不伪造以前的版本',async t=>{
 const f=await fixture(t);await f.notes.update(base.id,{...f.note,content:'Latest'},1);
 const before=(await f.current()).notes[0];let db=await openAppDatabase(f.file);
 db.exec('DROP TABLE task_note_history;DROP TABLE task_note_comments;ALTER TABLE tasks DROP COLUMN prompt_version;PRAGMA user_version=14;');db.close();
 const after=(await f.current()).notes[0];assert.equal(after.updatedAt,before.updatedAt);assert.equal(after.createdAt,before.createdAt);
 const history=await f.notes.history(base.id,f.note.id);assert.equal(history.length,1);assert.equal(history[0].version,2);assert.equal(history[0].kind,'baseline');assert.equal(history[0].actor,'unknown');assert.equal(history[0].createdAt,before.updatedAt);
});

test('原文清单更新保留空白，评论唯一位置重定位，笔记链接不接受额外动作',()=>{
 const source='  - [ ] task\r\nlast';assert.equal(toggleNoteChecklist(source,1,true),'  - [x] task\r\nlast');assert.equal(toggleNoteChecklist(source,2,true),source);
 const anchor={startLine:1,endLine:1,quote:'target'};assert.deepEqual(locateNoteComment('new\ntarget',anchor),{startLine:2,endLine:2});assert.equal(locateNoteComment('new\ntarget\ntarget',anchor),null);
 assert.deepEqual(parseTaskLink(taskLink('task','task-prompt')),{taskId:'task',noteId:'task-prompt'});assert.equal(parseTaskLink('navo://task/task/note/id?run=1'),null);
});

test('另存为使用系统确认目标，保留完整 Markdown；取消不写文件',async t=>{
 const f=await fixture(t);let canceled=true;const target=path.join(f.dir,'export.md');
 const module=createLoader({electron:{dialog:{showSaveDialog:async(_window,options)=>{assert.ok(options.defaultPath.endsWith('.md'));return {canceled,filePath:target};}}}})('src/main-process/services/taskNoteExport.ts');
 const window={isDestroyed:()=>false};assert.equal(await module.exportTaskNote(window,await f.current(),f.note.id),false);await assert.rejects(readFile(target));
 canceled=false;assert.equal(await module.exportTaskNote(window,await f.current(),f.note.id),true);assert.equal(await readFile(target,'utf8'),f.note.content);
 assert.equal(module.noteExportFilename('../bad:name\n'), '..-bad-name-.md');
});

test('清空已有笔记和正文仍保留可恢复历史，新建空笔记被拒绝', async t => {
  const f = await fixture(t);
  await f.notes.update(base.id, { ...f.note, content: '' }, 1);
  assert.equal((await f.current()).notes[0].content, '');
  await f.notes.restore(base.id, f.note.id, 1, 2);
  assert.equal((await f.current()).notes[0].content, f.note.content);
  await f.content.updatePrompt(base.id, '', base.description, 1);
  assert.equal((await f.current()).description, '');
  await f.notes.restore(base.id, 'task-prompt', 1, 2);
  assert.equal((await f.current()).description, base.description);
  assert.throws(() => f.notes.create(base.id, { id: randomUUID(), title: '', content: '' }, 'agent', () => {}), /TASK_INVALID/);
});

test('MCP 评论使用可信作者，隔离任务，校验引用，排队期间撤销凭证不写入', async t => {
  const f = await fixture(t);
  const { TaskContextServer } = load('src/main-process/services/taskSessions/taskContextServer.ts');
  const task = async id => (await f.tasks.load()).find(item => item.id === id);
  let gate, entered;
  const server = new TaskContextServer(task, undefined, {
    create: (...args) => f.bindings.createAgentNote(...args),
    update: (...args) => f.bindings.updateNote(...args),
    remove: (...args) => f.bindings.deleteNote(...args),
    comment: async (...args) => { if (gate) { entered(); await gate; } return f.bindings.commentNote(...args); },
    changeComment: (...args) => f.bindings.changeNoteComment(...args),
  });
  t.after(() => server.close());
  const one = await server.connect('trusted-agent', base.id), other = await server.connect('other-agent', 'other');
  const rpc = (connection, method, params) => fetch(connection.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const call = async (connection, name, args = {}) => (await (await rpc(connection, 'tools/call', { name, arguments: args })).json()).result;
  const data = result => JSON.parse(result.content[0].text);
  const listed = (await (await rpc(one, 'tools/list')).json()).result.tools;
  assert.ok(listed.some(tool => tool.name === 'comment_task_note' && !tool.annotations.readOnlyHint));
  const input = { noteId: f.note.id, version: 1, startLine: 1, endLine: 1, quote: '# Heading', body: 'Review this heading' };
  for (const args of [{ ...input, taskId: 'other' }, { ...input, sessionId: 'spoof' }, { ...input, quote: 'wrong' }, { ...input, version: 2 }]) {
    assert.equal((await call(one, 'comment_task_note', args)).isError, true);
  }
  assert.equal((await call(other, 'comment_task_note', input)).isError, true);
  const created = data(await call(one, 'comment_task_note', input)).comment;
  assert.equal(created.actor, 'agent'); assert.equal(created.sessionId, 'trusted-agent');
  const read = data(await call(one, 'get_task_note', { noteId: f.note.id }));
  assert.equal(read.version, 1); assert.equal(read.comments[0].body, input.body);
  const reply = data(await call(one, 'comment_task_note', { ...input, body: 'Reply', parentId: created.id })).comment;
  assert.equal(reply.parentId, created.id);
  const resolve = { commentId: created.id, updatedAt: created.updatedAt, resolved: true };
  assert.equal((await call(other, 'resolve_task_note_comment', resolve)).isError, true);
  assert.equal(data(await call(one, 'resolve_task_note_comment', resolve)).resolved, true);
  assert.equal((await call(one, 'resolve_task_note_comment', { ...resolve, resolved: false })).isError, true);
  const prompt = data(await call(one, 'get_task_note', { noteId: 'task-prompt' }));
  assert.equal(prompt.version, 1);
  await call(one, 'comment_task_note', { ...input, noteId: 'task-prompt', quote: prompt.content });
  assert.equal(data(await call(one, 'get_task_context')).promptComments[0].sessionId, 'trusted-agent');
  let release;
  gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const pending = call(one, 'comment_task_note', { ...input, body: 'Revoked write' });
  await started; server.revoke('trusted-agent'); release();
  assert.equal((await pending).isError, true);
  assert.equal((await f.current()).notes[0].comments.length, 2);
  assert.equal((await rpc(one, 'tools/list')).status, 401);
});

test('正文和评论草稿重新加载、任务隔离、清理与存储失败提示', async t => {
  const previous = globalThis.localStorage;
  const storage = new Map(); let fail = false;
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { if (fail) throw new Error('QuotaExceededError'); storage.set(key, value); },
    removeItem: key => storage.delete(key),
  };
  t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
  const first = createLoader()('src/stores/taskNoteDraftStore.ts');
  const note = { id: randomUUID(), title: 'Note', content: 'Saved', version: 2, comments: [{ body: 'Do not duplicate' }] };
  first.useTaskNoteDraftStore.getState().write({ taskId: 'one', original: note, title: note.title, content: 'Draft' });
  first.useTaskNoteDraftStore.getState().write({ taskId: 'two', original: note, title: note.title, content: 'Other task' });
  const comment = { id: randomUUID(), noteId: note.id, noteVersion: 2, startLine: 1, endLine: 1, quote: 'Saved', body: 'Comment draft' };
  first.useTaskNoteDraftStore.getState().writeComment('one', comment);
  const reloaded = createLoader()('src/stores/taskNoteDraftStore.ts');
  const key = first.taskNoteDraftKey('one', note.id);
  assert.equal(reloaded.useTaskNoteDraftStore.getState().drafts[key].content, 'Draft');
  assert.equal(reloaded.useTaskNoteDraftStore.getState().drafts[key].original.comments, undefined);
  assert.equal(reloaded.useTaskNoteDraftStore.getState().commentDrafts[key].body, 'Comment draft');
  fail = true;
  reloaded.useTaskNoteDraftStore.getState().writeComment('one', { ...comment, body: 'Still in memory' });
  assert.equal(reloaded.useTaskNoteDraftStorageStatus.getState().failed, true);
  assert.equal(reloaded.useTaskNoteDraftStore.getState().commentDrafts[key].body, 'Still in memory');
  fail = false;
  reloaded.useTaskNoteDraftStore.getState().clearTask('one');
  assert.equal(reloaded.useTaskNoteDraftStorageStatus.getState().failed, false);
  assert.equal(reloaded.useTaskNoteDraftStore.getState().drafts[key], undefined);
  assert.equal(reloaded.useTaskNoteDraftStore.getState().commentDrafts[key], undefined);
  assert.equal(Object.values(reloaded.useTaskNoteDraftStore.getState().drafts)[0].content, 'Other task');
});
