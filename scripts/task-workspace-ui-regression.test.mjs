import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("任务工作台：窄侧栏、终端同步、挂载独立、分组和会话状态图标", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-workbench-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error",
    plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, worker: { format: "es" }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__workbench", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__workbench", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TaskWorkspace} from '/src/components/tasks/workspace/TaskWorkspace.tsx';
      import {TaskSessionStatusIcon} from '/src/components/tasks/workspace/SessionStatusIcon.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';import {useSettingsStore} from '/src/stores/settingsStore.ts';
      import {useTaskSessionStore,subscribeTaskSessions} from '/src/stores/taskSessionStore.ts';
      await i18n.changeLanguage('zh-CN');useSettingsStore.setState({loaded:true});
      const data=new Set(),exits=new Set(),changed=new Set();window.creates=[];window.stops=[];window.archives=[];window.renames=[];window.removes=[];window.attached=[];window.destroyed=[];
      const task={id:'test-task',title:'任务工作台验证',description:'真实任务描述',date:'2026-10-07',projectName:'test',status:'TODO',resources:[],links:[],webLinks:[],attachments:[]};
      let records=[],number=0;const publish=()=>{for(const callback of changed)callback(structuredClone(records));return structuredClone(records);};
      window.navo={agents:{onCapabilitiesChanged:()=>()=>{},capabilitySnapshot:async()=>({settings:{configurations:['grok','claude'].map(id=>({id,enabled:true}))},installations:[],entries:Object.fromEntries(['grok','claude'].map(id=>[id,{capabilities:{agentId:id},pending:false,error:null}]))})},taskSessions:{
        list:async()=>structuredClone(records),onChanged:callback=>{changed.add(callback);return()=>changed.delete(callback);},
        start:async input=>{window.creates.push(input);number++;records.push({id:input.kind+'-'+number,taskId:task.id,kind:input.kind,title:input.kind==='shell'?'zsh'+number:'CLI session '+number,agent:input.kind==='agent'?{agentId:input.agentId,modelName:'hidden-model',modeName:'hidden-mode',effort:'hidden-effort'}:undefined,nativeSessionId:'3ce7a9f0-9d84-47bc-921c-9cf4f686fccc',cwd:'/test',status:'running',terminalId:'terminal-'+number,createdAt:'now',resumable:false});return publish();},
        stop:async id=>{window.stops.push(id);records=records.filter(record=>record.id!==id);return publish();},
        archive:async id=>{window.archives.push(id);records=records.map(record=>record.id===id?{...record,status:'stopped',archivedAt:new Date().toISOString()}:record);return publish();},
        rename:async(id,title)=>{window.renames.push({id,title});records=records.map(record=>record.id===id?{...record,title,status:'stopped'}:record);return publish();},
        remove:async id=>{window.removes.push(id);records=records.filter(record=>record.id!==id);return publish();},
        restart:async()=>publish(),openLink:async()=>{},revealAttachment:async()=>{}
      },terminal:{
        create:async params=>{window.attached.push(params);for(const callback of data){callback({sessionId:params.sessionId,data:''});callback({sessionId:params.sessionId,data:'SAFE TEST OUTPUT\\r\\n'});}},
        write:async()=>{},resize:async()=>{},destroy:async params=>window.destroyed.push(params.sessionId),
        onData:callback=>{data.add(callback);return()=>data.delete(callback);},onExit:callback=>{exits.add(callback);return()=>exits.delete(callback);}
      }};
      subscribeTaskSessions();
      function Fixture(){const [width,setWidth]=React.useState(360),[visible,setVisible]=React.useState(true),[sidebar,setSidebar]=React.useState(true),[currentTask,setTask]=React.useState(task);window.resizeFixture=setWidth;window.showFixture=setVisible;window.setSidebar=setSidebar;window.setTaskResources=resources=>setTask({...task,...resources});
        return React.createElement(TooltipProvider,null,React.createElement('div',{id:'status'},React.createElement(TaskSessionStatusIcon,{taskId:task.id})),visible&&React.createElement('div',{id:'fixture',style:{width,height:610}},React.createElement(TaskWorkspace,{task:currentTask,headingId:'test-title',onClose:()=>setVisible(false),onOpenPage:sidebar?()=>{}:undefined})));}
      window.setRecords=value=>{records=value;publish();};window.renameSession=(id,title)=>{records=records.map(record=>record.id===id?{...record,title}:record);publish();};window.setLocale=locale=>i18n.changeLanguage(locale);
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,"user-data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1150,height:850,webPreferences:{backgroundThrottling:false}});
      win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
      try {await win.loadURL(${JSON.stringify("http://127.0.0.1:"+server.httpServer.address().port+"/__workbench")});
      await win.webContents.executeJavaScript(\`(async()=>{
        const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
        const wait=async(check,message)=>{for(let i=0;i<200;i++){if(check())return;await pause();}throw new Error(message);};
        const button=label=>document.querySelector('button[aria-label="'+label+'"]');
        await wait(()=>button('显示终端'),'workspace not mounted');
        await wait(()=>document.querySelector('.task-workbench').dataset.narrow==='true','narrow container not detected');
        if(document.querySelector('.task-context-container'))throw new Error('Narrow side rail must collapse');
        button('任务上下文').click();await wait(()=>document.querySelector('.task-context-container'),'Context toggle failed');
        if(document.querySelector('.task-context-title'))throw new Error('Context title must be removed');
        const resourceButton=document.querySelector('.task-context-toolbar button');
        if(!resourceButton?.disabled||resourceButton.textContent.trim()!=='添加资源')throw new Error('Add resource must remain a translated disabled placeholder');
        const resourceBounds=resourceButton.getBoundingClientRect();
        const toolbarBounds=resourceButton.parentElement.getBoundingClientRect();
        if(resourceButton.dataset.variant!=='outline'||resourceBounds.height!==28||Math.abs(resourceBounds.width-toolbarBounds.width)>1||Math.abs(resourceBounds.left-toolbarBounds.left)>1)throw new Error('Add resource must be a full-width 28px outline button');
        const titleBounds=document.querySelector('.task-workbench-heading h2').getBoundingClientRect();
        const statusBounds=document.querySelector('.task-workbench-task-status').getBoundingClientRect();
        if(statusBounds.width===0||Math.abs(statusBounds.left-titleBounds.right-8)>1)throw new Error('Task status must sit directly beside the title even in a narrow pane');
        if(document.querySelector('.task-context-group'))throw new Error('Empty context groups must hide');
        if(document.querySelector('.task-workbench-heading button[aria-label="新建会话"]'))throw new Error('Header must not offer new session');
        if(![...document.querySelectorAll('.task-session-empty button')].some(item=>item.textContent.includes('新建会话')))throw new Error('Empty task must still offer new session');
        window.setTaskResources({resources:[{resourceId:'repo',name:'repo',mode:'worktree',workingPath:'/test',targetBranch:'feature'}],links:[{id:'pr',group:'PR',title:'PR'},{id:'issue',group:'ISSUE',title:'Issue'}],attachments:[{id:'file',name:'file.txt'}]});
        await wait(()=>document.querySelectorAll('.task-context-group').length===4,'Populated groups must appear');
        if(getComputedStyle(document.querySelector('.task-context-group-heading')).height!=='32px'||getComputedStyle(document.querySelector('.task-context-group + .task-context-group')).marginTop!=='6px')throw new Error('Context groups must use 32px headings and 6px spacing');
        for(const name of ['CHANGES','PULL REQUESTS','ISSUES','LINKS'])if(!document.querySelector('.task-context-rail').textContent.includes(name))throw new Error('Missing '+name);
        if(document.querySelector('.task-context-rail').textContent.includes('NOTES'))throw new Error('Empty notes must hide');
        window.setTaskResources({});await wait(()=>!document.querySelector('.task-context-group'),'Cleared groups must hide');
        const sidebarActions=document.querySelector('.task-workbench-actions').querySelectorAll('button').length;
        window.setSidebar(false);await wait(()=>document.querySelector('.task-workbench-actions').querySelectorAll('button').length===sidebarActions-2,'Task page must remove close and promote buttons');
        window.setSidebar(true);await wait(()=>document.querySelector('.task-workbench-actions').querySelectorAll('button').length===sidebarActions,'Sidebar close must remain');
        if(document.querySelector('.task-context-container').getBoundingClientRect().width>320)throw new Error('Context escapes sidebar');
        button('收起任务上下文').click();button('显示终端').click();
        await wait(()=>button('关闭 zsh1'),'Terminal 1 missing');
        await wait(()=>document.querySelector('.task-shell-pane [role="textbox"]')?.textContent.includes('SAFE TEST OUTPUT'),'Started terminal must render real VT output');
        if(window.destroyed.length)throw new Error('Attaching a terminal must not terminate its process');
        if(document.querySelector('.task-terminal-badge').textContent!=='1')throw new Error('Badge missing');
        button('新建终端').click();await wait(()=>button('关闭 zsh2'),'Terminal 2 missing');
        await wait(()=>window.attached.length===2,'Terminal did not attach');
        if(window.attached.some(params=>!params.attachOnly))throw new Error('Must attach existing PTY');
        button('任务上下文').click();await wait(()=>document.querySelector('.task-context-container'),'Context missing');
        if(!document.querySelector('.task-context-rail').textContent.includes('zsh2'))throw new Error('Context terminal not synchronized');
        button('收起任务上下文').click();
        window.showFixture(false);await pause();window.showFixture(true);await wait(()=>button('显示终端'),'Remount failed');
        if(window.creates.length!==2||window.attached.length!==2)throw new Error('View remount restarted terminals');
        button('显示终端').click();await wait(()=>button('关闭 zsh1'),'Existing terminal lost');
        button('关闭 zsh1').click();await wait(()=>!button('关闭 zsh1'),'Close failed');
        button('关闭 zsh2').click();await wait(()=>!document.querySelector('.task-terminal-badge'),'Zero badge should hide');
        button('任务上下文').click();await pause();
        const headings=[...document.querySelectorAll('.task-context-group-heading')].map(node=>node.textContent);
        if(headings.some(text=>text.includes('终端')))throw new Error('Empty terminal group must hide');
        button('收起任务上下文').click();button('显示终端').click();await wait(()=>button('关闭 zsh3'),'Number reused');
        window.resizeFixture(1020);await wait(()=>document.querySelector('.task-workbench').dataset.narrow==='false','Desktop not detected');
        await wait(()=>document.querySelector('.task-context-container'),'Desktop context missing');
        for(const divider of document.querySelectorAll('.task-workbench-separator')){
          if(!divider.classList.contains('panel-resize-handle'))throw new Error('Workspace dividers must use the shared resize handle');
          const line=getComputedStyle(divider,'::after');
          if(line.borderRadius!=='2px'||(divider.dataset.resizeAxis==='y'?line.height:line.width)!=='2px')throw new Error('Resize handle stroke must use the shared 2px rounded line');
        }
        const styleProbes=[];
        for(const className of ['task-panel-separator','task-split-separator','task-workbench-separator','absolute'])for(const axis of ['x','y']){
          const probe=document.createElement('div');probe.className=className+' panel-resize-handle';probe.dataset.resizeAxis=axis;probe.dataset.resizing='true';
          Object.assign(probe.style,{position:'fixed',left:'-1000px',top:'0',width:axis==='x'?'8px':'200px',height:axis==='x'?'200px':'8px'});
          document.body.append(probe);styleProbes.push(probe);
        }
        await wait(()=>styleProbes.every(probe=>Number(getComputedStyle(probe,'::after').opacity)===0.3),'All resize handles must use the same drag opacity');
        for(const probe of styleProbes){
          const line=getComputedStyle(probe,'::after'),vertical=probe.dataset.resizeAxis==='x';
          if((vertical?line.width:line.height)!=='2px'||(vertical?line.height:line.width)!=='40px'||line.borderRadius!=='2px')throw new Error('All resize handles must use centered short strokes, not full-height borders');
          probe.remove();
        }
        await window.setLocale('en');await wait(()=>button('Show terminals'),'English translation missing');
        window.setRecords([{id:'agent',taskId:'test-task',kind:'agent',title:'CLI generated name',agent:{agentId:'grok'},status:'failed',terminalId:'failed',cwd:'/test',resumable:false},
          {id:'second-agent',taskId:'test-task',kind:'agent',title:'Second CLI name',agent:{agentId:'claude'},status:'stopped',terminalId:'second-terminal',cwd:'/test',resumable:false}]);
        await wait(()=>document.querySelector('#status [aria-label="Failed"]'),'Tab status is not driven by sessions');
        await wait(()=>document.querySelectorAll('.task-context-session').length===2,'Session rows missing');
        const rows=()=>[...document.querySelectorAll('.task-context-session')];
        if(!rows()[0].querySelector('svg[aria-label="Grok Build"]')||!rows()[1].querySelector('svg[aria-label="Claude Code"]'))throw new Error('Agent brand icons missing');
        if(rows()[0].querySelector('.task-session-status')||rows()[0].querySelector('.task-context-session-status').textContent!=='Failed')throw new Error('Session status must be text, not an icon');
        if(rows().some(row=>!row.querySelector('button[aria-label="Archive session"]')))throw new Error('Archive action missing');
        window.renameSession('agent','CLI renamed name');await wait(()=>rows()[0].textContent.includes('CLI renamed name'),'Native title update missing');
        rows()[0].querySelector('button[aria-label="Archive session"]').click();
        await wait(()=>rows().length===1,'Archived session must leave context');
        if(window.archives[0]!=='agent'||!document.querySelector('.task-agent-pane').textContent.includes('Second CLI name'))throw new Error('Archiving must not select another session accidentally');
        if(!window.destroyed.includes('failed'))throw new Error('Archive must release the terminal buffer');
        rows()[0].querySelector('button[aria-label="Archive session"]').click();
        await wait(()=>rows().length===0,'Last archived row must disappear');
        await wait(()=>document.querySelector('#status [aria-label="No session"]'),'Archived records must not affect tab status');
        if(document.querySelector('.task-context-group'))throw new Error('Empty session group must hide');
        if(!document.querySelector('.task-session-empty button'))throw new Error('Task must still allow creating a new session');
        const menuItem=label=>[...document.querySelectorAll('[role="menuitem"]')].find(element=>(element.querySelector(':scope > span')?.textContent||element.textContent).trim()===label);
        const openDropdown=element=>element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,isPrimary:true,pointerType:'mouse'}));
        openDropdown(document.querySelector('.task-agent-pane button[aria-label="New session"]'));
        await wait(()=>menuItem('Grok Build'),'Agent picker missing');
        if(document.querySelector('[role="dialog"]')||document.querySelector('[role="combobox"]'))throw new Error('New session must only show the Agent menu');
        menuItem('Grok Build').click();await wait(()=>rows().length===1,'Agent selection did not create session');
        const request=window.creates[window.creates.length-1];if(request.agentId!=='grok'||request.agent||request.resourceId)throw new Error('New session must only submit Agent ID, not inherited configuration');
        if(document.querySelector('.task-agent-pane').textContent.includes('hidden-model')||document.querySelector('.task-session-config')||button('Stop session'))throw new Error('Session chrome must hide configuration and stop action');
        const createdCount=window.creates.length,stoppedCount=window.stops.length,destroyedCount=window.destroyed.length;
        button('Close pane').click();await wait(()=>!document.querySelector('.task-agent-pane'),'Close pane must remove the module');
        await wait(()=>!document.querySelector('.task-context-group-heading button[aria-label="New session"]')?.disabled,'Creation did not settle');
        if(document.querySelector('.task-agent-pane'))throw new Error('Late creation result must not reopen a closed pane');
        if(window.stops.length!==stoppedCount||window.destroyed.length!==destroyedCount||rows().length!==1)throw new Error('Close pane must not terminate or archive');
        rows()[0].querySelector('.task-context-session-select').click();await wait(()=>document.querySelector('.task-agent-pane'),'Selecting context must reopen pane');
        rows()[0].querySelector('.task-context-session-select').click();await wait(()=>!document.querySelector('.task-agent-pane'),'Repeated selection must hide the session pane');
        if(rows()[0].dataset.active==='true')throw new Error('Hidden session must not remain highlighted');
        rows()[0].querySelector('.task-context-session-select').click();await wait(()=>document.querySelector('.task-agent-pane'),'Repeated selection must show the session pane again');
        if(window.stops.length!==stoppedCount||window.destroyed.length!==destroyedCount)throw new Error('Context toggles must not stop a session');
        if(window.creates.length!==createdCount)throw new Error('Reopen must not create another session');
        openDropdown(button('Session actions'));await wait(()=>menuItem('Rename session'),'Session menu missing');
        for(const label of ['Archive session','Delete session'])if(!menuItem(label))throw new Error('Missing '+label);
        if(menuItem('Rename session').nextElementSibling?.getAttribute('role')!=='separator'||menuItem('Archive session').nextElementSibling!==menuItem('Delete session'))throw new Error('Archive and delete must share a group separated from rename');
        menuItem('Rename session').click();await wait(()=>document.querySelector('input[aria-label="Session name"]'),'Rename dialog missing');
        const field=document.querySelector('input[aria-label="Session name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'Renamed native session');field.dispatchEvent(new Event('input',{bubbles:true}));await pause();
        const dialogButton=label=>[...document.querySelectorAll('[role="dialog"] button')].find(element=>element.textContent.trim()===label);
        dialogButton('Confirm').click();await wait(()=>window.renames.length===1&&!document.querySelector('[role="dialog"]'),'Rename not submitted');
        if(!document.querySelector('.task-agent-pane').textContent.includes('Renamed native session'))throw new Error('Native name not synchronized');
        openDropdown(document.querySelector('.task-context-group-heading button[aria-label="New session"]'));await wait(()=>menuItem('Claude Code'),'Context Agent picker missing');
        menuItem('Claude Code').click();await wait(()=>rows().length===2,'Context must use same new session behavior');
        await wait(()=>!button('Session actions')?.disabled,'Context creation did not settle');
        rows()[0].querySelector('.task-context-session-select').click();await wait(()=>document.querySelector('.task-agent-pane').textContent.includes('Renamed native session'),'Different session must switch and show');
        rows()[1].querySelector('.task-context-session-select').click();await wait(()=>!document.querySelector('.task-agent-pane').textContent.includes('Renamed native session'),'Switching back must show the selected session');
        openDropdown(button('Session actions'));await wait(()=>menuItem('Delete session'),'Delete menu missing');menuItem('Delete session').click();
        await wait(()=>dialogButton('Cancel'),'Delete confirmation missing');dialogButton('Cancel').click();await wait(()=>!document.querySelector('[role="dialog"]'),'Cancel failed');
        if(window.removes.length)throw new Error('Cancel must not delete native history');
        openDropdown(button('Session actions'));await wait(()=>menuItem('Delete session'),'Delete menu missing');menuItem('Delete session').click();await wait(()=>dialogButton('Delete'),'Delete confirmation missing');dialogButton('Delete').click();
        await wait(()=>window.removes.length===1&&rows().length===1,'Delete must remove only the selected session');
        button('Show terminals').click();await wait(()=>document.querySelector('.task-shell-tab'),'First terminal missing');
        await wait(()=>!button('New terminal').disabled,'First terminal creation pending');
        button('New terminal').click();await wait(()=>document.querySelectorAll('.task-shell-tab').length===2,'Second terminal missing');
        await wait(()=>!button('New terminal').disabled,'Second terminal creation pending');
        const terminalRows=()=>[...document.querySelectorAll('.task-context-row[aria-pressed]')];
        const activeTerminalName=()=>document.querySelector('.task-shell-tab[data-active="true"] span')?.textContent;
        const terminalNames=terminalRows().map(row=>row.textContent);
        const toggleCounts=[window.creates.length,window.stops.length,window.destroyed.length];
        terminalRows()[0].click();await wait(()=>activeTerminalName()===terminalNames[0],'Different terminal must switch and show');
        terminalRows()[0].click();await wait(()=>!document.querySelector('.task-shell-pane'),'Repeated terminal selection must hide');
        if(terminalRows().some(row=>row.dataset.active==='true'))throw new Error('Hidden terminal must not remain highlighted');
        terminalRows()[0].click();await wait(()=>activeTerminalName()===terminalNames[0],'Repeated terminal selection must reopen');
        terminalRows()[1].click();await wait(()=>activeTerminalName()===terminalNames[1],'Different terminal must switch');
        if(!button('Hide terminals').querySelector('.lucide-panel-bottom-close'))throw new Error('Hide terminal must not reuse the dropdown chevron');
        button('Hide terminals').click();await wait(()=>!document.querySelector('.task-shell-pane'),'Terminal toolbar hide failed');
        terminalRows()[1].click();await wait(()=>activeTerminalName()===terminalNames[1],'Context must reopen after toolbar hide');
        button('Maximize terminal').click();await wait(()=>!document.querySelector('.task-agent-pane'),'Terminal maximize failed');
        rows()[0].querySelector('.task-context-session-select').click();await wait(()=>document.querySelector('.task-agent-pane'),'Session selection must show a pane hidden by maximized terminals');
        if(JSON.stringify(toggleCounts)!==JSON.stringify([window.creates.length,window.stops.length,window.destroyed.length]))throw new Error('Pane toggles must not change processes');
        if(document.querySelector('.demo-preview-trigger')||document.querySelector('.demo-changes-container'))throw new Error('Demo-only controls shipped');
        window.resizeFixture(240);await pause();
        const root=document.querySelector('.task-workbench');if(root.scrollWidth>root.clientWidth+2)throw new Error('Narrow workspace overflows');
      })()\`);
      console.log('WORKBENCH_UI_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}
    });`);
    let output = "";
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: ["ignore","pipe","pipe"] });
    child.stdout.on("data", data=>output+=data);child.stderr.on("data",data=>output+=data);
    const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});
    assert.equal(code,0,output);assert.match(output,/WORKBENCH_UI_OK/);
  } finally {child?.kill("SIGKILL");await server.close();await rm(directory,{recursive:true,force:true});}
});
