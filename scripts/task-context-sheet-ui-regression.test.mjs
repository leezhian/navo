import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("局部上下文 Sheet、嵌套弹层和快捷键键帽", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-context-sheet-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error",
    plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__context", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__context", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';
      import '/src/App.css';import '/src/components/tasks/workspace/task-workspace.css';import '/src/components/settings/settings.css';
      import i18n from '/src/i18n/index.ts';
      import {TaskContextPanel} from '/src/components/tasks/workspace/TaskContextPanel.tsx';
      import {SettingsShortcuts} from '/src/components/settings/SettingsShortcuts.tsx';
      import {Dialog,DialogContent,DialogTitle} from '/src/components/ui/dialog.tsx';
      import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '/src/components/ui/dropdown-menu.tsx';
      await i18n.changeLanguage('zh-CN');window.setLocale=value=>i18n.changeLanguage(value);window.outsideClicks=0;
      function Fixture(){
        const [open,setOpen]=React.useState(false),[narrow,setNarrow]=React.useState(true),[container,setContainer]=React.useState(null),[dialog,setDialog]=React.useState(false);
        const triggerRef=React.useRef(null);window.setNarrow=setNarrow;
        return React.createElement(React.Fragment,null,
          React.createElement('button',{id:'outside',onClick:()=>window.outsideClicks++},'Outside'),
          React.createElement('div',{className:'task-workbench','data-narrow':narrow,style:{height:320,width:320,marginLeft:150}},
            React.createElement('header',{className:'task-workbench-heading'},React.createElement('button',{id:'toggle',ref:triggerRef,'aria-expanded':open,onClick:()=>setOpen(!open)},'Context')),
            React.createElement('div',{ref:setContainer,className:'task-workbench-layout'},
              React.createElement(TaskContextPanel,{narrow,open,onOpenChange:setOpen,width:216,container,triggerRef},
                React.createElement('aside',{className:'task-context-rail'},
                  React.createElement('button',{id:'resource',onClick:()=>setDialog(true)},'Resource'),
                  React.createElement(DropdownMenu,null,
                    React.createElement(DropdownMenuTrigger,{id:'menu-trigger'},'Menu'),
                    React.createElement(DropdownMenuContent,null,React.createElement(DropdownMenuItem,null,'Option'))))),
              React.createElement('main',{className:'task-workbench-content'},'Session'))),
          React.createElement(Dialog,{open:dialog,onOpenChange:setDialog},React.createElement(DialogContent,{'aria-describedby':undefined},React.createElement(DialogTitle,null,'Resource dialog'),React.createElement('input',{id:'resource-title'}))),
          React.createElement('div',{id:'shortcuts'},React.createElement(SettingsShortcuts)));
      }
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,"user-data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1000,height:850,webPreferences:{backgroundThrottling:false}});const errors=[];
      win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:"+server.httpServer.address().port+"/__context")});
        await win.webContents.executeJavaScript(\`(async()=>{
          const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
          const wait=async(check,message)=>{for(let attempt=0;attempt<200;attempt++){if(check())return;await pause();}throw Error(message);};
          const sheet=()=>document.querySelector('[data-slot="sheet-content"]');
          const dialog=()=>document.querySelector('[data-slot="dialog-content"]');
          const toggle=()=>document.querySelector('#toggle');
          const escape=()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
          await wait(()=>toggle(),'Fixture missing');toggle().click();await wait(()=>sheet()?.dataset.state==='open','Sheet not opened');
          await wait(()=>document.activeElement?.id==='resource','Sheet should focus first action');
          await new Promise(resolve=>setTimeout(resolve,250));
          const panel=sheet().getBoundingClientRect(),layout=document.querySelector('.task-workbench-layout').getBoundingClientRect(),backdrop=document.querySelector('.task-context-backdrop').getBoundingClientRect();
          if(sheet().parentElement!==document.querySelector('.task-workbench-layout')||getComputedStyle(sheet()).borderRadius!=='14px'||Math.abs(panel.left-layout.left)>1||Math.abs(panel.top-layout.top)>1)throw Error('Sheet must be a rounded local panel');
          if(Math.abs(backdrop.left-layout.left)>1||Math.abs(backdrop.width-layout.width)>1||Math.abs(backdrop.height-layout.height)>1)throw Error('Backdrop must stay inside task content');
          if(getComputedStyle(document.body).pointerEvents==='none'||document.querySelector('#outside').closest('[aria-hidden="true"]'))throw Error('Local Sheet must not lock other tasks');
          document.querySelector('#outside').focus();document.querySelector('#outside').click();await pause();
          if(window.outsideClicks!==1||!sheet())throw Error('Other task areas must remain interactive');
          document.querySelector('#resource').focus();escape();await wait(()=>!sheet(),'Escape did not close Sheet');await wait(()=>document.activeElement===toggle(),'Escape should return focus to trigger');
          toggle().click();await wait(()=>sheet(),'Reopen failed');document.querySelector('.task-context-backdrop').focus();document.querySelector('.task-context-backdrop').click();await wait(()=>!sheet(),'Backdrop did not close Sheet');await wait(()=>document.activeElement===toggle(),'Backdrop close should return focus to trigger');
          toggle().click();await wait(()=>document.querySelector('#menu-trigger'),'Sheet menu missing');await new Promise(resolve=>setTimeout(resolve,250));
          document.querySelector('#menu-trigger').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,isPrimary:true,pointerType:'mouse'}));
          await wait(()=>document.querySelector('[role="menuitem"]'),'Nested menu missing');escape();await wait(()=>!document.querySelector('[role="menuitem"]'),'Nested menu did not close');
          if(sheet()?.dataset.state!=='open')throw Error('Nested menu dismissal must not close Sheet');
          document.querySelector('#resource').click();await wait(()=>dialog(),'Nested resource dialog missing');
          document.querySelector('#resource-title').focus();escape();await wait(()=>!dialog(),'Resource dialog did not close');
          if(sheet()?.dataset.state!=='open')throw Error('Closing resource dialog must leave Sheet open');
          toggle().click();await wait(()=>!sheet(),'Header toggle must close Sheet');
          window.setNarrow(false);await pause();toggle().click();await wait(()=>document.querySelector('.task-context-container'),'Wide panel missing');
          if(sheet()||document.querySelector('.task-context-backdrop'))throw Error('Wide view must remain a plain resizable column');
          if(document.querySelector('.task-context-container').getBoundingClientRect().width!==216)throw Error('Wide panel width changed');
          window.setNarrow(true);await wait(()=>sheet(),'Narrow switch should reuse Sheet');
          document.querySelector('.task-workbench').style.width='240px';await new Promise(resolve=>setTimeout(resolve,250));
          if(sheet().getBoundingClientRect().width>200||sheet().scrollWidth>sheet().clientWidth+1)throw Error('Sheet overflows narrow workspace');
          const shortcutRows=()=>[...document.querySelectorAll('#shortcuts .settings-row')];
          const keycaps=row=>[...row.querySelectorAll('kbd[data-slot="kbd"]')].map(key=>key.textContent);
          if(shortcutRows().length!==4||JSON.stringify(keycaps(shortcutRows()[1]))!==JSON.stringify(['←','→'])||JSON.stringify(keycaps(shortcutRows()[2]))!==JSON.stringify(['↑','↓','←','→']))throw Error('All shortcuts must use individual keycaps');
          for(const key of document.querySelectorAll('#shortcuts kbd'))if(getComputedStyle(key).backgroundColor==='rgba(0, 0, 0, 0)')throw Error('Keycaps need a visible background');
          Object.defineProperty(navigator,'platform',{configurable:true,value:'Win32'});await window.setLocale('en');await wait(()=>shortcutRows()[0].textContent.includes('Open settings'),'English shortcuts missing');
          if(keycaps(shortcutRows()[0]).join(' ')!=='Ctrl ,'||keycaps(shortcutRows()[3]).join(' ')!=='Ctrl Shift I F12')throw Error('Windows modifiers incorrect');
          Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});await window.setLocale('zh-CN');await wait(()=>shortcutRows()[0].textContent.includes('打开设置'),'Chinese shortcuts missing');
          if(keycaps(shortcutRows()[0]).join(' ')!=='⌘ ,'||keycaps(shortcutRows()[3]).join(' ')!=='⌘ ⌥ I F12')throw Error('Mac modifiers incorrect');
        })()\`);
        if(errors.length)throw Error(errors.join('\\n'));console.log('CONTEXT_SHEET_UI_OK');app.exit(0);
      }catch(error){console.error(error,errors.join('\\n'));app.exit(1);}
    });`);
    let output = "";
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => output += data);child.stderr.on("data", data => output += data);
    const code = await new Promise((resolve, reject) => { child.on("error", reject);child.on("exit", resolve); });
    assert.equal(code, 0, output);assert.match(output, /CONTEXT_SHEET_UI_OK/);
  } finally { child?.kill("SIGKILL");await server.close();await rm(directory, { recursive: true, force: true }); }
});
