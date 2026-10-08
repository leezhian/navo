import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("任务资源统一窗口：分类定位、共享筛选、笔记、原文件、取消与失败保留", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-resource-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error", plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, worker: { format: "es" }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__resource_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__resource_test", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TaskWorkspace} from '/src/components/tasks/workspace/TaskWorkspace.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';import {useSettingsStore} from '/src/stores/settingsStore.ts';
      import {useTaskStore} from '/src/stores/taskStore.ts';import {useIssueStore} from '/src/stores/issueStore.ts';
      await i18n.changeLanguage('zh-CN');useSettingsStore.setState({loaded:true});
      let task={id:'existing',title:'任务资源测试',date:'2026-10-07',projectName:'navo',status:'TODO',resources:[{resourceId:'repo',name:'navo',mode:'current-branch',workingPath:'/test',targetBranch:'main',sourceBranch:'main'}],links:[],webLinks:[],files:[],notes:[]};
      const items=['ISSUE','PR'].map(group=>({id:group,title:group+' title',group,tag:'feature',status:group==='PR'?'review':'todo',projectName:'navo',provider:'GitHub',date:'2026-10-07'}));
      useTaskStore.setState({tasks:[task],loaded:true});useIssueStore.setState({items});window.submissions=[];window.releases=[];window.reveals=[];
      const records=[{id:'repo',name:'navo',kind:'repo',localPath:'/test',available:true},{id:'backend',name:'backend',kind:'repo',localPath:'/fixture/backend',available:true},{id:'assets',name:'assets',kind:'folder',localPath:'/fixture/assets',available:true}];
      window.navo={settings:{chooseDirectory:async()=>'/fixture/quick'},resources:{list:async()=>records,onCloneProgress:()=>()=>{},save:async value=>{const saved={...value,id:'quick',available:true};records.push(saved);return saved;}},
        review:{watchProject:async()=>{},unwatchProject:async()=>{},onProjectChanged:()=>()=>{}},
        tasks:{inspectResource:async id=>{const record=records.find(item=>item.id===id);return {resourceId:id,name:record.name,path:record.localPath,git:record.kind==='repo'?{root:record.localPath,currentBranch:'main',defaultSource:'refs/heads/main',branches:[{ref:'refs/heads/main',name:'main',kind:'local'}]}:null};},
        loadBranch:async()=>({projectPath:'/test',branchName:'main',baseBranch:'main',baseAvailable:true,files:{unstaged:[],staged:[],branch:[]},untrackedCount:0,commits:[],hasMoreCommits:false}),
        addResources:async(id,input)=>{window.submissions.push({id,input});if(window.failSave)throw Error('TASK_BUSY');task={...task,resources:[...task.resources,...(input.resources??[]).map(resource=>{const record=records.find(item=>item.id===resource.resourceId);return {...resource,name:record.name,originalPath:record.localPath,workingPath:resource.mode==='worktree'?'/fixture/worktrees/'+record.id:record.localPath,targetBranch:resource.mode==='folder'?'':'navo/12345678'};})],links:[...task.links,...input.links],webLinks:[...task.webLinks,...input.webLinks],notes:[...task.notes,...input.notes],files:input.fileIds.length?[{id:input.fileIds[0],name:'spec.md',path:'/fixture/spec.md',size:4}]:task.files};return structuredClone(task);},
        chooseResourceFile:async()=>({id:'11111111-1111-4111-8111-111111111111',name:'spec.md',path:'/fixture/spec.md',size:4}),releaseResourceFiles:async ids=>window.releases.push(...ids),revealResourceFile:async(...args)=>window.reveals.push(args)},
        agents:{onCapabilitiesChanged:()=>()=>{},capabilitySnapshot:async()=>({settings:{configurations:[]},installations:[],entries:{}})}};
      function Fixture(){const record=useTaskStore(state=>state.tasks[0]);return React.createElement(TooltipProvider,null,React.createElement('div',{style:{height:720,width:1100}},React.createElement(TaskWorkspace,{task:record,headingId:'task-title',onClose:()=>{}})));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,"data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1250,height:900,webPreferences:{backgroundThrottling:false}});
      const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:"+server.httpServer.address().port+"/__resource_test")});
        await win.webContents.executeJavaScript(\`(async()=>{
          const pause=()=>new Promise(resolve=>setTimeout(resolve,35));const wait=async(check,message)=>{for(let attempt=0;attempt<160;attempt++){if(check())return;await pause();}throw Error(message);};
          const dialog=()=>document.querySelector('[role="dialog"]');const button=(label,root=dialog())=>[...root.querySelectorAll('button')].find(item=>item.textContent.trim()===label);
          const category=()=>dialog()?.querySelector('[data-resource-category]')?.dataset.resourceCategory;
          const fill=async(element,value)=>{const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));await pause();};
          await wait(()=>document.querySelector('.task-context-toolbar button'),'Workspace missing');
          document.querySelector('.task-context-toolbar button').click();await wait(()=>category()==='repositories','Top add should open repositories');
          button('笔记').click();await wait(()=>category()==='notes','Notes tab missing');
          if(!button('添加到任务').disabled)throw Error('Empty note must be rejected');
          await fill(dialog().querySelector('textarea'),'# A note'+String.fromCharCode(10)+'Markdown body');
          window.failSave=true;button('添加到任务').click();await wait(()=>dialog().querySelector('[role="alert"]'),'Save error missing');
          if(!dialog().querySelector('textarea').value.includes('Markdown'))throw Error('Failure lost draft');
          window.failSave=false;await wait(()=>!button('添加并继续').disabled,'Retry button must become enabled');button('添加并继续').click();await wait(()=>dialog()?.querySelector('textarea').value==='','Keep adding must reset successful category');
          if(window.submissions[0].input.requestId!==window.submissions[1].input.requestId)throw Error('Retry must retain request ID');
          if(!document.querySelector('.task-context-rail').textContent.includes('未命名笔记'))throw Error('Note not reflected in context');
          button('文件').click();await wait(()=>category()==='files','Files tab missing');button('选择文件…').click();await wait(()=>dialog().textContent.includes('/fixture/spec.md'),'Native file selection missing');
          button('取消').click();await wait(()=>!dialog()&&window.releases.length===1,'Cancel must release file token');
          if(window.submissions.length!==2)throw Error('Cancel must not bind file');
          document.querySelector('button[aria-label="添加 NOTES"]').click();await wait(()=>category()==='notes','Category add must focus Notes');
          button('文件').click();await wait(()=>category()==='files','Files missing');button('选择文件…').click();await wait(()=>!button('添加到任务').disabled,'File cannot be submitted');button('添加到任务').click();
          await wait(()=>!dialog()&&document.querySelector('.task-context-rail').textContent.includes('spec.md'),'File binding not reflected');
          [...document.querySelectorAll('.task-context-row')].find(item=>item.textContent==='spec.md').click();await wait(()=>window.reveals.length===1,'Bound file must reveal original');
          document.querySelector('button[aria-label="添加 LINKS"]').click();await wait(()=>category()==='links','LINKS add must focus Links');
          await fill(dialog().querySelector('input[type="url"]'),'javascript:alert(1)');if(!button('添加到任务').disabled)throw Error('Unsafe URL accepted');
          await fill(dialog().querySelector('input[type="url"]'),'https://example.com/spec');button('添加到任务').click();await wait(()=>!dialog(),'Link add failed');
          document.querySelector('.task-context-toolbar button').click();await wait(()=>dialog(),'Reopen failed');button('Issues').click();await wait(()=>category()==='issues','Issues missing');
          if(!dialog().querySelector('[data-issue-picker-toolbar]')||!dialog().querySelector('[role="separator"]'))throw Error('Shared filters and resizable preview missing');
          dialog().querySelector('button[role="checkbox"]').click();await wait(()=>!button('添加到任务').disabled,'Issue selection missing');button('添加到任务').click();await wait(()=>!dialog(),'Issue add failed');
          document.querySelector('button[aria-label="添加 ISSUES"]').click();await wait(()=>category()==='issues','ISSUES add must focus Issues');
          if(dialog().querySelector('button[role="checkbox"]'))throw Error('Already linked issue must be excluded by default unlinked filter');
          button('Pull requests').click();await wait(()=>category()==='pullRequests','PR tab missing');dialog().querySelector('button[role="checkbox"]').click();await wait(()=>!button('添加到任务').disabled,'PR selection missing');button('添加到任务').click();await wait(()=>!dialog(),'PR add failed');
          document.querySelector('button[aria-label="添加 PULL REQUESTS"]').click();await wait(()=>category()==='pullRequests','PR plus must focus PR');button('取消').click();await wait(()=>!dialog(),'Close failed');
          if(window.submissions.some(item=>item.id!=='existing'))throw Error('Resources bound to wrong task');
          document.querySelector('button[aria-label="添加 CHANGES"]').click();await wait(()=>category()==='repositories','CHANGES plus must open repository picker');
          await wait(()=>dialog().querySelector('[data-resource-id="backend"]'),'Shared repository list missing');
          const directoryRow=id=>dialog()?.querySelector('[data-resource-id="'+id+'"]');
          if(directoryRow('repo').querySelector('[role="checkbox"]').disabled||!directoryRow('repo').textContent.includes('仓库已添加'))throw Error('Already linked repository should show a notice, not be disabled');
          directoryRow('backend').querySelector('[role="checkbox"]').click();await wait(()=>directoryRow('backend').querySelector('[aria-label="源分支"]'),'Selected directory controls missing');
          if(dialog().querySelector('[aria-label="目标分支"]'))throw Error('Task resource picker must not include target branch input');
          button('链接').click();await wait(()=>category()==='links','Switch category failed');button('仓库与文件夹').click();await wait(()=>category()==='repositories','Switch back failed');
          if(directoryRow('backend').querySelector('[role="checkbox"]').getAttribute('aria-checked')!=='true')throw Error('Category switching must preserve directory selection');
          window.failSave=true;button('添加到任务').click();await wait(()=>dialog().querySelector('[role="alert"]'),'Directory save failure must be visible');
          if(directoryRow('backend').querySelector('[role="checkbox"]').getAttribute('aria-checked')!=='true')throw Error('Failed add lost selected directory');
          window.failSave=false;await wait(()=>!button('添加并继续').disabled,'Directory retry must be enabled');button('添加并继续').click();
          await wait(()=>directoryRow('backend').textContent.includes('仓库已添加'),'Added repository should show an existing-binding notice');
          if(directoryRow('backend').querySelector('[role="checkbox"]').disabled)throw Error('Added repository must remain selectable for another worktree');
          await wait(()=>[...document.querySelectorAll('.task-context-change')].some(row=>row.textContent.includes('backend')),'CHANGES did not refresh');
          const directoryCalls=window.submissions.filter(item=>item.input.resources);
          if(directoryCalls.length!==2||directoryCalls[0].input.requestId!==directoryCalls[1].input.requestId||directoryCalls[1].input.resources[0].mode!=='worktree'||directoryCalls[1].input.resources[0].targetBranch!=='')throw Error('Directory retry/configuration payload incorrect');
          button('添加仓库').click();await wait(()=>document.querySelectorAll('[data-slot="dialog-content"]').length===2,'Nested quick-add missing');
          const nested=()=>[...document.querySelectorAll('[data-slot="dialog-content"]')].at(-1);
          button('取消',nested()).click();await wait(()=>document.querySelectorAll('[data-slot="dialog-content"]').length===1,'Quick-add cancel must preserve resource dialog');
          button('添加仓库').click();await wait(()=>document.querySelectorAll('[data-slot="dialog-content"]').length===2,'Quick-add reopen failed');
          button('选择本地文件夹',nested()).click();await wait(()=>directoryRow('quick')?.querySelector('[role="checkbox"]').getAttribute('aria-checked')==='true','Quick-added folder must be auto-selected');
          await wait(()=>!button('添加到任务').disabled,'Quick folder inspection missing');button('添加到任务').click();await wait(()=>!dialog(),'Directory submit must close dialog');
          if(![...document.querySelectorAll('.task-context-row')].some(row=>row.textContent==='quick'))throw Error('Plain folder must appear in LINKS');
          document.querySelector('button[aria-label="添加 CHANGES"]').click();await wait(()=>directoryRow('assets'),'Repository picker reopen failed');directoryRow('assets').querySelector('[role="checkbox"]').click();button('取消').click();await wait(()=>!dialog(),'Cancel must close picker');
          if([...document.querySelectorAll('.task-context-row')].some(row=>row.textContent==='assets'))throw Error('Cancelled directories must not bind to task');
          document.querySelector('.task-context-toolbar button').click();await wait(()=>dialog(),'Final preview missing');button('笔记').click();await wait(()=>category()==='notes','Notes preview missing');
        })()\`);
        if(process.env.NAVO_RESOURCE_SCREENSHOT){await win.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,200))))");await require('node:fs/promises').writeFile(process.env.NAVO_RESOURCE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());}
        if(errors.length)throw Error(errors.join('\\n'));console.log('RESOURCE_UI_OK');app.exit(0);
      }catch(error){console.error(error,errors.join('\\n'));app.exit(1);}
    });`);
    let output="";child=spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:""},stdio:["ignore","pipe","pipe"]});child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);
    const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});assert.equal(code,0,output);assert.match(output,/RESOURCE_UI_OK/);
  }finally{child?.kill("SIGKILL");await server.close();await rm(directory,{recursive:true,force:true});}
});
