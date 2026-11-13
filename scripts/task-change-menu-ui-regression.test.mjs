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
  const wait = async (check, message) => { for (let i = 0; i < 150; i++) { if (check()) return; await pause(); } throw Error(message); };
  const item = name => [...document.querySelectorAll('[role="menuitem"]')].find(node => node.closest('[role="menu"]')?.dataset.state === 'open' && (node.querySelector(':scope > span')?.textContent ?? node.textContent) === name);
  const button = name => [...document.querySelectorAll('button')].find(node => node.textContent === name);
  const open = async () => { document.querySelector('#change').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 90, clientY: 70 })); await wait(() => item('Open'), 'Menu did not open'); };
  const close = async () => { document.querySelector('[role="menu"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await pause(); };
  const sub = async (name, child) => { item(name).focus(); item(name).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(() => item(child), 'Submenu missing: ' + child); };
  await wait(() => document.querySelector('#change') && window.optionReads === 1, 'Fixture missing');
  await open();
  for (const label of ['Open in', 'New session here', 'New terminal here', 'Run command here', 'Copy branch name', 'Copy worktree path', 'Copy remote URL', 'Unlink', 'Delete worktree']) if (!item(label)) throw Error('Missing ' + label);
  if (item('Unlink').getAttribute('aria-disabled') !== 'true') throw Error('Last workspace must not unlink');
  item('Open').click(); await wait(() => window.opened === 1, 'Open did not show branch');
  await open(); await sub('Open in', 'Cursor'); item('Cursor').click(); await wait(() => window.opens.length === 1, 'Editor was not opened');
  if (window.opens[0].resourceId !== 'worktree' || window.opens[0].target.editorId !== 'cursor') throw Error('Wrong editor workspace');
  await open(); await sub('New session here', 'Claude Code'); item('Claude Code').click(); await wait(() => window.agents.length === 1, 'Agent not created');
  if (window.agents[0].join(',') !== 'claude,worktree') throw Error('Agent lost workspace');
  await open(); item('New terminal here').click(); await wait(() => window.terminals.length === 1, 'Terminal not created');
  if (window.terminals[0] !== 'worktree') throw Error('Terminal lost workspace');
  await open(); await sub('Run command here', 'install'); item('install').click(); await wait(() => window.commands.length === 1, 'Command not run');
  if (window.commands[0].join(',') !== 'worktree,install') throw Error('Command lost workspace');
  for (const name of ['Copy branch name', 'Copy worktree path', 'Copy remote URL']) { await open(); item(name).click(); await pause(); }
  if (JSON.stringify(window.copied) !== JSON.stringify(['feature/menu', '/fixture/worktree', 'git@github.com:team/repo.git'])) throw Error('Copied wrong data');
  if (window.optionReads !== 1) throw Error('Opening menus must reuse cached options');
  await open(); item('Delete worktree').click(); await wait(() => document.querySelector('[role="dialog"]') && button('Delete worktree') && !button('Delete worktree').disabled, 'Delete confirmation missing');
  if (window.deleted) throw Error('Deletion ran before confirmation');
  if (document.activeElement !== button('Cancel')) throw Error('Confirmation must focus cancel');
  button('Cancel').click(); await wait(() => !document.querySelector('[role="dialog"]'), 'Cancel did not close');
  await open(); item('Delete worktree').click(); await wait(() => button('Delete worktree') && !button('Delete worktree').disabled, 'Second confirmation missing');
  button('Delete worktree').click(); await wait(() => window.deleted === 1 && !document.querySelector('[role="dialog"]'), 'Confirmed deletion not completed');
  window.setFixture({ two: true, archived: false, owned: false }); await pause(); await open();
  if (item('Unlink').getAttribute('aria-disabled') === 'true' || item('Delete worktree')) throw Error('Existing directory must not show worktree deletion');
  await close(); window.setFixture({ two: true, archived: true, owned: true }); await pause(); await open();
  for (const name of ['New session here', 'New terminal here', 'Run command here', 'Unlink', 'Delete worktree']) if (item(name).getAttribute('aria-disabled') !== 'true') throw Error('Archive must disable ' + name);
  await close(); await window.setLocale('zh-CN'); document.querySelector('#change').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 90, clientY: 70 }));
  await wait(() => item('复制远程 URL'), 'Chinese menu missing');
}

