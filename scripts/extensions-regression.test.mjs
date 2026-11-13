import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { createLoader } from './helpers/load-typescript.mjs';

const load=createLoader();
const {ExtensionRepository}=load('src/main-process/services/extensions/extensionRepository.ts');
const {ExtensionService}=load('src/main-process/services/extensions/extensionService.ts');
const {decodePackage}=load('src/main-process/services/extensions/extensionPackage.ts');
const manifest={id:'session-trace',version:'0.1.0',apiVersion:1,hostMajor:1,runtime:'runtime/index.cjs'};
function bundle(files={'runtime/index.cjs':'module.exports={}'}) {const bytes=Buffer.from(JSON.stringify({manifest,files}));return {bytes,release:{version:manifest.version,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,url:'https://github.com/leezhian/navo/releases/download/test/test'}};}
async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'navo-extensions-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}

test('package requires a host-pinned digest, expected manifest and contained UTF-8 entries',()=>{
 const {bytes,release}=bundle();assert.equal(decodePackage(bytes,release).manifest.id,'session-trace');
 assert.throws(()=>decodePackage(Buffer.from(bytes.toString().replace('module.exports={}','module.exports={tampered:1}')),release),/PACKAGE_INVALID/);
 for(const name of ['runtime/../escape.js','runtime//bad.js','/runtime/file.js','runtime/../../file','runtime/./x','runtime/\\x','ui/index.html']){const bad=bundle({'runtime/index.cjs':'ok',[name]:'bad'});assert.throws(()=>decodePackage(bad.bytes,bad.release),/PACKAGE_INVALID/);}
 const uiPkg=bundle({'runtime/index.cjs':'ok','ui/index.html':'<p>no</p>'});
 assert.throws(()=>decodePackage(uiPkg.bytes,uiPkg.release),/PACKAGE_INVALID/);
 const oldManifest={...manifest,ui:'ui/index.html'}; const oldBytes=Buffer.from(JSON.stringify({manifest:oldManifest,files:{'ui/index.html':'<p>trace</p>','runtime/index.cjs':'module.exports={}'}}));
 const oldRelease={version:manifest.version,sha256:createHash('sha256').update(oldBytes).digest('hex'),bytes:oldBytes.length,url:'https://github.com/leezhian/navo/releases/download/test/test'};
 assert.throws(()=>decodePackage(oldBytes,oldRelease),/INCOMPATIBLE/);
});

test('install, enable, disable, restart and uninstall preserve source history',()=>fixture(async root=>{
 const {bytes,release}=bundle(),pkg=path.join(root,'official.navo-extension');await writeFile(pkg,bytes);
 const original=path.join(root,'native-history.jsonl');await writeFile(original,'keep');
 const repository=new ExtensionRepository(path.join(root,'app.db'),'test');let stopped=0;const statuses=[];
 const service=new ExtensionService(path.join(root,'extension'),repository,release,s=>statuses.push(s),()=>stopped++);
 await service.initialize();assert.equal(service.status.version,null);assert.equal(service.status.enabled,false);
 await service.install(pkg);assert.equal(service.status.version,'0.1.0');assert.equal(service.status.enabled,false);assert.ok(statuses.some(s=>s.operation==='installing'));
 await service.setEnabled(true);assert.equal(service.status.enabled,true);
 const restarted=new ExtensionService(service.directory,repository,release,()=>{},()=>{});await restarted.initialize();assert.equal(restarted.status.enabled,true);
 await service.setEnabled(false);assert.equal(stopped,1);await access(service.installedDirectory);
 await service.uninstall();assert.equal(service.status.version,null);assert.equal(service.status.enabled,false);assert.equal(await readFile(original,'utf8'),'keep');await assert.rejects(access(service.installedDirectory));
 assert.deepEqual(await repository.load(),{version:null,enabled:false,operation:'idle'});
}));

