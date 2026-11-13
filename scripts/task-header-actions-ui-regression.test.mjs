import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import electron from 'electron';
import { createServer } from 'vite';

test('标题菜单复制、已读聚合与链接导航的完整交互', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'navo-header-ui-'));
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const server = await createServer({ configFile: false, appType: 'custom', root: process.cwd(), cacheDir: path.join(directory, 'cache'), logLevel: 'error',
    plugins: [tailwindcss()], esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use('/__header', async (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml('/__header', `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';
      import {TaskWorkbenchMenu} from '/src/components/tasks/workspace/TaskWorkbenchMenu.tsx';
      import {TaskSessionSummary} from '/src/components/tasks/TaskSessionSummary.tsx';
      import {TaskSessionStatusIcon} from '/src/components/tasks/workspace/SessionStatusIcon.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {useTaskSessionStore} from '/src/stores/taskSessionStore.ts';
      import {useTaskStore} from '/src/stores/taskStore.ts';
      import {useTaskTabsStore} from '/src/stores/taskTabsStore.ts';
      import {useSessionAutoRead} from '/src/hooks/useSessionAutoRead.ts';
      import {useTaskLinks} from '/src/hooks/useTaskLinks.ts';
      import {isSessionUnread,markSessionUnread} from '/src/utils/sessionReadMarks.ts';
      await i18n.changeLanguage('zh-CN');
      const task={id:'task-one',title:'不要复制这个标题',description:'  第一行\\n\\n第二行  ',status:'TODO',resources:[]};
      const second={...task,id:'task-two',status:'ARCHIVED'};
      const records=[{id:'older',taskId:task.id,kind:'agent',status:'stopped',lastActiveAt:'2026-01-01T00:00:00Z',createdAt:'2026-01-01T00:00:00Z'},
        {id:'latest',taskId:task.id,kind:'agent',status:'running',lastActiveAt:'2026-01-02T00:00:00Z',createdAt:'2026-01-01T00:00:00Z'}];
      window.copied=[];window.notices=[];window.readyCount=0;window.section='settings';
      Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>{if(window.failCopy)throw Error('denied');window.copied.push(text);}});
      const listeners=new Set();let pending='task-two';
      window.navo={app:{onOpenTask:callback=>{listeners.add(callback);return()=>listeners.delete(callback);},taskLinksReady:async()=>{window.readyCount++;if(pending){for(const cb of listeners)cb(pending);pending=null;}}}};
      window.deliverTask=id=>{for(const cb of listeners)cb(id);};
      window.loadTasks=()=>useTaskStore.setState({tasks:[task,second],loaded:true});
      window.tabs=()=>useTaskTabsStore.getState();
      window.addAgents=()=>useTaskSessionStore.setState({sessions:records});
      window.unread=()=>useTaskSessionStore.getState().sessions.filter(isSessionUnread).map(s=>s.id);
      window.markOlder=()=>markSessionUnread('older');
      window.updateReply=()=>useTaskSessionStore.setState({sessions:records.map(s=>({...s,lastReplyAt:'2099-01-01T00:00:00Z'}))});
      const selectTasks=()=>{window.section='tasks';useTaskTabsStore.getState().showOverview();};
      function Fixture(){
        const [prompt,setPrompt]=React.useState(task.description),[visible,setVisible]=React.useState(true);
        window.setPrompt=setPrompt;window.showPane=setVisible;
        const sessions=useTaskSessionStore(s=>s.sessions);
        useSessionAutoRead(sessions.find(s=>s.id==='latest'),visible);
        const links=useTaskLinks(selectTasks);
        return React.createElement(TooltipProvider,null,
          React.createElement(TaskWorkbenchMenu,{task:{...task,description:prompt},onRename:()=>{},onNotice:(title,body)=>window.notices.push({title,body})}),
          React.createElement(TaskSessionSummary,{taskId:task.id}),React.createElement(TaskSessionStatusIcon,{taskId:task.id}),
          React.createElement('div',{id:'link-error'},links.error));
      }
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, 'runner.cjs');
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:900,height:750,webPreferences:{backgroundThrottling:false}});
      const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error(event.message);}});
      try{await win.loadURL(${JSON.stringify('http://127.0.0.1:'+server.httpServer.address().port+'/__header')});
        await win.webContents.executeJavaScript(\`(async()=>{
          const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
          const wait=async(check,message)=>{for(let i=0;i<150;i++){if(check())return;await pause(30);}throw Error(message);};
          const trigger=()=>document.querySelector('button[aria-label="任务操作"]');
          const item=label=>[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent===label&&e.closest('[role="menu"]')?.dataset.state==='open');
          const openMenu=async()=>{await pause(180);trigger().dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,isPrimary:true,pointerType:'mouse'}));await wait(()=>item('复制任务链接'),'Menu did not open');};
          await wait(trigger,'Header not rendered');
          if(window.readyCount!==0)throw Error('Must not acknowledge link before task data loads');
          window.loadTasks();await wait(()=>window.tabs().activeTaskId==='task-two','Cold-start archived task not opened');
          if(window.section!=='tasks')throw Error('Must switch to tasks');
          window.deliverTask('task-one');await wait(()=>window.tabs().activeTaskId==='task-one','Warm link not opened');
          window.tabs().startSplit('task-one','task-two');window.deliverTask('task-one');
          if(window.tabs().taskIds.length!==2||window.tabs().splits.length!==1)throw Error('Repeated link must reuse split tab');
          window.deliverTask('deleted');await wait(()=>document.getElementById('link-error').textContent==='missing','Missing task feedback absent');
          if(window.tabs().activeTaskId!=='task-one')throw Error('Missing task changed current page');
          await openMenu();
          if(item('标为已读')||item('标为未读'))throw Error('Empty task must not show read actions');
          item('复制任务链接').click();await wait(()=>window.copied.length===1,'Link not copied');
          if(window.copied[0]!=='navo://task/task-one')throw Error('Wrong task link');
          await openMenu();item('复制任务正文').click();await wait(()=>window.copied.length===2,'Prompt not copied');
          if(window.copied[1]!==['  第一行','','第二行  '].join(String.fromCharCode(10)))throw Error('Prompt must keep whitespace and omit title');
          window.setPrompt('   ');await openMenu();if(item('复制任务正文'))throw Error('Blank prompt action should be hidden');
          window.failCopy=true;item('复制任务链接').click();await wait(()=>window.notices.length===1,'Copy failure not reported');window.failCopy=false;
          window.addAgents();await wait(()=>document.querySelector('.task-session-summary'),'Agents missing');
          await openMenu();item('标为未读').click();await wait(()=>window.unread().join()==='latest','Latest session must be marked unread');
          await wait(()=>document.querySelector('.task-session-status').dataset.status==='unread'&&document.querySelector('.task-session-group[data-status="unread"]'),'Unread must propagate to task cards and tab');
          window.updateReply();await pause(200);
          if(!window.unread().includes('latest'))throw Error('Visible reply refresh erased manual unread');
          await openMenu();item('标为已读').click();await wait(()=>window.unread().length===0,'Read action must clear all replies');
          await openMenu();item('标为未读').click();window.markOlder();await wait(()=>window.unread().length===2,'Two sessions should be unread');
          await openMenu();item('标为已读').click();await wait(()=>window.unread().length===0,'Read must clear all manual marks');
          await openMenu();item('标为未读').click();await wait(()=>window.unread().length===1,'Manual unread absent');
          window.showPane(false);await pause(80);window.showPane(true);await wait(()=>window.unread().length===0,'Re-entering session must clear manual unread');
        })().catch(error=>{console.error(error.stack);throw error;})\`);
        if(errors.length)throw Error(errors.join('\\n'));process.stdout.write('header interactions passed\\n');win.destroy();app.quit();
      }catch(error){console.error(error);app.exit(1);}
    });`);
    child = spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
    const code = await new Promise(resolve=>child.on('exit',resolve));
    assert.equal(code,0,output);assert.match(output,/header interactions passed/);
  } finally { if(child?.exitCode===null)child.kill();await server.close();await rm(directory,{recursive:true,force:true}); }
});
