import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import electron from 'electron';
import { createServer } from 'vite';

async function checks(){
 const wait=async(fn,message)=>{for(let i=0;i<220;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(message);};
 const pane=()=>document.querySelector('.task-note-pane');
 const action=label=>pane()?.querySelector('button[aria-label="'+label+'"]');
 const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
 const input=()=>pane().querySelector('textarea');
 const fill=async(node,value)=>{Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,50));};
 const menu=async()=>{action('笔记操作').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,isPrimary:true,pointerType:'mouse'}));await wait(()=>document.querySelector('[role="menuitem"]'),'Note actions missing');};
 const menuItem=text=>[...document.querySelectorAll('[role="menuitem"]')].find(node=>node.textContent===text);
 await wait(()=>pane()?.querySelector('h1'),'Markdown not rendered');
 if(!pane().querySelector('strong')||!pane().querySelector('table')||!pane().querySelector('pre code'))throw Error('Markdown formatting incomplete');
 if(window.unsafeNoteExecuted||pane().querySelector('script'))throw Error('Markdown must never run HTML');
 action('复制笔记').click();await wait(()=>window.copied.length===1,'Copy missing');if(window.copied[0]!==window.current().notes[0].content)throw Error('Copy must include raw body only');
 action('另存为…').click();await wait(()=>window.exports.length===1,'Save as missing');
 await menu();menuItem('复制笔记链接').click();await wait(()=>window.copied.length===2,'Note link missing');if(window.copied[1]!==`navo://task/task/note/${window.current().notes[0].id}`)throw Error('Wrong note link');
 const before=window.current().notes[0].version;pane().querySelector('input[type="checkbox"]').click();await wait(()=>window.current().notes[0].version===before+1&&!window.pending(),'Checklist not saved');
 if(!window.current().notes[0].content.includes('- [x] item'))throw Error('Checklist modified wrong source line');
 pane().querySelector('header button[title="Original note"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait(()=>pane().querySelector('header input'),'Inline rename absent');
 await fill(pane().querySelector('header input'),'Renamed note');action('确认').click();await wait(()=>window.current().notes[0].title==='Renamed note'&&!window.pending()&&!pane().querySelector('header input'),'Rename failed');
 action('编辑笔记').click();await wait(input,'Editor missing');await fill(input(),'# Updated\n\n**new body**');button('预览').click();await wait(()=>pane().querySelector('strong')?.textContent==='new body','Editor preview missing');button('编辑').click();await wait(input,'Source toggle failed');
 input().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));await wait(()=>!input()&&!window.pending()&&window.current().notes[0].content.includes('Updated'),'Save shortcut failed');
 action('历史版本与变更').click();await wait(()=>pane().querySelectorAll('select').length===2,'History controls missing');
 const to=[...pane().querySelectorAll('label')].find(node=>node.textContent.includes('查看版本')).querySelector('select');to.value='1';to.dispatchEvent(new Event('change',{bubbles:true}));
 await wait(()=>button('恢复此版本')&&!button('恢复此版本').disabled,'Version restore missing');window.remoteEdit('Changed while browsing history','Remote title');await wait(()=>pane().querySelectorAll('select').length===2,'History refresh missing');if(pane().querySelectorAll('select')[1].value!=='1')throw Error('New version changed the selected historical version');const oldVersion=window.current().notes[0].version;button('恢复此版本').click();await wait(()=>window.current().notes[0].version===oldVersion+1&&!window.pending(),'Restore did not append version');
 if(window.current().notes[0].title!=='Original note'||window.noteHistory.at(-1).restoredFrom!==1)throw Error('History restoration lost title or provenance');await wait(()=>button('恢复此版本')?.disabled,'Identical snapshot must not offer a no-op restore');
 button('后退').click();await wait(()=>pane().querySelector('strong')?.textContent==='bold','Restore body missing');
 const text=pane().querySelector('.task-note-markdown strong').firstChild,range=document.createRange();range.selectNodeContents(text);window.getSelection().removeAllRanges();window.getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));await wait(()=>!button('评论选中文本').disabled,'Selection toolbar unavailable');button('评论选中文本').click();
 await wait(()=>pane().querySelector('[data-note-comment-draft] textarea'),'Selection comment missing');await fill(pane().querySelector('[data-note-comment-draft] textarea'),'Check this claim');button('保存评论').click();await wait(()=>pane().querySelector('article')?.textContent.includes('Check this claim')&&!window.pending(),'Comment not saved');
 if(!window.current().notes[0].comments[0].quote.includes('**bold**'))throw Error('Comment must reference Markdown source');
 button('回复').click();await wait(()=>pane().querySelector('[data-note-comment-draft] textarea'),'Reply draft missing');await fill(pane().querySelector('[data-note-comment-draft] textarea'),'A reply');button('保存评论').click();await wait(()=>window.current().notes[0].comments.length===2&&!window.pending(),'Reply missing');
 button('解决').click();await wait(()=>!pane().querySelector('article'),'Resolved thread should be hidden');button('显示已解决').click();await wait(()=>pane().querySelector('article'),'Resolved thread unavailable');button('重新打开').click();await wait(()=>!window.current().notes[0].comments[0].resolvedAt&&!window.pending(),'Reopen failed');
 action('编辑笔记').click();await wait(input,'Draft editor missing');await fill(input(),'Persistent local draft');action('关闭').click();await wait(()=>!pane(),'Close failed');window.reopen();await wait(()=>action('继续编辑草稿'),'Persisted draft unavailable');action('继续编辑草稿').click();await wait(()=>input()?.value==='Persistent local draft','Draft lost');
 window.remoteEdit('Remote content','Remote title');button('保存').click();await wait(()=>button('仍然保存'),'Conflict choice missing');if(window.current().notes[0].content!=='Remote content'||input().value!=='Persistent local draft')throw Error('Conflict lost content');
 button('仍然保存').click();await wait(()=>!input()&&window.current().notes[0].content==='Persistent local draft','Explicit overwrite failed');if(window.current().notes[0].title!=='Remote title')throw Error('Body overwrite must preserve newer independent title');
 action('编辑笔记').click();await wait(input,'Clear editor missing');await fill(input(),'');if(button('保存').disabled)throw Error('Clearing an existing note must be allowed');button('保存').click();await wait(()=>!input()&&window.current().notes[0].content==='','Empty content did not save');
 action('编辑笔记').click();await wait(input,'Empty note editor missing');await fill(input(),'Persistent local draft');button('保存').click();await wait(()=>!input()&&!window.pending(),'Refill failed');
 pane().querySelector('header button[title="Remote title"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait(()=>pane().querySelector('header input'),'Conflict rename missing');await fill(pane().querySelector('header input'),'Local title');window.remoteEdit('Persistent local draft','New remote title');action('确认').click();await wait(()=>pane().querySelector('header [role="alert"]'),'Stale rename should fail');if(window.current().notes[0].title!=='New remote title')throw Error('Stale rename overwrote newer title');action('取消').click();await wait(()=>!pane().querySelector('header [role="alert"]'),'Cancelling rename must clear its conflict error');
 window.archive(true);await wait(()=>action('编辑笔记')?.disabled,'Archive must disable editing');await menu();if(menuItem('删除笔记').getAttribute('aria-disabled')!=='true'||menuItem('重命名笔记').getAttribute('aria-disabled')!=='true')throw Error('Archive must disable note writes');menuItem('复制笔记链接').click();
 action('复制笔记').click();await wait(()=>window.copied.at(-1)==='Persistent local draft','Archived note should remain copyable');window.archive(false);await wait(()=>!action('编辑笔记').disabled,'Unarchive failed');
 window.resize(300);await new Promise(r=>setTimeout(r,120));if(pane().scrollWidth>pane().clientWidth+1)throw Error('Narrow note panel overflows');
 window.resize(620);window.remoteEdit(window.noteHistory[0].content,'Notes');await new Promise(r=>setTimeout(r,120));
}