test('tampered installed code cannot be enabled; interrupted install is reconciled',()=>fixture(async root=>{
 const {bytes,release}=bundle(),pkg=path.join(root,'official.navo-extension');await writeFile(pkg,bytes);
 const repository=new ExtensionRepository(path.join(root,'app.db'),'test');const directory=path.join(root,'extension');
 const service=new ExtensionService(directory,repository,release,()=>{},()=>{});await service.initialize();await service.install(pkg);
 await writeFile(path.join(service.installedDirectory,'runtime/index.cjs'),'tampered');await assert.rejects(service.setEnabled(true),/PACKAGE_INVALID/);assert.equal(service.status.enabled,false);
 await service.uninstall();await repository.save({version:null,enabled:false,operation:'installing'});await mkdir(path.join(directory,'staging'),{recursive:true});await mkdir(path.join(directory,'installed'),{recursive:true});
 const next=new ExtensionService(directory,repository,release,()=>{},()=>{});await next.initialize();assert.equal(next.status.operation,'idle');await assert.rejects(access(next.installedDirectory));
}));

test('concurrent operations are rejected, cancellation cleans the incomplete package',()=>fixture(async root=>{
 const {release}=bundle(),repository=new ExtensionRepository(path.join(root,'app.db'),'test');
 const service=new ExtensionService(path.join(root,'extension'),repository,release,()=>{},()=>{});await service.initialize();
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});if(signal.aborted)reject(signal.reason);});
 try {const installing=service.install();await assert.rejects(service.setEnabled(true),/BUSY/);service.cancel();await installing;assert.equal(service.status.version,null);assert.equal(service.status.operation,'idle');}
 finally{globalThis.fetch=originalFetch;}
}));

test('initial installation record write failure restores a retryable state without restarting',()=>fixture(async root=>{
 const {bytes,release}=bundle(),pkg=path.join(root,'official.navo-extension');await writeFile(pkg,bytes);
 const original=new ExtensionRepository(path.join(root,'app.db'),'test');let failWrites=true;
 const repository={load:()=>original.load(),save:value=>{if(failWrites)throw Error('SQLITE_BUSY');return original.save(value);}};
 const statuses=[];const service=new ExtensionService(path.join(root,'extension'),repository,release,status=>statuses.push(status),()=>{});await service.initialize();
 await assert.rejects(service.install(pkg),/OPERATION_FAILED/);assert.equal(service.status.operation,'idle');assert.equal(service.status.version,null);assert.equal(service.status.progress,0);
 await assert.rejects(service.install(pkg),/OPERATION_FAILED/);assert.equal(statuses.at(-1).operation,'idle');assert.equal((await original.load()).operation,'idle');
 service.cancel();failWrites=false;await service.install(pkg);assert.equal(service.status.version,'0.1.0');assert.equal(service.status.enabled,false);await service.uninstall();
}));

