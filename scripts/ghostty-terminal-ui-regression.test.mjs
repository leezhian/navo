import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import electron from 'electron';
import { createServer } from 'vite';
import { assertTerminalWheel } from './helpers/assert-terminal-wheel.mjs';
import { assertTerminalIme } from './helpers/assert-terminal-ime.mjs';

async function assertions(checkWheel) {
  const pause = () => new Promise(resolve => setTimeout(resolve, 35));
  const wait = async (check, label) => { for (let i=0;i<150;i++) { if (check()) return; await pause(); } throw Error(label); };
  const failures=[];
  const check = (value, label) => { if (!value) failures.push(label); };
  await wait(()=>document.querySelector('.navo-terminal-container[data-status="ready"] canvas'), 'Canvas did not initialize');
  const original = document.querySelector('.navo-terminal-surface');
  const host = () => document.querySelector('.navo-terminal-surface');
  const text = () => { host().dispatchEvent(new KeyboardEvent('keydown',{key:'a',code:'KeyA',metaKey:true,bubbles:true,cancelable:true})); const clipboard = new DataTransfer(); host().dispatchEvent(new ClipboardEvent('copy',{clipboardData:clipboard,bubbles:true,cancelable:true}));return clipboard.getData('text/plain'); };
  await wait(()=>text().includes('HISTORY'), 'Real VT output did not reach selection');
  check(text().match(/HISTORY/g)?.length===1,'Replay duplicated initial output');
  window.emit('\x1B[32m✓ Canvas / WASM ready\x1B[0m\r\n中文输入 · Agent session · navo/task\r\n\x1B[34m┌─ Changes ─────────────────────────┐\x1B[0m\r\n│ + terminal renderer              │\r\n│ - HTML snapshot                  │\r\n\x1B[34m└──────────────────────────────────┘\x1B[0m\r\n');
  await pause();
  const canvas=host().querySelector('canvas'), pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  check(pixels.some((value,index)=>index%4===0&&value!==17),'Canvas contains no rendered glyphs');
  check(document.activeElement?.id === 'outside','autoFocus=false stole focus');
  document.querySelector('#outside').click();await pause();
  const preview=canvas.toDataURL();
  const oldSize=window.sizes.at(-1);window.resizeFixture(430);await wait(()=>window.sizes.at(-1)?.cols<oldSize.cols,'Resize did not use font metrics');
  window.show(false);await wait(()=>!document.querySelector('.navo-terminal-host'),'Unmount failed');
  window.emit('BACKGROUND\r\n');const count=window.sizes.length;await pause();check(window.sizes.length===count,'Hidden terminal changed PTY size');
  window.show(true);await wait(()=>host()?.querySelector('canvas'),'Remount failed');
  check(host()===original,'Terminal instance recreated on remount');check(window.creates===1,'PTY reattached on remount');check(text().includes('BACKGROUND'),'Hidden output lost');
  const textarea=host().querySelector('textarea');textarea.focus();
  window.writes.length=0;
  textarea.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
  textarea.dispatchEvent(new KeyboardEvent('keydown',{key:'Process',code:'KeyA',isComposing:true,bubbles:true,cancelable:true}));
  textarea.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'你好中文'}));
  await pause();check(window.writes.join('')==='你好中文','Composition was lost or duplicated');
  window.writes.length=0;textarea.dispatchEvent(new KeyboardEvent('keydown',{key:'c',code:'KeyC',ctrlKey:true,bubbles:true,cancelable:true}));await pause();check(window.writes.join('')==='\x03','Ctrl+C did not interrupt');
  window.emit('\x1B[?2004h');window.writes.length=0;const clipboard=new DataTransfer();clipboard.setData('text/plain','one\ntwo');
  textarea.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));await pause();check(window.writes.join('')==='\x1B[200~one\ntwo\x1B[201~','Bracketed paste incorrect');
  const sizeBefore=window.sizes.length;window.exit();await wait(()=>document.querySelector('[data-status="exited"]'),'Exit missing');
  window.resizeFixture(500);await pause();check(window.sizes.length===sizeBefore,'Exited terminal resized PTY');
  window.writes.length=0;textarea.dispatchEvent(new KeyboardEvent('keydown',{key:'x',code:'KeyX',bubbles:true,cancelable:true}));await pause();check(window.writes.length===0,'Exited terminal still sends input');
  check(text().includes('HISTORY'),'Exit cleared terminal output');

  // 直接使用同一生产适配器检查上游绘制和资源释放，所有内容均为隔离样例。
  const add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);const mouseup=new Set();
  document.addEventListener=(type,listener,...rest)=>{if(type==='mouseup')mouseup.add(listener);return add(type,listener,...rest);};
  document.removeEventListener=(type,listener,...rest)=>{if(type==='mouseup')mouseup.delete(listener);return remove(type,listener,...rest);};
  const surface=await window.newSurface();document.querySelector('#direct').append(surface.element);surface.fit();
  checkWheel(surface, check);
  surface.write(Array.from({length:200},(_,i)=>'line-'+i+'\r\n').join(''));surface.terminal.scrollLines(-25);const before=surface.terminal.getViewportY();
  surface.write('new output\r\n');check(surface.terminal.getViewportY()>=before,'Output snapped a scrolled viewport to bottom');
  const nativeDpr=window.devicePixelRatio;Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>3});
  window.dispatchEvent(new Event('resize'));surface.fit();await pause();
  const directCanvas=surface.element.querySelector('canvas');check(Math.abs(directCanvas.width/directCanvas.getBoundingClientRect().width-3)<0.05,'Canvas did not update device pixel ratio');
  Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>nativeDpr});
  let hiddenDraws=0;const ctx=directCanvas.getContext('2d'),fill=ctx.fillRect.bind(ctx);ctx.fillRect=(...args)=>{hiddenDraws++;return fill(...args);};
  surface.element.remove();await pause();await pause();check(hiddenDraws===0,'Detached terminal still redraws');
  surface.dispose();check(mouseup.size===0,'Terminal leaked document mouseup listeners');
  document.addEventListener=add;document.removeEventListener=remove;
  await window.destroy();check(window.destroyed===1,'Explicit close did not dispose PTY');
  check(!document.querySelector('.navo-terminal-surface'),'Explicit close left a terminal surface');
  if(failures.length)throw Error(failures.join('; '));
  return preview;
}

