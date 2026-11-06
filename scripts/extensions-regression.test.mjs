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
const manifest={id:'session-trace',version:'0.1.0',apiVersion:1,hostMajor:1,ui:'ui/index.html',runtime:'runtime/index.cjs'};
function bundle(files={'ui/index.html':'<p>trace</p>','runtime/index.cjs':'module.exports={}'}) {const bytes=Buffer.from(JSON.stringify({manifest,files}));return {bytes,release:{version:manifest.version,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,url:'https://github.com/leezhian/navo/releases/download/test/test'}};}
async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'navo-extensions-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}

test('package requires a host-pinned digest, expected manifest and contained UTF-8 entries',()=>{
 const {bytes,release}=bundle();assert.equal(decodePackage(bytes,release).manifest.id,'session-trace');
 assert.throws(()=>decodePackage(Buffer.from(bytes.toString().replace('trace</p>','other</p>')),release),/PACKAGE_INVALID/);
 for(const name of ['ui/../escape.js','ui//bad.js','/ui/file.js','runtime/../../file','ui/./x','ui/\\x']){const bad=bundle({'ui/index.html':'ok','runtime/index.cjs':'ok',[name]:'bad'});assert.throws(()=>decodePackage(bad.bytes,bad.release),/PACKAGE_INVALID/);}
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
 for(const query of [{kind:'delete'}, {kind:'page',limit:100000}, {kind:'detail',eventId:-1}, {kind:'page',search:'x'.repeat(501)}])assert.throws(()=>validateTraceQuery(query),/INVALID_QUERY/);
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
      const cancelled = assert.rejects(runtime.open('session', 1, id), /LEASE_EXPIRED/);
      await cancel(id);
      resolveSession(session);
      await cancelled;
      assert.equal(children.length, 0, 'Cancelling metadata lookup must prevent a later process launch');
    }
    metadata = Promise.resolve(session);
    const firstId = randomUUID(), secondId = randomUUID();
    const first = runtime.open('session', 1, firstId), second = runtime.open('session', 2, secondId);
    const firstCancelled = assert.rejects(first, /LEASE_EXPIRED/);
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
    const lastCancelled = assert.rejects(runtime.open('session', 1, lastId), /LEASE_EXPIRED/);
    await tick();
    runtime.close(lastId, 1);
    assert.equal(children[1].killed, true, 'The last view must stop indexing without waiting for its first response');
    await lastCancelled;
    children[1].emit('message', { id: children[1].openMessage.id, result: true });
  } finally {
    await runtime.closeAll();
  }
});