test('runtime leases share a process, bind windows and revoke access before teardown',async()=>{
 const children=[];
 const loadRuntime=createLoader({electron:{utilityProcess:{fork:()=>{
  const child=new EventEmitter();child.postMessage=data=>queueMicrotask(()=>child.emit('message',{id:data.id,result:data.type==='open'?true:{events:[],total:0}}));
  child.kill=()=>{child.killed=true;queueMicrotask(()=>child.emit('exit',0));return true;};children.push(child);return child;
 }}}});
 const {TraceRuntime,validateTraceQuery}=loadRuntime('src/main-process/services/extensions/traceRuntime.ts');
 const status={enabled:true,compatible:true,operation:'idle'};
 const extension={status,directory:'/isolated/trace-test',installedDirectory:'/isolated/trace-test/installed',reportRuntimeFailure(){}};
 let exists=true;const session={id:'session',kind:'agent',nativeSessionId:'12345678-1234-1234-1234-123456789abc',nativeHistoryRoot:'/isolated/native',cwd:'/isolated/work',agent:{agentId:'claude'},createdAt:'2026-11-06T00:00:00Z'};
 const notifications=[];const runtime=new TraceRuntime(()=>extension,async()=>exists?session:undefined,(owner,update)=>notifications.push({owner,update}));
 const first=await runtime.open('session',1,randomUUID()),second=await runtime.open('session',2,randomUUID());assert.equal(children.length,1);
 await assert.rejects(runtime.query(first.id,{kind:'page'},2),/LEASE_EXPIRED/);
 runtime.close(first.id,2);assert.equal((await runtime.query(first.id,{kind:'page'},1)).total,0);
 runtime.close(first.id,1);assert.equal(children[0].killed,undefined);
 status.enabled=false;await runtime.closeAll();assert.equal(children[0].killed,true);assert.equal(notifications.at(-1).owner,2);
 await assert.rejects(runtime.query(second.id,{kind:'page'},2),/EXTENSION_DISABLED/);
 status.enabled=true;const third=await runtime.open('session',1,randomUUID());exists=false;await assert.rejects(runtime.query(third.id,{kind:'page'},1),/SESSION_MISSING/);await runtime.closeAll();
 for(const query of [{kind:'delete'}, {kind:'page',limit:100000}, {kind:'detail',eventId:-1}, {kind:'page',search:'x'.repeat(501)}, {kind:'timeline',showBookkeeping:'yes'}, {kind:'page',hitIds:[-1]}, {kind:'page',hitIds:[0]}, {kind:'page',hitIds:['1']}, {kind:'page',hitIds:1}, {kind:'page',hitIds:Array.from({length:1001},(_,index)=>index+1)}])assert.throws(()=>validateTraceQuery(query),/INVALID_QUERY/);
 // contextBridge 会把未设置的布尔字段变成 null，默认关闭「显示全部」时必须仍能查询。
 for(const query of [{kind:'timeline'}, {kind:'timeline',showBookkeeping:undefined}, {kind:'timeline',showBookkeeping:null}, {kind:'timeline',showBookkeeping:false}, {kind:'page',limit:80,offset:0,filter:'all',search:'',showBookkeeping:null}, {kind:'page',limit:80,offset:80,filter:'tool',search:'',eventId:null,showBookkeeping:null}, {kind:'page',filter:null,search:null,offset:null,limit:null}, {kind:'page',from:null,to:null}, {kind:'page',from:'2026-11-06T08:00:00.000Z',to:'2026-11-06T08:00:05.000Z'}, {kind:'page',hitIds:[1]}, {kind:'page',hitIds:null}, {kind:'page',hitIds:[]}])validateTraceQuery(query);
 assert.throws(()=>validateTraceQuery({kind:'detail',eventId:null}),/INVALID_QUERY/);
 for(const query of [{kind:'page',from:'2026-11-06T08:00:00.000Z'}, {kind:'page',to:'2026-11-06T08:00:05.000Z'}, {kind:'page',from:'not-a-date',to:'2026-11-06T08:00:05.000Z'}, {kind:'page',from:'2026-11-06T08:00:05.000Z',to:'2026-11-06T08:00:00.000Z'}, {kind:'page',from:'2026-11-06T08:00:00.000Z',to:'2026-11-06T08:00:00.000Z'}])assert.throws(()=>validateTraceQuery(query),/INVALID_QUERY/);
});


