import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import electron from "electron";
import { createServer } from "vite";

async function browserAssertions() {
  const pause = () => new Promise(resolve => setTimeout(resolve, 35));
  const wait = async (check, message) => { for (let i = 0; i < 150; i++) { if (check()) return; await pause(); } throw Error(message); };
  const item = name => [...document.querySelectorAll('[role="menuitem"]')].find(node => node.closest('[role="menu"]')?.dataset.state === 'open' && (node.querySelector(':scope > span')?.textContent ?? node.textContent) === name);
  const dialog = () => document.querySelector('[data-slot="dialog-content"]');
  const button = name => [...dialog().querySelectorAll('button')].find(node => node.textContent === name);
  const open = async () => { document.querySelector('#source').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 90, clientY: 70 })); await wait(() => item('Open'), 'Menu missing'); };
  const close = async () => { item('Open').closest('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(() => !item('Open'), 'Menu did not close'); };
  const assertSheet = () => { if (!document.querySelector('[data-slot="sheet-content"]')) throw Error('Upper layer closed the context panel'); };
  await wait(() => document.querySelector('#source'), 'Fixture missing'); await open();
  if (window.selected !== 'other') throw Error('Right click selected a different session');
  const labels = [...item('Open').closest('[role="menu"]').querySelectorAll('[role="menuitem"]')].map(node => node.textContent);
  if (labels.join('|') !== 'Open|Rename session|New session from this one|Archive session|Delete session') throw Error('Wrong session menu order');
  for (const [label, icon] of [['Rename session', 'pencil'], ['Archive session', 'archive'], ['Delete session', 'trash-2']]) if (!item(label).querySelector('.lucide-' + icon)) throw Error('Missing icon for ' + label);
  if (item('Delete session').dataset.variant !== 'destructive' || getComputedStyle(item('Open')).fontSize !== '12px') throw Error('Menu style mismatch');
  item('Open').click(); await wait(() => window.selected === 'source', 'Open did not select source');
  await open(); item('Open').click(); await wait(() => window.opened === 2, 'Repeated Open must still open');
  window.selected = 'other'; await open(); item('Rename session').click(); await wait(() => dialog(), 'Rename dialog missing');
  if (dialog().querySelector('input').value !== 'Source session' || window.selected !== 'other') throw Error('Rename changed selection or targeted active session');
  dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(() => !dialog(), 'Rename did not cancel'); assertSheet();
  await open(); item('Rename session').click(); await wait(() => dialog(), 'Rename reopen missing');
  const field = dialog().querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'Renamed source'); field.dispatchEvent(new Event('input', { bubbles: true })); await pause();
  button('Confirm').click(); await wait(() => window.renames.length === 1 && !dialog(), 'Rename did not save');
  if (window.renames[0].join('|') !== 'source|Renamed source' || window.selected !== 'other') throw Error('Wrong rename target');
  await open(); item('New session from this one').focus(); item('New session from this one').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait(() => item('Grok Build'), 'Agent submenu missing');
  if (item('Codex').getAttribute('aria-disabled') !== 'true') throw Error('Unavailable capability must disable creation');
  item('Grok Build').click(); await wait(() => window.created.length === 1, 'New session action missing');
  if (window.created[0].join('|') !== 'grok|source') throw Error('Creation must pass source identity, not selected session');
  assertSheet(); window.setCanCreate(false); await pause(); await open();
  if (item('New session from this one').getAttribute('aria-disabled') !== 'true') throw Error('Invalid directory/archived task must disable creation');
  await close(); assertSheet(); window.setCanCreate(true); window.setAgent('codex'); await pause(); await open();
  for (const name of ['Rename session', 'Delete session']) if (item(name).getAttribute('aria-disabled') !== 'true') throw Error('Unsupported native action enabled');
  await close(); window.setAgent('claude'); await pause(); await open();
  item('Archive session').click(); await wait(() => window.archived.length === 1, 'Archive missing');
  if (window.archived[0] !== 'source' || window.selected !== 'other') throw Error('Archive must target clicked row without selection');
  await open(); item('Delete session').click(); await wait(() => dialog(), 'Delete dialog missing');
  if (document.activeElement !== button('Cancel') || window.removed.length) throw Error('Deletion must await confirmation and focus cancel');
  button('Cancel').click(); await wait(() => !dialog(), 'Delete did not cancel'); assertSheet();
  await open(); item('Delete session').click(); await wait(() => dialog(), 'Delete reopen missing');
  window.failDelete = true; button('Delete').click(); await wait(() => dialog()?.querySelector('[role="alert"]'), 'Delete failure missing');
  if (!document.querySelector('#source') || window.selected !== 'other') throw Error('Failure removed or selected session');
  window.failDelete = false; button('Delete').click(); await wait(() => !dialog() && window.removed.length === 1, 'Delete retry failed');
  if (window.removed[0] !== 'source') throw Error('Wrong delete target'); assertSheet();
  await window.setLocale('zh-CN'); document.querySelector('#source').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 90, clientY: 70 }));
  await wait(() => item('从此会话新建') && item('归档会话') && item('重命名会话'), 'Chinese labels missing');
  item('从此会话新建').closest('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await pause();
  await window.setLocale('en'); window.showArchived(true);
  await wait(() => document.querySelector('button[aria-expanded="false"]'), 'Archived group missing');
  document.querySelector('button[aria-expanded="false"]').click();
  const archivedRow = () => document.querySelector('.task-context-row');
  const openArchived = async () => { archivedRow().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 100, clientY: 100 })); await wait(() => item('Restore'), 'Archived context menu missing'); };
  await wait(archivedRow, 'Archived row missing'); await openArchived();
  const archivedLabels = [...item('Restore').closest('[role="menu"]').querySelectorAll('[role="menuitem"]')].map(node => node.textContent);
  if (archivedLabels.join('|') !== 'Restore|New session from this one|Delete session') throw Error('Archived session must expose exactly three actions');
  if (window.restores.length) throw Error('Right click restored the session');
  item('New session from this one').focus(); item('New session from this one').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait(() => item('Claude Code'), 'Archived Agent submenu missing'); item('Claude Code').click();
  await wait(() => window.created.length === 2, 'Archived source did not create');
  if (window.created[1].join('|') !== 'claude|archived' || window.restores.length || !archivedRow()) throw Error('New session must keep its source archived');
  await openArchived(); item('Restore').click();
  await wait(() => window.restores.length === 1 && window.restoredSelection === 'archived' && !archivedRow(), 'Restore must use archived row action');
  if (window.restores[0] !== 'archived') throw Error('Wrong restored session');
  window.rearchive(); await wait(archivedRow, 'Archived row did not return'); window.setTaskArchived(true); await pause(); await openArchived();
  for (const name of ['Restore', 'New session from this one']) if (item(name).getAttribute('aria-disabled') !== 'true') throw Error('Archived task must disable ' + name);
  item('Restore').closest('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await pause(); assertSheet();
  window.setTaskArchived(false); await pause(); await openArchived(); item('Delete session').click(); await wait(dialog, 'Archived delete confirmation missing');
  button('Cancel').click(); await wait(() => !dialog(), 'Archived deletion did not cancel'); if (!archivedRow()) throw Error('Cancel removed archive');
  await openArchived(); item('Delete session').click(); await wait(dialog, 'Archived delete retry missing'); button('Delete').click();
  await wait(() => !dialog() && !archivedRow(), 'Archived delete did not finish');
  if (window.removed.at(-1) !== 'archived' || window.restores.length !== 1) throw Error('Delete must not restore the archived source'); assertSheet();
}

