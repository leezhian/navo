import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("资源窗口现有条目、批量与归档恢复、清理、撤销、预览、菜单与只读归档任务", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-resource-window-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error", plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, worker: { format: "es" }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__resource_window_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__resource_window_test", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TaskWorkspace} from '/src/components/tasks/workspace/TaskWorkspace.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';import {useSettingsStore} from '/src/stores/settingsStore.ts';
      import {useTaskStore} from '/src/stores/taskStore.ts';
      await i18n.changeLanguage('zh-CN');useSettingsStore.setState({loaded:true});
      const now='2026-10-07T00:00:00.000Z';
      const note=(id,title,content,archivedAt)=>({id,title,content,version:1,origin:'user',sortOrder:0,createdAt:now,updatedAt:now,...(archivedAt?{archivedAt}:{})});
      const file=(id,name,path,archivedAt)=>({id,name,path,size:4,...(archivedAt?{archivedAt}:{})});
      let task={id:'existing',title:'资源窗口测试',date:'2026-10-07',updatedAt:now,projectName:'navo',status:'TODO',contextVersion:1,
        resources:[{resourceId:'folder-1',name:'assets',mode:'folder',workingPath:'/fixture/assets',originalPath:'/fixture/assets',sourceBranch:'',targetBranch:''}],
        links:[{id:'pr-merged',group:'PR',tag:'feature',title:'Merged PR',projectName:'navo',provider:'GitHub',status:'merged',date:'2026-10-07'}],webLinks:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',url:'https://example.com/spec',title:'Spec'},{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',url:'https://example.com/spec',title:''},{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',url:'https://example.com/plain',title:''}],
        files:[file('33333333-3333-4333-8333-333333333333','spec.md','/fixture/spec.md'),file('44444444-4444-4444-8444-444444444444','notes.ts','/fixture/notes.ts'),file('55555555-5555-4555-8555-555555555555','deck.pptx','/fixture/deck.pptx')],
        attachments:[{id:'66666666-6666-4666-8666-666666666666',name:'copy.txt',size:4}],
        notes:[note('11111111-1111-4111-8111-111111111111','Rules','keep')],
        archivedNotes:[note('22222222-2222-4222-8222-222222222222','Old note','archived body','2026-10-06T00:00:00.000Z')],
        archivedFiles:[file('77777777-7777-4777-8777-777777777777','old.md','/fixture/old.md','2026-10-06T00:00:00.000Z')],
        archivedAttachments:[{id:'88888888-8888-4888-8888-888888888888',name:'old-copy.txt',size:4,archivedAt:'2026-10-06T00:00:00.000Z'}],
        archivedWebLinks:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',url:'https://example.com/old',title:'Old link',archivedAt:'2026-10-06T00:00:00.000Z'}]};
      useTaskStore.setState({tasks:[task],loaded:true});
      window.reveals=[];window.copies=[];window.archives=[];window.restores=[];window.detaches=[];window.deletes=[];window.undos=[];window.cleanups=[];window.titles=[];window.cleanupPlan={missingFiles:[],mergedPullRequests:[]};window.dismissed=false;window.undoAllowed=false;let lastSnapshot=null;
      const writeCopy=async(value)=>{window.copies.push(value);};
      if(navigator.clipboard)navigator.clipboard.writeText=writeCopy;else Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:writeCopy}});
      const previewType=name=>name.endsWith('.md')?'markdown':name.endsWith('.png')||name.endsWith('.jpg')?'image':name.endsWith('.pptx')||name.endsWith('.bin')?'unsupported':'text';
      const allFiles=()=>[...task.files,...(task.attachments??[]),...task.archivedFiles,...(task.archivedAttachments??[])];
      function publish(next){task=next;useTaskStore.setState({tasks:[structuredClone(task)]});return structuredClone(task);}
      const batch=(applied,skipped=[])=>({task:structuredClone(task),applied,skipped,undoExpiresAt:new Date(Date.now()+10000).toISOString()});
      window.navo={app:{onOpenTask:()=>()=>{},taskLinksReady:async()=>{}},settings:{chooseDirectory:async()=>'/fixture'},
        resources:{list:async()=>[],onCloneProgress:()=>()=>{}},review:{watchProject:async()=>{},unwatchProject:async()=>{},onProjectChanged:()=>()=>{}},
        agents:{onCapabilitiesChanged:()=>()=>{},capabilitySnapshot:async()=>({settings:{configurations:[]},installations:[],entries:{}})},
        tasks:{
          loadBranch:async()=>({projectPath:'/test',branchName:'main',baseBranch:'main',baseAvailable:true,files:{unstaged:[],staged:[],branch:[]},untrackedCount:0,commits:[],hasMoreCommits:false}),
          workspaceOpenOptions:async()=>({editors:[{id:'vscode',name:'Visual Studio Code'}],fileManager:true,externalTerminal:true}),
          inspectManagedFile:async(id,kind,fileId)=>{const item=allFiles().find(file=>file.id===fileId)||{name:'unknown',path:'',size:0};return {kind,id:fileId,name:item.name,description:item.description??'',size:item.size??4,mtime:now,exists:true,source:kind==='file'?'path':'attachment',location:item.path||item.name,previewType:previewType(item.name)};},
          previewManagedFile:async(id,kind,fileId)=>{const item=allFiles().find(file=>file.id===fileId)||{name:'unknown'};const type=previewType(item.name);return type==='image'?{type,dataUrl:'data:image/png;base64,AAAA',size:4}:{type,text:'preview body',size:4};},
          revealResourceFile:async(...args)=>window.reveals.push(['file',...args]),
          inspectResourceCleanup:async()=>structuredClone(window.cleanupPlan),
          dismissResourceUndo:async()=>{window.dismissed=true;window.undoAllowed=false;},
          archiveResources:async(id,items)=>{window.archives.push(items);window.undoAllowed=true;window.dismissed=false;lastSnapshot=structuredClone(task);const kinds={note:'notes',file:'files',attachment:'attachments',link:'webLinks',issue:'links'};const archived={note:'archivedNotes',file:'archivedFiles',attachment:'archivedAttachments',link:'archivedWebLinks',issue:'archivedLinks'};const applied=[];for(const item of items){const list=task[kinds[item.kind]]??[];const current=list.find(entry=>entry.id===item.id);if(!current)continue;task={...task,contextVersion:task.contextVersion+1,[kinds[item.kind]]:list.filter(entry=>entry.id!==item.id),[archived[item.kind]]:[...(task[archived[item.kind]]??[]),{...current,archivedAt:now}]};applied.push(item);}return publish(task)&&batch(applied);},
          restoreResources:async(id,items)=>{window.restores.push(items);const kinds={note:'notes',file:'files',attachment:'attachments',link:'webLinks',issue:'links'};const archived={note:'archivedNotes',file:'archivedFiles',attachment:'archivedAttachments',link:'archivedWebLinks',issue:'archivedLinks'};const applied=[];for(const item of items){const list=task[archived[item.kind]]??[];const current=list.find(entry=>entry.id===item.id);if(!current)continue;const {archivedAt,...rest}=current;task={...task,contextVersion:task.contextVersion+1,[archived[item.kind]]:list.filter(entry=>entry.id!==item.id),[kinds[item.kind]]:[...(task[kinds[item.kind]]??[]),rest]};applied.push(item);}return publish(task)&&batch(applied);},
          detachResources:async(id,items)=>{lastSnapshot=structuredClone(task);window.undoAllowed=true;window.dismissed=false;const skipped=[];const applied=[];for(const item of items){if(item.kind==='workspace'&&(task.resources?.length??0)<=1){skipped.push({...item,reason:'lastWorkspace'});continue;}if(item.kind==='workspace')task={...task,resources:task.resources.filter(resource=>resource.resourceId!==item.id)};if(item.kind==='file')task={...task,files:task.files.filter(file=>file.id!==item.id)};if(item.kind==='link')task={...task,webLinks:task.webLinks.filter(link=>link.id!==item.id)};if(item.kind!=='workspace'||!skipped.some(entry=>entry.id===item.id))applied.push(item);}window.detaches.push({applied,skipped});task={...task,contextVersion:task.contextVersion+1};publish(task);return {...batch(applied,skipped),task:structuredClone(task)};},
          deleteAttachments:async(id,ids)=>{window.deletes.push(ids);window.undoAllowed=true;window.dismissed=false;task={...task,attachments:(task.attachments??[]).filter(file=>!ids.includes(file.id)),contextVersion:task.contextVersion+1};publish(task);return batch(ids.map(item=>({kind:'attachment',id:item})));},
          applyResourceCleanup:async()=>{window.cleanups.push(window.cleanupPlan);const merged=window.cleanupPlan.mergedPullRequests??[];const moved=(task.links??[]).filter(link=>merged.some(item=>item.id===link.id)).map(link=>({...link,archivedAt:now}));const links=(task.links??[]).filter(link=>!merged.some(item=>item.id===link.id));window.cleanupPlan={missingFiles:[],mergedPullRequests:[]};window.undoAllowed=true;window.dismissed=false;publish({...task,links,archivedLinks:[...(task.archivedLinks??[]),...moved],contextVersion:task.contextVersion+1});return batch(moved.map(item=>({kind:'issue',id:item.id})));},
          undoResourceChange:async()=>{if(!window.undoAllowed)throw new Error('TASK_UNDO_EXPIRED');window.undos.push(true);window.undoAllowed=false;if(lastSnapshot){const restored=lastSnapshot;lastSnapshot=null;return publish(restored);}return structuredClone(task);},
          updateFileMeta:async(id,kind,fileId,patch)=>{const list=kind==='file'?task.files:task.attachments;task={...task,[kind==='file'?'files':'attachments']:list.map(item=>item.id===fileId?{...item,...patch}:item),contextVersion:task.contextVersion+1};return publish(task);},
          updateWebLink:async(id,linkId,title)=>{window.titles.push(title);task={...task,webLinks:task.webLinks.map(link=>link.url.includes('example.com/spec')?{...link,title}:link)};return publish(task);},
          addResources:async()=>structuredClone(task),
        }};
      window.setTaskStatus=status=>{task={...task,status};publish(task);};
      window.storePending=()=>useTaskStore.getState().pending;window.expireUndo=()=>import('/src/stores/taskResourceUndoStore.ts').then(mod=>mod.useTaskResourceUndoStore.setState({expiresAt:new Date(Date.now()-1).toISOString()}));
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
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:"+server.httpServer.address().port+"/__resource_window_test")});
        await win.webContents.executeJavaScript(\`(async()=>{
          const pause=()=>new Promise(resolve=>setTimeout(resolve,35));
          const wait=async(check,message)=>{for(let attempt=0;attempt<160;attempt++){if(check())return;await pause();}throw Error(message);};
          const dialog=()=>document.querySelector('[role="dialog"]');
          const button=(label,root=dialog())=>[...root.querySelectorAll('button')].find(item=>item.textContent.trim()===label);
          const category=()=>dialog()?.querySelector('[data-resource-category]')?.dataset.resourceCategory;
          const menuItems=()=>[...document.querySelectorAll('[role="menuitem"]')];
          const itemsIn=(label)=>{const item=menuItems().find(entry=>entry.textContent===label);return item?[...item.closest('[role="menu"]').querySelectorAll('[role="menuitem"]')]:[];};
          const dismissMenu=async()=>{document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));document.body.click();await pause();};
          const contextOn=(el)=>{el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2,clientX:120,clientY:120}));};
          await wait(()=>document.querySelector('.task-context-toolbar button'),'Workspace missing');
          document.querySelector('.task-context-toolbar button').click();
          await wait(()=>dialog()?.textContent.includes('资源窗口'),'Window title missing');
          const cleanupBtn=dialog().querySelector('[data-cleanup]');
          const closeBtn=dialog().querySelector('[data-slot="dialog-close"]');
          if(!cleanupBtn||!closeBtn)throw Error('Cleanup or close button missing');
          const overlap=(a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return !(ra.right<=rb.left||ra.left>=rb.right||ra.bottom<=rb.top||ra.top>=rb.bottom);};
          const inside=(el,box)=>{const r=el.getBoundingClientRect(),b=box.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=b.left-0.5&&r.right<=b.right+0.5&&r.top>=b.top-0.5&&r.bottom<=b.bottom+0.5;};
          if(overlap(cleanupBtn,closeBtn)||cleanupBtn===closeBtn)throw Error('Cleanup and close buttons overlap');
          if(!inside(cleanupBtn,dialog())||!inside(closeBtn,dialog()))throw Error('Cleanup or close is not fully visible');
          const cleanup=()=>dialog()?.querySelector('[data-cleanup]');
          if(!cleanup()?.disabled)throw Error('Cleanup must start disabled when empty');
          button('笔记').click();await wait(()=>category()==='notes','Notes tab missing');
          if(!dialog().querySelector('[data-resource-existing] [data-existing-id="11111111-1111-4111-8111-111111111111"]'))throw Error('Active note missing in window');
          dialog().querySelector('[data-archived-toggle]').click();
          await wait(()=>dialog().querySelector('[data-resource-archived] [data-existing-id="22222222-2222-4222-8222-222222222222"]'),'Archived note missing in window');
          button('恢复',dialog().querySelector('[data-resource-archived]')).click();
          await wait(()=>dialog().querySelector('[data-resource-existing] [data-existing-id="22222222-2222-4222-8222-222222222222"]'),'Restored note missing');
          button('文件').click();await wait(()=>category()==='files','Files tab missing');
          if(!dialog().querySelector('[data-existing-id="33333333-3333-4333-8333-333333333333"]')||!dialog().querySelector('[data-existing-id="66666666-6666-4666-8666-666666666666"]'))throw Error('Existing files and attachments missing');
          dialog().querySelector('[data-archived-toggle]').click();
          await wait(()=>dialog().querySelector('[data-resource-archived] [data-existing-id="77777777-7777-4777-8777-777777777777"]')&&dialog().querySelector('[data-resource-archived] [data-existing-id="88888888-8888-4888-8888-888888888888"]'),'Archived files missing');
          button('链接').click();await wait(()=>category()==='links','Links tab missing');
          if([...dialog().querySelectorAll('[data-resource-existing] [data-existing-kind="link"]')].length!==2)throw Error('Duplicate URLs must aggregate into one row, and a distinct URL stays separate');
          dialog().querySelector('[data-archived-toggle]').click();
          await wait(()=>dialog().querySelector('[data-resource-archived] [data-existing-kind="link"]'),'Archived link missing');
          const urlInput=dialog().querySelector('input[type="url"]');
          if(!urlInput)throw Error('Link URL field missing');
          const urlProto=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
          urlProto.set.call(urlInput,'https://example.com/old');
          urlInput.dispatchEvent(new Event('input',{bubbles:true}));
          await wait(()=>dialog().textContent.includes('已在归档中'),'Archived link hint missing');
          if(!button('添加到任务')?.disabled)throw Error('Adding an archived link must stay disabled');
          button('取消').click();await wait(()=>!dialog(),'Close after inventory failed');
          const row=name=>[...document.querySelectorAll('.task-context-row')].find(item=>item.textContent.includes(name));
          row('spec.md').click();await wait(()=>document.querySelector('[data-file-preview]')?.textContent.includes('spec.md'),'Markdown preview missing');
          if(!document.querySelector('[data-file-preview]').textContent.includes('原路径引用'))throw Error('Metadata source missing');
          document.querySelector('[data-file-preview] button[aria-label="关闭预览"]').click();
          await wait(()=>!document.querySelector('[data-file-preview]'),'Preview close failed');
          row('notes.ts').click();await wait(()=>document.querySelector('[data-file-preview]')?.textContent.includes('notes.ts'),'Code preview missing');
          row('deck.pptx').click();await wait(()=>window.reveals.some(item=>item[0]==='file'),'Unsupported file must reveal');
          const attach=row('copy.txt');contextOn(attach);await wait(()=>menuItems().some(item=>item.textContent==='删除'),'Attachment delete missing');
          if(itemsIn('删除').some(item=>item.textContent==='解除关联'))throw Error('Attachment menu must use Delete');
          await dismissMenu();
          contextOn(row('notes.ts'));await wait(()=>itemsIn('解除关联').length,'File detach missing');
          if(itemsIn('解除关联').some(item=>item.textContent==='删除'))throw Error('Path file must not use Delete');
          await dismissMenu();
          const link=row('Spec')||row('example.com/spec');contextOn(link);await wait(()=>menuItems().some(item=>item.textContent==='复制链接地址')&&menuItems().some(item=>item.textContent==='编辑显示名称'),'Link menu missing');
          menuItems().find(item=>item.textContent==='编辑显示名称').click();
          await wait(()=>dialog()?.querySelector('input'),'Rename dialog missing');
          const title=dialog().querySelector('input');const proto=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');proto.set.call(title,'Shared');title.dispatchEvent(new Event('input',{bubbles:true}));
          button('保存').click();await wait(()=>window.titles.includes('Shared'),'Link title not saved');
          await wait(()=>!dialog()||!dialog().querySelector('input'),'Rename dialog still open');
          const plain=row('example.com/plain');
          if(!plain)throw Error('Untitled link row missing');
          contextOn(plain);await wait(()=>menuItems().some(item=>item.textContent==='复制标题'),'Copy title missing');
          const copyTitle=menuItems().find(item=>item.textContent==='复制标题');
          if(copyTitle.getAttribute('data-disabled')==='true'||copyTitle.getAttribute('aria-disabled')==='true'||copyTitle.hasAttribute('disabled'))throw Error('Copy title must stay enabled when title is empty');
          copyTitle.click();
          await wait(()=>window.copies.includes('https://example.com/plain'),'Copy title should copy the URL when title is empty');
          await dismissMenu();
          const folder=row('assets');contextOn(folder);await wait(()=>menuItems().some(item=>item.textContent==='打开方式')&&menuItems().some(item=>item.textContent==='复制路径')&&menuItems().some(item=>item.textContent==='在此新建会话')&&menuItems().some(item=>item.textContent==='在此新建终端'),'Folder menu missing required items');
          const forbidden=['复制分支名','复制远程 URL','删除 Worktree','在此运行命令'];
          const folderItems=itemsIn('复制路径');
          if(folderItems.some(item=>forbidden.includes(item.textContent.trim())))throw Error('Folder menu has repository-only items');
          await dismissMenu();
          document.querySelector('.task-context-toolbar button').click();await wait(()=>dialog(),'Reopen for bulk missing');
          button('文件').click();await wait(()=>category()==='files','Files for bulk missing');
          dialog().querySelector('input[type="checkbox"][aria-label="全选"]').click();
          await wait(()=>button('归档'),'Bulk archive missing');
          button('归档').click();
          await wait(()=>dialog()?.querySelector('[data-undo-bar]'),'Undo bar missing after archive');
          await wait(()=>dialog()?.querySelector('[data-undo-button]:not(:disabled)'),'Undo button not enabled');
          dialog().querySelector('[data-undo-button]').click();
          await wait(()=>window.undos.length===1&&!dialog()?.querySelector('[data-undo-bar]'),'Undo click failed undos='+window.undos.length+' pending='+window.storePending()+' disabled='+(dialog()?.querySelector('[data-undo-button]')&&dialog().querySelector('[data-undo-button]').disabled)+' alert='+(dialog()?.querySelector('[data-undo-bar] [role="alert"]')&&dialog().querySelector('[data-undo-bar] [role="alert"]').textContent));
          dialog().querySelector('input[type="checkbox"][aria-label="全选"]').click();
          await wait(()=>button('归档')&&button('解除关联')&&button('删除'),'Bulk actions missing after reselect');
          button('删除').click();
          await wait(()=>document.querySelector('[data-batch-confirm="delete"]'),'Delete confirm missing');
          const deleteConfirm=()=>document.querySelector('[data-batch-confirm="delete"]');
          if(document.activeElement!==button('取消',deleteConfirm()))throw Error('Delete confirm default focus must be Cancel');
          const deletesBefore=window.deletes.length;
          button('取消',deleteConfirm()).click();
          await wait(()=>!document.querySelector('[data-batch-confirm]'),'Delete confirm cancel did not close');
          if(window.deletes.length!==deletesBefore)throw Error('Cancel must not delete attachments');
          button('解除关联').click();
          await wait(()=>document.querySelector('[data-batch-confirm="detach"]'),'Detach confirm missing');
          const detachConfirm=()=>document.querySelector('[data-batch-confirm="detach"]');
          if(document.activeElement!==button('取消',detachConfirm()))throw Error('Detach confirm default focus must be Cancel');
          const detachesBefore=window.detaches.length;
          button('取消',detachConfirm()).click();
          await wait(()=>!document.querySelector('[data-batch-confirm]'),'Detach confirm cancel did not close');
          if(window.detaches.length!==detachesBefore)throw Error('Cancel must not detach');
          button('归档').click();await wait(()=>dialog()?.querySelector('[data-undo-bar]'),'Undo bar missing before expiry');
          await window.expireUndo();
          await wait(()=>!dialog()?.querySelector('[data-undo-bar]'),'Expired undo bar still visible');
          button('仓库与文件夹').click();await wait(()=>category()==='repositories','Repos tab missing');
          dialog().querySelector('input[type="checkbox"][aria-label="全选"]').click();
          await wait(()=>button('解除关联'),'Bulk detach missing');
          button('解除关联').click();
          await wait(()=>document.querySelector('[data-batch-confirm="detach"]'),'Bulk detach confirm missing');
          if(window.detaches.length)throw Error('Bulk detach must wait for confirm');
          button('解除关联',document.querySelector('[data-batch-confirm="detach"]')).click();
          await wait(()=>dialog().textContent.includes('已跳过')||dialog()?.querySelector('[data-undo-bar]')?.textContent.includes('已跳过'),'Skipped last workspace reason missing');
          button('笔记').click();await wait(()=>category()==='notes','Notes tab missing before close');
          dialog().querySelector('input[type="checkbox"][aria-label="全选"]').click();
          await wait(()=>button('归档'),'Notes archive missing before close');
          button('归档').click();
          await wait(()=>dialog()?.querySelector('[data-undo-bar]')&&!button('归档'),'Undo bar missing or selection still active before close');
          window.dismissed=false;
          button('取消').click();await wait(()=>!dialog(),'Close window failed');
          if(document.querySelector('[data-undo-bar]'))throw Error('Undo bar remained after closing the resource window');
          if(!window.dismissed)throw Error('dismissResourceUndo was not called on close');
          let rejected=false;try{await window.navo.tasks.undoResourceChange('existing');}catch(error){if(String(error).includes('TASK_UNDO_EXPIRED'))rejected=true;else throw error;}
          if(!rejected)throw Error('Undo still allowed after closing the window');
          window.cleanupPlan={missingFiles:[{kind:'file',id:'33333333-3333-4333-8333-333333333333',name:'spec.md'}],mergedPullRequests:[{id:'pr-merged',title:'Merged PR'}]};
          document.querySelector('.task-context-toolbar button').click();await wait(()=>dialog(),'Reopen missing');
          await wait(()=>!cleanup()?.disabled,'Cleanup stayed disabled after plan arrived');
          cleanup().click();await wait(()=>document.querySelector('[data-cleanup-dialog]'),'Cleanup preview missing');
          if(!document.querySelector('[data-cleanup-dialog]').textContent.includes('spec.md'))throw Error('Cleanup preview did not list missing file');
          button('清理',document.querySelector('[data-cleanup-dialog]')).click();
          await wait(()=>window.cleanups.length===1&&!document.querySelector('[data-cleanup-dialog]'),'Cleanup apply missing');
          button('Pull requests').click();await wait(()=>category()==='pullRequests','PR tab missing after cleanup');
          if(dialog().querySelector('[data-resource-existing] [data-existing-id="pr-merged"]'))throw Error('Cleaned PR must leave the active list');
          dialog().querySelector('[data-archived-toggle]').click();
          await wait(()=>dialog().querySelector('[data-resource-archived] [data-existing-id="pr-merged"]'),'Archived PR missing in window');
          button('取消').click();await wait(()=>!dialog(),'Close after cleanup failed');
          const prGroup=[...document.querySelectorAll('.task-context-group')].find(group=>group.textContent.includes('PULL REQUESTS'));
          if(!prGroup)throw Error('PR rail group missing after cleanup');
          prGroup.querySelector('[data-archived-toggle]').click();
          await wait(()=>prGroup.querySelector('[data-resource-archived]')?.textContent.includes('Merged PR'),'Archived PR missing in rail');
          const archivedRow=[...prGroup.querySelectorAll('.task-context-row')].find(row=>row.textContent.includes('Merged PR'));
          if(!archivedRow)throw Error('Archived PR row missing in rail');
          contextOn(archivedRow);await wait(()=>menuItems().some(item=>item.textContent==='恢复'),'Rail restore missing');
          menuItems().find(item=>item.textContent==='恢复').click();
          await wait(()=>window.restores.some(items=>items.some(item=>item.kind==='issue'&&item.id==='pr-merged')),'Rail restore was not applied');
          await wait(()=>{const group=[...document.querySelectorAll('.task-context-group')].find(item=>item.textContent.includes('PULL REQUESTS'));return group&&[...group.querySelectorAll('.task-context-row')].some(row=>row.textContent.includes('Merged PR')&&!row.closest('[data-resource-archived]'));},'Restored PR missing from rail active list');
          window.setTaskStatus('ARCHIVED');await pause();
          document.querySelector('.task-context-toolbar button').click();await wait(()=>dialog(),'Archived window missing');
          if(!cleanup()?.disabled)throw Error('Archived task cleanup must be disabled');
          if(dialog().querySelector('input[type="checkbox"]'))throw Error('Archived task must not allow bulk selection');
          if(button('添加到任务')||button('归档')||button('解除关联'))throw Error('Archived task must be read-only');
          button('笔记').click();await wait(()=>category()==='notes','Archived notes tab missing');
          dialog().querySelector('[data-archived-toggle]')?.click();
          await pause();
          if(button('恢复'))throw Error('Archived task must not restore resources');
        })()\`);
        if(errors.length)throw Error(errors.join('\\n'));console.log('RESOURCE_WINDOW_UI_OK');app.exit(0);
      }catch(error){console.error(error,errors.join('\\n'));app.exit(1);}
    });`);
    let output="";child=spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:""},stdio:["ignore","pipe","pipe"]});child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);
    const code=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});
    assert.equal(code,0,output);assert.match(output,/RESOURCE_WINDOW_UI_OK/);
  } finally { child?.kill("SIGKILL"); await server.close(); await rm(directory,{recursive:true,force:true}); }
});