test('trace open, query and parser failures are written to the diagnostic log without trace content', async () => {
  const children = [], logged = [];
  const { makeDiagnosticEntry } = createLoader()('src/main-process/diagnostics/diagnosticSanitizer.ts');
  const loadRuntime = createLoader({
    electron: { utilityProcess: { fork: () => {
      const child = new EventEmitter();
      child.postMessage = data => queueMicrotask(() => child.emit('message', { id: data.id, result: data.type === 'open' ? true : { events: [], total: 0 } }));
      child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('exit', 0)); return true; };
      children.push(child);
      return child;
    } } },
    '../../diagnostics/diagnosticLogger': { writeDiagnosticEvent: (event, metadata) => { logged.push(makeDiagnosticEntry(event, metadata)); return Promise.resolve(); } },
  });
  const { TraceRuntime } = loadRuntime('src/main-process/services/extensions/traceRuntime.ts');
  const extension = { status: { enabled: true, compatible: true, operation: 'idle', version: '0.1.0' }, directory: '/isolated/trace-log', installedDirectory: '/isolated/trace-log/installed', reportRuntimeFailure() {} };
  const sessionId = randomUUID(), taskId = randomUUID(), secret = 'DO_NOT_LOG_TRACE_SECRET';
  const session = { id: sessionId, taskId, kind: 'agent', nativeSessionId: '12345678-1234-1234-1234-123456789abc', nativeHistoryRoot: '/isolated/' + secret, cwd: '/isolated/work', agent: { agentId: 'claude' }, createdAt: '2026-11-06T00:00:00Z' };
  let current = { ...session, nativeSessionId: undefined };
  const runtime = new TraceRuntime(() => extension, async () => current, () => {});
  await assert.rejects(runtime.open(sessionId, 1, randomUUID()), /IDENTITY_PENDING/);
  let entry = logged.at(-1);
  assert.equal(entry.event, 'trace.open_failed'); assert.equal(entry.level, 'WARN'); assert.equal(entry.error.code, 'IDENTITY_PENDING');
  assert.deepEqual([entry.data.extensionId, entry.data.version, entry.data.taskId, entry.data.sessionId], ['session-trace', '0.1.0', taskId, sessionId]);
  current = session;
  const lease = await runtime.open(sessionId, 1, randomUUID());
  await assert.rejects(runtime.query(lease.id, { kind: 'page', search: secret, showBookkeeping: 'yes' }, 1), /INVALID_QUERY/);
  entry = logged.at(-1);
  assert.equal(entry.event, 'trace.query_failed'); assert.equal(entry.level, 'ERROR'); assert.equal(entry.error.code, 'INVALID_QUERY');
  assert.deepEqual([entry.data.queryKind, entry.data.taskId, entry.data.sessionId], ['page', taskId, sessionId]);
  const before = logged.length;
  await assert.rejects(runtime.query(lease.id, { kind: 'page' }, 2), /LEASE_EXPIRED/);
  assert.equal(logged.length, before, 'Expired leases are a normal close race and must not be logged');
  children[0].emit('message', { type: 'failed', error: 'SOURCE_UNREADABLE' });
  entry = logged.at(-1);
  assert.equal(entry.event, 'trace.runtime_exited'); assert.equal(entry.error.code, 'SOURCE_UNREADABLE'); assert.equal(entry.data.taskId, taskId);
  await new Promise(resolve => setImmediate(resolve));
  await runtime.open(sessionId, 1, randomUUID());
  children[1].emit('exit', 9);
  entry = logged.at(-1);
  assert.equal(entry.event, 'trace.runtime_exited'); assert.equal(entry.error.code, 'RUNTIME_FAILED'); assert.equal(entry.data.exitCode, 9);
  assert.doesNotMatch(JSON.stringify(logged), new RegExp(secret + '|/isolated/'));
  await runtime.closeAll();
});

test('closing the last lease stops the parser, and reopening the same session starts a fresh shared process', async () => {
  const children = [];
  const loadRuntime = createLoader({ electron: { utilityProcess: { fork: () => {
    const child = new EventEmitter();
    child.postMessage = data => queueMicrotask(() => child.emit('message', { id: data.id, result: data.type === 'open' ? true : { events: [], total: 0 } }));
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('exit', 0)); return true; };
    children.push(child);
    return child;
  } } } });
  const { TraceRuntime } = loadRuntime('src/main-process/services/extensions/traceRuntime.ts');
  const extension = {
    status: { enabled: true, compatible: true, operation: 'idle' },
    directory: '/isolated/trace-test', installedDirectory: '/isolated/trace-test/installed', reportRuntimeFailure() { throw Error('intentional stop must not report RUNTIME_FAILED'); },
  };
  const session = {
    id: 'session', kind: 'agent', nativeSessionId: '12345678-1234-1234-1234-123456789abc', nativeHistoryRoot: '/isolated/native',
    cwd: '/isolated/work', agent: { agentId: 'claude' }, createdAt: '2026-11-06T00:00:00Z',
  };
  const notifications = [];
  const runtime = new TraceRuntime(() => extension, async () => session, (owner, update) => notifications.push({ owner, update }));
  const firstId = randomUUID();
  const first = await runtime.open('session', 1, firstId);
  assert.equal(children.length, 1);
  runtime.close(first.id, 1);
  // stop() 同步 kill，exit 以 microtask 发出；等两拍确保 stopping Promise 落地后再 reopen。
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(children[0].killed, true, 'Last lease must stop the parser');
  assert.equal(notifications.some(item => item.update.error === 'RUNTIME_FAILED'), false, 'Intentional close must not notify RUNTIME_FAILED');
  const second = await runtime.open('session', 1, randomUUID());
  assert.equal(children.length, 2, 'Reopen after last close must start a new parser process');
  assert.equal((await runtime.query(second.id, { kind: 'page' }, 1)).total, 0);
  await runtime.closeAll();
});

