import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import electron from "electron";
import { createServer } from "vite";

async function browserAssertions() {
  const pause = () => new Promise(resolve => setTimeout(resolve, 30));
  const wait = async (check, message) => { for (let i = 0; i < 200; i++) { if (check()) return; await pause(); } throw Error(message); };
  const card = () => document.querySelector('[data-slot="change-hover"]');
  const item = name => [...document.querySelectorAll('[role="menuitem"]')].find(node => node.closest('[role="menu"]')?.dataset.state === 'open' && (node.querySelector(':scope > span')?.textContent ?? node.textContent) === name);
  const hover = async () => {
    const trigger = document.querySelector('#change');
    trigger.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    await wait(() => card(), 'Hover card did not open');
  };
  const hide = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const trigger = document.querySelector('#change');
    trigger.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }));
    trigger.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
    await wait(() => !card(), 'Hover card did not close');
  };
  const show = async (status, locale = 'en') => {
    await window.setLocale(locale);
    window.setStatus(status);
    await hover();
    return card().textContent;
  };
  const defaultStatus = {
    branchName: 'feature', repoName: 'navo', workingPath: '/Users/kim/worktrees/navo-feature',
    isDetached: false, missingDirectory: false, failed: false, operation: null,
    sinceSource: { branch: 'main', commits: 2, files: 3, additions: 4, deletions: 1 },
    uncommitted: { files: 2, additions: 5, deletions: 2 }, untrackedCount: 1,
    upstream: { name: 'origin/feature', ahead: 1, behind: 2 },
    sourceBehind: { kind: 'behind', branch: 'main', count: 3 }, isMainWorktree: true,
  };
  await wait(() => document.querySelector('#change'), 'Fixture missing');
  if (document.querySelector('#change').getAttribute('title')) throw Error('Native path tooltip must be removed');
  const full = await show(defaultStatus);
  const order = ['feature', 'navo', 'navo-feature', '2 commits, 3 files since main', '+4', '−1', '2 uncommitted files', '+5', '−2', 'Plus 1 untracked file', '1 ahead · 2 behind (of origin/feature)', '3 commits behind main', "Repository's main worktree"];
  let cursor = 0;
  for (const snippet of order) {
    const index = full.indexOf(snippet, cursor);
    if (index < 0) throw Error('Missing or out of order: ' + snippet + ' in ' + full);
    cursor = index + snippet.length;
  }
  if (card().querySelector('button') || card().querySelector('a') || card().querySelector('[role="button"]')) throw Error('Hover card must be read-only');
  await hide();
  const omitted = await show({
    ...defaultStatus, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0,
    upstream: { name: 'origin/main', ahead: 0, behind: 0 }, sourceBehind: { kind: 'omitted' }, isMainWorktree: false,
  });
  if (omitted.includes('files since') || omitted.includes('uncommitted') || omitted.includes('untracked') || omitted.includes('behind main') || omitted.includes('main worktree')) throw Error('Empty rows must be omitted: ' + omitted);
  if (!omitted.includes('Up to date with origin/main')) throw Error('Up-to-date upstream missing');
  await hide();
  const unpublished = await show({ ...defaultStatus, upstream: null, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, sourceBehind: { kind: 'even', branch: 'main' }, isMainWorktree: false });
  if (!unpublished.includes('Not published yet') || !unpublished.includes('Up to date with main')) throw Error('Unpublished or even source missing: ' + unpublished);
  await hide();
  const detached = await show({ ...defaultStatus, branchName: 'abc1234', isDetached: true, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, sourceBehind: null, isMainWorktree: false });
  if (!detached.includes('Not on a branch · abc1234') || !detached.includes('abc1234')) throw Error('Detached state missing: ' + detached);
  await hide();
  const paused = await show({ ...defaultStatus, operation: { kind: 'rebase', conflicts: 0 }, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, sourceBehind: null, isMainWorktree: false });
  if (!paused.includes('Rebase paused') || paused.includes('conflicts')) throw Error('Paused rebase without conflicts should omit the count: ' + paused);
  await hide();
  const conflicts = await show({ ...defaultStatus, operation: { kind: 'merge', conflicts: 2 }, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, sourceBehind: null, isMainWorktree: false });
  if (!conflicts.includes('Merge paused: 2 conflicts')) throw Error('Conflict count missing: ' + conflicts);
  await hide();
  const oneConflict = await show({ ...defaultStatus, operation: { kind: 'merge', conflicts: 1 }, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, sourceBehind: null, isMainWorktree: false });
  if (!oneConflict.includes('Merge paused: 1 conflict') || oneConflict.includes('1 conflicts')) throw Error('Singular conflict count incorrect: ' + oneConflict);
  await hide();
  const singularSource = await show({ ...defaultStatus, sinceSource: { branch: 'main', commits: 1, files: 1, additions: 1, deletions: 0 }, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, sourceBehind: { kind: 'behind', branch: 'main', count: 1 }, isMainWorktree: false });
  if (!singularSource.includes('1 commit, 1 file since main') || singularSource.includes('1 commits') || singularSource.includes('1 files')) throw Error('Singular since-source copy incorrect: ' + singularSource);
  if (!singularSource.includes('1 commit behind main') || singularSource.includes('1 commits behind')) throw Error('Singular behind-source copy incorrect: ' + singularSource);
  await hide();
  const mixedSource = await show({ ...defaultStatus, sinceSource: { branch: 'main', commits: 1, files: 2, additions: 1, deletions: 0 }, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, sourceBehind: null, isMainWorktree: false });
  if (!mixedSource.includes('1 commit, 2 files since main') || mixedSource.includes('1 commits')) throw Error('Mixed since-source copy incorrect: ' + mixedSource);
  await hide();
  const missing = await show({ ...defaultStatus, missingDirectory: true, failed: false });
  if (!missing.includes('Directory is gone') || missing.includes('uncommitted') || missing.includes('ahead')) throw Error('Missing directory must hide later rows: ' + missing);
  await hide();
  const uncounted = await show({ ...defaultStatus, uncommitted: 'uncounted', untrackedCount: 0, sinceSource: null, upstream: null, sourceBehind: null, isMainWorktree: false });
  if (!uncounted.includes('Uncommitted files not counted') || uncounted.includes('Plus')) throw Error('Uncounted row incorrect: ' + uncounted);
  await hide();
  const trigger = document.querySelector('#change');
  trigger.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }));
  trigger.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
  document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
  await wait(() => !card(), 'Hover card still open before loading');
  window.currentStatus = { ...defaultStatus, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, sourceBehind: null, isMainWorktree: false };
  window.inspectError = false;
  window.clearChangeGitStatusCache();
  window.holdInspect = true;
  await hover();
  await wait(() => card()?.textContent.includes('Reading Git status'), 'Loading state missing');
  window.releaseInspect();
  await wait(() => card()?.textContent.includes('Not published yet'), 'Loaded status missing');
  await hide();
  await show(defaultStatus);
  await hide();
  window.currentStatus = { ...defaultStatus, failed: true };
  window.expireChangeGitStatusCache();
  await hover();
  const kept = card().textContent;
  if (!kept.includes('2 uncommitted files') || kept.includes('Unable to read Git status')) throw Error('Failed inspect must keep the last card: ' + kept);
  await hide();
  window.currentStatus = { ...defaultStatus, missingDirectory: true, failed: false };
  window.expireChangeGitStatusCache();
  await hover();
  const updatedMissing = card().textContent;
  if (!updatedMissing.includes('Directory is gone') || updatedMissing.includes('uncommitted')) throw Error('Missing directory must replace the last card: ' + updatedMissing);
  await hide();
  const failedOnly = await show({ ...defaultStatus, failed: true });
  if (!failedOnly.includes('Unable to read Git status') || failedOnly.includes('uncommitted') || failedOnly.includes('ahead')) throw Error('Failed inspect with no prior result must show the error row: ' + failedOnly);
  await hide();
  const chinese = await show({ ...defaultStatus, operation: { kind: 'rebase', conflicts: 2 }, uncommitted: 'uncounted' }, 'zh-CN');
  if (!chinese.includes('变基已暂停：2 个冲突') || !chinese.includes('未提交文件未统计') || !chinese.includes('仓库主工作区')) throw Error('Chinese copy missing: ' + chinese);
  await hide();
  window.reviews = 0;
  document.querySelector('#change').click();
  if (window.reviews !== 1) throw Error('Click must still open the branch pane');
  document.querySelector('#change').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 90, clientY: 70 }));
  await wait(() => item('Open') || item('打开'), 'Context menu must still open from the row');
}

