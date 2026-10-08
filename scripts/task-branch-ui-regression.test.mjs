import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("正式分支栏：仓库隔离、文件筛选、旧 Diff 弹窗及窄屏浮层", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-branch-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, root: process.cwd(), appType: "custom", cacheDir: path.join(directory, "cache"), logLevel: "error", plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, worker: { format: "es" }, resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 } });
  const patch = "diff --git a/src/example.ts b/src/example.ts\nindex 1111111..2222222 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n";
  server.middlewares.use("/__branch", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__branch", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TaskWorkspace} from '/src/components/tasks/workspace/TaskWorkspace.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';import {useSettingsStore} from '/src/stores/settingsStore.ts';
      await i18n.changeLanguage('zh-CN');window.setBranchLocale=locale=>i18n.changeLanguage(locale);useSettingsStore.setState({loaded:true});
      window.diffRequests=[];window.branchReads=[];window.watchCount=0;window.failBranch=false;const listeners=new Set();
      window.notifyChanges=()=>listeners.forEach(callback=>callback('/fixture/repo-a'));
      window.navo={settings:{},agents:{capabilitySnapshot:async()=>({settings:{configurations:[]},installations:[],entries:{}}),onCapabilitiesChanged:()=>()=>{}},tasks:{
        workspaceOpenOptions:async()=>({editors:[],remote:null,externalTerminal:false}),
        loadBranch:async(taskId,id)=>{window.branchReads.push(id);if(window.failBranch)throw Error('read failed');
          const snapshot={projectPath:'/fixture/'+id,branchName:'live-'+id,baseBranch:'main',baseAvailable:true,untrackedCount:2,commits:[{sha:'a'.repeat(40),title:'Implement '+id,author:'Fixture',date:'2026-10-08T10:00:00Z'}],hasMoreCommits:false,
            files:{unstaged:[{path:'src/example.ts',status:'M',additions:1,deletions:1,binary:false}],staged:[{path:'staged.txt',status:'A',additions:2,deletions:0,binary:false}],branch:[{path:'src/example.ts',status:'M',additions:1,deletions:1,binary:false}]}};
          if(window.holdBranch===id)await new Promise(resolve=>window.releaseBranch=resolve);return snapshot;
        }
      },review:{watchProject:async()=>{window.watchCount++;},unwatchProject:async()=>{window.watchCount--;},onProjectChanged:callback=>{listeners.add(callback);return()=>listeners.delete(callback);},
        loadLocalBranches:async()=>['main'],getUntrackedFileCount:async()=>2,getGitDiffSignature:async()=>'fixture',
        getCommitStatus:async()=>({branchName:'feature',isDetached:false,hasUpstream:false,aheadCount:0,stagedFileCount:0,unstagedFileCount:0,stagedAdditions:0,stagedDeletions:0,unstagedAdditions:0,unstagedDeletions:0}),
        runGitDiff:async params=>{window.diffRequests.push(params);return {stdout:${JSON.stringify(patch)},stderr:'',signature:'fixture',file_snapshots:[]};}
      }};
      const resources=['repo-a','repo-b'].map(name=>({resourceId:name,name,mode:'worktree',sourceBranch:'main',targetBranch:'saved-branch',workingPath:'/fixture/'+name}));
      const task={id:'task',title:'Branch workspace',date:'2026-10-08',projectName:'Fixture',status:'TODO',resources};
      function Fixture(){const [width,setWidth]=React.useState(1200);window.resizeBranchFixture=setWidth;return React.createElement(TooltipProvider,null,React.createElement('div',{style:{width,height:740}},React.createElement(TaskWorkspace,{task,headingId:'branch-task',onClose:()=>{}})));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, "user-data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1300,height:850,webPreferences:{backgroundThrottling:false}});
      const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:" + server.httpServer.address().port + "/__branch")});
        await win.webContents.executeJavaScript(\`(async()=>{
          const wait=async(check,message)=>{for(let attempt=0;attempt<350;attempt++){if(check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error(message);};
          const button=label=>document.querySelector('button[aria-label="'+label+'"]');
          const pane=()=>document.querySelector('.task-branch-pane');const dialog=()=>document.querySelector('[data-slot="dialog-content"]');
          await wait(()=>pane()?.textContent.includes('live-repo-a'),'Real branch snapshot missing');
          const heading=document.querySelector('.task-workbench-heading');
          if(!button('收起分支栏')?.querySelector('.lucide-panel-right-close')||button('显示分支栏'))throw Error('Visible branch pane must show the hide action and closing-direction icon');
          if(button('显示终端').getBoundingClientRect().left>=button('收起分支栏').getBoundingClientRect().left)throw Error('Terminal controls must precede the branch toggle');
          const contextButton=heading.querySelector('button[aria-label="任务上下文"]');
          if(!contextButton.querySelector('.lucide-panel-left-close'))throw Error('Visible context must use the panel closing icon');
          contextButton.click();await wait(()=>contextButton.querySelector('.lucide-panel-left-open'),'Hidden context must use the panel opening icon');contextButton.click();await wait(()=>contextButton.querySelector('.lucide-panel-left-close'),'Reopened context icon did not reset');
          button('收起分支栏').click();await wait(()=>!pane()&&button('显示分支栏')?.querySelector('.lucide-panel-right-open'),'Hiding must update both the tooltip label and icon');
          button('显示分支栏').click();await wait(()=>pane()?.textContent.includes('live-repo-a')&&button('收起分支栏'),'Reopening must restore hide action');
          if(getComputedStyle(document.querySelector('.task-branch-controls')).paddingTop!=='12px')throw Error('Branch content must keep 12px top spacing');
          if(document.querySelectorAll('.task-branch-file').length!==2||!pane().textContent.includes('未跟踪'))throw Error('Staged/unstaged files or tracked-only notice missing');
          const filter=document.querySelector('.task-branch-filter input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(filter,'example');filter.dispatchEvent(new Event('input',{bubbles:true}));
          await wait(()=>document.querySelectorAll('.task-branch-file').length===1,'File filter failed');
          document.querySelector('.task-branch-file').click();await wait(()=>dialog(),'Old Diff dialog not opened');
          await wait(()=>window.diffRequests.some(request=>request.projectPath==='/fixture/repo-a'&&request.mode==='unstaged'),'Diff loaded wrong repository or mode');
          await wait(()=>document.querySelector('diffs-container'),'Old Pierre Diff component not reused');
          await wait(()=>{const bounds=dialog().getBoundingClientRect();return Math.abs(bounds.left-24)<=2&&Math.abs(bounds.top-24)<=2;},'Full Diff dialog must use 24px outer spacing');
          if(!dialog().textContent.includes('live-repo-a'))throw Error('Dialog must use current branch name');
          dialog().querySelector('button[aria-label="关闭"]').click();await wait(()=>!dialog(),'Diff close failed');
          document.querySelectorAll('.task-branch-segments button')[1].click();await wait(()=>pane().textContent.includes('Implement repo-a'),'Commit list missing');
          button('打开完整 Diff').click();await wait(()=>window.diffRequests.some(request=>request.mode==='branch'&&request.targetBranch==='main'),'Commit scope must open old branch comparison');
          await wait(()=>dialog(),'Branch diff dialog missing');dialog().querySelector('button[aria-label="关闭"]').click();await wait(()=>!dialog(),'Branch Diff close failed');
          window.holdBranch='repo-a';window.notifyChanges();await wait(()=>window.releaseBranch,'Deferred refresh did not start');
          document.querySelector('.task-context-change button[title="/fixture/repo-b"]').click();await wait(()=>pane().textContent.includes('live-repo-b'),'Repository switch failed');
          window.releaseBranch();await new Promise(resolve=>setTimeout(resolve,60));if(pane().textContent.includes('live-repo-a'))throw Error('Stale response leaked across repositories');
          window.failBranch=true;window.dispatchEvent(new Event('focus'));await wait(()=>pane().querySelector('[role="alert"]'),'Read failures must not look like an empty repository');
          if(!pane().textContent.includes('live-repo-b'))throw Error('Failed background refresh must retain the prior snapshot');
          window.failBranch=false;pane().querySelector('[role="alert"] button').click();await wait(()=>!pane().querySelector('[role="alert"]'),'Retry must recover the branch snapshot');
          button('关闭分支栏').click();await wait(()=>!pane(),'Branch close failed');
          await wait(()=>window.watchCount===0,'Hidden pane must release project watch');
          window.resizeBranchFixture(360);await wait(()=>document.querySelector('.task-workbench').dataset.narrow==='true','Narrow layout not applied');
          button('显示分支栏').click();await wait(()=>document.querySelector('.task-branch-overlay'),'Narrow branch must use an overlay');
          const workspace=document.querySelector('.task-workbench');if(workspace.scrollWidth>workspace.clientWidth+2)throw Error('Branch pane overflows narrow task details');
          const branchSheet=()=>document.querySelector('.task-branch-overlay[data-slot="sheet-content"][data-side="right"]');
          const escape=()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
          await wait(()=>branchSheet()?.dataset.state==='open','Branch overlay must use the shared Sheet');
          await new Promise(resolve=>setTimeout(resolve,250));
          const layout=document.querySelector('.task-workbench-layout');
          const panelBounds=branchSheet().getBoundingClientRect(),layoutBounds=layout.getBoundingClientRect(),backdropBounds=document.querySelector('.task-context-backdrop').getBoundingClientRect();
          if(branchSheet().parentElement!==layout||Math.abs(panelBounds.right-layoutBounds.right)>1||Math.abs(panelBounds.top-layoutBounds.top)>1||getComputedStyle(branchSheet()).borderRadius!=='14px')throw Error('Branch Sheet must align to the right edge of its task');
          if(Math.abs(backdropBounds.width-layoutBounds.width)>1||Math.abs(backdropBounds.left-layoutBounds.left)>1||getComputedStyle(document.body).pointerEvents==='none')throw Error('Branch backdrop must stay local and not lock other tasks');
          branchSheet().querySelector('input').focus();escape();await wait(()=>!branchSheet(),'Escape must close branch Sheet');
          await wait(()=>document.activeElement===button('显示分支栏'),'Escape must return focus to branch trigger');
          button('显示分支栏').click();await wait(()=>branchSheet()?.dataset.state==='open','Branch Sheet reopen failed');
          document.querySelector('.task-context-backdrop').focus();document.querySelector('.task-context-backdrop').click();await wait(()=>!branchSheet(),'Backdrop must close branch Sheet');
          await wait(()=>document.activeElement===button('显示分支栏'),'Backdrop close must return focus to branch trigger');
          button('显示分支栏').click();await wait(()=>branchSheet()&&!button('打开完整 Diff').disabled,'Branch Diff action missing');
          button('打开完整 Diff').click();await wait(()=>dialog(),'Nested full Diff missing');
          dialog().querySelector('button[aria-label="关闭"]').focus();escape();await wait(()=>!dialog(),'Escape must close nested Diff');
          if(branchSheet()?.dataset.state!=='open')throw Error('Closing full Diff must not close its branch Sheet');
          button('任务上下文').click();await wait(()=>!branchSheet()&&document.querySelector('.task-context-sheet[data-state="open"]'),'Context and branch Sheets must switch exclusively');
          document.querySelector('.task-context-change button[title="/fixture/repo-b"]').click();await wait(()=>branchSheet()?.dataset.state==='open'&&!document.querySelector('.task-context-sheet'),'Repository click must switch back to the right Sheet');
          await wait(()=>branchSheet().contains(document.activeElement),'Closing context must not steal branch Sheet focus');
          button('关闭分支栏').click();await wait(()=>!pane(),'Overlay close failed');
          await window.setBranchLocale('en');await wait(()=>button('Show branch pane'),'Hidden branch tooltip must support English');
          button('Show branch pane').click();await wait(()=>pane()&&button('Hide branch pane')?.querySelector('.lucide-panel-right-close'),'Visible branch tooltip must switch to English hide action');
        })()\`);
        if(errors.length)throw Error(errors.join('\\n'));console.log('BRANCH_UI_OK');app.exit(0);
      }catch(error){console.error(error);app.exit(1);}
    });`);
    let output = "";
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => output += data);child.stderr.on("data", data => output += data);
    const code = await new Promise((resolve, reject) => { child.on("error", reject);child.on("exit", resolve); });
    assert.equal(code, 0, output);assert.match(output, /BRANCH_UI_OK/);
  } finally { child?.kill("SIGKILL");await server.close();await rm(directory, { recursive: true, force: true }); }
});