test('CHANGES menus target the selected workspace, share options and confirm deletion', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'navo-changes-menu-'));
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const server = await createServer({ configFile: false, appType: 'custom', root: process.cwd(), cacheDir: path.join(directory, 'cache'), logLevel: 'error',
    plugins: [tailwindcss()], esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use('/__changes', async (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml('/__changes', `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {TaskChangeMenu} from '/src/components/tasks/workspace/TaskChangeMenu.tsx';
      import {useTaskStore} from '/src/stores/taskStore.ts';import {useResourceStore} from '/src/stores/resourceStore.ts';
      await i18n.changeLanguage('en');window.setLocale=locale=>i18n.changeLanguage(locale);
      window.opens=[];window.agents=[];window.terminals=[];window.commands=[];window.copied=[];window.optionReads=0;window.opened=0;window.deleted=0;
      const resource={resourceId:'worktree',repositoryId:'repo',name:'repo',mode:'worktree',workingPath:'/fixture/worktree',originalPath:'/fixture/repo',sourceBranch:'main',targetBranch:'feature/menu',ownership:{path:'/fixture/worktree'}};
      const task={id:'task',title:'Task',status:'TODO',resources:[resource],date:'now',updatedAt:'now',projectName:'repo'};
      useTaskStore.setState({loaded:true,tasks:[task]});useResourceStore.setState({loaded:true,records:[{id:'repo',name:'repo',commands:[{id:'install',name:'install',script:'echo fixture'}]}]});
      window.navo={settings:{save:async settings=>settings},tasks:{workspaceOpenOptions:async()=>{window.optionReads++;return {editors:[{id:'cursor',name:'Cursor'}],externalTerminal:true,remote:{provider:'GitHub',url:'https://github.com/team/repo'},remoteUrl:'git@github.com:team/repo.git'};},
        openWorkspace:async(taskId,resourceId,target)=>window.opens.push({taskId,resourceId,target}),
        inspectWorktreeDeletion:async()=>({token:'confirmed',blocked:false,item:{resourceId:'worktree',name:'repo',path:'/fixture/worktree',branch:'feature/menu',worktreeAction:'delete',branchAction:'keep',sharedTasks:[],uncommittedFiles:1,ignoredFiles:0,detached:false,unpushedCommits:null}}),
        deleteWorktree:async(taskId,resourceId,confirmation)=>{if(taskId!=='task'||resourceId!=='worktree'||confirmation.token!=='confirmed')throw Error('Wrong deletion');window.deleted++;return {...task,resources:[]};}}};
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied.push(text)},configurable:true});
      function Fixture(){const [state,setState]=React.useState({two:false,archived:false,owned:true});window.setFixture=setState;
        return React.createElement(TooltipProvider,null,React.createElement(TaskChangeMenu,{task:{...task,status:state.archived?'ARCHIVED':'TODO',resources:state.two?[resource,{...resource,resourceId:'other'}]:[resource]},resource:{...resource,mode:state.owned?'worktree':'current-branch',ownership:state.owned?resource.ownership:undefined},sessions:[],pending:false,agentChoices:[{id:'claude',ready:true}],onOpen:()=>window.opened++,onRunCommand:(...args)=>window.commands.push(args),onNewSession:(...args)=>window.agents.push(args),onNewTerminal:id=>window.terminals.push(id),onOpenError:()=>{throw Error('Open failed');}},React.createElement('button',{id:'change'},'feature/menu')));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, 'runner.cjs');
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, 'data'))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1000,height:850,webPreferences:{backgroundThrottling:false}});
      try {await win.loadURL(${JSON.stringify('http://127.0.0.1:' + server.httpServer.address().port + '/__changes')});await win.webContents.executeJavaScript(${JSON.stringify(`(${browserAssertions.toString()})()`)});console.log('CHANGES_MENU_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}
    });`);
    let output = '';
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, output); assert.match(output, /CHANGES_MENU_OK/);
  } finally { child?.kill('SIGKILL'); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