test('pending trace opens can be cancelled before metadata resolves or initial indexing finishes', async () => {
  const children = [];
  const loadRuntime = createLoader({ electron: { utilityProcess: { fork: () => {
    const child = new EventEmitter();
    child.postMessage = message => { child.openMessage = message; };
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('exit', 0)); return true; };
    children.push(child);
    return child;
  } } } });
  const { TraceRuntime } = loadRuntime('src/main-process/services/extensions/traceRuntime.ts');
  const extension = {
    status: { enabled: true, compatible: true, operation: 'idle' },
    directory: '/isolated/trace-test', installedDirectory: '/isolated/trace-test/installed', reportRuntimeFailure() {},
  };
  const session = {
    id: 'session', kind: 'agent', nativeSessionId: randomUUID(), nativeHistoryRoot: '/isolated/native',
    cwd: '/isolated/work', agent: { agentId: 'claude' }, createdAt: '2026-11-06T00:00:00Z',
  };
  let resolveSession;
  let metadata = new Promise(resolve => { resolveSession = resolve; });
  const runtime = new TraceRuntime(() => extension, () => metadata, () => {});
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    for (const cancel of [id => runtime.close(id, 1), () => runtime.closeOwner(1), () => runtime.closeAll()]) {
      metadata = new Promise(resolve => { resolveSession = resolve; });
      const id = randomUUID();
      const cancelled = runtime.open('session', 1, id);
      await cancel(id);
      resolveSession(session);
      assert.deepEqual(await cancelled, { cancelled: true });
      assert.equal(children.length, 0, 'Cancelling metadata lookup must prevent a later process launch');
    }
    metadata = Promise.resolve(session);
    const firstId = randomUUID(), secondId = randomUUID();
    const first = runtime.open('session', 1, firstId), second = runtime.open('session', 2, secondId);
    const firstCancelled = first.then(result => assert.deepEqual(result, { cancelled: true }));
    await tick();
    assert.equal(children.length, 1);
    await assert.rejects(runtime.open('session', 2, firstId), /INVALID_QUERY/);
    runtime.close(firstId, 2);
    assert.equal(children[0].killed, undefined, 'Another window cannot cancel the request');
    runtime.close(firstId, 1);
    assert.equal(children[0].killed, undefined, 'The remaining view still needs the shared parser');
    children[0].emit('message', { id: children[0].openMessage.id, result: true });
    await firstCancelled;
    assert.equal((await second).id, secondId);
    runtime.close(secondId, 2);
    await runtime.closeAll();

    const lastId = randomUUID();
    const lastCancelled = runtime.open('session', 1, lastId).then(result => assert.deepEqual(result, { cancelled: true }));
    await tick();
    runtime.close(lastId, 1);
    assert.equal(children[1].killed, true, 'The last view must stop indexing without waiting for its first response');
    await lastCancelled;
    children[1].emit('message', { id: children[1].openMessage.id, result: true });
  } finally {
    await runtime.closeAll();
  }
});
