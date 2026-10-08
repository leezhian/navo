import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("标题栏空白可拖动窗口，标签及按钮保留交互区域", { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-header-drag-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error",
    plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__header", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__header", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import {ApplicationShell} from '/src/components/layout/ApplicationShell.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {useTaskStore} from '/src/stores/taskStore.ts';import {useTaskTabsStore} from '/src/stores/taskTabsStore.ts';
      import i18n from '/src/i18n/index.ts';await i18n.changeLanguage('zh-CN');
      window.navo={window:{getIsFullScreen:async()=>false,onFullScreenChange:()=>()=>{}}};window.created=0;window.back=0;window.forward=0;
      const tasks=Array.from({length:12},(_,index)=>({id:'task-'+index,title:'Task '+index,status:'TODO',date:'2026-10-08',projectName:'fixture'}));
      useTaskStore.setState({tasks,loaded:true});
      window.seed=count=>useTaskTabsStore.setState({taskIds:tasks.slice(0,count).map(task=>task.id),activeTaskId:count?tasks[0].id:null,splits:[]});
      window.seedSplit=()=>useTaskTabsStore.getState().startSplit('task-0','task-1');
      window.seed(0);
      createRoot(document.getElementById('root')).render(React.createElement(TooltipProvider,null,React.createElement(ApplicationShell,{
        section:'tasks',canGoBack:true,canGoForward:true,onSelectSection:()=>{},onGoBack:()=>window.back++,onGoForward:()=>window.forward++,onCreateTask:()=>window.created++
      })));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,"user-data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1000,height:700,titleBarStyle:'hiddenInset',webPreferences:{backgroundThrottling:false}});
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:"+server.httpServer.address().port+"/__header")});
        await win.webContents.executeJavaScript(\`(async()=>{
          const wait=async(check,message)=>{for(let attempt=0;attempt<200;attempt++){if(check())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error(message);};
          const list=()=>document.querySelector('.navo-workspace-tabs');
          const region=element=>getComputedStyle(element).getPropertyValue('-webkit-app-region');
          const assertInteractive=element=>{for(let node=element;node;node=node.parentElement){const value=region(node);if(value==='no-drag')return;if(value==='drag')break;}throw Error('Interactive control is inside a window drag region');};
          await wait(()=>list(),'Tabs missing');
          if(region(document.querySelector('.navo-window-header'))!=='drag')throw Error('Header must be draggable');
          if(region(list())!=='drag')throw Error('Empty tab list overrides the header with a non-draggable region');
          if(list().getBoundingClientRect().height<28)throw Error('Empty tab bar must retain its drag hit area');
          window.seed(2);await wait(()=>document.querySelectorAll('.navo-tab-group').length===2,'Tabs not seeded');
          const bounds=list().getBoundingClientRect(),last=document.querySelectorAll('.navo-tab-group')[1].getBoundingClientRect();
          if(bounds.right-last.right<100||region(list())!=='drag')throw Error('Trailing blank tab area must remain draggable');
          for(const element of document.querySelectorAll('.navo-window-header button'))assertInteractive(element);
          document.querySelector('[role="tab"][data-state="inactive"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));await wait(()=>document.querySelector('[role="tab"][aria-selected="true"]')?.textContent==='Task 1','Tab selection broken');
          const controls=[...document.querySelectorAll('.navo-window-header button')].filter(element=>!element.closest('.navo-tab-group'));
          controls.forEach(element=>element.click());if(window.created!==1||window.back!==1||window.forward!==1)throw Error('Header buttons must keep their click handlers');
          document.querySelector('.navo-workspace-tab-close').click();await wait(()=>document.querySelectorAll('.navo-tab-group').length===1,'Tab close broken');
          window.seed(12);await wait(()=>document.querySelectorAll('.navo-tab-group').length===12,'Overflow tabs missing');
          if(list().scrollWidth<=list().clientWidth)throw Error('Fixture must cover overflowing tabs');
          list().scrollLeft=100;await wait(()=>list().scrollLeft>0,'Tab scrolling broken');
          for(const element of document.querySelectorAll('.navo-tab-group'))if(region(element)!=='no-drag')throw Error('Tab drag-sort region must exclude native window dragging');
          window.seed(2);window.seedSplit();await wait(()=>document.querySelector('.navo-tab-group[data-split="true"]'),'Split tab missing');
          const split=document.querySelector('.navo-tab-group[data-split="true"]');
          if(region(split)!=='no-drag'||split.querySelectorAll('.navo-workspace-tab-close').length!==2)throw Error('Entire split group must exclude window dragging');
          for(const element of split.querySelectorAll('button'))assertInteractive(element);
          window.seed(0);await wait(()=>!document.querySelector('.navo-tab-group'),'Close all failed');
          if(region(list())!=='drag'||list().getBoundingClientRect().height<28)throw Error('Empty tabs must remain draggable after closing all tabs');
        })()\`);console.log('HEADER_DRAG_OK');app.exit(0);
      }catch(error){console.error(error);app.exit(1);}
    });`);
    let output = "";
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => output += data);child.stderr.on("data", data => output += data);
    const code = await new Promise((resolve, reject) => { child.on("error", reject);child.on("exit", resolve); });
    assert.equal(code, 0, output);assert.match(output, /HEADER_DRAG_OK/);
  } finally { child?.kill("SIGKILL");await server.close();await rm(directory, { recursive: true, force: true }); }
});
