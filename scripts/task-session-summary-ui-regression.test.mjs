import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("Tasks 卡片和列表按状态分组，单个不显示数字，空会话隐藏且实时更新", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-session-summary-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error", plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__summary", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__summary", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';import '/src/components/tasks/workspace/task-workspace.css';
      import i18n from '/src/i18n/index.ts';import {TaskCard} from '/src/components/tasks/TaskCard.tsx';import {TaskListRow} from '/src/components/tasks/TaskListRow.tsx';
      import {TaskSessionStatusIcon} from '/src/components/tasks/workspace/SessionStatusIcon.tsx';import {useTaskSessionStore} from '/src/stores/taskSessionStore.ts';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      await i18n.changeLanguage('zh-CN');window.setLocale=value=>i18n.changeLanguage(value);
      window.setSessions=items=>useTaskSessionStore.setState({sessions:items,loaded:true});
      const task={id:'task',title:'LongUnbrokenTaskTitle'.repeat(20)+'很长的任务标题'.repeat(4),projectName:'project',date:'2026-10-08',status:'TODO',resources:[
        {resourceId:'repo-1',name:'project',mode:'worktree',targetBranch:'feature/long-branch-name'.repeat(8),sourceBranch:'main'},
        {resourceId:'folder',name:'Folder',mode:'folder'},
        {resourceId:'repo-2',name:'other',mode:'current-branch',targetBranch:'main',sourceBranch:'main'}]};
      createRoot(document.getElementById('root')).render(React.createElement(TooltipProvider,null,
        React.createElement('div',{id:'card',style:{width:200}},React.createElement(TaskCard,{task})),
        React.createElement('div',{id:'list',style:{width:240}},React.createElement(TaskListRow,{task,display:{showDate:false,showProject:false}})),
        React.createElement('div',{id:'tab'},React.createElement(TaskSessionStatusIcon,{taskId:'task'}))));
    </script>`));
  });
  let child;
  try {
    await server.listen();const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, "user-data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:900,height:800,webPreferences:{backgroundThrottling:false}});const errors=[];
      win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:" + server.httpServer.address().port + "/__summary")});
        await win.webContents.executeJavaScript(\`(async()=>{
          const wait=async(check,message)=>{for(let attempt=0;attempt<200;attempt++){if(check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error(message);};
          const summaries=()=>[...document.querySelectorAll('.task-session-summary')];
          const check=expected=>summaries().length===2&&summaries().every(item=>JSON.stringify([...item.querySelectorAll('.task-session-group')].map(group=>[group.dataset.status,group.querySelector('.task-session-group-count')?.textContent??'']))===JSON.stringify(expected));
          await wait(()=>document.querySelector('.task-title-with-sessions'),'Task cards not mounted');
          if(summaries().length)throw Error('Empty task must hide the summary entirely');
          const records=[{id:'run',taskId:'task',kind:'agent',status:'running'},{id:'run-2',taskId:'task',kind:'agent',status:'running'},{id:'stop',taskId:'task',kind:'agent',status:'stopped'},
            {id:'start',taskId:'task',kind:'agent',status:'starting'},
            {id:'fail',taskId:'task',kind:'agent',status:'failed'},{id:'archived',taskId:'task',kind:'agent',status:'starting',archivedAt:'date'},
            {id:'shell',taskId:'task',kind:'shell',status:'starting'},{id:'other',taskId:'other',kind:'agent',status:'starting'}];
          window.setSessions(records);await wait(()=>check([['failed',''],['running','2'],['starting',''],['stopped','']]),'Statuses must be grouped with only counts greater than one visible');
          for(const row of document.querySelectorAll('.task-title-with-sessions')){
            const title=row.firstElementChild.getBoundingClientRect(),summary=row.querySelector('.task-session-summary').getBoundingClientRect();
            if(Math.abs(title.top+title.height/2-summary.top-summary.height/2)>1)throw Error('Session indicators must be vertically centered with task titles');
          }
          for(const item of summaries())if(!item.getAttribute('aria-label').includes('5 个未归档会话')||!item.getAttribute('aria-label').includes('2 个运行中会话'))throw Error('Accessible summary must include total and individual tallies');
          if(document.querySelector('#tab .task-session-status').dataset.status!=='running')throw Error('Single tab icon must prioritize active sessions over errors');
          const summary=summaries()[0];summary.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse'}));
          await wait(()=>document.querySelector('[role="tooltip"]'),'Grouped tooltip missing');
          const tooltip=document.querySelector('[role="tooltip"]');
          for(const label of ['1 个失败会话','2 个运行中会话','1 个正在启动会话','1 个已停止会话'])if(!tooltip.textContent.includes(label))throw Error('Missing tooltip tally '+label);
          summary.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));
          for(const status of ['failed','stopped'])if(getComputedStyle(summary.querySelector('.task-session-group-icon[data-status="'+status+'"]')).animationName!=='none')throw Error('Ended sessions must not animate');
          if(getComputedStyle(summary.querySelector('.task-session-group-icon[data-status="running"]')).fill==='none'||getComputedStyle(summary.querySelector('.task-session-group-icon[data-status="stopped"]')).fill!=='none')throw Error('Running and stopped states need distinct filled and hollow markers');
          for(const id of ['card','list']){const root=document.getElementById(id);if(root.scrollWidth>root.clientWidth+1)throw Error('Long title overflows '+id);}
          const card=document.querySelector('#card .task-card'),cardTitle=card.querySelector('.task-title'),project=card.querySelector('.task-project');
          const titleStyle=getComputedStyle(cardTitle),titleRect=cardTitle.getBoundingClientRect();
          if(titleStyle.webkitLineClamp!=='2'||Math.abs(titleRect.height-parseFloat(titleStyle.lineHeight)*2)>1||cardTitle.scrollHeight<=cardTitle.clientHeight)throw Error('Card title must wrap and clamp to two lines');
          const branch='feature/long-branch-name'.repeat(8);
          if(!project||project.getBoundingClientRect().top<titleRect.bottom||JSON.stringify([...project.querySelectorAll('.task-project-entry')].map(item=>item.textContent))!==JSON.stringify(['project'+branch,'Folder','othermain'])||project.title!=='project · '+branch+', Folder, other · main')throw Error('Projects must sit below title in resource order with full project/branch hover labels and no overflow count');
          const branchLabel=project.querySelector('.task-project-branch');
          if(project.querySelectorAll('.lucide-git-branch').length!==2||branchLabel?.textContent!==branch||getComputedStyle(project).textOverflow!=='ellipsis'||project.scrollWidth<=project.clientWidth)throw Error('Branches must follow each project with a Git branch icon and the full row must truncate without overflow');
          const footer=card.querySelector('.task-metadata'),time=footer.querySelector('time');
          if(time.hasAttribute('title'))throw Error('Card time must not show a hover tooltip');
          if(Math.abs(time.getBoundingClientRect().right-footer.getBoundingClientRect().right)>1)throw Error('Time must align to bottom right');
          if(footer.getBoundingClientRect().top<project.getBoundingClientRect().bottom)throw Error('Footer must follow project');
          const listTitle=document.querySelector('#list .task-title-with-sessions').firstElementChild,listStyle=getComputedStyle(listTitle);
          if(listStyle.whiteSpace!=='nowrap'||listStyle.textOverflow!=='ellipsis'||listTitle.scrollWidth<=listTitle.clientWidth)throw Error('List title must retain single-line ellipsis');
          window.setSessions(records.map(item=>item.id==='run'?{...item,archivedAt:'date'}:item));await wait(()=>check([['failed',''],['running',''],['starting',''],['stopped','']]),'Count dropping to one must hide the number');
          await window.setLocale('en');await wait(()=>summaries()[0].getAttribute('aria-label').includes('4 unarchived sessions'),'English summary missing');
          if(!summaries()[0].getAttribute('aria-label').includes('1 Running session'))throw Error('English per-status tally missing');
          window.setSessions([{id:'stop',taskId:'task',kind:'agent',status:'stopped'}]);await wait(()=>check([['stopped','']]),'Stopped session must still show a group without numeral one');
          if(!summaries()[0].getAttribute('aria-label').startsWith('1 unarchived session'))throw Error('Singular count missing');
          window.setSessions([{id:'stop',taskId:'task',kind:'agent',status:'stopped',archivedAt:'date'}]);await wait(()=>summaries().length===0,'Archiving the last session must hide all groups');
          window.setSessions([]);await wait(()=>summaries().length===0,'Empty sessions must remain hidden');
        })()\`);
        if(errors.length)throw Error(errors.join('\\n'));console.log('SESSION_SUMMARY_UI_OK');app.exit(0);
      }catch(error){console.error(error);app.exit(1);}
    });`);
    let output = "";
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => output += data);child.stderr.on("data", data => output += data);
    const code = await new Promise((resolve, reject) => { child.on("error", reject);child.on("exit", resolve); });
    assert.equal(code, 0, output);assert.match(output, /SESSION_SUMMARY_UI_OK/);
  } finally { child?.kill("SIGKILL");await server.close();await rm(directory, { recursive: true, force: true }); }
});
