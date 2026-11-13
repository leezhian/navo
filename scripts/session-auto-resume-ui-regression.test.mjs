import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("可见会话首次恢复：隐藏标签、后台窗口、折叠和归档不触发，分屏待处理请求不丢失", { timeout: 45000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-auto-resume-"));
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error", esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__auto", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__auto", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {useVisibleSessionResume} from '/src/hooks/useVisibleSessionResume.ts';import {useTaskSessionStore} from '/src/stores/taskSessionStore.ts';
      window.calls=[];window.skips=0;window.focused=false;document.hasFocus=()=>window.focused;window.foreground='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.foreground});
      useTaskSessionStore.setState({resumeVisible:async id=>{if(useTaskSessionStore.getState().pending){window.skips++;return false;}useTaskSessionStore.setState({pending:true});window.calls.push(id);await new Promise(resolve=>setTimeout(resolve,50));useTaskSessionStore.setState({pending:false});return true;}});
      const task={id:'task',status:'TODO'},base={id:'one',taskId:'task',kind:'agent',status:'stopped',resumable:true,nativeSessionId:'native-id',resumeOnOpen:true};
      function Pane({session,task,visible}){const root=React.useRef(null);useVisibleSessionResume(task,session,visible,root);return React.createElement('div',{ref:root,style:{height:100,width:300}},session.id);}
      function Fixture(){const [state,setState]=React.useState({hidden:true,visible:true,task,session:base,second:true});window.patch=patch=>setState(old=>({...old,...patch}));window.session=patch=>setState(old=>({...old,session:{...base,...patch}}));
        return React.createElement('div',{style:{display:state.hidden?'none':'block'}},React.createElement(Pane,{task:state.task,session:state.session,visible:state.visible}),state.second&&React.createElement(Pane,{task,session:{...base,id:'two'},visible:state.visible}));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,"user-data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:900,height:700,webPreferences:{backgroundThrottling:false}});
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:"+server.httpServer.address().port+"/__auto")});await win.webContents.executeJavaScript(\`(async()=>{
        const pause=()=>new Promise(resolve=>setTimeout(resolve,120));const wait=async(check,label)=>{for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error(label);};
        await wait(()=>window.patch,'Fixture missing');await pause();if(window.calls.length)throw Error('Hidden task started');
        window.patch({hidden:false});await pause();if(window.calls.length)throw Error('Background window started');
        window.foreground='visible';document.dispatchEvent(new Event('visibilitychange'));await pause();if(window.calls.length)throw Error('Visible but unfocused window started');
        window.focused=true;window.dispatchEvent(new Event('focus'));await wait(()=>window.calls.length===2,'Split pane pending retry was lost');
        if(new Set(window.calls).size!==2)throw Error('Repeated restore');await pause();if(window.calls.length!==2)throw Error('Stopped response loops');
        window.patch({visible:false,second:false});window.session({id:'three'});await pause();if(window.calls.length!==2)throw Error('Collapsed pane restored');
        window.patch({visible:true});await wait(()=>window.calls.includes('three'),'Expanded pane not restored');
        window.patch({task:{id:'task',status:'ARCHIVED'}});window.session({id:'four'});await pause();if(window.calls.includes('four'))throw Error('Archived task restored');
        window.patch({task:{id:'task',status:'TODO'}});await wait(()=>window.calls.includes('four'),'Unarchived task not restored');
        window.session({id:'archived-session',archivedAt:'now'});await pause();if(window.calls.includes('archived-session'))throw Error('Archived session restored');
        window.session({id:'failed',status:'failed',error:'SESSION_EXIT_FAILED'});await pause();if(window.calls.includes('failed'))throw Error('Failed session retried');
        window.session({id:'stopped-by-user',resumeOnOpen:false});await pause();if(window.calls.includes('stopped-by-user'))throw Error('User stop ignored');
        window.session({id:'unknown-id',resumable:false});await pause();if(window.calls.includes('unknown-id'))throw Error('Unbound native id restored');
        window.focused=false;window.dispatchEvent(new Event('blur'));window.session({id:'blurred-window'});await pause();if(window.calls.includes('blurred-window'))throw Error('Blurred window restored');
        window.focused=true;window.dispatchEvent(new Event('focus'));await wait(()=>window.calls.includes('blurred-window'),'Focused window did not restore');
        window.patch({hidden:true});window.session({id:'hidden-tab'});await pause();if(window.calls.includes('hidden-tab'))throw Error('Hidden tab restored');
        window.patch({hidden:false});await wait(()=>window.calls.includes('hidden-tab'),'Visible tab not restored');
      })()\`);console.log('AUTO_RESUME_UI_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}
    });`);
    let output="";child=spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:""},stdio:["ignore","pipe","pipe"]});
    child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);
    const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});assert.equal(code,0,output);assert.match(output,/AUTO_RESUME_UI_OK/);
  } finally {child?.kill("SIGKILL");await server.close();await rm(directory,{recursive:true,force:true});}
});
