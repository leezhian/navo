import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import electron from 'electron';
import { build, createServer } from 'vite';

test('real package: isolated iframe, utility process, virtualization, search, live tail and uninstall',{timeout:60000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'navo-trace-electron-'));
 const {default:tailwindcss}=await import('@tailwindcss/vite');
 const server=await createServer({configFile:false,root:process.cwd(),appType:'custom',logLevel:'error',cacheDir:path.join(directory,'vite-cache'),plugins:[tailwindcss()],esbuild:{jsx:'automatic'},resolve:{alias:{'@':path.resolve('src')}},server:{host:'127.0.0.1',port:0}});
 server.middlewares.use('/__trace',async(_request,response)=>{
  response.setHeader('Content-Type','text/html');response.end(await server.transformIndexHtml('/__trace',`<div id="root"></div><script type="module">
   import React from 'react';import{createRoot}from'react-dom/client';import'/src/App.css';import i18n from'/src/i18n/index.ts';await i18n.changeLanguage('zh-CN');window.setFixtureLanguage=language=>i18n.changeLanguage(language);
   import{SessionTracePane}from'/src/components/tasks/workspace/SessionTracePane.tsx';import{LabsSettingsPage}from'/src/components/settings/LabsSettingsPage.tsx';import{useExtensions}from'/src/hooks/useExtensions.ts';
   function Fixture(){const {status}=useExtensions();const[labs,setLabs]=React.useState(true);window.showLabs=setLabs;return React.createElement('div',{style:{height:'800px',display:'flex',flexDirection:'column',padding:16}},labs?React.createElement(LabsSettingsPage):status?.enabled?React.createElement(SessionTracePane,{session:{id:'trace-session',nativeSessionId:'12345678-1234-1234-1234-123456789abc'},visible:true}):React.createElement('p',null,'Trace disabled'));}
   createRoot(document.querySelector('#root')).render(React.createElement(Fixture));
  </script>`));
 });
 let child;
 try {
  await build({configFile:false,logLevel:'error',build:{outDir:directory,emptyOutDir:false,target:'node22',minify:false,lib:{entry:path.resolve('scripts/fixtures/sessionTraceElectron.ts'),formats:['cjs'],fileName:()=> 'main.cjs'},rollupOptions:{external:id=>id==='electron'||id.startsWith('node:')}}});
  await build({configFile:false,logLevel:'error',build:{outDir:directory,emptyOutDir:false,target:'node22',minify:false,lib:{entry:path.resolve('src/preload.ts'),formats:['cjs'],fileName:()=> 'preload.cjs'},rollupOptions:{external:['electron']}}});
  await server.listen();
  let output='';child=spawn(electron,[path.join(directory,'main.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'',NAVO_TRACE_TEST_DIRECTORY:directory,NAVO_TRACE_TEST_URL:'http://127.0.0.1:'+server.httpServer.address().port+'/__trace',NAVO_TRACE_TEST_PACKAGE:path.resolve('extension-dist/session-trace-0.1.0.navo-extension')},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,output);assert.match(output,/TRACE_UI_OK/);
  if(process.env.NAVO_TRACE_PREVIEW_PATH)await copyFile(path.join(directory,'trace.png'),process.env.NAVO_TRACE_PREVIEW_PATH);
 }finally{child?.kill('SIGKILL');await server.close();await rm(directory,{recursive:true,force:true});}
});