test('ghostty-web: real Canvas, VT, wheel protocols, IME, paste, resize, remount and cleanup', {timeout:30000}, async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'navo-ghostty-ui-'));
  const {default:tailwindcss}=await import('@tailwindcss/vite');
  const server=await createServer({configFile:false,appType:'custom',root:process.cwd(),cacheDir:path.join(directory,'cache'),logLevel:'error',plugins:[tailwindcss()],esbuild:{jsx:'automatic'},resolve:{alias:{'@':path.resolve('src')}},server:{host:'127.0.0.1',port:0}});
  server.middlewares.use('/__terminal',async(_request,response)=>{
    response.setHeader('Content-Type','text/html');response.end(await server.transformIndexHtml('/__terminal',`<button id="outside">Keep focus</button><div id="root"></div><div id="direct" style="width:500px;height:200px"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import {TerminalWorkspace} from '/src/components/terminal/TerminalWorkspace.tsx';import {GhosttyTerminalSurface} from '/src/components/terminal/ghosttyTerminalSurface.ts';
      import {destroyManagedTerminalSession} from '/src/components/terminal/terminalSessionManager.ts';
      const output=new Set(),exits=new Set();window.writes=[];window.sizes=[];window.creates=0;window.destroyed=0;
      window.emit=data=>{for(const callback of output)callback({sessionId:'terminal-test',data});};window.exit=()=>{for(const callback of exits)callback({sessionId:'terminal-test',exitCode:0});};
      window.navo={terminal:{create:async()=>{window.creates++;window.emit('HISTORY\\r\\n');for(const callback of output)callback({sessionId:'terminal-test',data:'HISTORY\\r\\n',replay:true});},write:async value=>window.writes.push(value.data),resize:async value=>window.sizes.push(value),destroy:async()=>window.destroyed++,onData:cb=>{output.add(cb);return()=>output.delete(cb);},onExit:cb=>{exits.add(cb);return()=>exits.delete(cb);}}};
      window.destroy=()=>destroyManagedTerminalSession('terminal-test');window.newSurface=()=>GhosttyTerminalSurface.create(80,24,()=>{},()=>{});
      function Fixture(){const[shown,setShown]=React.useState(true),[width,setWidth]=React.useState(700);window.show=setShown;window.resizeFixture=setWidth;return shown&&React.createElement('div',{style:{height:300,width}},React.createElement(TerminalWorkspace,{title:'Fixture',sessionId:'terminal-test',attachOnly:true,autoFocus:false,compact:true}));}
      document.querySelector('#outside').focus();createRoot(document.querySelector('#root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;try{
    await server.listen();const runner=path.join(directory,'runner.cjs');await writeFile(runner,`const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'data'))});app.commandLine.appendSwitch('force-device-scale-factor','2');app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{backgroundThrottling:false}});win.webContents.on('console-message',e=>{if(e.level==='error')console.error(e.message);});
      try{await win.loadURL(${JSON.stringify('http://127.0.0.1:'+server.httpServer.address().port+'/__terminal')});await (${assertTerminalIme.toString()})(win.webContents);const preview=await win.webContents.executeJavaScript(${JSON.stringify(`(${assertions.toString()})(${assertTerminalWheel.toString()})`)});if(process.env.NAVO_TERMINAL_PREVIEW_PATH)require('fs').writeFileSync(process.env.NAVO_TERMINAL_PREVIEW_PATH,Buffer.from(preview.split(',')[1],'base64'));console.log('GHOSTTY_UI_OK');app.exit(0);}catch(e){console.error(e);app.exit(1);}});`);
    let output='';child=spawn(electron,[runner],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0,output);assert.match(output,/GHOSTTY_UI_OK/);
  }finally{child?.kill('SIGKILL');await server.close();await rm(directory,{recursive:true,force:true});}
});
