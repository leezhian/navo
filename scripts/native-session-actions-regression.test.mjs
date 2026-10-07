import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, lstat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLoader } from "./helpers/load-typescript.mjs";

const id="4890228e-d734-4c1a-a8a0-dcb661b8d5af";
const session={kind:"agent",nativeSessionId:id,cwd:"/fixture/repo",agent:{agentId:"grok"}};
const load=createLoader();
const {renameNativeSession,removeNativeSession,requireSessionName}=load("src/main-process/services/taskSessions/nativeSessionActions.ts");
const {readNativeSessionTitle}=load("src/main-process/services/taskSessions/nativeSessionTitle.ts");

test("原生改名：Grok 更新真实标题且保留其余元数据，Claude 追加 custom-title 而非改写历史", async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"navo-native-actions-"));
  try {
    const directory=path.join(root,"sessions",encodeURIComponent(session.cwd),id);
    await mkdir(directory,{recursive:true});
    const file=path.join(directory,"summary.json");
    await writeFile(file,JSON.stringify({info:{id,cwd:session.cwd},generated_title:"Before",keep:{value:42}}));
    await renameNativeSession(session,"After",{GROK_HOME:root});
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),"After");
    assert.deepEqual(JSON.parse(await readFile(file,"utf8")).keep,{value:42});
    const claude={...session,agent:{agentId:"claude"}};
    const project=path.join(root,"projects",session.cwd.replace(/[^a-zA-Z0-9]/g,"-"));
    await mkdir(project,{recursive:true});
    const transcript=path.join(project,id+".jsonl");
    const history=JSON.stringify({type:"user",sessionId:id,message:{content:"keep history"}});
    await writeFile(transcript,history);
    await renameNativeSession(claude,"Claude native name",{CLAUDE_CONFIG_DIR:root});
    assert.ok((await readFile(transcript,"utf8")).startsWith(history+"\n"));
    assert.equal(await readNativeSessionTitle(claude,{CLAUDE_CONFIG_DIR:root}),"Claude native name");
  }finally{await rm(root,{recursive:true,force:true});}
});

test("拒绝错误 ID、路径替换、控制字符和不支持的原生来源",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"navo-native-guards-"));
 try {
   for(const value of ["", "line\nnext", "x".repeat(161)])assert.throws(()=>requireSessionName(value),/INVALID_NAME/);
   const directory=path.join(root,"sessions",encodeURIComponent(session.cwd),id);
   await mkdir(directory,{recursive:true});
   const file=path.join(directory,"summary.json");
   await writeFile(file,JSON.stringify({info:{id:"other",cwd:session.cwd},generated_title:"Other"}));
   await assert.rejects(renameNativeSession(session,"Bad",{GROK_HOME:root}),/CHANGED/);
   await assert.rejects(removeNativeSession(session,{GROK_HOME:root},"/mock/grok"),/CHANGED/);
   const outside=path.join(root,"outside.json");await writeFile(outside,"keep");await rm(file);await symlink(outside,file);
   await assert.rejects(renameNativeSession(session,"Bad",{GROK_HOME:root}),/CHANGED/);
   assert.equal(await readFile(outside,"utf8"),"keep");
   await assert.rejects(removeNativeSession({...session,agent:{agentId:"codex"}},{GROK_HOME:root}),/UNSUPPORTED/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test("Grok 删除使用官方 CLI，退出码成功但历史未移除时不得伪造成功",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"navo-grok-remove-"));
 try {
   const directory=path.join(root,"sessions",encodeURIComponent(session.cwd),id);
   await mkdir(directory,{recursive:true});await writeFile(path.join(directory,"summary.json"),JSON.stringify({info:{id,cwd:session.cwd}}));
   const calls=[];let deleteFiles=false;
   const actions=createLoader({"../agents/agentEnvironment":{runAgentProbe:async(_binary,args)=>{
     calls.push(args);if(args.includes("--help"))return {code:0,stdout:"Usage: grok sessions delete [OPTIONS] <ID>",stderr:""};
     if(deleteFiles)await rm(directory,{recursive:true});
     return {code:0,stdout:"Done",stderr:""};
   }}})("src/main-process/services/taskSessions/nativeSessionActions.ts");
   await assert.rejects(actions.removeNativeSession(session,{GROK_HOME:root},"/fixture/grok"),/DELETE_FAILED/);
   deleteFiles=true;await actions.removeNativeSession(session,{GROK_HOME:root},"/fixture/grok");
   assert.deepEqual(calls[1],["sessions","delete",id]);
   await assert.rejects(lstat(directory));
 }finally{await rm(root,{recursive:true,force:true});}
});

test("Claude 删除只移除精确会话 transcript、子记录及索引项，保留其他会话",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"navo-claude-remove-"));
 try {
   const project=path.join(root,"projects",session.cwd.replace(/[^a-zA-Z0-9]/g,"-"));
   const sidecar=path.join(project,id);await mkdir(sidecar,{recursive:true});
   await writeFile(path.join(sidecar,"subagent.jsonl"),"owned");
   const target=path.join(project,id+".jsonl");
   await writeFile(target,JSON.stringify({type:"user",sessionId:id}));
   await writeFile(path.join(project,"other.jsonl"),"keep");
   await writeFile(path.join(project,"sessions-index.json"),JSON.stringify({version:1,entries:[{sessionId:id},{sessionId:"other"}]}));
   await removeNativeSession({...session,agent:{agentId:"claude"}},{CLAUDE_CONFIG_DIR:root});
   await assert.rejects(lstat(target));await assert.rejects(lstat(sidecar));
   assert.equal(await readFile(path.join(project,"other.jsonl"),"utf8"),"keep");
   assert.deepEqual(JSON.parse(await readFile(path.join(project,"sessions-index.json"),"utf8")).entries,[{sessionId:"other"}]);
   await removeNativeSession({...session,agent:{agentId:"claude"}},{CLAUDE_CONFIG_DIR:root});
 }finally{await rm(root,{recursive:true,force:true});}
});

test("主记录缺失但仍有原生历史时拒绝伪造删除成功",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"navo-native-partial-"));
  try {
    const grokDirectory=path.join(root,"sessions",encodeURIComponent(session.cwd),id);
    await mkdir(grokDirectory,{recursive:true});
    await writeFile(path.join(grokDirectory,"chat.json"),"keep history");
    await assert.rejects(removeNativeSession(session,{GROK_HOME:root},"/fixture/grok"),/NATIVE_MISSING/);
    assert.equal(await readFile(path.join(grokDirectory,"chat.json"),"utf8"),"keep history");
    const project=path.join(root,"projects",session.cwd.replace(/[^a-zA-Z0-9]/g,"-"));
    const sidecar=path.join(project,id);await mkdir(sidecar,{recursive:true});
    const claude={...session,agent:{agentId:"claude"}};
    await assert.rejects(removeNativeSession(claude,{CLAUDE_CONFIG_DIR:root}),/NATIVE_MISSING/);
    await rm(sidecar,{recursive:true});
    await writeFile(path.join(project,"sessions-index.json"),JSON.stringify({entries:[{sessionId:id},{sessionId:"other"}]}));
    await removeNativeSession(claude,{CLAUDE_CONFIG_DIR:root});
    assert.deepEqual(JSON.parse(await readFile(path.join(project,"sessions-index.json"),"utf8")).entries,[{sessionId:"other"}]);
  } finally {await rm(root,{recursive:true,force:true});}
});