test('Session row menu targets source, lists Agents, and keeps confirmation layers independent', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'navo-session-menu-'));
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const server = await createServer({ configFile: false, appType: 'custom', root: process.cwd(), cacheDir: path.join(directory, 'cache'), logLevel: 'error', plugins: [tailwindcss()], esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 0 } });
  server.middlewares.use('/__session_menu', async (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml('/__session_menu', `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TaskSessionMenu} from '/src/components/tasks/workspace/TaskSessionMenu.tsx';
      import {TaskPanelSheet} from '/src/components/tasks/workspace/TaskPanelSheet.tsx';import {useTaskSessionStore} from '/src/stores/taskSessionStore.ts';
      import {ArchivedSessions} from '/src/components/tasks/workspace/ArchivedSessions.tsx';
      await i18n.changeLanguage('en');window.setLocale=locale=>i18n.changeLanguage(locale);
      window.selected='other';window.opened=0;window.created=[];window.renames=[];window.archived=[];window.removed=[];window.restores=[];
      let record={id:'source',taskId:'task',kind:'agent',title:'Source session',agent:{agentId:'claude'},status:'stopped',cwd:'/fixture',workspace:{kind:'all'},nativeSessionId:'native-source',terminalId:'terminal-source'};
      let archivedRecord={...record,id:'archived',title:'Archived source',archivedAt:'2026-11-01T00:00:00Z',terminalId:'terminal-archived'};
      const records=()=>[record,archivedRecord].filter(Boolean);useTaskSessionStore.setState({loaded:true,sessions:records()});
      window.rearchive=()=>{archivedRecord={...archivedRecord,archivedAt:'2026-11-01T00:00:00Z'};useTaskSessionStore.setState({sessions:records()});};
      window.navo={taskSessions:{rename:async(id,title)=>{window.renames.push([id,title]);record={...record,title};return records();},remove:async id=>{if(window.failDelete)throw Error('SESSION_NATIVE_DELETE_FAILED');window.removed.push(id);if(id==='archived')archivedRecord=null;return records();},restore:async id=>{window.restores.push(id);archivedRecord={...archivedRecord,archivedAt:undefined};return records();}}};
      function Fixture(){const [open,setOpen]=React.useState(true),[container,setContainer]=React.useState(null),[canCreate,setCanCreate]=React.useState(true),[agent,setAgent]=React.useState('claude');window.setCanCreate=setCanCreate;window.setAgent=setAgent;
        const [archivedMode,setArchivedMode]=React.useState(false),[taskArchived,setTaskArchived]=React.useState(false);window.showArchived=setArchivedMode;window.setTaskArchived=setTaskArchived;
        const trigger=React.useRef(null);const sessions=useTaskSessionStore(state=>state.sessions);const session=sessions[0];const pending=useTaskSessionStore(state=>state.pending);
        return React.createElement('div',{ref:setContainer,style:{position:'relative',width:900,height:700}},React.createElement('button',{ref:trigger},'Context'),React.createElement(TaskPanelSheet,{side:'left',open,onOpenChange:setOpen,width:300,container,triggerRef:trigger,title:'Context',closeLabel:'Close context'},
          archivedMode?React.createElement(ArchivedSessions,{sessions:sessions.filter(item=>item.archivedAt),task:{id:'task',status:taskArchived?'ARCHIVED':'TODO',resources:[]},agentChoices:[{id:'claude',ready:true}],onRestored:item=>window.restoredSelection=item.id,onNewSessionFrom:(...args)=>window.created.push(args)}):
          React.createElement(TaskSessionMenu,{session:{...session,agent:{agentId:agent}},canCreate,pending,agentChoices:[{id:'claude',ready:true},{id:'grok',ready:true},{id:'codex',ready:false}],onOpen:()=>{window.selected='source';window.opened++;},onArchive:()=>window.archived.push(session.id),onNewSession:(...args)=>window.created.push(args)},React.createElement('button',{id:'source'},session.title))));}
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen(); const runner = path.join(directory, 'runner.cjs');
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, 'data'))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:1000,height:850,webPreferences:{backgroundThrottling:false}});
      try {await win.loadURL(${JSON.stringify('http://127.0.0.1:' + server.httpServer.address().port + '/__session_menu')});await win.webContents.executeJavaScript(${JSON.stringify(`(${browserAssertions.toString()})()`)});console.log('SESSION_MENU_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}
    });`);
    let output = ''; child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, output); assert.match(output, /SESSION_MENU_OK/);
  } finally { child?.kill('SIGKILL'); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
