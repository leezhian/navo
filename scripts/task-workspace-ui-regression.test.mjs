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
      import {TaskSessionStatusIcon} from '/src/components/tasks/workspace/SessionStatusIcon.tsx';import {resolveSessionWorkspace} from '/src/utils/taskSessionWorkspace.ts';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';import {useSettingsStore} from '/src/stores/settingsStore.ts';
      import {useTaskSessionStore,subscribeTaskSessions} from '/src/stores/taskSessionStore.ts';
      import {useResourceStore} from '/src/stores/resourceStore.ts';
      import {WORKSPACE_OPTIONS_CACHE_MS} from '/src/services/workspaceOpenOptions.ts';
      const originalNow=Date.now;let timeOffset=0;Date.now=()=>originalNow()+timeOffset;window.expireWorkspaceOptions=()=>{timeOffset+=WORKSPACE_OPTIONS_CACHE_MS+1;window.dispatchEvent(new Event('focus'));};
      await i18n.changeLanguage('zh-CN');useSettingsStore.setState({loaded:true,settings:{...useSettingsStore.getState().settings,locale:'zh-CN'}});
      window.setCommandRecord=(id,commands=[{id:'build',name:'Build',script:'echo fixture',runOnWorktreeCreation:false}])=>useResourceStore.setState({loaded:true,records:[{id,name:'repo',kind:'repo',available:true,localPath:'/test',commands}]});window.setCommandRecord('repo');
      const data=new Set(),exits=new Set(),changed=new Set();window.creates=[];window.stops=[];window.restarts=[];window.autoResumes=[];window.archives=[];window.renames=[];window.removes=[];window.attached=[];window.destroyed=[];window.workspaceOpens=[];window.remoteProvider="GitLab";
      const task={id:'test-task',title:'任务工作台验证',description:'真实任务描述',date:'2026-10-07',projectName:'test',status:'TODO',resources:[],links:[],webLinks:[],attachments:[]};
      let records=[],number=0;window.scopeResources=[];const publish=()=>{for(const callback of changed)callback(structuredClone(records));return structuredClone(records);};
      const extensionListeners=new Set();let extensionStatus={id:'session-trace',version:'0.1.0',availableVersion:'0.1.0',enabled:false,compatible:true,operation:'idle',progress:0,error:null,downloadBytes:100};window.traceOpens=[];window.traceCloses=[];window.traceLeaseIds=[];window.setTraceEnabled=enabled=>{extensionStatus={...extensionStatus,enabled};for(const callback of extensionListeners)callback(extensionStatus);};
      window.navo={extensions:{status:async()=>extensionStatus,onChanged:callback=>{extensionListeners.add(callback);return()=>extensionListeners.delete(callback);},openTrace:async(id,leaseId)=>{window.traceOpens.push(id);window.traceLeaseIds.push(leaseId);if(window.deferTraceOpen)await new Promise(resolve=>{window.resolveTraceOpen=resolve;});return{id:leaseId};},closeTrace:async id=>window.traceCloses.push(id),queryTrace:async(_leaseId,query)=>query.kind==='timeline'?{events:[],truncated:false}:query.kind==='detail'?{id:query.eventId??0,kind:'user',round:0,preview:'',content:'',raw:'',truncated:false}:{events:[],total:0,stats:{events:0,rounds:0,requests:null,tools:0,errors:0}},onTraceChanged:()=>()=>{}},settings:{save:async settings=>{window.savedSettings=settings;return settings;}},resources:{onCloneProgress:()=>()=>{},inspectGit:async()=>({isRepository:true,remoteUrl:null})},tasks:{workspaceOpenOptions:async()=>{window.optionsReadCount=(window.optionsReadCount||0)+1;if(window.failWorkspaceOptions)throw new Error('fixture read failure');return {editors:window.noEditors?[]:[{id:'vscode',name:'VS Code'},{id:'xcode',name:'Xcode'}],remote:{provider:window.remoteProvider,url:'https://gitlab.com/fixture/repo'},externalTerminal:true};},openWorkspace:async(taskId,resourceId,target)=>window.workspaceOpens.push({taskId,resourceId,target})},agents:{onCapabilitiesChanged:()=>()=>{},capabilitySnapshot:async()=>({settings:{configurations:['grok','claude'].map(id=>({id,enabled:true}))},installations:[],entries:Object.fromEntries(['grok','claude'].map(id=>[id,{capabilities:{agentId:id},pending:false,error:null}]))})},taskSessions:{
        resumeVisible:async id=>{window.autoResumes.push(id);return publish();},
        list:async()=>structuredClone(records),refreshTitles:async()=>structuredClone(records),onChanged:callback=>{changed.add(callback);return()=>changed.delete(callback);},
        start:async input=>{window.creates.push(input);number++;records.push({id:input.kind+'-'+number,taskId:task.id,kind:input.kind,command:input.commandId?{id:input.commandId,resourceId:input.resourceId,name:'Build'}:undefined,title:input.commandId?'Build':input.kind==='shell'?'zsh'+number:'CLI session '+number,agent:input.kind==='agent'?{agentId:input.agentId,modelName:'hidden-model',modeName:'hidden-mode',effort:'hidden-effort'}:undefined,nativeSessionId:'3ce7a9f0-9d84-47bc-921c-9cf4f686fccc',cwd:'/test',workspace:resolveSessionWorkspace(window.scopeResources,input.resourceId),status:'running',terminalId:'terminal-'+number,createdAt:'now',lastActiveAt:'2026-10-07T00:00:00.000Z',resumable:input.kind==='agent'});return publish();},
        stop:async id=>{window.stops.push(id);records=records.filter(record=>record.id!==id||record.kind==='agent').map(record=>record.id===id?{...record,status:'stopped'}:record);return publish();},
        archive:async id=>{window.archives.push(id);records=records.map(record=>record.id===id?{...record,status:'stopped',archivedAt:new Date().toISOString()}:record);return publish();},
        restore:async id=>{records=records.map(record=>record.id===id?{...record,archivedAt:undefined,status:'stopped'}:record);return publish();},
        rename:async(id,title)=>{window.renames.push({id,title});records=records.map(record=>record.id===id?{...record,title,status:'stopped'}:record);return publish();},
        remove:async id=>{window.removes.push(id);records=records.filter(record=>record.id!==id);return publish();},
        restart:async(id,resume)=>{window.restarts.push({id,resume});records=records.map(record=>record.id===id?{...record,status:'running'}:record);return publish();},openLink:async()=>{},revealAttachment:async()=>{}
      },terminal:{
        create:async params=>{window.attached.push(params);for(const callback of data){callback({sessionId:params.sessionId,data:'',replay:true});callback({sessionId:params.sessionId,data:'SAFE TEST OUTPUT\\r\\n'});}},
        write:async()=>{},resize:async()=>{},destroy:async params=>window.destroyed.push(params.sessionId),
        onData:callback=>{data.add(callback);return()=>data.delete(callback);},onExit:callback=>{exits.add(callback);return()=>exits.delete(callback);}
      }};
      subscribeTaskSessions();
      function Fixture(){const [width,setWidth]=React.useState(360),[visible,setVisible]=React.useState(true),[sidebar,setSidebar]=React.useState(true),[currentTask,setTask]=React.useState(task);window.resizeFixture=setWidth;window.showFixture=setVisible;window.setSidebar=setSidebar;window.setTaskResources=resources=>{window.scopeResources=resources.resources||[];setTask({...task,...resources});};
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
        const button=label=>(label==='Session actions'?document.querySelector('.task-agent-pane'):document).querySelector('button[aria-label="'+label+'"]');
        const assertItemIcons=()=>{
          for(const item of document.querySelectorAll('.task-context-row, .task-context-session-select')){
            const title=item.querySelector('.block.truncate')??item.querySelector(':scope > span.truncate');
            if(!title||getComputedStyle(title).fontSize!=='12px')throw new Error('All context item titles must use 12px text');
            const icon=item.querySelector(':scope > .task-context-item-icon');
            if(!icon||!icon.querySelector('svg'))throw new Error('Every context item needs a leading icon container');
            const bounds=icon.getBoundingClientRect(),style=getComputedStyle(icon);
            if(bounds.width!==28||bounds.height!==28||style.backgroundColor==='rgba(0, 0, 0, 0)')throw new Error('Context icons need a prominent 28px square background');
            const glyph=icon.querySelector('svg').getBoundingClientRect();
            if(glyph.width!==16||glyph.height!==16)throw new Error('Context glyphs must remain legible at 16px');
            const itemBounds=item.getBoundingClientRect();
            if(Math.abs(bounds.top+bounds.height/2-itemBounds.top-itemBounds.height/2)>1)throw new Error('Context icons must be vertically centered beside the complete item text');
          }
        };
        const assertMetadataActions=(item,metadataSelector,actionsSelector)=>{
          const metadata=item.querySelector(metadataSelector).getBoundingClientRect();
          const actions=item.querySelector(actionsSelector).getBoundingClientRect();
          const titleNode=item.querySelector('.block.truncate');
          const title=(titleNode.parentElement??titleNode).getBoundingClientRect();
          if(actions.height!==20||metadata.height!==20||Math.abs(metadata.top-title.bottom-2)>1)throw new Error('Context actions and metadata must be 20px high with a 2px title gap');
          if(Math.abs(metadata.top+metadata.height/2-actions.top-actions.height/2)>1||actions.top<title.bottom)throw new Error('Item actions must align with metadata, not the title');
          if(Math.abs(title.right-actions.right)>1)throw new Error('Title must retain full width above actions');
        };
        await wait(()=>button('显示终端'),'workspace not mounted');
        await wait(()=>document.querySelector('.task-workbench').dataset.narrow==='true','narrow container not detected');
        await wait(()=>!document.querySelector('.task-context-container'),'Narrow side rail must collapse');
        button('任务上下文').click();await wait(()=>document.querySelector('.task-context-container'),'Context toggle failed');
        // 页面可见且聚焦时，左侧 Sheet 仍应阻止自动恢复；关闭后才启动同一个会话。
        Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.hasFocus=()=>true;window.dispatchEvent(new Event('focus'));
        window.setRecords([{id:'overlay-resume',taskId:'test-task',kind:'agent',agent:{agentId:'claude'},title:'Overlay test',cwd:'/test',workspace:{kind:'task'},status:'stopped',terminalId:'overlay-terminal',createdAt:'now',lastActiveAt:'2026-10-07T00:00:00.000Z',nativeSessionId:'overlay-native',resumable:true,resumeOnOpen:true}]);
        await wait(()=>document.querySelector('.task-agent-pane [title="Overlay test"]'),'Overlay test session missing');await new Promise(resolve=>setTimeout(resolve,200));
        if(window.autoResumes.length)throw new Error('Left context sheet must block automatic resume');
        button('任务上下文').click();await wait(()=>window.autoResumes.length===1,'Closing left sheet must allow automatic resume');
        if(window.autoResumes[0]!=='overlay-resume')throw new Error('Wrong session resumed');
        window.setTraceEnabled(true);document.hasFocus=()=>false;window.dispatchEvent(new Event('blur'));
        window.setRecords([{id:'trace-resume',taskId:'test-task',kind:'agent',agent:{agentId:'claude'},title:'Trace resume test',cwd:'/test',status:'stopped',terminalId:'trace-terminal',createdAt:'now',lastActiveAt:'2026-10-07T00:00:00.000Z',nativeSessionId:'trace-native',resumable:true,resumeOnOpen:true}]);
        const viewTab=label=>Array.from(document.querySelectorAll('.task-workbench-panel-heading [role=group] button')).find(button=>button.getAttribute('aria-label')===label);if(document.querySelector('.task-agent-pane [role=tab]'))throw Error('Session view tab row must be removed');
        await wait(()=>viewTab('轨迹'),'Trace header switch missing');window.deferTraceOpen=true;viewTab('轨迹').click();await wait(()=>window.traceOpens.includes('trace-resume'),'Trace reader missing');
        document.hasFocus=()=>true;window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,200));
        if(window.autoResumes.includes('trace-resume'))throw Error('Historical trace started Agent');
        window.setTraceEnabled(false);await wait(()=>!viewTab('轨迹'),'Disabled plugin switch remained');await wait(()=>window.traceCloses.includes(window.traceLeaseIds.at(-1)),'Disable did not release pending reader');
        window.deferTraceOpen=false;window.resolveTraceOpen();await pause();if(document.querySelector('.task-agent-pane iframe'))throw Error('Late open response remounted a closed trace view');
        await new Promise(resolve=>setTimeout(resolve,200));if(window.autoResumes.includes('trace-resume'))throw Error('Disable fallback started Agent');
        window.setTraceEnabled(true);await wait(()=>viewTab('终端'),'Terminal header switch missing');viewTab('终端').click();await wait(()=>window.autoResumes.includes('trace-resume'),'Explicit terminal selection did not restore');
        // 同一会话内反复切换终端↔轨迹不得关闭解析租约或再次 open（避免杀进程后重开触发 RUNTIME_FAILED）。
        window.traceOpens=[];window.traceCloses=[];window.traceLeaseIds=[];
        viewTab('轨迹').click();await wait(()=>window.traceOpens.length===1,'Trace reopen missing after terminal');
        const keptLease=window.traceLeaseIds[0];
        viewTab('终端').click();await pause();
        if(window.traceCloses.includes(keptLease))throw Error('Terminal↔trace switch must keep the parser lease alive');
        viewTab('轨迹').click();await pause();
        if(window.traceOpens.length!==1||window.traceCloses.includes(keptLease))throw Error('Switching back to trace must reuse the existing parser lease');
        if([...document.querySelectorAll('.task-agent-pane [role=alert]')].some(node=>/轨迹解析进程已退出|RUNTIME_FAILED/.test(node.textContent||'')))throw Error('View switch must not surface parser failure');
        window.setTraceEnabled(false);
        window.setRecords([]);delete document.visibilityState;delete document.hasFocus;window.dispatchEvent(new Event('blur'));
        await wait(()=>!document.querySelector('.task-agent-pane [title="Overlay test"]'),'Overlay test session not removed');
        await wait(()=>window.destroyed.includes('overlay-terminal'),'Removed fixture session must release its terminal');
        if(window.attached.length)throw new Error('Visibility fixture must not attach a stopped terminal');
        window.destroyed=[];
        button('任务上下文').click();await wait(()=>document.querySelector('.task-context-container'),'Context did not reopen');
        if(document.querySelector('.task-context-title'))throw new Error('Context title must be removed');
        const resourceButton=document.querySelector('.task-context-toolbar button');
        if(!resourceButton||resourceButton.disabled||resourceButton.textContent.trim()!=='添加资源')throw new Error('Add resource must open the unified resource dialog');
        const resourceBounds=resourceButton.getBoundingClientRect();
        const toolbarBounds=resourceButton.parentElement.getBoundingClientRect();
        if(resourceButton.dataset.variant!=='outline'||resourceBounds.height!==28||Math.abs(resourceBounds.width-toolbarBounds.width)>1||Math.abs(resourceBounds.left-toolbarBounds.left)>1)throw new Error('Add resource must be a full-width 28px outline button');
        const titleCluster=document.querySelector('.task-workbench-title');
        const titleBounds=titleCluster.querySelector('h2').getBoundingClientRect();
        const menuBounds=titleCluster.querySelector('button[aria-label="任务操作"]').getBoundingClientRect();
        const statusBounds=titleCluster.querySelector('.task-workbench-task-status').getBoundingClientRect();
        if(statusBounds.width===0||Math.abs(titleBounds.top+titleBounds.height/2-statusBounds.top-statusBounds.height/2)>1)throw new Error('Task status must stay on the title row even in a narrow pane');
        if(Math.abs(menuBounds.left-titleBounds.right-4)>1||Math.abs(statusBounds.left-menuBounds.right-4)>1)throw new Error('Title menu and status must sit beside the title with a 4px gap');
        if(document.querySelectorAll('.task-context-group').length!==1||!document.querySelector('.task-context-rail').textContent.includes('任务正文'))throw new Error('Prompt must remain when other groups are empty');
        if(document.querySelector('.task-workbench-heading button[aria-label="新建会话"]'))throw new Error('Header must not offer new session');
        if(![...document.querySelectorAll('.task-session-empty button')].some(item=>item.textContent.includes('新建会话')))throw new Error('Empty task must still offer new session');
        window.setTaskResources({resources:[{resourceId:'repo',name:'repo',mode:'worktree',workingPath:'/test',targetBranch:'feature'}],links:[{id:'pr',group:'PR',title:'PR'},{id:'issue',group:'ISSUE',title:'Issue'}],attachments:[{id:'file',name:'file.txt'}]});
        await wait(()=>document.querySelectorAll('.task-context-group').length===5,'Populated groups must appear');
        for(const group of document.querySelectorAll('.task-context-group'))if(!group.querySelector('.task-context-group-heading button:not(:disabled) .lucide-plus'))throw new Error('Resource groups must expose add buttons');
        if(getComputedStyle(document.querySelector('.task-context-group-heading')).height!=='32px'||getComputedStyle(document.querySelector('.task-context-group + .task-context-group')).marginTop!=='6px')throw new Error('Context groups must use 32px headings and 6px spacing');
        for(const heading of document.querySelectorAll('.task-context-group-heading'))if(getComputedStyle(heading.querySelector('button:first-child')).fontSize!=='12px'||getComputedStyle(heading.querySelector('small')).fontSize!=='10px')throw new Error('Category titles must be 12px with subordinate 10px counts');
        for(const name of ['CHANGES','PULL REQUESTS','ISSUES','LINKS'])if(!document.querySelector('.task-context-rail').textContent.includes(name))throw new Error('Missing '+name);
        const workspaceButtons=()=>[...document.querySelectorAll('.task-context-change-actions > [data-slot="button-group"]:first-child > button')];
        if(workspaceButtons().length!==2||!workspaceButtons()[0].querySelector('.lucide-folder-open'))throw new Error('Changes row needs a file manager / dropdown split button');
        if(workspaceButtons().some(item=>item.dataset.variant!=='ghost'||getComputedStyle(item).borderTopWidth!=='0px'||getComputedStyle(item).borderRightWidth!=='0px'))throw new Error('Changes actions must be borderless ghost buttons');
        assertItemIcons();
        if(!document.querySelector('.task-context-change .task-context-item-icon .lucide-git-branch'))throw new Error('Changes must use git-branch icon');
        const changeRow=document.querySelector('.task-context-change');const changeTitle=changeRow.querySelector('.block.truncate');
        if(changeTitle.textContent!=='feature'||changeRow.querySelector('.task-context-row').textContent!=='feature'||getComputedStyle(changeTitle).fontSize!=='12px')throw new Error('Changes must show only the branch name as its title');
        const changeTitleBounds=changeTitle.getBoundingClientRect(),changeActionsBounds=changeRow.querySelector('.task-context-change-actions').getBoundingClientRect();
        if(changeActionsBounds.height!==20||Math.abs(changeActionsBounds.top-changeTitleBounds.bottom-2)>1||Math.abs(changeActionsBounds.right-changeTitleBounds.right)>1)throw new Error('Changes actions must remain below the full-width branch title');
        workspaceButtons()[0].click();await wait(()=>window.workspaceOpens.length===1&&!workspaceButtons()[0].disabled,'File manager shortcut failed');
        if(document.querySelector('[data-slot="dialog-content"]'))throw new Error('Open-in shortcut must not trigger the Diff row action');
        const workspaceItem=label=>[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.closest('[role="menu"]')?.dataset.state==='open'&&item.textContent===label);
        const workspaceMenu=async()=>{await new Promise(resolve=>setTimeout(resolve,200));workspaceButtons()[1].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,isPrimary:true,pointerType:'mouse'}));await wait(()=>workspaceItem('在文件管理器中打开'),'Workspace menu missing after '+window.workspaceOpens.length+' actions');};
        await workspaceMenu();await wait(()=>workspaceItem('VS Code')&&workspaceItem('Xcode')&&workspaceItem('在 GitLab 上打开'),'Installed IDEs and provider menu missing');
        if(!workspaceItem('VS Code').querySelector('svg[data-editor="vscode"]')||!workspaceItem('Xcode').querySelector('svg[data-editor="xcode"]'))throw new Error('Installed editors must display their mapped brand icons');
        if(workspaceItem('VS Code').querySelector('path').getAttribute('d')===workspaceItem('Xcode').querySelector('path').getAttribute('d'))throw new Error('Different editors must not show the same generic icon');
        if(!workspaceItem('在 GitLab 上打开').querySelector('svg[data-provider="GitLab"]'))throw new Error('GitLab menu must use its provider icon');
        const initialOptionReads=window.optionsReadCount;
        const openInMenu=workspaceItem('VS Code').closest('[role="menu"]');
        if(openInMenu.querySelector('[role="menuitem"]')!==workspaceItem('VS Code')||workspaceItem('Xcode').nextElementSibling?.getAttribute('role')!=='separator'||workspaceItem('Xcode').nextElementSibling?.nextElementSibling!==workspaceItem('在文件管理器中打开'))throw new Error('IDEs must appear first, separated from workspace actions');
        if(getComputedStyle(openInMenu).width!=='192px')throw new Error('Open-in menu must use the narrower 192px width');
        workspaceItem('打开外部终端').click();await wait(()=>window.workspaceOpens.length===2&&!workspaceButtons()[1].disabled,'External terminal action failed');
        if(!workspaceButtons()[0].querySelector('.lucide-terminal')||workspaceButtons()[0].getAttribute('aria-label')!=='打开外部终端')throw new Error('Shortcut must follow last successful target');
        if(window.creates.length)throw new Error('External terminal must not create a task terminal');
        await workspaceMenu();workspaceItem('VS Code').click();await wait(()=>window.workspaceOpens.length===3&&!workspaceButtons()[1].disabled,'IDE action failed');
        if(!workspaceButtons()[0].querySelector('svg[data-editor="vscode"]')||workspaceButtons()[0].getAttribute('aria-label')!=='在 VS Code 中打开')throw new Error('Editor shortcut must use saved editor icon and label');
        window.dispatchEvent(new Event('focus'));await pause();if(window.optionsReadCount!==initialOptionReads)throw new Error('Repeated menus and fresh-cache focus must not query options');
        window.remoteProvider='GitHub';window.expireWorkspaceOptions();await workspaceMenu();await wait(()=>workspaceItem('在 GitHub 上打开'),'Expired options must refresh on focus');
        if(!workspaceItem('在 GitHub 上打开').querySelector('svg[data-provider="GitHub"]'))throw new Error('Changed remote must update provider icon');
        workspaceItem('在 GitHub 上打开').click();await wait(()=>window.workspaceOpens.length===4,'Remote action failed');
        if(window.workspaceOpens.some(call=>call.taskId!=='test-task'||call.resourceId!=='repo'))throw new Error('Open-in actions must bind the exact task resource');
        if(JSON.stringify(window.workspaceOpens.map(call=>call.target))!==JSON.stringify([{kind:'fileManager'},{kind:'terminal'},{kind:'editor',editorId:'vscode'},{kind:'remote'}]))throw new Error('Wrong open-in target');
        await wait(()=>workspaceButtons()[0].querySelector('[data-provider="GitHub"]')&&window.savedSettings?.lastWorkspaceOpenTarget.kind==='remote','Remote shortcut should be saved in settings');
        workspaceButtons()[0].click();await wait(()=>window.workspaceOpens.length===5&&!workspaceButtons()[0].disabled,'Saved shortcut did not open');if(window.workspaceOpens.at(-1).target.kind!=='remote')throw new Error('Shortcut still opens file manager');
        const dismissWorkspaceMenu=async()=>{workspaceItem('在文件管理器中打开').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(()=>!workspaceItem('在文件管理器中打开'),'Workspace menu did not close');};
        window.failWorkspaceOptions=true;const previousReads=window.optionsReadCount;window.expireWorkspaceOptions();await wait(()=>window.optionsReadCount>previousReads,'Expired options should refresh on focus');await workspaceMenu();await pause();
        if(!workspaceItem('VS Code')||workspaceItem('无法读取打开选项，请重新展开重试'))throw new Error('Read failures must silently preserve previous options');
        await dismissWorkspaceMenu();window.failWorkspaceOptions=false;window.noEditors=true;window.expireWorkspaceOptions();await workspaceMenu();await wait(()=>!workspaceItem('VS Code'),'Empty IDE list must update');
        if(workspaceItem('未检测到支持的 IDE')||document.querySelector('[role="menu"][data-state="open"] [role="separator"]'))throw new Error('Empty IDE lists must not add placeholder rows or separators');
        await dismissWorkspaceMenu();
        for(const provider of ['Bitbucket','Gitee','git.company.example']){
          window.remoteProvider=provider;window.expireWorkspaceOptions();await workspaceMenu();await wait(()=>workspaceItem('在 '+provider+' 上打开'),'Provider-specific label missing');
          const providerItem=workspaceItem('在 '+provider+' 上打开');
          if(provider==='git.company.example'?!providerItem.querySelector('.lucide-globe'):!providerItem.querySelector('svg[data-provider="'+provider+'"]'))throw new Error('Wrong provider brand or unknown-host fallback');
          await dismissWorkspaceMenu();
        }
        window.noEditors=false;
        if(!document.querySelector('.task-context-rail').textContent.includes('NOTES'))throw new Error('Prompt group must remain');
        window.setTaskResources({});await wait(()=>document.querySelectorAll('.task-context-group').length===1,'Only Prompt remains after clearing resources');
        const sidebarActions=document.querySelector('.task-workbench-actions').querySelectorAll('button').length;
        window.setSidebar(false);await wait(()=>document.querySelector('.task-workbench-actions').querySelectorAll('button').length===sidebarActions-2,'Task page must remove close and promote buttons');
        window.setSidebar(true);await wait(()=>document.querySelector('.task-workbench-actions').querySelectorAll('button').length===sidebarActions,'Sidebar close must remain');
        if(document.querySelector('.task-context-container').getBoundingClientRect().width>320)throw new Error('Context escapes sidebar');
        button('收起任务上下文').click();button('显示终端').click();
        await wait(()=>button('关闭 zsh1'),'Terminal 1 missing');
        await wait(()=>document.querySelector('.task-shell-pane .navo-terminal-container[data-status="ready"] canvas')?.width > 0,'Started terminal must render real VT output');
        if(window.destroyed.length)throw new Error('Attaching a terminal must not terminate its process');
        if(document.querySelector('.task-terminal-badge').textContent!=='1')throw new Error('Badge missing');
        button('新建终端').click();await wait(()=>button('关闭 zsh2'),'Terminal 2 missing');
        await wait(()=>window.attached.length===2,'Terminal did not attach');
        if(window.attached.some(params=>!params.attachOnly))throw new Error('Must attach existing PTY');
        button('任务上下文').click();await wait(()=>document.querySelector('.task-context-container'),'Context missing');
        if(!document.querySelector('.task-context-rail').textContent.includes('zsh2'))throw new Error('Context terminal not synchronized');
        assertItemIcons();
        button('收起任务上下文').click();
        window.showFixture(false);await pause();window.showFixture(true);await wait(()=>button('显示终端'),'Remount failed');
        if(window.creates.length!==2||window.attached.length!==2)throw new Error('View remount restarted terminals');
        // 任务会记住终端抽屉是否打开；重挂后若已展开，再点「显示终端」会把它收起。
        if(!button('关闭 zsh1')){button('显示终端').click();await wait(()=>button('关闭 zsh1'),'Existing terminal lost');}
        button('关闭 zsh1').click();await wait(()=>!button('关闭 zsh1'),'Close failed');
        button('关闭 zsh2').click();await wait(()=>!document.querySelector('.task-terminal-badge'),'Zero badge should hide');
        button('任务上下文').click();await pause();
        const headings=[...document.querySelectorAll('.task-context-group-heading')].map(node=>node.textContent);
        if(headings.some(text=>text.includes('终端')))throw new Error('Empty terminal group must hide');
        button('收起任务上下文').click();button('显示终端').click();await wait(()=>button('关闭 zsh3'),'Number reused');
        window.resizeFixture(1020);await wait(()=>document.querySelector('.task-workbench').dataset.narrow==='false','Desktop not detected');
        if(document.querySelector('.task-context-container'))throw new Error('Widening must not reopen a closed context rail');
        button('任务上下文').click();await wait(()=>document.querySelector('.task-context-container'),'Desktop context missing');
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
        window.setRecords([{id:'agent',taskId:'test-task',kind:'agent',title:'CLI generated name',agent:{agentId:'grok'},status:'failed',lastActiveAt:'2026-10-07T00:00:00.000Z',terminalId:'failed',cwd:'/test',resumable:false},
          {id:'second-agent',taskId:'test-task',kind:'agent',title:'Second CLI name',agent:{agentId:'claude'},status:'stopped',lastActiveAt:'2026-10-07T00:00:00.000Z',terminalId:'second-terminal',cwd:'/test',resumable:false}]);
        await wait(()=>document.querySelector('#status [aria-label="Failed"]'),'Tab status is not driven by sessions');
        await wait(()=>document.querySelectorAll('.task-context-session').length===2,'Session rows missing');
        const rows=()=>[...document.querySelectorAll('.task-context-session')];
        const resumeButton=()=>[...document.querySelectorAll('.task-agent-pane button')].find(element=>element.textContent.trim()==='Resume conversation');
        const resumeHint=document.getElementById(resumeButton()?.getAttribute('aria-describedby'));
        if(!resumeButton()?.disabled||!resumeHint?.textContent.trim()||!resumeHint.getClientRects().length||getComputedStyle(resumeHint).visibility!=='visible')throw new Error('Unbound session must expose a visible, accessible explanation without hover');
        const hintBounds=resumeHint.getBoundingClientRect();
        if(hintBounds.width===0||hintBounds.height===0||!resumeHint.contains(document.elementFromPoint(hintBounds.left+hintBounds.width/2,hintBounds.top+hintBounds.height/2)))throw new Error('Resume explanation must remain visible inside the pane');
        if([...document.querySelectorAll('.task-agent-pane button')].some(element=>element.textContent.trim()==='Restart agent'))throw new Error('Stopped panel must not duplicate the resume action');
        const sessionActions=[...document.querySelectorAll('.task-agent-pane > header > div:last-child > button')];
        if(sessionActions.length!==3||new Set(sessionActions.map(element=>getComputedStyle(element).color)).size!==1)throw new Error('Session header add, menu and close buttons must share the same default color');
        if(!rows()[0].querySelector('svg[aria-label="Grok Build"]')||!rows()[1].querySelector('svg[aria-label="Claude Code"]'))throw new Error('Agent brand icons missing');
        if(rows()[0].querySelector('.task-session-status')||rows()[0].querySelector('.task-context-session-status').textContent!=='Failed')throw new Error('Session status must be text, not an icon');
        const metadata=rows()[0].querySelector('.task-context-session-metadata');
        const sessionStatusBounds=metadata.querySelector('.task-context-session-status').getBoundingClientRect();
        const workspaceBounds=metadata.querySelector('.task-context-session-workspace').getBoundingClientRect();
        if(!metadata.textContent.includes('·')||Math.abs(sessionStatusBounds.top-workspaceBounds.top)>1||workspaceBounds.left<=sessionStatusBounds.right)throw new Error('Status and workspace must share one row with a dot separator');
        if(rows().some(row=>!row.querySelector('button[aria-label="Archive session"]')))throw new Error('Archive action missing');
        assertItemIcons();
        assertMetadataActions(rows()[0],'.task-context-session-metadata','.task-context-session-archive');
        window.renameSession('agent','CLI renamed name');await wait(()=>rows()[0].textContent.includes('CLI renamed name'),'Native title update missing');
        rows()[0].querySelector('button[aria-label="Archive session"]').click();
        await wait(()=>rows().length===1,'Archived session must leave context');
        if(window.archives[0]!=='agent'||!document.querySelector('.task-agent-pane').textContent.includes('Second CLI name'))throw new Error('Archiving must not select another session accidentally');
        if(!window.destroyed.includes('failed'))throw new Error('Archive must release the terminal buffer');
        rows()[0].querySelector('button[aria-label="Archive session"]').click();
        await wait(()=>rows().length===0,'Last archived row must disappear');
        await wait(()=>document.querySelector('#status [aria-label="No session"]'),'Archived records must not affect tab status');
        const archivedToggle=[...document.querySelectorAll('.task-context-rail button')].find(button=>button.textContent==='Archived 2');if(!archivedToggle||archivedToggle.getAttribute('aria-expanded')!=='false')throw Error('Archived list must start collapsed');archivedToggle.click();
        await wait(()=>document.querySelector('button[title*="Click to restore"]'),'Archived rows missing');const launchesBeforeRestore=window.creates.length;document.querySelector('button[title*="Click to restore"]').click();await wait(()=>rows().length===1,'Restore must return an active row');if(window.creates.length!==launchesBeforeRestore)throw Error('Restore must not launch');rows()[0].querySelector('button[aria-label="Archive session"]').click();await wait(()=>rows().length===0,'Rearchive failed');
        if(!document.querySelector('.task-context-rail').textContent.includes('Archived 2'))throw new Error('Archived-only session group must remain');
        if(!document.querySelector('.task-session-empty button'))throw new Error('Task must still allow creating a new session');
        const menuItem=label=>[...document.querySelectorAll('[role="menuitem"]')].find(element=>element.closest('[role="menu"]')?.dataset.state==='open'&&(element.querySelector(':scope > span')?.textContent||element.textContent).trim()===label);
        const openDropdown=async element=>{await new Promise(resolve=>setTimeout(resolve,200));element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,isPrimary:true,pointerType:'mouse'}));};
        await openDropdown(document.querySelector('.task-agent-pane button[aria-label="New session"]'));
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
        if(!document.querySelector('.task-agent-pane header svg[aria-label="Grok Build"]'))throw new Error('Session title must show Agent icon');
        await openDropdown(button('Session actions'));await wait(()=>menuItem('Shut down agent'),'Shutdown action missing');menuItem('Shut down agent').click();
        await wait(()=>rows()[0].querySelector('.task-context-session-status').textContent==='Stopped'&&!button('Session actions').disabled,'Shutdown did not update status');
        if(rows().length!==1||!document.querySelector('.task-agent-pane'))throw new Error('Shutdown must preserve record and pane');
        await openDropdown(button('Session actions'));await wait(()=>menuItem('Shut down agent'),'Stopped session menu missing');
        if(menuItem('Restart Agent'))throw new Error('Stopped session must not expose restart');
        if(menuItem('Shut down agent').getAttribute('aria-disabled')!=='true')throw new Error('Shutdown must be disabled for stopped Agent');
        menuItem('Shut down agent').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        await wait(()=>!document.querySelector('[role="menu"][data-state="open"]'),'Stopped session menu did not close');
        if(!resumeButton()||resumeButton().disabled||resumeButton().hasAttribute('aria-describedby'))throw new Error('Bound stopped session must offer resume without an unavailable explanation');
        resumeButton().click();await wait(()=>window.restarts.length===1&&!button('Session actions').disabled,'Resume not submitted');
        if(window.restarts[0].resume!==true)throw new Error('Stopped session must resume the same conversation');
        await openDropdown(button('Session actions'));await wait(()=>menuItem('Restart Agent'),'Running restart missing');menuItem('Restart Agent').click();
        await wait(()=>window.restarts.length===2&&!button('Session actions').disabled,'Running Agent must allow restart');
        if(window.restarts[1].resume!==false)throw new Error('Running restart must stop the old process before resuming');
        await openDropdown(button('Session actions'));await wait(()=>menuItem('Rename session'),'Session menu missing');
        for(const label of ['Archive session','Delete session'])if(!menuItem(label))throw new Error('Missing '+label);
        if(menuItem('Rename session').nextElementSibling?.getAttribute('role')!=='separator'||menuItem('Archive session').nextElementSibling!==menuItem('Delete session'))throw new Error('Archive and delete must share a group separated from rename');
        menuItem('Rename session').click();await wait(()=>document.querySelector('input[aria-label="Session name"]'),'Rename dialog missing');
        const field=document.querySelector('input[aria-label="Session name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'Renamed native session');field.dispatchEvent(new Event('input',{bubbles:true}));await pause();
        const dialogButton=label=>[...document.querySelectorAll('[role="dialog"] button')].find(element=>element.textContent.trim()===label);
        dialogButton('Confirm').click();await wait(()=>window.renames.length===1&&!document.querySelector('[role="dialog"]'),'Rename not submitted');
        if(!document.querySelector('.task-agent-pane').textContent.includes('Renamed native session'))throw new Error('Native name not synchronized');
        await openDropdown(document.querySelector('.task-context-group-heading button[aria-label="New session"]'));await wait(()=>menuItem('Claude Code'),'Context Agent picker missing');
        menuItem('Claude Code').click();await wait(()=>rows().length===2,'Context must use same new session behavior');
        await wait(()=>!button('Session actions')?.disabled,'Context creation did not settle');
        rows()[0].querySelector('.task-context-session-select').click();await wait(()=>document.querySelector('.task-agent-pane').textContent.includes('Renamed native session'),'Different session must switch and show');
        rows()[1].querySelector('.task-context-session-select').click();await wait(()=>!document.querySelector('.task-agent-pane').textContent.includes('Renamed native session'),'Switching back must show the selected session');
        if(!document.querySelector('.task-agent-pane header svg[aria-label="Claude Code"]'))throw new Error('Title icon must follow current Agent');
        await openDropdown(button('Session actions'));await wait(()=>menuItem('Delete session'),'Delete menu missing');menuItem('Delete session').click();
        await wait(()=>dialogButton('Cancel'),'Delete confirmation missing');dialogButton('Cancel').click();await wait(()=>!document.querySelector('[role="dialog"]'),'Cancel failed');
        if(window.removes.length)throw new Error('Cancel must not delete native history');
        await openDropdown(button('Session actions'));await wait(()=>menuItem('Delete session'),'Delete menu missing');menuItem('Delete session').click();await wait(()=>dialogButton('Delete'),'Delete confirmation missing');dialogButton('Delete').click();
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
        const repoResource={resourceId:'repo-choice',name:'navo',mode:'worktree',workingPath:'/repo',sourceBranch:'main',targetBranch:'feature/one'};
        const folderResource={resourceId:'folder-choice',name:'design-assets',mode:'folder',workingPath:'/assets',sourceBranch:'',targetBranch:''};
        window.setTaskResources({resources:[repoResource]});await pause();
        const addButtons=[...document.querySelectorAll('.task-context-group-heading button')].filter(element=>element.querySelector('.lucide-plus'));
        const addStyles=addButtons.map(element=>{const style=getComputedStyle(element),icon=getComputedStyle(element.querySelector('svg'));return [style.width,style.height,style.color,style.borderRadius,icon.width,icon.height].join('|');});
        if(addStyles.length<3||new Set(addStyles).size!==1)throw new Error('Every category add button must use the same size, color and icon style');
        const sessionAdd=document.querySelector('.task-agent-pane button[aria-label="New session"]');
        for(const element of [...addButtons,sessionAdd]){const bounds=element.getBoundingClientRect(),icon=element.querySelector('svg').getBoundingClientRect();if(bounds.width!==24||bounds.height!==24||icon.width!==14||icon.height!==14)throw new Error('Context and session actions must share 24px targets and 14px icons');}
        for(const icon of document.querySelectorAll('.task-workbench-actions svg')){const bounds=icon.getBoundingClientRect();if(bounds.width!==16||bounds.height!==16)throw new Error('Task heading action icons must be 16px');}
        await openDropdown(document.querySelector('.task-agent-pane button[aria-label="New session"]'));await wait(()=>menuItem('Grok Build'),'Single directory must go directly to Agent choices');
        if(document.querySelector('[data-slot="dropdown-menu-sub-trigger"]'))throw new Error('Single directory must not require an extra menu');
        menuItem('Grok Build').click();await wait(()=>!button('Session actions').disabled&&window.creates[window.creates.length-1].resourceId==='repo-choice','Single resource binding missing');
        await wait(()=>document.querySelector('.task-context-session[data-active="true"] .task-context-session-workspace')?.textContent==='feature/one','Session branch label missing');
        window.setTaskResources({resources:[repoResource,folderResource]});await pause();
        const submenu=label=>[...document.querySelectorAll('[data-slot="dropdown-menu-sub-trigger"]')].find(element=>element.closest('[role="menu"]')?.dataset.state==='open'&&element.textContent.includes(label));
        const openSubmenu=async label=>{await pause();await pause();const element=submenu(label);element.focus();element.click();};
        await openDropdown(document.querySelector('.task-agent-pane button[aria-label="New session"]'));await wait(()=>submenu('All worktrees and folders'),'Multi-resource scope menu missing');
        if(menuItem('Grok Build'))throw new Error('Agent options must be nested under scope');
        await openSubmenu('All worktrees and folders');await wait(()=>menuItem('Grok Build'),'Global Agent submenu missing');menuItem('Grok Build').click();
        await wait(()=>!button('Session actions').disabled&&window.creates[window.creates.length-1].resourceId===null,'Global choice must submit explicit all scope');
        await wait(()=>document.querySelector('.task-context-session[data-active="true"] .task-context-session-workspace')?.textContent==='All worktrees and folders','Global scope label missing');
        await openDropdown(document.querySelector('.task-context-group-heading button[aria-label="New session"]'));await wait(()=>submenu('design-assets'),'Folder choice missing');
        await openSubmenu('design-assets');await wait(()=>menuItem('Claude Code'),'Folder Agent submenu missing');menuItem('Claude Code').click();
        await wait(()=>!button('Session actions').disabled&&window.creates[window.creates.length-1].resourceId==='folder-choice','Context creation must pass selected folder');
        await wait(()=>document.querySelector('.task-context-session[data-active="true"] .task-context-session-workspace')?.textContent==='design-assets','Folder label missing');
        const secondRepo={...repoResource,resourceId:'second-repo',name:'backend',workingPath:'/backend-worktree',targetBranch:'feature/two'};
        window.setTaskResources({resources:[repoResource,secondRepo,folderResource]});window.setRecords([]);await wait(()=>!document.querySelector('.task-shell-tab'),'Terminal reset failed');
        const createdBeforeMenu=window.creates.length;
        await openDropdown(button('Show terminals'));await wait(()=>menuItem('feature/two'),'First terminal with multiple repos must offer directory choices');
        if(window.creates.length!==createdBeforeMenu||!menuItem('feature/two').textContent.includes('backend'))throw new Error('Directory picker must show branch and repo without starting a shell');
        menuItem('feature/two').click();await wait(()=>document.querySelector('.task-shell-pane')&&!button('Show terminals').disabled,'Selected terminal was not revealed');
        if(window.creates.at(-1).kind!=='shell'||window.creates.at(-1).resourceId!=='second-repo')throw new Error('Terminal must bind the selected second repository');
        const createdAfterSelection=window.creates.length;button('Show terminals').click();await wait(()=>!document.querySelector('.task-shell-pane'),'Existing terminal must toggle closed');button('Show terminals').click();await wait(()=>document.querySelector('.task-shell-pane'),'Existing terminal must toggle open');
        if(window.creates.length!==createdAfterSelection)throw new Error('Toggling terminals must not create another process');
        await openDropdown(button('Choose terminal directory'));await wait(()=>menuItem('feature/one'),'Toolbar directory menu missing');menuItem('feature/one').click();await wait(()=>window.creates.at(-1).resourceId==='repo-choice'&&!button('Show terminals').disabled,'Toolbar must create in first repo');
        await openDropdown(document.querySelector('.task-shell-pane button[aria-label="New terminal"]'));await wait(()=>menuItem('design-assets'),'Drawer must support folder selection');menuItem('design-assets').click();await wait(()=>window.creates.at(-1).resourceId==='folder-choice'&&!button('Show terminals').disabled,'Drawer must create in the selected folder');
        await openDropdown(document.querySelector('.task-context-group-heading button[aria-label="New terminal"]'));await wait(()=>menuItem('feature/two'),'Context terminal menu missing');menuItem('feature/two').click();await wait(()=>window.creates.at(-1).resourceId==='second-repo'&&!button('Show terminals').disabled,'Context must create in second repo');
        window.setTaskResources({resources:[repoResource]});await pause();if(button('Choose terminal directory'))throw new Error('Single directory must not show a redundant toolbar dropdown');
        document.querySelector('.task-shell-pane button[aria-label="New terminal"]').click();await wait(()=>window.creates.at(-1).resourceId==='repo-choice'&&!button('Show terminals').disabled,'Single directory must create without a menu');
        await window.setLocale('zh-CN');window.setTaskResources({resources:[repoResource,secondRepo]});await pause();await openDropdown(button('选择终端工作目录'));await wait(()=>document.querySelector('[role="menu"]')?.textContent.includes('在以下目录新建终端'),'Terminal directory menu must support Chinese');
        const beforeCancel=window.creates.length;document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause();if(window.creates.length!==beforeCancel)throw new Error('Cancelling the menu must not create a terminal');
        window.resizeFixture(240);await pause();
        const root=document.querySelector('.task-workbench');if(root.scrollWidth>root.clientWidth+2)throw new Error('Narrow workspace overflows');
        window.resizeFixture(1100);window.setRecords([]);window.setTaskResources({resources:[repoResource]});window.setCommandRecord('repo-choice');
        await wait(()=>document.querySelector('.task-context-change [role="group"][aria-label="运行命令"]'),'Command shortcut missing');
        const commandGroup=()=>document.querySelector('.task-context-change [role="group"][aria-label="运行命令"]');
        const commandButton=()=>commandGroup().querySelector('button[aria-label="选择命令"]');
        const commandShortcut=()=>commandGroup().querySelector('button');
        if(commandGroup().querySelectorAll('button').length!==2||!commandButton().querySelector('.lucide-chevron-down'))throw new Error('Commands must use separate shortcut and dropdown buttons');
        if(commandShortcut().getAttribute('aria-label')!=='在此工作区运行「Build」')throw new Error('Shortcut tooltip must name the command and working directory scope');
        if(commandGroup().getBoundingClientRect().left<=document.querySelector('.task-context-change [data-slot="button-group"]').getBoundingClientRect().right)throw new Error('Command shortcut must sit to the right of Open in');
        await openDropdown(commandButton());await wait(()=>menuItem('Build'),'Configured commands missing');
        const commandCount=window.creates.length;
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause();if(window.creates.length!==commandCount)throw new Error('Dropdown must not run a command');
        commandShortcut().click();await wait(()=>window.creates.length===commandCount+1&&document.querySelector('.task-shell-pane')&&!commandButton().disabled,'Command shortcut did not reveal terminal');
        if(window.creates.at(-1).commandId!=='build'||window.creates.at(-1).resourceId!=='repo-choice'||!document.querySelector('.task-shell-pane').textContent.includes('Build'))throw new Error('Command did not bind to selected workspace');
        if(document.querySelector('.task-shell-pane [role="textbox"]')===document.activeElement)throw new Error('Running command must not steal input focus');
        if(!commandShortcut().querySelector('.lucide-square')||commandShortcut().getAttribute('aria-label')!=='停止此工作区中的「Build」')throw new Error('Running shortcut must name the command it stops');
        await openDropdown(commandButton());await wait(()=>menuItem('Build')?.querySelector('.lucide-square'),'Running command must show stop action');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause();commandShortcut().click();await wait(()=>!document.querySelector('.task-shell-pane'),'Stop shortcut must close command terminal');
        if(window.creates.length!==commandCount+1)throw new Error('Selecting running command must not start another process');
        await openDropdown(commandButton());await wait(()=>menuItem('管理命令…'),'Manage commands missing');menuItem('管理命令…').click();await wait(()=>document.querySelector('[data-slot="dialog-content"]'),'Manage must reuse repo edit dialog');
        const manageDialog=document.querySelector('[data-slot="dialog-content"]');if(!manageDialog.textContent.includes('Build'))throw new Error('Manage dialog shows wrong repository commands');
        [...manageDialog.querySelectorAll('button')].find(item=>item.textContent==='取消').click();await wait(()=>!document.querySelector('[data-slot="dialog-content"]'),'Manage close failed');
        window.setCommandRecord('repo-choice',[]);await wait(()=>!commandGroup(),'Empty commands must hide the whole button group');
        if(document.querySelector('.task-context-change button[aria-label="选择命令"]')||window.creates.length!==commandCount+1)throw new Error('Empty commands must not retain a dropdown or execute');
        if(document.querySelectorAll('.task-context-change-actions > [data-slot="button-group"]').length!==1||document.querySelector('.task-context-change-actions').getBoundingClientRect().width!==36)throw new Error('Hidden commands must not reserve space or hide Open in');
        window.setCommandRecord('repo-choice');await window.setLocale('en');
        await wait(()=>[...document.querySelectorAll('.task-context-change button')].some(item=>item.getAttribute('aria-label')==='Run "Build" in this worktree'),'English shortcut tooltip must contain command name and scope');
      })().catch(error=>{console.error(error.stack);throw error;})\`);
      console.log('WORKBENCH_UI_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}
    });`);
    let output = "";
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: ["ignore","pipe","pipe"] });
    child.stdout.on("data", data=>output+=data);child.stderr.on("data",data=>output+=data);
    const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});
    assert.equal(code,0,output);assert.match(output,/WORKBENCH_UI_OK/);
  } finally {child?.kill("SIGKILL");await server.close();await rm(directory,{recursive:true,force:true});}
});
