import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("删除弹窗：默认保留、选项联动、风险复核、失败重试与当前分支保护", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-delete-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({
    configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"),
    logLevel: "error", plugins: [tailwindcss()], esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__delete", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__delete", `<style>*,*::before,*::after { animation:none!important;transition:none!important; }</style><div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/App.css';
      import i18n from '/src/i18n/index.ts';
      import { TaskDeleteDialog } from '/src/components/tasks/TaskDeleteDialog.tsx';
      import { useTaskStore } from '/src/stores/taskStore.ts';
      await i18n.changeLanguage('zh-CN');
      const worktree = { resourceId:'repo', mode:'worktree', name:'Navo', originalPath:'/repo', workingPath:'/worktree', targetBranch:'navo/task', sourceBranch:'main', ownership:{} };
      const base = { id:'task', title:'删除确认测试', status:'TODO', date:'2026-10-05', projectName:'Navo', resources:[worktree] };
      window.checks = []; window.checkActions = []; window.removals = []; window.archivals = []; window.failNext = false; window.holdRemoval = false;
      window.navo = { settings: {}, tasks: {
        inspectDeletion: async (id, options, action) => {
          window.checks.push(options);
          window.checkActions.push(action);
          await new Promise(resolve => setTimeout(resolve, 100));
          return { token: 'token-' + window.checks.length, canDeleteWorktrees: id !== 'current', blocked:false, items: !options.deleteWorktrees ? [] : [
            { resourceId:'repo', name:'Navo', path:'/worktree', branch:'navo/task', worktreeAction:'delete', branchAction:options.deleteBranches?'delete':'keep', sharedTasks:[], uncommittedFiles:2, ignoredFiles:1, detached:false, unpushedCommits:options.deleteBranches?1:null },
            { resourceId:'shared', name:'Shared repo', path:'/shared', branch:'main', worktreeAction:'keep', branchAction:'keep', worktreeReason:'shared', sharedTasks:['另一个任务'], uncommittedFiles:0, ignoredFiles:0, detached:false, unpushedCommits:null }
          ] };
        },
        archive: async (id, confirmation) => {
          window.archivals.push({id, confirmation});
          if (window.failNext) { window.failNext=false; throw new Error('TASK_ARCHIVE_CHANGED'); }
          return [{...base,id,status:'ARCHIVED',archivedFrom:'TODO'}];
        },
        remove: async (id, confirmation) => {
          window.removals.push({id, confirmation});
          if (window.holdRemoval) await new Promise(resolve => { window.finishRemoval=resolve; });
          if (window.failNext) { window.failNext=false; throw new Error('TASK_DELETE_CHANGED'); }
          return [];
        }
      }};
      function Fixture() {
        const [task,setTask] = React.useState(null);
        const [action,setAction] = React.useState('delete');
        window.openDeletion = (current=false,nextAction='delete') => {
          const value = current ? {...base, id:'current', resources:[{...worktree, mode:'current-branch', ownership:undefined}]} : base;
          useTaskStore.setState({ tasks:[value], loaded:true, pending:false, error:null });
          setAction(nextAction);setTask(value);
        };
        return task ? React.createElement(TaskDeleteDialog, {task, action, onClose:()=>setTask(null)}) : React.createElement('p', null, 'ready');
      }
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "run.cjs");
    await writeFile(runner, `
      const {app,BrowserWindow}=require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async()=>{
        app.dock?.hide();
        const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{backgroundThrottling:false}});
        try {
          await win.loadURL(${JSON.stringify("http://127.0.0.1:" + server.httpServer.address().port + "/__delete")});
          win.webContents.debugger.attach('1.3');
          await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
          await win.webContents.executeJavaScript(\`(async()=>{
            const dialog=()=>document.querySelector('[role="dialog"]');
            const button=text=>[...dialog().querySelectorAll('button')].find(item=>item.textContent.trim()===text);
            const checks=()=>[...dialog().querySelectorAll('[role="checkbox"]')];
            async function wait(check,message) { const deadline=Date.now()+6000; while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error(message);}
            async function ready(){await new Promise(resolve=>setTimeout(resolve,0));await wait(()=>button('删除任务')&&!button('删除任务').disabled,'Inspection never completed');}
            await wait(()=>window.openDeletion,'Fixture missing');
            window.openDeletion(); await wait(dialog,'Missing delete dialog'); await ready();
            if(checks().length!==1||checks()[0].getAttribute('data-state')!=='unchecked')throw new Error('Cleanup must default off; branch option hidden');
            if(document.activeElement!==button('取消'))throw new Error('Cancel should receive initial focus');
            if(dialog().textContent.includes('将被删除'))throw new Error('Default dialog must not show an expanded checklist');
            checks()[0].click(); await wait(()=>checks().length===2,'Branch checkbox must follow worktree selection'); await ready();
            if(!dialog().textContent.includes('2 个未提交文件')||!dialog().textContent.includes('1 个被 Git 忽略的文件')||!dialog().textContent.includes('另一个任务'))throw new Error('Missing risk or retained-resource details');
            checks()[1].click(); await ready();
            if(!dialog().textContent.includes('1 个提交')||!window.checks.at(-1).deleteBranches)throw new Error('Branch risk must be rechecked');
            checks()[0].click(); await ready();
            if(checks().length!==1||window.checks.at(-1).deleteBranches)throw new Error('Unchecking worktrees must reset branch cleanup');
            checks()[0].click(); await ready(); checks()[1].click(); await ready();
            button('取消').click(); await wait(()=>!dialog(),'Cancel failed');
            window.openDeletion(); await wait(dialog,'Reopen failed'); await ready();
            if(checks()[0].getAttribute('data-state')!=='unchecked')throw new Error('Destructive options must not persist');
            window.failNext=true; button('删除任务').click();
            await wait(()=>dialog()?.querySelector('[role="alert"]'),'Changed resources must retain dialog with error'); await ready();
            if(!dialog().textContent.includes('再次确认删除'))throw new Error('Missing re-confirmation instruction');
            if(window.removals.length!==1)throw new Error('Failure must not automatically retry deletion');
            window.holdRemoval=true; button('删除任务').click();
            await wait(()=>window.finishRemoval,'Removal did not start');
            if(!button('取消').disabled||dialog().querySelector('[data-slot="dialog-close"]'))throw new Error('Pending deletion must block dismissal');
            dialog().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
            if(!dialog())throw new Error('Escape dismissed pending deletion');
            window.finishRemoval(); await wait(()=>!dialog(),'Successful deletion must close dialog');
            if(!window.removals.at(-1).confirmation.token)throw new Error('Deletion must carry preview token');
            window.holdRemoval=false; window.openDeletion(true); await wait(dialog,'Current branch dialog missing'); await ready();
            if(checks().length||!dialog().textContent.includes('现有工作目录和分支将保留'))throw new Error('Current branch must not offer cleanup');
            button('删除任务').click(); await wait(()=>!dialog(),'Task-only deletion failed');
            window.openDeletion(false,'archive');await wait(dialog,'Archive dialog missing');
            const archiveReady=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await wait(()=>button('归档任务')&&!button('归档任务').disabled,'Archive inspection did not finish');};await archiveReady();
            if(!dialog().textContent.includes('保留任务、会话历史、笔记和附件')||dialog().textContent.includes('此操作无法撤销'))throw Error('Default archive must describe preserved history, not task deletion');
            if(checks()[0].getAttribute('data-state')!=='unchecked'||window.checkActions.at(-1)!=='archive'||button('归档任务').dataset.variant!=='default')throw Error('Archive must default to keeping directories with its own confirmation');
            button('取消').click();await wait(()=>!dialog(),'Archive cancel failed');if(window.archivals.length)throw Error('Cancel archived task');
            window.openDeletion(false,'archive');await wait(dialog,'Archive reopen failed');await archiveReady();checks()[0].click();await wait(()=>checks().length===2,'Archive branch checkbox missing');await archiveReady();checks()[1].click();await archiveReady();
            if(!dialog().textContent.includes('无法通过恢复任务找回')||button('归档任务').dataset.variant!=='destructive')throw Error('Archive cleanup needs irreversible warning and destructive button');
            window.failNext=true;button('归档任务').click();await wait(()=>dialog()?.querySelector('[role="alert"]'),'Archive failure missing');await archiveReady();
            if(!dialog().textContent.includes('再次确认归档')||window.archivals.length!==1)throw Error('Archive failure must recheck without automatically repeating');
            button('归档任务').click();await wait(()=>!dialog(),'Archive confirmation did not finish');
            if(window.archivals.length!==2||!window.archivals.at(-1).confirmation.token)throw Error('Archive must use the latest preview token');
          })()\`);
          app.exit(0);
        }catch(error){console.error(error.stack);app.exit(1);}
      });
    `);
    let output = "";
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(electron, [runner], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(code, 0, output);
  } finally {
    child?.kill();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
