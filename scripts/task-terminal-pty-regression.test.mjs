import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import electron from "electron";

test("真实 PTY：空闲直接关闭、运行时确认和强制结束，其他终端不受影响", { timeout: 20000 }, async () => {
  if (process.platform === "win32") return;
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-pty-"));
  const runner = path.join(directory, "runner.mjs");
  const wrapper = path.join(directory, "wrapper.sh");
  await writeFile(wrapper, "trap 'exit 0' TERM\n/bin/bash -c 'trap \"\" TERM HUP; printf \"FORCE:%s\\n\" \"$$\"; exec /bin/sleep 30' &\nwait\n");
  await writeFile(runner, `import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLoader} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/helpers/load-typescript.mjs")).href)};
const service=createLoader()('src/main-process/services/terminal/terminalService.ts');
const owner=new EventEmitter();owner.id=19;owner.isDestroyed=()=>false;
let output='';owner.send=(channel,payload)=>{if(channel==='terminal:data')output+=payload.data;};
const wait=async check=>{for(let count=0;count<150;count++){if(check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('PTY timeout '+output);};
let resistantPid;
try {
  const shell={command:'/bin/bash',args:['--noprofile','--norc','+H'],env:process.env,onFinish:()=>{},retainOnExit:true};
  const open=id=>service.createTerminal({sessionId:id,cols:80,rows:24,cwd:${JSON.stringify(directory)}},owner,shell);
  const close=(id,mode)=>service.requestTerminalClose({sessionId:id},owner.id,mode);
  const exited=pid=>{try{process.kill(pid,0);return false;}catch{return true;}};
  open('test-pty');open('other-pty');
  service.writeTerminal({sessionId:'test-pty',data:"sleep 30 & CHILD_PID=$!; printf 'CHILD:%s\\\\n' \\\"$CHILD_PID\\\"; wait\\r"},owner.id);
  await wait(()=>/CHILD:(\\d+)/.test(output));
  const childPid=Number(output.match(/CHILD:(\\d+)/)[1]);assert.ok(childPid>1);
  assert.throws(()=>service.writeTerminal({sessionId:'test-pty',data:'bad'},99),/不存在/);
  output='';service.attachTerminal({sessionId:'test-pty',cols:90,rows:25},owner.id);
  assert.match(output,/CHILD:/);
  assert.deepEqual(await close('test-pty','inspect'),{kind:'confirm',program:'sleep'});
  assert.equal(exited(childPid),false);
  assert.deepEqual(await close('test-pty','confirm'),{kind:'closed'});
  await wait(()=>exited(childPid));
  output='';service.writeTerminal({sessionId:'other-pty',data:"printf 'OTHER_OK\\\\n'\\r"},owner.id);
  await wait(()=>output.includes('OTHER_OK'));
  assert.deepEqual(await close('other-pty','inspect'),{kind:'closed'});
  output='';open('force-pty');
  service.writeTerminal({sessionId:'force-pty',data:${JSON.stringify('/bin/bash "' + wrapper + '"\r')}},owner.id);
  await wait(()=>/FORCE:([0-9]+)/.test(output));
  resistantPid=Number(output.match(/FORCE:([0-9]+)/)[1]);
  assert.equal((await close('force-pty','inspect')).kind,'confirm');
  assert.equal((await close('force-pty','confirm')).kind,'needsForce');
  assert.equal(exited(resistantPid),false);
  assert.deepEqual(await close('force-pty','force'),{kind:'closed'});
  await wait(()=>exited(resistantPid));console.log('PTY_OK');
} finally {
  service.destroyAllTerminals();
  if (resistantPid) try { process.kill(resistantPid, 'SIGKILL'); } catch { /* Already stopped. */ }
}
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
