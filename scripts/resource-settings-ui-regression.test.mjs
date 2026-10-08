import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("资源编辑：真实远端回显、描述、命令草稿、勾选、取消、保存失败及国际化", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-resource-settings-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error", plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__resource_settings", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__resource_settings", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {ResourceDialog} from '/src/components/settings/ResourceDialog.tsx';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {ResourcesSettingsPage} from '/src/components/settings/ResourcesSettingsPage.tsx';import {defaultSettings} from '/src/domain/settings.ts';import '/src/components/settings/settings.css';
      await i18n.changeLanguage('zh-CN');window.setTestLocale=locale=>i18n.changeLanguage(locale);
      window.persisted={id:'fixture',kind:'folder',name:'navo',localPath:'/fixture/repo',available:true};window.saves=[];window.inspections=[];window.forcedInspections=[];
      window.navo={settings:{chooseDirectory:async()=>window.folderChoice??null},resources:{
        onCloneProgress:()=>()=>{},cancelClone:async()=>{},
        list:async()=>[window.persisted,{id:'second',kind:'repo',name:'Second repo',localPath:'/fixture/new',available:true}],
        inspectGit:async(localPath,forceRefresh)=>{window.inspections.push(localPath);if(forceRefresh)window.forcedInspections.push(localPath);if(window.holdRemote){window.holdRemote=false;return new Promise(resolve=>window.resolveRemote=resolve);}if(window.failRemote||localPath==='/fixture/failure')throw Error('GIT_UNAVAILABLE');return localPath==='/fixture/repo'?{isRepository:true,remoteUrl:window.overrideRemote??'git@gitlab.example.com:team/navo.git'}:localPath==='/fixture/new'?{isRepository:true,remoteUrl:'https://github.com/team/new.git'}:{isRepository:false,remoteUrl:null};},
        save:async params=>{window.saves.push(structuredClone(params));if(window.failSave)throw Error('INVALID_RESOURCE_STORAGE');window.persisted={...structuredClone(params),available:true};return window.persisted;}
      }};
      function Fixture(){const[open,setOpen]=React.useState(true);const[page,setPage]=React.useState(false);window.showResourcePage=()=>{setOpen(false);setPage(true);};return React.createElement(TooltipProvider,null,page?React.createElement(ResourcesSettingsPage,{settings:defaultSettings}):React.createElement('button',{id:'reopen',onClick:()=>setOpen(true)},'Edit'),open&&React.createElement(ResourceDialog,{record:window.persisted,repositoriesDirectory:'/fixture/repos',onClose:()=>setOpen(false)}));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, "data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1050,height:950,webPreferences:{backgroundThrottling:false}});const errors=[];
      win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
      try{await win.loadURL(${JSON.stringify("http://127.0.0.1:" + server.httpServer.address().port + "/__resource_settings")});await win.webContents.executeJavaScript(\`(async()=>{
        const pause=()=>new Promise(resolve=>setTimeout(resolve,35));
        const wait=async(check,message)=>{for(let count=0;count<180;count++){if(check())return;await pause();}throw Error(message);};
        const dialog=()=>document.querySelector('[role="dialog"]');const editor=()=>document.querySelector('[data-slot="resource-command-editor"]');
        const button=(text,root=dialog())=>[...root.querySelectorAll('button')].find(item=>item.textContent.trim()===text);
        const field=(text,root=dialog())=>[...root.querySelectorAll('label')].find(item=>item.firstChild?.textContent.trim()===text)?.querySelector('input,textarea');
        const input=async(element,value)=>{const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));await pause();};
        const reopen=async()=>{document.getElementById('reopen').click();await wait(()=>dialog(),'Edit must reopen');};
        const choosePath=async value=>{window.folderChoice=value;dialog().querySelector('button[aria-label="选择目录"]').click();await pause();};
        const nameInput=()=>dialog().querySelector('[data-slot="resource-name-input"]');
        const editName=async()=>{dialog().querySelector('[data-slot="resource-name"]').click();await wait(()=>nameInput(),'Name input must appear after clicking');};
        await wait(()=>dialog()?.textContent.includes('git@gitlab.example.com:team/navo.git'),'Imported folder that is a repository must show its real remote');
        if(dialog().textContent.includes('修改名称或本地路径不会更改 Git remote。'))throw Error('Removed helper copy must not appear');
        if(nameInput()||dialog().textContent.includes('暂无命令'))throw Error('Name must start as text and empty commands must have no placeholder');
        if(field('本地路径')||dialog().querySelector('input[aria-label="本地路径"]'))throw Error('Local path must not be editable or have a visible label');
        await editName();await input(nameInput(),'Renamed repo');nameInput().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await pause();
        if(nameInput()||dialog().querySelector('[data-slot="resource-name"]').textContent!=='Renamed repo'||window.saves.length)throw Error('Enter must confirm the name draft without saving the resource');
        await editName();await input(nameInput(),'Discard name');nameInput().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause();
        if(!dialog()||nameInput()||dialog().querySelector('[data-slot="resource-name"]').textContent!=='Renamed repo')throw Error('Escape must cancel name editing without closing the dialog');
        await editName();await input(nameInput(),'   ');nameInput().dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await pause();
        if(dialog().querySelector('[data-slot="resource-name"]').textContent!=='Renamed repo')throw Error('Empty name must retain the prior value');
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.failCopy)throw Error('clipboard unavailable');window.copiedPath=value;}}});
        dialog().querySelector('button[aria-label="复制路径"]').click();await pause();
        if(window.copiedPath!=='/fixture/repo'||!dialog().querySelector('button[aria-label="已复制"]'))throw Error('Copy must use the complete path and show success');
        window.failCopy=true;dialog().querySelector('button[aria-label="已复制"]').click();await pause();
        if(!dialog().querySelector('[role="alert"]')||dialog().querySelector('button[aria-label="已复制"]'))throw Error('Failed copy must show feedback without claiming success');
        window.failCopy=false;dialog().querySelector('button[aria-label="复制路径"]').click();await pause();
        button('取消').click();await wait(()=>!dialog(),'Close before testing cached metadata');window.holdRemote=true;await reopen();await wait(()=>window.resolveRemote,'Reopening must revalidate metadata in the background');
        if(!dialog().textContent.includes('git@gitlab.example.com:team/navo.git'))throw Error('Reopening must show cached remote before background inspection completes');
        window.resolveRemote({isRepository:true,remoteUrl:'git@gitlab.example.com:team/navo.git'});await pause();button('取消').click();await wait(()=>!dialog(),'Close before failure test');window.failRemote=true;await reopen();await pause();
        if(!dialog().textContent.includes('git@gitlab.example.com:team/navo.git')||dialog().textContent.includes('无法读取远程仓库信息'))throw Error('Background failure must retain the prior remote');window.failRemote=false;window.resolveRemote=undefined;
        if(dialog().textContent.includes('分支前缀')||dialog().textContent.includes('Branch Prefix'))throw Error('Branch Prefix must not be implemented');
        if(document.querySelector('[data-slot="resource-remote"] input'))throw Error('Remote URL must be read-only');
        await input(field('描述'),'资源用途说明');button('添加命令').click();await wait(()=>editor(),'Add command must open inline fields');
        if(document.querySelectorAll('[role="dialog"]').length!==1||document.querySelectorAll('form').length!==1)throw Error('Command editor must not create nested dialogs or forms');
        if(!button('保存').disabled||!button('确认',editor()).disabled)throw Error('Unconfirmed command must block parent save and empty command submission');
        await input(field('名称',editor()),'install');await input(field('命令脚本',editor()),'pnpm install'+String.fromCharCode(10)+'pnpm run codegen');
        editor().querySelector('[role="checkbox"]').click();await pause();button('确认',editor()).click();await wait(()=>!editor(),'Command confirm must update draft');
        if(window.saves.length||document.querySelectorAll('[data-slot="resource-command-row"]').length!==1)throw Error('Command confirm must not persist the resource');
        button('添加命令').click();await wait(()=>editor(),'Second command editor missing');await input(field('名称',editor()),'dev');await input(field('命令脚本',editor()),'npm run dev');button('确认',editor()).click();await wait(()=>!editor(),'Second command confirm failed');
        dialog().querySelector('button[aria-label="编辑: install"]').click();await wait(()=>editor(),'Edit command missing');await input(field('名称',editor()),'discarded');button('取消',editor()).click();await wait(()=>!editor(),'Cancel command must close inline editor');
        if(dialog().textContent.includes('discarded'))throw Error('Cancelling command edit must retain original draft');
        dialog().querySelector('button[aria-label="移除: dev"]').click();await pause();if(document.querySelectorAll('[data-slot="resource-command-row"]').length!==1)throw Error('Command removal failed');
        button('取消').click();await wait(()=>!dialog(),'Cancel resource must close');if(window.saves.length)throw Error('Cancel must not save description or commands');
        await reopen();if(field('描述').value||document.querySelector('[data-slot="resource-command-row"]'))throw Error('Cancelled drafts must not survive reopening');
        await input(field('描述'),'Saved description');button('添加命令').click();await wait(()=>editor(),'Editor missing');await input(field('名称',editor()),'install');await input(field('命令脚本',editor()),'pnpm install');editor().querySelector('[role="checkbox"]').click();await pause();button('确认',editor()).click();await wait(()=>!editor(),'Confirm missing');
        window.failSave=true;button('保存').click();await wait(()=>dialog()?.querySelector('[role="alert"]'),'Save failure must be shown');
        if(field('描述').value!=='Saved description'||!dialog().textContent.includes('install'))throw Error('Save failure must retain all fields');
        window.failSave=false;button('保存').click();await wait(()=>!dialog(),'Retry save failed');if(window.persisted.commands[0].runOnWorktreeCreation!==true||window.persisted.description!=='Saved description')throw Error('Configuration must be submitted together');
        await reopen();dialog().querySelector('button[aria-label="编辑: install"]').click();await wait(()=>editor(),'Stored command must be editable');if(editor().querySelector('[role="checkbox"]').getAttribute('aria-checked')!=='true')throw Error('Automatic flag must survive save');
        const commandId=window.persisted.commands[0].id;await input(field('命令脚本',editor()),'pnpm install --frozen-lockfile');button('确认',editor()).click();await wait(()=>!editor(),'Edit confirm failed');button('保存').click();await wait(()=>!dialog(),'Edited save failed');if(window.persisted.commands[0].id!==commandId||window.persisted.commands[0].script!=='pnpm install --frozen-lockfile')throw Error('Edit must preserve command id');
        await reopen();window.holdRemote=true;await choosePath('/fixture/slow');await wait(()=>window.resolveRemote,'Slow inspection did not start');await choosePath('/fixture/new');await wait(()=>dialog().textContent.includes('https://github.com/team/new.git'),'Changing path must re-read Git metadata');window.resolveRemote({isRepository:true,remoteUrl:'STALE_REMOTE'});await pause();if(dialog().textContent.includes('STALE_REMOTE'))throw Error('Stale inspection must not overwrite the new path');
        await choosePath(null);if(dialog().querySelector('[data-slot="resource-local-path"]').textContent!=='/fixture/new')throw Error('Cancelled picker must retain the path');
        await choosePath('/fixture/folder');await wait(()=>dialog().textContent.includes('非 Git 仓库'),'Plain folders must not show stale remote URLs');
        await choosePath('/fixture/failure');await wait(()=>dialog().textContent.includes('无法读取远程仓库信息'),'Metadata failure must not be shown as no remote');if(button('保存').disabled)throw Error('Optional metadata failure must not prevent editing');
        await choosePath('/fixture/repo');await wait(()=>dialog().textContent.includes('git@gitlab.example.com:team/navo.git'),'Remote should recover');await window.setTestLocale('en');await wait(()=>button('Add command'),'Commands must support English');button('Add command').click();await wait(()=>editor(),'English editor missing');if(!editor().textContent.includes('Run on worktree creation'))throw Error('Checkbox translation missing');button('Cancel',editor()).click();await wait(()=>!editor(),'English cancel failed');
        await window.setTestLocale('zh-CN');window.showResourcePage();await wait(()=>document.querySelectorAll('[data-slot="resource-edit-trigger"]').length===2&&!dialog(),'Resource list must load');
        const rows=[...document.querySelectorAll('.resource-row')];
        for(const row of rows){const count=row.querySelector('[data-slot="resource-command-count"]'),bounds=count.getBoundingClientRect(),rowBounds=row.getBoundingClientRect(),title=row.querySelector('h2').getBoundingClientRect(),remove=row.querySelector('button[aria-label^="移除:"]').getBoundingClientRect();if(count.parentElement!==row||bounds.left<title.right||bounds.right>remove.left||Math.abs(bounds.top+bounds.height/2-rowBounds.top-rowBounds.height/2)>1)throw Error('Command count must be independently right-aligned before remove and vertically centered');}
        if(rows[0].querySelector('[data-slot="resource-command-count"]').textContent!=='1 条命令'||rows[1].querySelector('[data-slot="resource-command-count"]').textContent!=='暂无命令')throw Error('List must show persisted command counts and empty state');
        await window.setTestLocale('en');await wait(()=>rows[0].querySelector('[data-slot="resource-command-count"]').textContent==='1 command'&&rows[1].querySelector('[data-slot="resource-command-count"]').textContent==='No commands','List command metadata must follow the selected language');await window.setTestLocale('zh-CN');await pause();
        if(rows.some(row=>row.querySelectorAll('button').length!==2||row.querySelector('.lucide-pencil')))throw Error('Rows must only contain the full-row trigger and independent remove action');
        rows[0].querySelector('[data-slot="resource-edit-trigger"]').click();await wait(()=>dialog()?.querySelector('[data-slot="resource-name"]'),'Clicking a folder row must open editing');
        button('取消').click();await wait(()=>!dialog(),'Editing must close');
        await wait(()=>document.activeElement===rows[0].querySelector('[data-slot="resource-edit-trigger"]'),'Closing must restore focus to the clicked row');
        rows[1].querySelector('[data-slot="resource-edit-trigger"]').click();await wait(()=>dialog()?.querySelector('[data-slot="resource-name"]')?.textContent==='Second repo','Clicking a repository row must open its editor');
        button('取消').click();await wait(()=>!dialog(),'Second editor must close');
        rows[0].querySelector('button[aria-label="移除: navo"]').click();await wait(()=>dialog()?.textContent.includes('移除资源？'),'Remove must open confirmation');
        if(document.querySelectorAll('[role="dialog"]').length!==1||dialog().querySelector('[data-slot="resource-name"]'))throw Error('Remove must not also open editing');
        button('取消').click();await wait(()=>!dialog(),'Remove cancellation must close');
        rows[0].querySelector('[data-slot="resource-edit-trigger"]').click();await wait(()=>dialog()?.textContent.includes('git@gitlab.example.com:team/navo.git'),'Final editor must display metadata');
        button('取消').click();await wait(()=>!dialog(),'Close before refreshing resources');window.overrideRemote='https://example.com/manually-refreshed.git';document.querySelector('button[aria-label="刷新"]').click();
        await wait(()=>window.forcedInspections.includes('/fixture/repo')&&!document.querySelector('button[aria-label="刷新"]').disabled,'List refresh must force-update cached Git metadata');
        rows[0].querySelector('[data-slot="resource-edit-trigger"]').click();await wait(()=>dialog()?.textContent.includes(window.overrideRemote),'Reopening must display the manually refreshed remote');
        window.overrideRemote='https://example.com/focus-refreshed.git';window.dispatchEvent(new Event('focus'));await wait(()=>dialog()?.textContent.includes(window.overrideRemote),'Returning to the app must check external config changes');
      })()\`);if(process.env.NAVO_RESOURCE_EDITOR_SCREENSHOT){await new Promise(resolve=>setTimeout(resolve,200));await require('node:fs/promises').writeFile(process.env.NAVO_RESOURCE_EDITOR_SCREENSHOT,(await win.webContents.capturePage()).toPNG());}app.exit(0);}catch(error){console.error(error.stack,errors.join('\\n'));app.exit(1);}});`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    let output = "";
    child = spawn(electron, [runner], { env, stdio: ["ignore", "pipe", "pipe"], timeout: 50000 });
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(code, 0, output);
  } finally { child?.kill(); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
