import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import electron from 'electron';
import { createServer } from 'vite';

test('任务进度单选、自动／手动、重新打开、失败、归档及窄屏交互', {timeout:60000}, async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'navo-progress-ui-'));
  const {default:tailwindcss}=await import('@tailwindcss/vite');
  const server=await createServer({configFile:false,appType:'custom',root:process.cwd(),cacheDir:path.join(directory,'cache'),logLevel:'error',plugins:[tailwindcss()],esbuild:{jsx:'automatic'},resolve:{alias:{'@':path.resolve('src')}},server:{host:'127.0.0.1',port:0}});
  server.middlewares.use('/__progress',async(_request,response)=>{
    response.setHeader('Content-Type','text/html');
    response.end(await server.transformIndexHtml('/__progress',`<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TaskTitleEditor} from '/src/components/tasks/workspace/TaskTitleEditor.tsx';
      import {TaskWorkbenchMenu} from '/src/components/tasks/workspace/TaskWorkbenchMenu.tsx';
      import {useTaskStore} from '/src/stores/taskStore.ts';import {taskProgress,resolveTaskProgress,reopenTaskProgress} from '/src/shared/taskProgress.ts';
      await i18n.changeLanguage('zh-CN');window.calls=[];window.failProgress=false;
      const task={id:'task',title:'这是一个用于验证窄窗口任务进度入口的很长很长的任务标题',description:'Prompt',status:'TODO',date:'2026-11-19',updatedAt:'2026-11-19',projectName:'repo',progress:{evidence:'development',settled:true},resources:[]};
      window.navo={settings:{},tasks:{setProgress:async(id,stage)=>{window.calls.push({id,stage});if(window.failProgress)throw Error('TASK_BUSY');
        const current=useTaskStore.getState().tasks[0],old=taskProgress(current);
        const progress=stage==='reopen'?reopenTaskProgress(old):{...old,manual:stage===null?undefined:{stage,evidence:old.evidence}};
        return {...current,progress,status:resolveTaskProgress(progress).stage==='done'?'DONE':'TODO'};}}};
      useTaskStore.setState({loaded:true,tasks:[task],pending:false});
      window.setArchived=()=>useTaskStore.setState(s=>({tasks:s.tasks.map(t=>({...t,status:'ARCHIVED',archivedFrom:t.status}))}));
      window.setAutomaticDone=()=>useTaskStore.setState(s=>({tasks:s.tasks.map(t=>({...t,status:'DONE',progress:{evidence:'done',settled:true}}))}));
      window.setWidth=width=>document.querySelector('.task-workbench').style.width=width+'px';
      function Fixture(){const task=useTaskStore(s=>s.tasks[0]);return React.createElement('div',{className:'task-workbench',style:{width:460,height:300,margin:24}},
        React.createElement('header',{className:'task-workbench-heading'},React.createElement(TaskTitleEditor,{task,headingId:'title',menu:React.createElement(TaskWorkbenchMenu,{task,onRename:()=>{},onNotice:()=>{}})})));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try{
    await server.listen();const runner=path.join(directory,'runner.cjs');
    await writeFile(runner,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:800,height:650,webPreferences:{backgroundThrottling:false}});const errors=[];
      win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
      try{await win.loadURL(${JSON.stringify('http://127.0.0.1:'+server.httpServer.address().port+'/__progress')});
        await win.webContents.executeJavaScript(\`(async()=>{
          const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(check,message)=>{for(let i=0;i<150;i++){if(check())return;await pause(30);}throw Error(message);};
          const trigger=()=>document.querySelector('button[aria-label^="任务进度："]');
          const radio=text=>[...document.querySelectorAll('[role="menuitemradio"]')].find(item=>item.textContent===text&&item.closest('[role="menu"]')?.dataset.state==='open');
          const open=async()=>{await pause(180);trigger().dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,isPrimary:true,pointerType:'mouse'}));await wait(()=>radio('自动'),'Progress menu missing');};
          const select=async label=>{radio(label).click();await wait(()=>!document.querySelector('[role="menu"][data-state="open"]'),'Menu did not close');};
          const close=async()=>{document.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause(200);};
          await wait(trigger,'Title not rendered');if(!trigger().getAttribute('aria-label').includes('开发中（自动）'))throw Error('Initial automatic stage absent');
          window.setWidth(240);await pause(100);
          const bounds=trigger().getBoundingClientRect(),root=document.querySelector('.task-workbench').getBoundingClientRect();
          if(bounds.right>root.right||bounds.width===0||document.querySelector('h2').getBoundingClientRect().width===0)throw Error('Long title hides or overflows progress');
          await open();if(document.querySelectorAll('[role="menuitemradio"]').length!==5||radio('自动').getAttribute('aria-checked')!=='true')throw Error('Must use five shadcn radio choices');
          await select('审查中');await wait(()=>trigger().getAttribute('aria-label').includes('审查中（手动）'),'Manual stage absent');
          await open();if(radio('审查中').getAttribute('aria-checked')!=='true'||radio('自动').getAttribute('aria-checked')!=='false')throw Error('Incorrect manual checkmark');
          await select('自动');await wait(()=>trigger().getAttribute('aria-label').includes('开发中（自动）'),'Automatic mode not restored');
          await open();radio('自动').focus();radio('自动').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
          await wait(()=>document.activeElement===radio('探索'),'Keyboard navigation absent');await close();
          await open();await select('已完成');await wait(()=>trigger().textContent==='已完成','Done missing');
          await open();const reopen=[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent==='重新打开');if(!reopen)throw Error('Reopen missing');reopen.click();
          await wait(()=>trigger().getAttribute('aria-label').includes('开发中（自动）'),'Manual done reopen should clear override');
          window.setAutomaticDone();await open();[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent==='重新打开').click();
          await wait(()=>trigger().getAttribute('aria-label').includes('开发中（手动）'),'Automatic done reopen should set development');
          window.failProgress=true;await open();await select('审查中');await wait(()=>document.querySelector('[role="alert"]'),'Failure must be visible');
          if(!trigger().textContent.includes('开发中'))throw Error('Failure changed the displayed stage');
          window.failProgress=false;await open();await select('审查中');await wait(()=>!document.querySelector('[role="alert"]'),'Retry did not clear failure');
          window.setArchived();await wait(()=>trigger().disabled&&trigger().textContent==='已归档','Archived progress must be read-only');
          if(window.calls.some(call=>call.id!=='task'))throw Error('Wrong task mutated');
        })()\`);
        if(errors.length)throw Error(errors.join('\\n'));process.stdout.write('progress UI passed\\n');win.destroy();app.quit();
      }catch(error){console.error(error);app.exit(1);}});`);
    child=spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
    const code=await new Promise(resolve=>child.on('exit',resolve));assert.equal(code,0,output);assert.match(output,/progress UI passed/);
  }finally{if(child?.exitCode===null)child.kill();await server.close();await rm(directory,{recursive:true,force:true});}
});
