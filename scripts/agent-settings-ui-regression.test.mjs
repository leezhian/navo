import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("Agent 设置：稳定首屏、四种 CLI、路径保存、命令确认、串行更新与取消", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-agents-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error",
    plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, worker: { format: "es" }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__agents", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__agents", `<div id="root"></div><script type="module">
      import React from 'react'; import {createRoot} from 'react-dom/client'; import '/src/App.css';
      import i18n from '/src/i18n/index.ts'; import {SettingsPanel} from '/src/components/settings/SettingsPanel.tsx';
      import {defaultSettings} from '/src/domain/settings.ts'; import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      await i18n.changeLanguage('zh-CN'); window.setLocale=locale=>i18n.changeLanguage(locale);
      let snapshot={defaultAgent:null,secureStorageAvailable:true,configurations:['claude','codex','grok','antigravity'].map(id=>({id,enabled:true,customPath:'',args:[],environmentNames:id==='claude'?['EXISTING_TOKEN']:[]}))};
      window.starts=[]; window.plans=[]; window.saved=[]; window.scans=0; const exits=new Set(); const output=new Set();
      window.navo={settings:{getLogsStatus:async()=>({failed:false})},agents:{
        load:async()=>{if(!window.loaded){await new Promise(resolve=>window.releaseLoad=resolve);window.loaded=true;}return structuredClone(snapshot);}, scan:async()=>{window.scans++;if(window.scans===1)await new Promise(resolve=>window.releaseScan=resolve);if(window.holdScan){await new Promise(resolve=>window.resumeScan=resolve);window.holdScan=false;}return snapshot.configurations.map(config=>({id:config.id,status:config.id==='codex'?'missing':'installed',binaryPath:config.id==='codex'?null:config.customPath||'/test/'+config.id,version:config.id==='codex'?null:'1.2.3',source:'path',auth:config.id==='claude'?'signedIn':'unknown',actions:config.id==='codex'?['install']:config.id==='antigravity'?['manageLogin']:['login','logout','update']}));},
        save:async input=>{window.saved.push(input);if(window.failSave)throw new Error('AGENT_STORAGE_FAILED');if(input.customPath==='/test/invalid')throw new Error('AGENT_INVALID_PATH');snapshot.configurations=snapshot.configurations.map(config=>config.id===input.id?{id:input.id,enabled:input.enabled,customPath:input.customPath,args:input.args,environmentNames:input.environment.map(entry=>entry.name)}:config);return structuredClone(snapshot);},
        setDefault:async id=>{snapshot.defaultAgent=id;return structuredClone(snapshot);},chooseBinary:async()=>window.chooseResult===undefined?'/test/chosen-cli':window.chooseResult,openDocumentation:async()=>{},
        prepare:async(id,action)=>{const plan={id,action,token:crypto.randomUUID(),command:id+' '+action};window.plans.push(plan);return plan;},discardPlans:async()=>{},
        startOperation:async params=>{window.starts.push(params);for(const listener of output)listener({sessionId:params.sessionId,data:'TEST CLI OUTPUT\\r\\n'});},
      },terminal:{create:async()=>{throw new Error('Must not create a plain shell');},write:async()=>{},resize:async()=>{},destroy:async params=>{window.destroyed=params.sessionId;},onData:listener=>{output.add(listener);return()=>output.delete(listener);},onExit:listener=>{exits.add(listener);return()=>exits.delete(listener);}}};
      window.finish=code=>{const last=window.starts.at(-1);for(const listener of exits)listener({sessionId:last.sessionId,exitCode:code});};
      createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(TooltipProvider,null,React.createElement(SettingsPanel,{settings:defaultSettings,resolvedTheme:'light',updateSettings:()=>{}}))));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, "user-data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const window=new BrowserWindow({show:false,width:1100,height:950,webPreferences:{backgroundThrottling:false}});
      window.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
      try {await window.loadURL(${JSON.stringify("http://127.0.0.1:" + server.httpServer.address().port + "/__agents")});
      await window.webContents.executeJavaScript(\`(async()=>{
        const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
        async function wait(check,message){const end=Date.now()+8000;while(Date.now()<end){if(check())return;await pause();}throw new Error(message);}
        const button=(label,root=document)=>[...root.querySelectorAll('button')].find(item=>item.textContent.trim()===label);
        const dialog=()=>document.querySelector('[role="dialog"]');
        await wait(()=>button('Agents'),'Missing settings navigation');button('Agents').click();
        await wait(()=>window.releaseScan && window.releaseLoad,'Initial requests must start');
        if(document.querySelectorAll('.settings-list[aria-label]').length!==4)throw new Error('Initial detection must keep four cards visible instead of replacing the list with loading text');
        if(document.body.textContent.includes('正在检测') || document.body.textContent.includes('未安装'))throw new Error('Pending detection must not show loading text or a false missing state');
        const initialCard=document.querySelector('section[aria-label="Claude Code"]');
        const initialHeight=initialCard.getBoundingClientRect().height;
        window.releaseLoad();window.releaseScan();
        await wait(()=>initialCard.textContent.includes('已登录'),'Initial detection did not finish');
        if(initialCard!==document.querySelector('section[aria-label="Claude Code"]') || initialCard.getBoundingClientRect().height!==initialHeight)throw new Error('Detection must update cards in place without changing installed card height');
        await wait(()=>document.querySelector('section[aria-label="Claude Code"]'),'Missing four CLI cards');
        if(document.querySelectorAll('.settings-list[aria-label]').length!==4)throw new Error('Must support only four agents');
        if(document.body.textContent.includes('Rich chat')||document.body.textContent.includes('添加账号'))throw new Error('Unsupported mode/account controls must be absent');
        if(window.scans!==1)throw new Error('StrictMode must not duplicate scanning');
        const claude=()=>document.querySelector('section[aria-label="Claude Code"]');
        if(!claude().textContent.includes('已登录')||!document.querySelector('section[aria-label="Grok Build"]').textContent.includes('登录状态未知'))throw new Error('Real/unknown auth must differ');
        window.holdScan=true;document.querySelector('.navo-settings-navigation nav button').click();
        await wait(()=>!claude(),'Agent page must unmount when navigating away');button('Agents').click();
        await wait(()=>window.resumeScan,'Returning must refresh detection');
        if(!claude()?.textContent.includes('已登录') || document.querySelectorAll('.settings-list[aria-label]').length!==4)throw new Error('Returning must retain cached cards and detection results');
        window.resumeScan();await wait(()=>!button('全部更新').disabled,'Returning scan should settle');
        if([...claude().querySelectorAll('p')].some(item=>item.textContent==='安装'))throw new Error('Duplicate installation section must be absent');
        button('高级设置',claude()).click();await wait(()=>claude().querySelector('input'),'Missing binary path form');
        if(claude().querySelector('textarea')||claude().querySelector('input[type="password"]')||claude().textContent.includes('启动参数')||claude().textContent.includes('环境变量'))throw new Error('Advanced settings must only edit the binary');
        if(claude().textContent.includes('启用') || !claude().querySelector('[role="switch"][aria-label="启用 Claude Code"]'))throw new Error('Switch must have an accessible name without visible copy');
        if(button('保存',claude()) || button('恢复默认',claude()))throw new Error('Save and restore defaults buttons must be absent');
        const pathInput=()=>claude().querySelector('input');
        const picker=()=>claude().querySelector('button[aria-label="选择可执行文件"]');
        const rescan=()=>button('重新扫描',claude());
        if(!pathInput().readOnly || pathInput().value!=='/test/claude')throw new Error('Detected path must be displayed read-only');
        if(!(rescan().compareDocumentPosition(picker()) & Node.DOCUMENT_POSITION_FOLLOWING))throw new Error('Re-scan must be to the left of the file picker');
        picker().click();await pause();
        await wait(()=>window.saved.length===1 && !picker().disabled,'Choosing a file must save immediately');
        if(window.saved[0].customPath!=='/test/chosen-cli'||window.saved[0].environment[0].value!==undefined||pathInput().value!=='/test/chosen-cli')throw new Error('Path not saved or unrelated stored settings changed');
        picker().click();await pause();
        if(window.saved.length!==1)throw new Error('Choosing the same path must not save again');
        window.chooseResult=null;picker().click();await pause();
        if(window.saved.length!==1)throw new Error('Cancelling the picker must not save');
        window.chooseResult='/test/invalid';picker().click();await pause();
        await wait(()=>document.querySelector('[role="alert"]') && !picker().disabled,'Save failure must be visible');
        if(pathInput().value!=='/test/chosen-cli')throw new Error('Save failure must preserve the last saved path');
        window.chooseResult='/test/retry-cli';picker().click();await pause();
        await wait(()=>window.saved.length===3 && !picker().disabled,'Choosing another path must allow retry');
        if(document.querySelector('[role="alert"]'))throw new Error('Successful retry must clear the error');
        window.failSave=true;rescan().click();await pause();
        await wait(()=>window.saved.length===4 && !rescan().disabled,'Failed reset should settle');
        if(pathInput().value!=='/test/retry-cli'||!document.querySelector('[role="alert"]'))throw new Error('Failed reset must preserve the custom path and show an error');
        window.failSave=false;const scansBeforeReset=window.scans;rescan().click();await pause();
        await wait(()=>window.saved.length===5 && !rescan().disabled,'Re-scan should persist automatic discovery');
        if(window.saved[4].customPath!==''||window.scans!==scansBeforeReset+1||pathInput().value!=='/test/claude')throw new Error('Re-scan must clear custom path and display automatic detection');
        rescan().click();await pause();
        await wait(()=>window.scans===scansBeforeReset+2 && !rescan().disabled,'Automatic mode must still allow repeated scans');
        button('全部更新').click();await wait(()=>dialog(),'Missing command confirmation');
        if(window.starts.length)throw new Error('Preparing must not run commands');
        if(dialog().querySelectorAll('pre').length!==2)throw new Error('Batch must show each command');
        button('确认并执行',dialog()).click();await wait(()=>window.starts.length===1,'First operation did not start');
        window.finish(1);await wait(()=>window.starts.length===2,'Failed update must not skip remaining agents');
        window.finish(0);await wait(()=>button('关闭',dialog()),'Completed operation must remain visible');
        if(!dialog().textContent.includes('执行失败')||!dialog().textContent.includes('命令已完成'))throw new Error('Batch results missing');
        button('关闭',dialog()).click();await wait(()=>!dialog(),'Operation dialog should close');
        await wait(()=>!button('全部更新').disabled,'Re-scan should settle');
        button('全部更新').click();await wait(()=>dialog(),'Missing second confirmation');button('确认并执行',dialog()).click();
        await wait(()=>window.starts.length===3,'Next batch did not start');button('停止并取消剩余操作',dialog()).click();
        await wait(()=>dialog().textContent.includes('已取消'),'Cancellation must be visible');window.finish(0);await pause();
        if(window.starts.length!==3)throw new Error('Cancellation must not launch queued update');
        button('关闭',dialog()).click();await wait(()=>!dialog(),'Cancelled dialog should close');
        await window.setLocale('en');await wait(()=>button('Re-scan'),'Agent settings must support English');
        if(!document.body.textContent.includes('Default agent'))throw new Error('Default setting missing');
        button('Advanced',claude()).click();
      })().catch(error=>{console.error(error.stack);throw error;})\`);
      if(process.env.NAVO_AGENT_SCREENSHOT){await new Promise(resolve=>setTimeout(resolve,500));require('node:fs').writeFileSync(process.env.NAVO_AGENT_SCREENSHOT,(await window.webContents.capturePage()).toPNG());}
      app.exit(0);}catch(error){console.error(error.stack);app.exit(1);}});`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    let output = "";
    child = spawn(electron, [runner], { env, stdio: ["ignore", "pipe", "pipe"], timeout: 45000 });
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(code, 0, output);
  } finally { child?.kill(); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
