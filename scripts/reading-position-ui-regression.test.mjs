import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import electron from 'electron';
import { createServer } from 'vite';

test('阅读位置按任务和内容隔离，支持隐藏、重挂载、异步分支及虚拟轨迹恢复', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'navo-reading-ui-'));
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const server = await createServer({ configFile: false, appType: 'custom', root: process.cwd(), cacheDir: path.join(directory, 'cache'), logLevel: 'error', plugins: [tailwindcss()], esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 0 } });
  // 手动释放图片响应，稳定覆盖恢复时尚未取得图片高度的场景。
  const pendingImages = new Map(), releasedImages = new Set();
  const sendImage = response => {
    response.setHeader('Content-Type', 'image/svg+xml');
    response.setHeader('Cache-Control', 'no-store');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="2000"><rect width="400" height="2000" fill="gray"/></svg>');
  };
  server.middlewares.use('/__reading-image', (request, response) => {
    const id = new URL(request.url, 'http://localhost').searchParams.get('id');
    if (releasedImages.has(id)) sendImage(response);
    else pendingImages.set(id, response);
  });
  server.middlewares.use('/__release-reading-image', (request, response) => {
    const id = new URL(request.url, 'http://localhost').searchParams.get('id');
    releasedImages.add(id);
    if (pendingImages.has(id)) { sendImage(pendingImages.get(id)); pendingImages.delete(id); }
    response.end('released');
  });
  server.middlewares.use('/__reading', async (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml('/__reading', String.raw`<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';import '/src/components/tasks/workspace/task-workspace.css';
      import i18n from '/src/i18n/index.ts';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {TaskNotePane} from '/src/components/tasks/workspace/TaskNotePane.tsx';
      import {TaskBranchPane} from '/src/components/tasks/workspace/TaskBranchPane.tsx';
      import {SessionTraceView} from '/src/components/tasks/workspace/trace/SessionTraceView.tsx';
      import {useReadingPosition} from '/src/hooks/useReadingPosition.ts';
      import {readTraceReadingPosition,readScrollPosition} from '/src/stores/readingPositionStore.ts';
      await i18n.changeLanguage('zh-CN');
      const noOp=()=>{};
      window.navo={settings:{load:async()=>({})},review:{watchProject:async()=>{},unwatchProject:async()=>{},onProjectChanged:()=>()=>{}},tasks:{loadBranch:async(_task,id)=>{if(window.delayBranch)await new Promise(resolve=>{window.resolveBranch=resolve;});return{branchName:id,baseAvailable:true,baseBranch:'main',commits:[],files:{unstaged:Array.from({length:80},(_,i)=>({path:'file-'+i+'.ts',additions:1,deletions:0})),staged:[],branch:[]},untrackedCount:0};}}};
      const events=Array.from({length:1200},(_,i)=>({id:i+1,kind:i%2?'tool':'user',round:Math.floor(i/8)+1,preview:'事件 '+(i+1),timestamp:new Date(1700000000000+i*1000).toISOString()}));
      window.extra=0;window.traceRequests=[];window.memory=key=>readTraceReadingPosition(key);window.scrollMemory=readScrollPosition;
      const query=async q=>{
        window.traceRequests.push({...q});
        const all=window.emptyTrace?[]:[...events,...Array.from({length:window.extra},(_,i)=>({...events[0],id:1201+i,preview:'新增 '+i}))];
        if(q.kind==='timeline')return{events:all,truncated:false};
        let matching=all.filter(e=>e.id!==window.removedEvent).filter(e=>(q.filter==='all'||!q.filter||e.kind===q.filter)&&(!q.search||e.preview.includes(q.search)));
        const found=q.eventId===undefined?-1:matching.findIndex(e=>e.id===q.eventId);
        const offset=found>=0?Math.max(0,found-20):q.offset??0;
        return{events:matching.slice(offset,offset+(q.limit??80)),offset,total:matching.length,stats:{events:matching.length,rounds:150,requests:null,tools:600,errors:0}};
      };
      function Fixture(){
        const [taskId,setTask]=React.useState('task-a'),[noteId,setNote]=React.useState('note-a'),[panel,setPanel]=React.useState('note'),[hidden,setHidden]=React.useState(false),[mounted,setMounted]=React.useState(true),[short,setShort]=React.useState(false),[draft,setDraft]=React.useState(false),[repo,setRepo]=React.useState('repo-a'),[trace,setTrace]=React.useState('trace-a'),[revision,setRevision]=React.useState(0);
        const [imageSource,setImageSource]=React.useState(null);
        Object.assign(window,{setTask,setNote,setPanel,setHidden,setMounted,setShort,setDraft,setRepo,setTrace,setImageSource,refresh:()=>setRevision(n=>n+1)});
        const content=imageSource?'![延迟加载图片]('+imageSource+')\n\n图片末尾':Array.from({length:short?2:180},(_,i)=>'笔记第 '+i+' 行').join('\n');
        const editor={note:{id:noteId,title:noteId,content,version:1,origin:'user',sortOrder:0,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'},draft:draft?{title:noteId,content}:null,busy:false,pending:false,readOnly:false,isPrompt:false,edit:()=>setDraft(true),change:noOp,cancel:()=>setDraft(false),save:noOp,requestDelete:noOp,error:null};
        const generic=useReadingPosition(taskId+'-generic');
        return React.createElement(TooltipProvider,null,React.createElement('div',{id:'container',hidden,style:{height:570,width:920,display:hidden?'none':'flex'}},mounted&&(
          panel==='note'?React.createElement(TaskNotePane,{taskId,editor,onClose:noOp}):
          panel==='branch'?React.createElement(TaskBranchPane,{key:repo,taskId,resource:{resourceId:repo,workingPath:'/fixture/'+repo,name:repo,targetBranch:repo},onClose:noOp,onOpenDiff:noOp}):
          panel==='trace'?React.createElement(SessionTraceView,{key:trace,readingKey:trace,query,revision}):
          React.createElement('div',{id:'generic',ref:generic,style:{height:300,width:400,overflow:'auto'}},React.createElement('div',{style:{height:2500,width:1200}},'scroll')))));
      }
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  const checks = async function () {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const wait = async (check, message) => { for (let i=0;i<200;i++) { if(check())return; await pause(25); } throw Error(message); };
    const near=(value,expected)=>Math.abs(value-expected)<=2;
    const note=()=>document.querySelector('.task-note-pane > div.overflow-auto');
    const scroll=async(element,top,left=0)=>{element.scrollTop=top;element.scrollLeft=left;await pause(70);};
    await wait(note,'Note missing');await scroll(note(),780);if(!near(note().scrollTop,780))throw Error('Note is not scrollable: '+JSON.stringify({top:note().scrollTop,height:note().clientHeight,scroll:note().scrollHeight,style:getComputedStyle(note()).overflow}));
    window.setNote('note-b');await wait(()=>note()?.scrollTop===0,'New note inherited prior position');await scroll(note(),320);
    window.setNote('note-a');await pause(150);if(!near(note()?.scrollTop,780))throw Error('Returning note lost position: '+JSON.stringify({top:note().scrollTop,memory:window.scrollMemory(JSON.stringify(['task-a','note','note-a','preview']))}));
    window.setTask('task-b');await wait(()=>note()?.scrollTop===0,'Task positions collided');await scroll(note(),110);
    window.setTask('task-a');await wait(()=>near(note()?.scrollTop,780),'Task position not restored');
    window.setHidden(true);await pause(80);window.setHidden(false);await wait(()=>near(note()?.scrollTop,780),'Hidden zero position overwrote memory');
    window.setMounted(false);await pause(50);window.setHidden(true);window.setMounted(true);await pause(80);window.setHidden(false);await wait(()=>near(note()?.scrollTop,780),'Hidden remount lost note position');
    window.setDraft(true);await wait(()=>document.querySelector('textarea'),'Editor missing');await scroll(document.querySelector('textarea'),550);
    window.setDraft(false);await wait(()=>near(note()?.scrollTop,780),'Edit mode changed reading position');
    window.setDraft(true);await wait(()=>near(document.querySelector('textarea')?.scrollTop,550),'Editor scroll not restored');window.setDraft(false);
    window.setShort(true);await wait(()=>note()?.scrollTop===0,'Shortened content must clamp');window.setShort(false);
    window.setPanel('generic');await wait(()=>document.getElementById('generic'),'Generic scroll missing');await scroll(document.getElementById('generic'),610,160);
    window.setMounted(false);await pause(50);window.setMounted(true);await wait(()=>document.getElementById('generic')?.scrollTop===610&&document.getElementById('generic')?.scrollLeft===160,'Both scroll axes must restore');
    const releaseImage=id=>fetch('/__release-reading-image?id='+id);
    const image=()=>note()?.querySelector('img');
    await releaseImage('first');window.setNote('image-note');window.setImageSource('/__reading-image?id=first');window.setPanel('note');
    await wait(()=>image()?.naturalHeight===2000,'Initial image missing');await scroll(note(),780);
    window.setMounted(false);await pause(50);window.setImageSource('/__reading-image?id=restored');window.setMounted(true);
    await wait(()=>image()&&!image().complete,'Delayed image must still be loading');
    if(window.scrollMemory(JSON.stringify(['task-a','note','image-note','preview']))?.top!==780)throw Error('Pending image overwrote reading position');
    await releaseImage('restored');await wait(()=>image()?.naturalHeight===2000&&near(note()?.scrollTop,780),'Image load must restore unclamped position');
    window.setMounted(false);await pause(50);window.setImageSource('/__reading-image?id=user-scroll');window.setMounted(true);
    await wait(()=>image()&&!image().complete,'Second delayed image missing');
    note().dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));await scroll(note(),0);
    await releaseImage('user-scroll');await wait(()=>image()?.naturalHeight===2000,'Image not released');await pause(100);
    if(note().scrollTop!==0)throw Error('Image completion must not override manual scrolling');
    window.setImageSource(null);
    window.setPanel('branch');await wait(()=>document.querySelectorAll('.task-branch-file').length===80,'Branch loading failed');
    const branch=()=>document.querySelector('.task-branch-scroll');await scroll(branch(),640);
    window.setRepo('repo-b');await wait(()=>document.querySelectorAll('.task-branch-file').length===80&&branch()?.scrollTop===0,'Repositories shared position');
    window.delayBranch=true;window.setRepo('repo-a');await wait(()=>window.resolveBranch,'Delayed branch did not load');await pause(80);window.resolveBranch();window.delayBranch=false;
    await wait(()=>near(branch()?.scrollTop,640),'Async branch restored before content loaded');
    window.setPanel('trace');await wait(()=>document.querySelector('.trace-events .trace-event-row'),'Trace missing');
    const trace=()=>document.querySelector('.trace-events');await scroll(trace(),18000);
    await wait(()=>window.memory('trace-a')?.eventId<1000&&window.memory('trace-a')?.eventId>100,'Virtualized read anchor not saved');
    await pause(150);const remembered={...window.memory('trace-a')};
    window.setTrace('trace-b');await wait(()=>window.memory('trace-b')?.eventId>1000,'New trace must default to latest');
    window.extra=100;const before=window.traceRequests.length;window.setTrace('trace-a');
    await wait(()=>window.traceRequests.slice(before).some(q=>q.kind==='page'&&q.eventId===remembered.eventId),'Restore must query remembered event');
    await wait(()=>window.memory('trace-a')?.eventId===remembered.eventId,'New events moved remembered reading position');
    if(Math.abs(window.memory('trace-a').offset-remembered.offset)>2)throw Error('Trace row offset not restored');
    window.setMounted(false);await pause(50);const count=window.traceRequests.length;window.setMounted(true);
    await wait(()=>window.traceRequests.slice(count).some(q=>q.eventId===remembered.eventId),'Remount lost trace anchor');
    await wait(()=>window.memory('trace-a')?.eventId===remembered.eventId,'Restored trace did not settle');
    const filter=[...document.querySelectorAll('[role="group"] button')].find(b=>b.textContent==='用户');filter.click();
    await wait(()=>window.memory('trace-a')?.filter==='user','Filter context not saved');await scroll(trace(),9000);await pause(150);
    const filtered={...window.memory('trace-a')};window.setTrace('trace-b');await pause(100);window.setTrace('trace-a');
    await wait(()=>window.traceRequests.some(q=>q.eventId===filtered.eventId&&q.filter==='user'),'Filtered reading position not restored');
    const follow=[...document.querySelectorAll('label')].find(label=>label.textContent.includes('跟随新事件')).querySelector('[role="checkbox"]');
    follow.click();await wait(()=>window.memory('trace-a')?.follow===true,'Follow preference not saved');
    follow.click();await wait(()=>window.memory('trace-a')?.follow===false,'Disabling follow not saved');
    await scroll(trace(),9000);await pause(150);const removed=window.memory('trace-a').eventId;window.setTrace('trace-b');await pause(100);window.removedEvent=removed;window.setTrace('trace-a');
    await wait(()=>window.memory('trace-a')?.eventId>1200,'Missing event must fall back to latest matching results');
    const search=()=>document.querySelector('.session-trace input[placeholder="搜索消息、命令或文件"]');
    const fillSearch=value=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search(),value);search().dispatchEvent(new Event('input',{bubbles:true}));};
    const empty=()=>document.querySelector('.trace-events')?.textContent.includes('没有匹配的轨迹事件');
    fillSearch('impossible-no-results');await wait(empty,'Search should have no results');
    window.setTrace('trace-b');await wait(()=>search()?.value==='','Other trace inherited search');window.setTrace('trace-a');
    await wait(()=>search()?.value==='impossible-no-results'&&empty(),'Empty-result search was lost on return');
    // 首次打开就没有事件时也保存条件与跟随选择，不依赖旧事件锚点。
    window.emptyTrace=true;window.setTrace('trace-empty');await wait(()=>search()?.value===''&&empty(),'Empty trace not ready');
    [...document.querySelectorAll('[role="group"] button')].find(b=>b.textContent==='用户').click();
    fillSearch('first-empty-search');await wait(()=>window.memory('trace-empty')?.search==='first-empty-search','Empty trace search not saved');
    [...document.querySelectorAll('label')].find(label=>label.textContent.includes('跟随新事件')).querySelector('[role="checkbox"]').click();
    await wait(()=>window.memory('trace-empty')?.follow===true,'Empty trace follow preference not saved');
    if(window.memory('trace-empty').eventId!==undefined)throw Error('Empty trace must not fabricate an anchor');
    window.setMounted(false);await pause(50);window.setMounted(true);
    await wait(()=>search()?.value==='first-empty-search'&&empty(),'Initial empty trace search was lost');
    if(window.memory('trace-empty').filter!=='user'||!window.memory('trace-empty').follow)throw Error('Empty trace preferences were lost');
  };
  let child;
  try {
    await server.listen();
    const runner=path.join(directory,'runner.cjs');
    await writeFile(runner,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'data'))});app.whenReady().then(async()=>{app.dock?.hide();const win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{backgroundThrottling:false}});const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'){errors.push(e.message);console.error(e.message);}});try{await win.loadURL(${JSON.stringify('http://127.0.0.1:'+server.httpServer.address().port+'/__reading')});await win.webContents.executeJavaScript(${JSON.stringify(`(${checks.toString()})().catch(error=>{console.error(error.stack);throw error;})`)});if(errors.length)throw Error(errors.join(String.fromCharCode(10)));console.log('reading positions passed');win.destroy();app.quit();}catch(e){console.error(e);app.exit(1);}});`);
    child=spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>child.kill(),45000);let output='';child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{output+=d;});
    const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timer);assert.equal(code,0,output);assert.match(output,/reading positions passed/);
  } finally {if(child?.exitCode===null)child.kill();await server.close();await rm(directory,{recursive:true,force:true});}
});