test('Notes 完整交互：Markdown、清单、复制、独立标题、历史、评论、草稿、冲突和归档', {timeout:60000}, async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'navo-notes-ui-'));
 const {default:tailwindcss}=await import('@tailwindcss/vite');
 const server=await createServer({configFile:false,appType:'custom',root:process.cwd(),cacheDir:path.join(dir,'cache'),logLevel:'error',plugins:[tailwindcss()],esbuild:{jsx:'automatic'},resolve:{alias:{'@':path.resolve('src')}},worker:{format:'es'},server:{host:'127.0.0.1',port:0}});
 const content='# Heading\n\n**bold** and [docs](https://example.com)\n\n- [ ] item\n\n| A | B |\n|---|---|\n| one | two |\n\n```js\nconst ok = true;\n```\n\n<script>window.unsafeNoteExecuted=true</script>';
 server.middlewares.use('/__notes',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__notes',`<div id="root"></div><script type="module">
 import React from 'react';import{createRoot}from'react-dom/client';import'/src/App.css';import'/src/components/tasks/workspace/task-workspace.css';import i18n from'/src/i18n/index.ts';
 import{TaskNotePane}from'/src/components/tasks/workspace/TaskNotePane.tsx';import{TaskNoteDialogs}from'/src/components/tasks/workspace/TaskNoteDialogs.tsx';
 import{useTaskNoteEditor}from'/src/hooks/useTaskNoteEditor.ts';import{useTaskStore}from'/src/stores/taskStore.ts';import{TooltipProvider}from'/src/components/ui/tooltip.tsx';
 await i18n.changeLanguage('zh-CN');
 let task={id:'task',title:'Task',description:'Prompt',date:'2026-11-01T10:00:00Z',updatedAt:'2026-11-01T10:00:00Z',status:'TODO',contextVersion:1,notes:[{id:'11111111-1111-4111-8111-111111111111',title:'Original note',content:${JSON.stringify(content).replaceAll("<", "\\u003c")},version:1,origin:'user',sortOrder:0,createdAt:'2026-11-01T10:00:00Z',updatedAt:'2026-11-01T10:00:00Z',comments:[]}]};
 let history=[{noteId:task.notes[0].id,...task.notes[0],actor:'user',kind:'create'}];window.copied=[];window.exports=[];window.noteHistory=history;
 const emit=()=>{task={...task,contextVersion:task.contextVersion+1,updatedAt:new Date().toISOString()};useTaskStore.setState({tasks:[structuredClone(task)]});return structuredClone(task);};
 const update=(patch,kind='edit',restoredFrom)=>{task.notes[0]={...task.notes[0],...patch,version:task.notes[0].version+1,updatedAt:new Date().toISOString(),lastEditor:'user'};history.push({noteId:task.notes[0].id,...task.notes[0],actor:'user',kind,createdAt:new Date().toISOString(),restoredFrom});return emit();};
 window.pending=()=>useTaskStore.getState().pending;window.current=()=>task;window.remoteEdit=(content,title)=>update({content,title});window.archive=value=>{task.status=value?'ARCHIVED':'TODO';emit();};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copied.push(text)}});
 window.navo={settings:{},tasks:{load:async()=>({tasks:[structuredClone(task)],recoveryWarnings:[]}),exportNote:async(...args)=>{window.exports.push(args);return true;},
 updateNote:async(_id,note,expected)=>{if(task.notes[0].version!==expected)throw Error('TASK_CONTENT_CHANGED');return update(note);},
 noteHistory:async()=>structuredClone(history).reverse(),restoreNote:async(_id,_note,version,expected)=>{if(expected!==task.notes[0].version)throw Error('TASK_CONTENT_CHANGED');const selected=history.find(item=>item.version===version);return update({title:selected.title,content:selected.content},'restore',version);},
 commentNote:async(_id,input)=>{if(task.notes[0].version!==input.noteVersion)throw Error('TASK_CONTENT_CHANGED');task.notes[0].comments.push({...input,actor:'user',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return emit();},
 changeNoteComment:async(_id,id,expected,patch)=>{const comment=task.notes[0].comments.find(item=>item.id===id);if(comment.updatedAt!==expected)throw Error('TASK_CONTENT_CHANGED');Object.assign(comment,patch,{resolvedAt:patch.resolved===undefined?comment.resolvedAt:patch.resolved?new Date().toISOString():undefined,updatedAt:new Date(Date.now()+1).toISOString()});return emit();},
 deleteNote:async()=>{task.notes=[];return emit();}}};
 useTaskStore.setState({tasks:[task],loaded:true});
 function Fixture(){const current=useTaskStore(s=>s.tasks[0]),[shown,setShown]=React.useState(true),[width,setWidth]=React.useState(620);window.reopen=()=>setShown(true);window.resize=setWidth;const editor=useTaskNoteEditor(current,current.notes[0]?.id,()=>setShown(false));return React.createElement(TooltipProvider,null,React.createElement('div',{style:{width,height:760,margin:16}},shown&&React.createElement(TaskNotePane,{taskId:'task',editor,onClose:()=>editor.leave(()=>setShown(false))}),React.createElement(TaskNoteDialogs,{editor})));}
 createRoot(document.getElementById('root')).render(React.createElement(Fixture));
 </script>`));});
 let child;
 try{await server.listen();const runner=path.join(dir,'runner.cjs');await writeFile(runner,`const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(dir,'user-data'))});app.whenReady().then(async()=>{app.dock?.hide();const win=new BrowserWindow({show:false,width:1000,height:900,webPreferences:{backgroundThrottling:false}});win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});try{await win.loadURL(${JSON.stringify('http://127.0.0.1:'+server.httpServer.address().port+'/__notes')});await win.webContents.executeJavaScript(${JSON.stringify(`(${checks.toString()})().catch(error=>{console.error(error.stack);throw error;})`)});await require('node:fs/promises').writeFile('/tmp/navo-notes-parity.png',(await win.webContents.capturePage()).toPNG());console.log('notes parity passed');win.destroy();app.quit();}catch(error){console.error(error);app.exit(1);}});`);
 child=spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const code=await new Promise(resolve=>child.on('exit',resolve));assert.equal(code,0,output);assert.match(output,/notes parity passed/);
 }finally{if(child?.exitCode===null)child.kill();await server.close();await rm(dir,{recursive:true,force:true});}
});
