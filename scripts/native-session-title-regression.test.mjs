import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const {readNativeSessionTitle} = createLoader()("src/main-process/services/taskSessions/nativeSessionTitle.ts");
const nativeSessionId = "3211c729-32c4-47d1-bde3-a89b73ea021d";
const session = {kind:"agent",cwd:"/test/project",nativeSessionId,agent:{agentId:"grok"}};

test("Grok 名称来自精确 ID 和目录匹配的 generated_title，不使用 prompt 或其他会话摘要", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),"navo-native-title-"));
  try {
    const directory = path.join(root,"sessions",encodeURIComponent(session.cwd),nativeSessionId);
    await mkdir(directory,{recursive:true});
    const filename = path.join(directory,"summary.json");
    const write = value => writeFile(filename,JSON.stringify(value));
    const info = {id:nativeSessionId,cwd:session.cwd};
    await write({info,generated_title:"Real CLI session name",session_summary:"Not the session name"});
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),"Real CLI session name");
    await write({info,generated_title:"Renamed in CLI"});
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),"Renamed in CLI");
    await write({info,session_summary:"Never treat this as a name"});
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),null);
    await write({info:{...info,id:"other"},generated_title:"Wrong session"});
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),null);
    await write({info:{...info,cwd:"/other"},generated_title:"Wrong workspace"});
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),null);
    await writeFile(filename,"{partial");
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),null);
    await write({info,generated_title:"Title\u001b[0m"});
    assert.equal(await readNativeSessionTitle(session,{GROK_HOME:root}),null);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("Claude 优先用户改名，其次 CLI 生成标题，不读取用户首条消息充当名称", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),"navo-native-claude-title-"));
  try {
    const directory = path.join(root,"projects",session.cwd.replace(/[^a-zA-Z0-9]/g,"-"));
    await mkdir(directory,{recursive:true});
    const filename = path.join(directory,nativeSessionId+".jsonl");
    const claude = {...session,agent:{agentId:"claude"}};
    const write = records => writeFile(filename,records.map(record=>JSON.stringify(record)).join("\n"));
    await write([{type:"ai-title",aiTitle:"Generated title",sessionId:nativeSessionId},{type:"custom-title",customTitle:"User title",sessionId:nativeSessionId},{type:"custom-title",customTitle:"Other title",sessionId:"other"}]);
    assert.equal(await readNativeSessionTitle(claude,{CLAUDE_CONFIG_DIR:root}),"User title");
    await write([{type:"ai-title",aiTitle:"Generated title",sessionId:nativeSessionId}]);
    assert.equal(await readNativeSessionTitle(claude,{CLAUDE_CONFIG_DIR:root}),"Generated title");
    await write([{type:"user",message:{content:"Task prompt"},sessionId:nativeSessionId}]);
    assert.equal(await readNativeSessionTitle(claude,{CLAUDE_CONFIG_DIR:root}),null);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("无精确原生标识及不支持的来源返回空值，不推断最近会话", async () => {
  assert.equal(await readNativeSessionTitle({...session,nativeSessionId:"../../somewhere"}),null);
  assert.equal(await readNativeSessionTitle({...session,agent:{agentId:"codex"}}),null);
  assert.equal(await readNativeSessionTitle({...session,agent:{agentId:"antigravity"}}),null);
});