test('CHANGES Git status hover card is read-only and keeps row actions', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'navo-change-hover-ui-'));
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const server = await createServer({ configFile: false, appType: 'custom', root: process.cwd(), cacheDir: path.join(directory, 'cache'), logLevel: 'error',
    plugins: [tailwindcss()], esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use('/__change-hover', async (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml('/__change-hover', `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {TaskChangeMenu} from '/src/components/tasks/workspace/TaskChangeMenu.tsx';
      import {ChangeHoverDetails} from '/src/components/tasks/workspace/ChangeHoverDetails.tsx';
      import {clearChangeGitStatusCache,expireChangeGitStatusCache} from '/src/services/changeGitStatusCache.ts';
      import {useTaskStore} from '/src/stores/taskStore.ts';import {useResourceStore} from '/src/stores/resourceStore.ts';
      await i18n.changeLanguage('en');window.setLocale=locale=>i18n.changeLanguage(locale);
      const resource={resourceId:'worktree',repositoryId:'repo',name:'navo',mode:'worktree',workingPath:'/Users/kim/worktrees/navo-feature',originalPath:'/fixture/repo',sourceBranch:'main',targetBranch:'feature',ownership:{path:'/Users/kim/worktrees/navo-feature'}};
      const task={id:'task',title:'Task',status:'TODO',resources:[resource],date:'now',updatedAt:'now',projectName:'navo'};
      useTaskStore.setState({loaded:true,tasks:[task]});useResourceStore.setState({loaded:true,records:[{id:'repo',name:'navo',commands:[]}]});
      window.currentStatus=null;window.holdInspect=false;window.inspectError=false;window.reviews=0;
      window.clearChangeGitStatusCache=clearChangeGitStatusCache;window.expireChangeGitStatusCache=expireChangeGitStatusCache;
      window.setStatus=status=>{window.currentStatus=status;window.holdInspect=false;window.inspectError=false;clearChangeGitStatusCache();};
      window.navo={settings:{save:async settings=>settings},tasks:{
        workspaceOpenOptions:async()=>({editors:[],externalTerminal:false,remote:null,remoteUrl:''}),
        inspectChangeGitStatus:async(taskId,resourceId)=>{
          if(taskId!=='task'||resourceId!=='worktree')throw Error('Must use task and resource ids');
          if(window.holdInspect)await new Promise(resolve=>window.releaseInspect=resolve);
          if(window.inspectError)throw Error('failed');
          return structuredClone(window.currentStatus);
        }
      }};
      function Fixture(){
        return React.createElement(TooltipProvider,{delayDuration:0},React.createElement(TaskChangeMenu,{task,resource,sessions:[],pending:false,agentChoices:[],onOpen:()=>window.reviews++,onRunCommand:()=>{},onOpenError:()=>{}},
          React.createElement('div',{className:'task-context-change','data-resource-id':'worktree'},
            React.createElement(ChangeHoverDetails,{taskId:'task',resource},
              React.createElement('button',{id:'change',className:'task-context-row',onClick:()=>window.reviews++},'feature')))));
      }
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, 'runner.cjs');
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, 'data'))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1000,height:850,webPreferences:{backgroundThrottling:false}});
      try {await win.loadURL(${JSON.stringify('http://127.0.0.1:' + server.httpServer.address().port + '/__change-hover')});await win.webContents.executeJavaScript(${JSON.stringify(`(${browserAssertions.toString()})()`)});console.log('CHANGE_HOVER_UI_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}
    });`);
    let output = '';
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, output); assert.match(output, /CHANGE_HOVER_UI_OK/);
  } finally { child?.kill('SIGKILL'); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
