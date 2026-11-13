import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import electron from "electron";

test("真实 PTY：附着重放、输入、隔离和关闭终止前台子命令", { timeout: 20000 }, async () => {
  if (process.platform === "win32") return;
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-pty-"));
  const runner = path.join(directory, "runner.mjs");
  await writeFile(runner, `import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLoader} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/helpers/load-typescript.mjs")).href)};
const service=createLoader()('src/main-process/services/terminal/terminalService.ts');
const owner=new EventEmitter();owner.id=19;owner.isDestroyed=()=>false;
let output='';owner.send=(channel,payload)=>{if(channel==='terminal:data')output+=payload.data;};
const wait=async check=>{for(let count=0;count<150;count++){if(check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('PTY timeout '+output);};
try {
  service.createTerminal({sessionId:'test-pty',cols:80,rows:24,cwd:${JSON.stringify(directory)}},owner,{command:'/bin/bash',args:['--noprofile','--norc','+H'],env:process.env,onFinish:()=>{}});
  service.createTerminal({sessionId:'other-pty',cols:80,rows:24,cwd:${JSON.stringify(directory)}},owner,{command:'/bin/bash',args:['--noprofile','--norc','+H'],env:process.env,onFinish:()=>{}});
  service.writeTerminal({sessionId:'test-pty',data:"sleep 30 & CHILD_PID=$!; printf 'CHILD:%s\\\\n' \\\"$CHILD_PID\\\"; wait\\r"},owner.id);
  await wait(()=>/CHILD:(\\d+)/.test(output));
  const childPid=Number(output.match(/CHILD:(\\d+)/)[1]);assert.ok(childPid>1);
  assert.throws(()=>service.writeTerminal({sessionId:'test-pty',data:'bad'},99),/不存在/);
  output='';service.attachTerminal({sessionId:'test-pty',cols:90,rows:25},owner.id);
  assert.match(output,/CHILD:/);
  service.destroyTerminal({sessionId:'test-pty'},owner.id);
  await wait(()=>{try{process.kill(childPid,0);return false;}catch{return true;}});
  output='';service.writeTerminal({sessionId:'other-pty',data:"printf 'OTHER_OK\\\\n'\\r"},owner.id);
  await wait(()=>output.includes('OTHER_OK'));console.log('PTY_OK');
} finally {service.destroyAllTerminals();}
`);
  let child;
  try {
    let output = "";
    child = spawn(electron, [runner], { cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
    const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
    assert.equal(code, 0, output); assert.match(output, /PTY_OK/);
  } finally { child?.kill("SIGKILL"); await rm(directory, { recursive: true, force: true }); }
});
