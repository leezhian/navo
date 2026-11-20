import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import electron from 'electron';
import { createServer } from 'vite';

async function checks() {
  const wait = async (fn, message) => { for (let i = 0; i < 120; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error(message); };
  await wait(() => document.querySelector('#session'), 'Session trigger missing');
  document.querySelector('#session').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
  await wait(() => document.querySelector('[role="tooltip"]'), 'Session tooltip missing');
  const text = () => document.querySelector('[role="tooltip"]')?.textContent ?? '';
  if (text().includes('上下文占用')) throw Error('Missing capacity must hide the whole context usage row');
  window.setUsage({ inputTokens: 50000, outputTokens: 1000, cachedTokens: 40000, contextTokens: 51000, contextWindow: 200000 });
  await wait(() => text().includes('26%'), 'A valid occupancy must show its percentage');
  window.setUsage({ contextTokens: 24000, contextWindow: 200000 }, 'antigravity');
  await wait(() => text().includes('12%'), 'Antigravity callback usage must be displayed');
  window.setUsage(undefined, 'antigravity');
  await wait(() => !text().includes('上下文占用'), 'Unsupported agent must hide the context usage row');
  window.setUsage(undefined, 'codex');
  await wait(() => text().includes('Codex'), 'Agent update missing');
  if (text().includes('上下文占用')) throw Error('Missing usage must hide the context usage row');
  window.setUsage({ contextTokens: 0, contextWindow: 200000 });
  await wait(() => text().includes('上下文占用 0%'), 'A confirmed zero occupancy must remain visible');
  window.setUsage({ contextTokens: 300000, contextWindow: 200000 });
  await wait(() => !text().includes('上下文占用'), 'Invalid usage must hide the context usage row');
  window.showSource();
  await wait(() => document.querySelector('#session').dataset.state === 'closed', 'Source hover trigger did not mount');
  document.querySelector('#session').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  const source = () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Previous session');
  await wait(source, 'Source navigation is missing');
  if (!document.body.textContent.includes('提示词缓存') || !document.body.textContent.includes('Run checks')) throw Error('Verified cache and background work missing');
  source().click();await wait(() => window.openedSource === true, 'Source hover link did not navigate');
}

test('会话悬停仅在上下文占用可靠时显示整行，保留真实零值', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'navo-context-usage-'));
  const server = await createServer({ configFile: false, appType: 'custom', root: process.cwd(), cacheDir: path.join(dir, 'cache'), logLevel: 'error', esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use('/__usage', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml('/__usage', `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';
      import i18n from '/src/i18n/index.ts';import {SessionHoverDetails} from '/src/components/tasks/workspace/SessionHoverDetails.tsx';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      await i18n.changeLanguage('zh-CN');
      function Fixture(){const [usage,setUsage]=React.useState({inputTokens:40577,outputTokens:414,cachedTokens:21120}),[agentId,setAgent]=React.useState('grok'),[withSource,setWithSource]=React.useState(false);window.setUsage=(next,agent)=>{setUsage(next);if(agent)setAgent(agent);};window.showSource=()=>setWithSource(true);const sourceProps=withSource?{source:{id:'earlier',title:'Previous session',archivedAt:'2026-11-01'},onOpenSource:()=>window.openedSource=true}:{};const observed=withSource?{status:'running',promptCache:{expiresAt:Date.now()+60_000},backgroundWork:[{id:'job',title:'Run checks'}]}:{status:'stopped'};return React.createElement(TooltipProvider,{delayDuration:0},React.createElement(SessionHoverDetails,{session:{id:'fixture',kind:'agent',title:'Fixture',cwd:'/fixture',agent:{agentId,modelId:'model',modelName:'Model',modeId:'default',modeName:'Default',effort:null},usage,...observed},resources:[],...sourceProps},React.createElement('button',{id:'session'},'Session')));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(dir, 'runner.cjs');
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(dir,'data'))});app.whenReady().then(async()=>{app.dock?.hide();const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});try{await win.loadURL(${JSON.stringify('http://127.0.0.1:'+server.httpServer.address().port+'/__usage')});await win.webContents.executeJavaScript(${JSON.stringify(`(${checks.toString()})()`)});console.log('CONTEXT_USAGE_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}});`);
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }, stdio: ['ignore','pipe','pipe'] });
    let output = '';child.stdout.on('data', d => output += d);child.stderr.on('data', d => output += d);
    const code = await new Promise((resolve,reject) => { child.on('exit',resolve);child.on('error',reject); });
    assert.equal(code, 0, output);
  } finally { if (child?.exitCode === null) child.kill();await server.close();await rm(dir,{recursive:true,force:true}); }
});
