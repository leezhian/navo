import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";
import { createLoader } from "./helpers/load-typescript.mjs";
import { grokInitialize, grokHelp, antigravityModels, antigravityHelp } from "./fixtures/agentCapabilities.mjs";

const load = createLoader();
const discoveredCapabilities = {
  grok: load("src/main-process/services/agents/grokCapabilities.ts").parseGrokCapabilities(grokInitialize, grokHelp),
  antigravity: load("src/main-process/services/agents/antigravityCapabilities.ts").parseAntigravityCapabilities(antigravityModels, antigravityHelp),
};

test("任务创建界面完整流程与卡片菜单", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-task-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({
    configFile: false,
    appType: "custom",
    root: process.cwd(),
    cacheDir: path.join(directory, "vite-cache"),
    logLevel: "error",
    plugins: [tailwindcss()],
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__task_create_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__task_create_test", `<style>*, *::before, *::after { animation: none !important; transition: none !important; }</style><div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/i18n/index.ts';
      import '/src/App.css';

      import { ApplicationShell } from '/src/components/layout/ApplicationShell.tsx';
      import { TaskBoard } from '/src/components/tasks/TaskBoard.tsx';
      import { TaskCreateDialog } from '/src/components/tasks/create/TaskCreateDialog.tsx';
      import { TooltipProvider } from '/src/components/ui/tooltip.tsx';
      import { defaultSettings } from '/src/domain/settings.ts';
      import { useTaskStore } from '/src/stores/taskStore.ts';
      import { useIssueStore } from '/src/stores/issueStore.ts';
      import { taskIssueFixtures } from '/scripts/fixtures/taskIssues.ts';
      useIssueStore.setState({ items: taskIssueFixtures });
      import i18n from '/src/i18n/index.ts';
      await i18n.changeLanguage('zh-CN');
      window.setTestLanguage = language => i18n.changeLanguage(language);
      let persisted = [];
      window.linkExistingIssue = () => {
        const issue = useIssueStore.getState().items.find(item => item.group === 'ISSUE');
        window.linkedIssue = issue;
        useTaskStore.setState({ tasks: [{ id: 'linked-test-task', title: 'Existing task', date: '2026-10-04', projectName: 'navo', status: 'ARCHIVED', links: [issue] }] });
      };
      window.clearExistingIssueTask = () => useTaskStore.setState({ tasks: persisted });
      let records = [
        { id: 'repo-a', name: 'repo-a', kind: 'repo', localPath: '/fixtures/repo-a', available: true },
        { id: 'repo-b', name: 'repo-b', kind: 'repo', localPath: '/fixtures/repo-b', available: true },
        { id: 'folder-b', name: 'folder-b', kind: 'folder', localPath: '/fixtures/folder-b', available: true },
      ];
      window.createdInputs = [];
      const discoveredCapabilities = ${JSON.stringify(discoveredCapabilities)};
      const cachedCapabilities = Object.fromEntries(['claude','codex','grok','antigravity'].map(id => [id, discoveredCapabilities[id] || {
        agentId:id,defaultModelId:'runtime-model',defaultModeId:'default',models:[
          {id:'runtime-model',name:id==='claude'?'Claude runtime model':'Codex runtime model',efforts:['low','high'],defaultEffort:'low'},
          {id:'runtime-fast',name:'Runtime fast model',efforts:[],defaultEffort:null}
        ],modes:[{id:'default',name:'Default'},{id:'plan',name:'Plan'}]
      }]));
      window.agentCacheReads = 0;
      const agentCacheListeners = new Set();
      window.publishAgentCache = () => agentCacheListeners.forEach(listener => listener());
      const info = (id) => {
        const record = records.find(record => record.id === id);
        const branch = id === 'repo-b' ? 'develop' : 'main';
        return { resourceId: id, name: record.name, path: record.localPath, git: id.startsWith('repo-') ? {
          root: record.localPath, currentBranch: branch, defaultSource: 'refs/remotes/origin/' + branch, worktrees: [{path:record.localPath,branch,isMain:true}],
          branches: [{ ref: 'refs/remotes/origin/' + branch, name: 'origin/' + branch, kind: 'remote' }, { ref: 'refs/heads/' + branch, name: branch, kind: 'local' }],
        } : null };
      };
      window.navo = {
        agents: {
          load: async () => ({defaultAgent:'claude',configurations:['claude','codex','grok','antigravity'].map(id=>({id,enabled:true}))}),
          scan: async () => { throw new Error('Opening or switching must not scan CLI'); },
          capabilities: async () => { throw new Error('Opening or switching must not query CLI capabilities'); },
          capabilitySnapshot: async () => { window.agentCacheReads += 1; if(window.failAgentSnapshot)throw new Error('AGENT_RUNTIME_OUTDATED'); return {
            settings: await window.navo.agents.load(),
            installations:['claude','codex','grok','antigravity'].map(id=>({id,status:id==='grok'?'error':'installed',auth:['grok','antigravity'].includes(id)?'unknown':'signedIn'})),
            entries:Object.fromEntries(Object.entries(cachedCapabilities).map(([id,capabilities])=>[id,{capabilities:structuredClone(capabilities),pending:false,error:window.failAgent===id?'AGENT_CAPABILITIES_FAILED':null}]))
          }; },
          onCapabilitiesChanged: listener => {agentCacheListeners.add(listener); return () => agentCacheListeners.delete(listener);},
          setDefault: async () => { throw new Error('Task selection must not change global default'); }
        },
        window: { getIsFullScreen: async () => false, onFullScreenChange: () => () => {} },
        settings: { chooseDirectory: async () => '/fixtures/extra' },
        resources: {
          list: async () => records,
          save: async (value) => { const record = { ...value, id: 'extra', available: true }; records.push(record); return record; },
          onCloneProgress: () => () => {},
        },
        tasks: {
          load: async () => ({ tasks: persisted, recoveryWarnings: [] }),
          inspectResource: async (id) => {
            if (window.failResourceInspect) throw new Error('TASK_RESOURCE_CHANGED');
            if (window.delayResourceInspect) await new Promise(resolve => { window.resolveResourceInspect = resolve; });
            return info(id);
          },
          chooseFiles: async () => [{ id: 'file-1', name: 'notes.txt', size: 12 }, { id: 'file-2', name: 'reference.png', size: 24, preview: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }],
          releaseFiles: async () => {},
          previewAttachment: async () => null,
          create: async (input) => {
            window.createdInputs.push(input);
            const resources = input.resources.map(resource => ({ ...resource, name: info(resource.resourceId).name, originalPath: info(resource.resourceId).path, workingPath: info(resource.resourceId).path }));
            const task = { id: input.requestId, agent:input.agent, title: input.description.trim().split(String.fromCharCode(10))[0], description: input.description, date: new Date().toISOString(), projectName: resources[0]?.name ?? '', status: 'TODO', resources, links: input.links, webLinks: input.webLinks, attachments: input.attachmentIds.map(id => ({ id, name: 'notes.txt', size: 12 })) };
            persisted = [task, ...persisted]; return task;
          },
          rename: async (id,title) => persisted = persisted.map(task => task.id === id ? { ...task,title } : task),
          move: async (id,status) => persisted = persisted.map(task => task.id === id ? { ...task,status,archivedFrom: task.status } : task),
          restore: async (id) => persisted = persisted.map(task => task.id === id ? { ...task,status: task.archivedFrom || 'TODO' } : task),
          inspectDeletion: async () => ({ token: 'fixture-confirmation', canDeleteWorktrees: false, blocked: false, items: [] }),
          remove: async (id) => persisted = persisted.filter(task => task.id !== id),
        }
      };
      const root = createRoot(document.getElementById('root'));
      function Fixture() {
        const [open,setOpen] = React.useState(false);
        return React.createElement(TooltipProvider, null,
          React.createElement(ApplicationShell, { section:'tasks', canGoBack:false, canGoForward:false, onGoBack:()=>{}, onGoForward:()=>{}, onSelectSection:()=>{}, onCreateTask:()=>setOpen(true) }, React.createElement(TaskBoard)),
          React.createElement(TaskCreateDialog, { open, settings:{...defaultSettings,locale:'zh-CN'}, onOpenChange:setOpen, onCreated:task=>useTaskStore.getState().requestOpen(task.id) })
        );
      }
      root.render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const address = server.httpServer.address();
    const preload = path.join(directory, "test-preload.cjs");
    await writeFile(preload, `
      const { contextBridge, ipcRenderer } = require('electron');
      contextBridge.exposeInMainWorld('testInput', { click: (point) => ipcRenderer.invoke('test:click', point), drag: (from, to) => ipcRenderer.invoke('test:drag', from, to), escape: () => ipcRenderer.invoke('test:escape'), hover: point => ipcRenderer.invoke('test:hover', point), captureResourcePicker: () => ipcRenderer.invoke('test:capture-resource-picker') });
    `);
    const runner = path.join(directory, "task-create.cjs");
    await writeFile(runner, `
      const { app, BrowserWindow, ipcMain } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async () => {
        app.dock?.hide();
        const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, preload: ${JSON.stringify(preload)} } });
        ipcMain.handle('test:drag', async (_event, from, to) => {
          window.webContents.sendInputEvent({ type: 'mouseMove', ...from });
          window.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
          for (let step = 1; step <= 10; step += 1) {
            await new Promise(resolve => setTimeout(resolve, 16));
            window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * step / 10), y: Math.round(from.y + (to.y - from.y) * step / 10), button: 'left', modifiers: ['leftButtonDown'] });
          }
          window.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 });
        });
        ipcMain.handle('test:escape', () => {
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
          window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
        });
        ipcMain.handle('test:capture-resource-picker', async () => {
          if (process.env.NAVO_RESOURCE_PICKER_SCREENSHOT) await require('node:fs/promises').writeFile(process.env.NAVO_RESOURCE_PICKER_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
        });
        ipcMain.handle('test:hover', (_event, point) => window.webContents.sendInputEvent({ type: 'mouseMove', ...point }));
        ipcMain.handle('test:click', async (_event, { x, y }) => {
          window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
          window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          await new Promise(resolve => setTimeout(resolve, 20));
          window.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        });
        window.webContents.on('console-message', (event) => {
          if (event.level === 'error') console.error(event.message);
        });
        try {
          await window.loadURL(${JSON.stringify(`http://127.0.0.1:${address.port}/__task_create_test`)});
          const result = await window.webContents.executeJavaScript(\`(async () => {
            async function waitFor(check, message) {
              const deadline = Date.now() + 12000;
              while (Date.now() < deadline) {
                if (check()) return;
                await new Promise(resolve => setTimeout(resolve, 25));
              }
              throw new Error(message);
            }

            const dialog = () => [...document.querySelectorAll('[role="dialog"]')].at(-1);
            const button = (text,root = dialog()) => [...root.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled);
            async function click(text) {
              await waitFor(() => button(text), 'Button missing: ' + text);
              await mouseClick(button(text));
            }
            async function mouseClick(element) {
              const rect = element.getBoundingClientRect();
              await window.testInput.click({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) });
            }
            function fill(element,value) {
              const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
              element.dispatchEvent(new Event('input',{bubbles:true}));
            }
            await waitFor(() => document.querySelector('button[aria-label="创建任务"]'), 'Missing create entry');
            document.querySelector('button[aria-label="创建任务"]').click();
            await waitFor(() => dialog()?.querySelector('textarea'), 'Missing task dialog');
            const accessibleTitle = document.getElementById(dialog().getAttribute('aria-labelledby'));
            if (accessibleTitle?.textContent !== '创建任务' || accessibleTitle.getBoundingClientRect().height > 1) throw new Error('Dialog title must be visually hidden but accessible');
            if (dialog().querySelector('[data-slot="dialog-header"], [data-slot="dialog-footer"]')) throw new Error('Task form must not have a separate title or footer area');
            if (dialog().querySelector('h3') || dialog().textContent.includes('可选：关联工作目录')) throw new Error('Resource section should only show its add button when empty');
            if (!button('添加仓库或文件夹')) throw new Error('Missing add resource button');
            const description = dialog().querySelector('textarea');
            for (const label of ['关联 Issue', '关联 PR']) {
              if (!(button(label).compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING)) throw new Error('Context buttons must precede the description');
            }
            const composer = () => dialog()?.querySelector('[data-slot="input-group"]');
            const agentTrigger = () => document.querySelector('button[aria-label="任务 Agent 配置"]');
            const agentSummary = () => document.querySelector('[data-slot="task-agent-summary"]');
            await waitFor(() => agentSummary()?.textContent.includes('Claude runtime model'), 'Default agent must use real capability response');
            const initialAgentCacheReads = window.agentCacheReads;
            if(!agentTrigger().contains(agentSummary())) throw new Error('Agent summary must be inside the clickable entry');
            if(agentTrigger().textContent.includes('Claude Code') || agentTrigger().hasAttribute('title')) throw new Error('Agent name must only appear in the detailed tooltip, not the trigger or a native title');
            const triggerBounds=agentTrigger().getBoundingClientRect();
            const agentTriggerStyle=getComputedStyle(agentTrigger());
            if(agentTriggerStyle.paddingLeft!=='0px'||agentTriggerStyle.paddingRight!=='0px'||agentTriggerStyle.borderLeftWidth!=='0px'||agentTriggerStyle.borderRightWidth!=='0px')throw new Error('Agent entry must not add horizontal padding or transparent borders');
            await window.testInput.hover({x:Math.round(triggerBounds.left+triggerBounds.width/2),y:Math.round(triggerBounds.top+triggerBounds.height/2)});
            await waitFor(()=>document.querySelector('[data-slot="task-agent-details"]'),'Hover must display per-field details');
            const tooltipRect=document.querySelector('[data-slot="tooltip-content"]').getBoundingClientRect();
            if(Math.abs(tooltipRect.right-agentTrigger().querySelector('.lucide-chevron-down').getBoundingClientRect().right)>1)throw new Error('Agent tooltip must align naturally with the chevron');
            const details=document.querySelector('[data-slot="task-agent-details"]').textContent;
            for(const detail of ['Claude Code','Claude runtime model','Default','low']) if(!details.includes(detail)) throw new Error('Missing tooltip detail: '+detail);
            await mouseClick(agentSummary());
            await waitFor(() => document.querySelector('[data-slot="task-agent-menu"]'), 'Agent configuration must be an anchored menu');
            if(document.querySelectorAll('[data-slot="dialog-overlay"]').length!==1 || dialog().querySelector('[data-slot="dialog-close"]')) throw new Error('Agent menu must not add a modal overlay or close button');
            if(dialog().textContent.includes('重新扫描') || dialog().textContent.includes('不选择 Agent')) throw new Error('Removed actions must not appear in the agent menu');
            const menuRect=dialog().getBoundingClientRect(), triggerRect=agentTrigger().getBoundingClientRect();
            const chevronRect=agentTrigger().querySelector('.lucide-chevron-down').getBoundingClientRect();
            if(menuRect.width>355 || Math.abs(menuRect.right-chevronRect.right)>1) throw new Error('Agent menu must be compact and right-aligned to the dropdown chevron');
            if(Math.abs(triggerRect.top-menuRect.bottom-6)>1)throw new Error('Agent menu must sit 6px above the trigger');
            async function selectAgentOption(label, text) {
              await mouseClick(dialog().querySelector('button[aria-label="' + label + '"]'));
              await waitFor(() => document.querySelector('[role="listbox"]'), 'Missing selector list');
              const option = [...document.querySelectorAll('[role="option"]')].find(item => item.textContent === text);
              if (!option) throw new Error('Missing runtime option: ' + text);
              await mouseClick(option);
              await waitFor(() => !document.querySelector('[role="listbox"]'), 'Selection must close only its own menu');
              if (document.querySelectorAll('[role="dialog"]').length !== 2) throw new Error('Select must not close either parent dialog');
            }
            await mouseClick(dialog().querySelector('button[aria-label="选择 Agent"]'));
            await waitFor(() => document.querySelector('[role="listbox"]'), 'Missing eligible agents');
            if(!document.querySelector('[role="listbox"]').textContent.includes('Grok Build') || !document.querySelector('[role="listbox"]').textContent.includes('Antigravity')) throw new Error('Unknown authentication and detection errors must not hide agents');
            await mouseClick([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === 'Codex'));
            await waitFor(() => dialog().textContent.includes('Codex runtime model'), 'Agent switch must load its own capabilities');
            await selectAgentOption('选择 Agent','Grok Build');
            await waitFor(()=>dialog().textContent.includes('Grok Runtime'),'Grok must expose its real discovered model');
            if(dialog().querySelector('[role="slider"]').getAttribute('aria-valuetext')!=='high')throw new Error('Grok must use the returned model default effort');
            await selectAgentOption('模型','Grok Legacy');
            if(dialog().querySelector('[role="slider"]').getAttribute('aria-valuemax')!=='2')throw new Error('Grok model changes must not retain unavailable xhigh effort');
            await selectAgentOption('模型','Grok Simple');
            if(dialog().querySelector('[role="slider"]'))throw new Error('Grok models without reasoning controls must not inherit them');
            await selectAgentOption('选择 Agent','Antigravity');
            await waitFor(()=>dialog().textContent.includes('Gemini Runtime (High)'),'Antigravity must expose the native CLI model list');
            await selectAgentOption('模式','plan');
            await selectAgentOption('模型','Claude Runtime (Thinking)');
            if(dialog().querySelector('[role="slider"]').getAttribute('aria-valuemax')!=='5')throw new Error('Antigravity effort options must come from CLI help');
            if(window.agentCacheReads!==initialAgentCacheReads)throw new Error('Opening menus and switching agents must not reload or revalidate the cache');
            window.failAgent='grok';window.publishAgentCache();await selectAgentOption('选择 Agent','Grok Build');
            await waitFor(()=>dialog().querySelector('button[aria-label="选择 Agent"]').textContent==='Grok Build'&&dialog().querySelector('button[aria-label="模型"]').disabled,'Failed capability reads must keep invalid options disabled');
            if(dialog().querySelector('[role="alert"]')||dialog().textContent.includes('模型配置暂不可用'))throw new Error('Agent menu must not display capability error messages');
            if(document.querySelector('[data-slot="dialog-content"]').querySelector('[role="alert"]'))throw new Error('Agent discovery errors must not appear in the create form');
            if(document.body.textContent.includes('暂无已接入')||document.body.textContent.includes('不提供预设选项'))throw new Error('Removed unsupported-provider copy must never appear');
            window.failAgent=null;window.publishAgentCache();
            await selectAgentOption('选择 Agent','Codex');
            await waitFor(()=>dialog().textContent.includes('Codex runtime model')&&!dialog().querySelector('[role="alert"]'),'Another agent must remain selectable after discovery fails');
            window.failAgentSnapshot=true;window.publishAgentCache();
            await waitFor(()=>dialog().querySelector('button[aria-label="模型"]').disabled,'Old IPC interfaces must still block invalid configuration');
            if(dialog().querySelector('[role="alert"]')||dialog().textContent.includes('完整重启')||dialog().textContent.includes('旧的 Agent 接口'))throw new Error('Agent menu must not display restart or interface error messages');
            window.failAgentSnapshot=false;window.publishAgentCache();
            await waitFor(()=>!dialog().querySelector('button[aria-label="模型"]').disabled,'Background recovery must re-enable cached options');
            await selectAgentOption('模型', 'Runtime fast model');
            if(!dialog().textContent.includes('此模型未提供思考等级选项')) throw new Error('Unsupported thought levels must not be fabricated');
            if(dialog().querySelector('[role="slider"]')) throw new Error('Unsupported thought levels must not show a slider');
            await selectAgentOption('模型', 'Codex runtime model');
            const effortSlider=()=>dialog().querySelector('[role="slider"][aria-label="思考等级"]');
            await waitFor(()=>effortSlider()?.getAttribute('aria-valuetext')==='low','Model default effort must be selected');
            const effortLabels=dialog().querySelector('[data-slot="task-agent-effort"]').textContent;
            const stableMenuLeft=dialog().getBoundingClientRect().left;
            if(!effortLabels.includes('low')||!effortLabels.includes('high')||effortLabels.includes('低')) throw new Error('Slider labels must preserve raw CLI values');
            effortSlider().dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
            await waitFor(()=>effortSlider().getAttribute('aria-valuetext')==='default','Home must restore CLI default without inventing a level');
            effortSlider().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
            await waitFor(()=>effortSlider().getAttribute('aria-valuetext')==='low','Arrow key must advance one real effort level');
            const effortBounds=dialog().querySelector('[data-slot="task-agent-effort"]').getBoundingClientRect();
            const thumbBounds=effortSlider().getBoundingClientRect();
            await window.testInput.drag({x:Math.round(thumbBounds.left+thumbBounds.width/2),y:Math.round(thumbBounds.top+thumbBounds.height/2)},{x:Math.round(effortBounds.right-1),y:Math.round(thumbBounds.top+thumbBounds.height/2)});
            await waitFor(()=>effortSlider().getAttribute('aria-valuetext')==='high','Dragging must select the final real level');
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            if(Math.abs(dialog().getBoundingClientRect().left-stableMenuLeft)>1) throw new Error('Changing thought levels must not shift the menu horizontally');
            await selectAgentOption('模式','Plan');await click('使用默认 Agent');
            await waitFor(() => dialog().textContent.includes('Claude runtime model'), 'Use default must restore global default agent for this task');
            await selectAgentOption('选择 Agent', 'Codex');
            await waitFor(() => dialog().textContent.includes('Codex runtime model'), 'Codex capabilities missing');
            effortSlider().dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
            await waitFor(()=>effortSlider().getAttribute('aria-valuetext')==='high','End must select the highest returned effort level');
            await selectAgentOption('模式','Plan');
            const readsBeforeBackgroundUpdate = window.agentCacheReads;
            window.publishAgentCache();
            await waitFor(()=>window.agentCacheReads>readsBeforeBackgroundUpdate,'Background cache events must reach the open form');
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            if(effortSlider().getAttribute('aria-valuetext')!=='high' || !dialog().textContent.includes('Plan'))throw new Error('Background updates must preserve compatible model, effort and mode choices');
            await window.testInput.escape();
            await waitFor(() => document.querySelectorAll('[role="dialog"]').length === 1, 'Closing agent dialog must retain create dialog');
            if(agentSummary().textContent!=='Codex runtime model · high' || agentTrigger().querySelector('[data-slot="task-agent-mode"]')?.textContent!=='Plan' || agentTrigger().textContent.includes('Codex ·')) throw new Error('Agent entry must show model and effort with a separate raw mode tag, without the agent name');
            if (!composer()?.contains(description) || !composer().parentElement.nextElementSibling?.contains(button('添加仓库或文件夹'))) throw new Error('Resource entry must directly follow the combined input container');
            if (composer().children.length !== 2) throw new Error('Empty composer must contain only the textarea and bottom bar');
            const attachmentButton = () => composer()?.querySelector('button[aria-label="添加附件或链接"]');
            if (!attachmentButton() || attachmentButton().textContent.trim() || !description.nextElementSibling?.contains(attachmentButton())) throw new Error('Attachment entry must be an icon in the bottom bar');
            const createButton = [...composer().querySelectorAll('button')].find(item => item.textContent === '创建');
            const agentRect=agentTrigger().getBoundingClientRect(),createRect=createButton.getBoundingClientRect();
            if(createButton.className.includes('rounded-l-none') || createButton.previousElementSibling!==agentTrigger() || Math.abs(createRect.left-agentRect.right-8)>1 || attachmentButton().parentElement===createButton.parentElement) throw new Error('Agent entry must sit immediately left of Create with a separate 8px gap');
            if (!createButton?.disabled || createButton.closest('[data-slot="input-group-addon"]') !== attachmentButton().closest('[data-slot="input-group-addon"]')) throw new Error('Create must share the input bottom bar and remain disabled for an empty description');
            await document.fonts.ready;
            await waitFor(() => getComputedStyle(description).fieldSizing === 'content', 'Native textarea autosizing must be enabled');
            const textareaStyle = getComputedStyle(description);
            const lineHeight = parseFloat(textareaStyle.lineHeight);
            const verticalPadding = parseFloat(textareaStyle.paddingTop) + parseFloat(textareaStyle.paddingBottom);
            const heightForLines = (lines) => lineHeight * lines + verticalPadding;
            const inputHeight = () => description.getBoundingClientRect().height;
            if (Math.abs(inputHeight() - heightForLines(1)) > 1) throw new Error('Textarea must initially show one line');
            const toolbar = composer().previousElementSibling;
            if (createButton.getBoundingClientRect().right < composer().getBoundingClientRect().right - 12 || createButton.getBoundingClientRect().top < description.getBoundingClientRect().bottom) throw new Error('Create button must be at the bottom-right inside the composer');
            if (Math.abs(composer().getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom - 8) > 1) throw new Error('Top buttons must be 8px above the composer');
            if (Math.abs(button('添加仓库或文件夹').getBoundingClientRect().top - composer().getBoundingClientRect().bottom - 8) > 1) throw new Error('Resource button gap must be reduced to 8px');
            for (const dark of [false, true]) {
              document.documentElement.classList.toggle('dark', dark);
              button('关联 Issue').focus();
              const idleBorder = getComputedStyle(composer()).borderColor;
              description.focus();
              const focusedStyle = getComputedStyle(composer());
              const hasVisibleShadow = focusedStyle.boxShadow.match(/-?[0-9.]+px/g)?.some(value => parseFloat(value) !== 0);
              if (focusedStyle.borderColor !== idleBorder || hasVisibleShadow) throw new Error('Composer focus must not highlight its border or add a ring');
            }
            document.documentElement.classList.remove('dark');
            fill(description, Array(3).fill('自动撑高').join(String.fromCharCode(10)));
            await waitFor(() => Math.abs(inputHeight() - heightForLines(3)) <= 1, 'Textarea must grow with explicit newlines');
            fill(description, Array(12).fill('最大八行').join(String.fromCharCode(10)));
            await waitFor(() => Math.abs(inputHeight() - heightForLines(8)) <= 1 && description.scrollHeight > description.clientHeight, 'Textarea must cap at eight lines and scroll');
            fill(description, '自动换行内容'.repeat(160));
            await waitFor(() => Math.abs(inputHeight() - heightForLines(8)) <= 1 && description.scrollHeight > description.clientHeight, 'Wrapped text must also respect the eight-line cap');
            fill(description, '单行');
            await waitFor(() => Math.abs(inputHeight() - heightForLines(1)) <= 1, 'Deleting text must shrink the textarea');
            fill(dialog().querySelector('textarea'),'界面回归任务' + String.fromCharCode(10) + '完整的任务描述');
            if (button('取消') || dialog().textContent.includes('创建本地任务，不会自动启动 Agent。')) throw new Error('Obsolete create-dialog controls are still present');
            await click('关闭');
            await waitFor(() => !dialog(), 'Close did not close dialog');
            document.querySelector('button[aria-label="创建任务"]').click();
            await waitFor(() => dialog()?.querySelector('textarea')?.value.includes('界面回归任务'), 'Draft was lost on close');
            const draftDialog = dialog();
            const draftTextarea = draftDialog.querySelector('textarea');
            function assertDialogStack(count) {
              const layers = [...document.querySelectorAll('[role="dialog"]')];
              if (layers.length !== count || !draftTextarea.isConnected || draftDialog.getAttribute('data-state') !== 'open') throw new Error('Parent dialogs must stay mounted and open beneath children: expected=' + count + ', actual=' + layers.length + ', connected=' + draftTextarea.isConnected + ', state=' + draftDialog.getAttribute('data-state'));
              for (const layer of layers) {
                if (getComputedStyle(layer).display === 'none' || getComputedStyle(layer).visibility === 'hidden' || layer.getBoundingClientRect().height === 0) throw new Error('Parent dialogs must remain visible');
              }
            }
            await click('关联 Issue');
            await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing issue selection');
            assertDialogStack(2);
            await click('取消');
            await waitFor(() => dialog()?.querySelector('textarea')?.value.includes('界面回归任务'), 'Canceling issue selection must return to draft');
            await waitFor(() => document.activeElement === button('关联 Issue'), 'Cancel must restore focus to its parent entry');
            for (const action of ['escape', 'close', 'outside']) {
              await click('关联 Issue');
              await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing stacked issue picker');
              await new Promise(resolve => requestAnimationFrame(resolve));
              assertDialogStack(2);
              if (action === 'escape') dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
              else if (action === 'close') {
                await mouseClick(button('关闭'));
                await waitFor(() => document.querySelectorAll('[role="dialog"]').length !== 2, 'Native close did not reach the child dialog');
                if (!draftDialog.isConnected) throw new Error('Native mouse close dismissed both the child and its parent');
              }
              else {
                const overlay = [...document.querySelectorAll('[data-slot="dialog-overlay"]')].at(-1);
                overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
                overlay.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
                overlay.click();
              }
              await waitFor(() => dialog() === draftDialog, 'Dismiss must close only the top dialog: ' + action);
              assertDialogStack(1);
            }
            await click('关联 Issue');
            await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing reopened issue selection');
            if (dialog().textContent.includes('勾选条目进行关联')) throw new Error('Picker instruction must be removed');
            if (dialog().querySelector('[aria-label="PR 状态筛选"]')) throw new Error('Issue picker must not show PR state filtering');
            for (const [label, text] of [['服务商筛选', '全部服务商'], ['仓库筛选', '全部仓库'], ['任务关联筛选', '未关联任务']]) {
              if (!dialog().querySelector('[aria-label="' + label + '"]')?.textContent.includes(text)) throw new Error('Incorrect picker filter default: ' + label);
            }
            await window.setTestLanguage('en');
            await waitFor(() => dialog()?.querySelector('[aria-label="Filter by provider"]')?.textContent.includes('Any provider'), 'Provider default must translate live');
            if (!dialog().querySelector('[aria-label="Filter by repository"]').textContent.includes('Any Repo') || !dialog().querySelector('[aria-label="Filter by task association"]').textContent.includes('Not task yet')) throw new Error('All filter defaults must translate');
            await mouseClick(dialog().querySelector('[aria-label="Filter by task association"]'));
            await waitFor(() => document.querySelectorAll('[role="option"]').length === 3, 'Missing translated task association options');
            if ([...document.querySelectorAll('[role="option"]')].map(option => option.textContent).join(',') !== 'Any,Has a task,Not task yet') throw new Error('Task association options must translate');
            await window.testInput.escape();
            await waitFor(() => !document.querySelector('[role="listbox"]'), 'Translated dropdown must close normally');
            await window.setTestLanguage('zh-CN');
            await waitFor(() => dialog()?.querySelector('[aria-label="任务关联筛选"]')?.textContent.includes('未关联任务'), 'Chinese defaults must restore without resetting selection');
            const titleButton = dialog().querySelector('button[aria-label^="预览："]');
            if (titleButton.querySelector('svg') || getComputedStyle(titleButton).whiteSpace !== 'nowrap' || getComputedStyle(titleButton).textOverflow !== 'ellipsis') throw new Error('Title must preview directly, truncate and have no eye icon');
            if (titleButton.nextElementSibling.textContent !== 'GitHub' || titleButton.parentElement.querySelector('p')) throw new Error('Source must replace preview icon without a project subtitle');
            const pickerRow = titleButton.parentElement;
            await window.testInput.hover({ x: 5, y: 5 });
            const rowBackground = getComputedStyle(pickerRow).backgroundColor;
            const rowRect = pickerRow.getBoundingClientRect();
            await window.testInput.hover({ x: Math.round(rowRect.x + rowRect.width / 2), y: Math.round(rowRect.y + rowRect.height / 2) });
            await waitFor(() => getComputedStyle(pickerRow).backgroundColor !== rowBackground, 'Picker row must highlight on hover');
            if (pickerRow.querySelector('[role="checkbox"]').getAttribute('data-state') !== 'unchecked' || dialog().querySelector('aside h3')) throw new Error('Hover must not select or preview an item');
            const pickerToolbar = dialog().querySelector('[data-issue-picker-toolbar]');
            const searchRect = pickerToolbar.querySelector('input').getBoundingClientRect();
            if (searchRect.width > 210) throw new Error('Search input must remain compact');
            for (const trigger of pickerToolbar.querySelectorAll('[role="combobox"]')) {
              if (Math.abs(trigger.getBoundingClientRect().top - searchRect.top) > 1) throw new Error('Search and all filters must stay on one row');
            }
            const pickerPanels = dialog().querySelector('.task-issue-panels');
            const divider = pickerPanels.querySelector('[role="separator"]');
            await waitFor(() => Math.abs(pickerPanels.querySelector('aside').getBoundingClientRect().width - (pickerPanels.getBoundingClientRect().width - 8) * 0.44) < 1, 'Picker layout must finish measuring before native drag');
            const initialPreviewWidth = pickerPanels.querySelector('aside').getBoundingClientRect().width;
            const dividerRect = divider.getBoundingClientRect();
            const from = { x: Math.round(dividerRect.x + dividerRect.width / 2), y: Math.round(dividerRect.y + dividerRect.height / 2) };
            await window.testInput.drag(from, { x: from.x + 60, y: from.y });
            await waitFor(() => pickerPanels.querySelector('aside').getBoundingClientRect().width < initialPreviewWidth - 40, 'Native divider drag must resize list and preview');
            const resizedPreviewWidth = pickerPanels.querySelector('aside').getBoundingClientRect().width;
            divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
            await waitFor(() => pickerPanels.querySelector('aside').getBoundingClientRect().width > resizedPreviewWidth + 15, 'Picker divider must support keyboard resizing');
            if (divider.getBoundingClientRect().width !== 8 || document.querySelectorAll('[role="dialog"]').length !== 2) throw new Error('Resizing must retain the 8px gap and both dialogs');
            async function pickerFilter(label, value) {
              await mouseClick(dialog().querySelector('[aria-label="' + label + '"]'));
              await waitFor(() => document.querySelector('[role="option"]'), 'Missing picker filter options');
              await mouseClick([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === value));
              await waitFor(() => !document.querySelector('[role="listbox"]'), 'Filter must close after selecting');
              if (document.querySelectorAll('[role="dialog"]').length !== 2) throw new Error('Filter must preserve nested dialogs');
            }
            for (const label of ['服务商筛选', '仓库筛选', '任务关联筛选']) {
              const picker = dialog();
              await new Promise(resolve => setTimeout(resolve, 100));
              await mouseClick(picker.querySelector('[aria-label="' + label + '"]'));
              await waitFor(() => document.querySelector('[role="listbox"]'), 'Missing open filter: ' + label);
              const bounds = picker.getBoundingClientRect();
              await window.testInput.click({ x: Math.round(bounds.left + 5), y: Math.round(bounds.top + bounds.height / 2) });
              await waitFor(() => !document.querySelector('[role="listbox"]'), 'Clicking picker background must dismiss filter');
              if (dialog() !== picker || !picker.isConnected) throw new Error('Dismissing filter inside picker must not close picker or creation dialog');
              await new Promise(resolve => setTimeout(resolve, 100));
              await mouseClick(picker.querySelector('[aria-label="' + label + '"]'));
              await waitFor(() => document.querySelector('[role="listbox"]'), 'Filter must reopen after dismissal');
              await window.testInput.escape();
              await waitFor(() => !document.querySelector('[role="listbox"]'), 'Escape must close only filter');
              if (dialog() !== picker) throw new Error('Escape from filter must retain picker');
            }
            window.linkExistingIssue();
            await waitFor(() => !dialog().querySelector('[aria-label="选择：' + window.linkedIssue.title + '"]'), 'Not task yet must hide persisted task links');
            await pickerFilter('任务关联筛选', '已关联任务');
            await waitFor(() => dialog().querySelectorAll('[role="checkbox"]').length === 1, 'Has a task must include archived tasks');
            const linkedCheckbox = dialog().querySelector('[role="checkbox"]');
            await mouseClick(linkedCheckbox);
            await pickerFilter('服务商筛选', 'GitLab');
            await waitFor(() => !dialog().querySelector('[role="checkbox"]'), 'Provider and association filters must intersect');
            if (!dialog().textContent.includes('已选择 1 项')) throw new Error('Filters must preserve hidden selections');
            await pickerFilter('任务关联筛选', '不限');
            await waitFor(() => dialog().querySelector('[role="checkbox"]'), 'Any association must show provider results');
            await pickerFilter('仓库筛选', 'demo/navo');
            await waitFor(() => !dialog().querySelector('[role="checkbox"]'), 'Repository and provider must intersect');
            await pickerFilter('服务商筛选', '全部服务商');
            await waitFor(() => dialog().querySelector('[aria-label="选择：' + window.linkedIssue.title + '"]')?.getAttribute('data-state') === 'checked', 'Restoring filters must retain selection');
            await mouseClick(dialog().querySelector('[aria-label="选择：' + window.linkedIssue.title + '"]'));
            await pickerFilter('仓库筛选', '全部仓库');
            window.clearExistingIssueTask();
            await pickerFilter('任务关联筛选', '未关联任务');
            dialog().querySelector('[role="checkbox"]').click();
            const preview = dialog().querySelector('button[aria-label^="预览："]');
            preview.click();
            await waitFor(() => dialog().querySelector('aside h3'), 'Missing issue preview');
            await click('确认');
            await waitFor(() => dialog()?.querySelector('textarea'), 'Did not return to task form');
            if (!composer()?.querySelector('button[aria-label^="移除："]') || !composer().textContent.includes('ISSUE')) throw new Error('Selected issue must be echoed inside the composer');
            if (composer().querySelector('button[aria-label^="移除："]').parentElement.getBoundingClientRect().height > 30) throw new Error('Linked item echo must stay compact');
            await click('关联 PR');
            await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing PR selection');
            if (!dialog().querySelector('[aria-label="PR 状态筛选"]').textContent.includes('全部状态')) throw new Error('PR state must default to Any State');
            await pickerFilter('PR 状态筛选', '草稿');
            await waitFor(() => dialog().querySelectorAll('[role="checkbox"]').length === 1, 'Draft must show only draft PRs');
            const draftCheckbox = dialog().querySelector('[role="checkbox"]');
            const draftLabel = draftCheckbox.getAttribute('aria-label');
            await mouseClick(draftCheckbox);
            await pickerFilter('PR 状态筛选', '开放');
            await waitFor(() => dialog().querySelectorAll('[role="checkbox"]').length === 2, 'Open must exclude draft and merged PRs');
            if (!dialog().textContent.includes('已选择 1 项')) throw new Error('State filtering must preserve hidden selections');
            await pickerFilter('PR 状态筛选', '全部状态');
            await waitFor(() => dialog().querySelector('[aria-label="' + draftLabel + '"]')?.getAttribute('data-state') === 'checked', 'Returning to Any State must keep selected draft');
            await mouseClick(dialog().querySelector('[aria-label="' + draftLabel + '"]'));
            await window.setTestLanguage('en');
            await waitFor(() => dialog()?.querySelector('[aria-label="Filter by PR state"]')?.textContent.includes('Any State'), 'PR state default must translate');
            await mouseClick(dialog().querySelector('[aria-label="Filter by PR state"]'));
            await waitFor(() => document.querySelectorAll('[role="option"]').length === 3, 'Missing PR state options');
            if ([...document.querySelectorAll('[role="option"]')].map(option => option.textContent).join(',') !== 'Any State,Open,Draft') throw new Error('PR state options must match the requested labels');
            await window.testInput.escape();
            await waitFor(() => !document.querySelector('[role="listbox"]'), 'PR state dropdown must dismiss without closing picker');
            await window.setTestLanguage('zh-CN');
            await waitFor(() => dialog()?.querySelector('[aria-label="PR 状态筛选"]'), 'PR picker must restore Chinese labels');
            dialog().querySelector('[role="checkbox"]').click();
            await click('确认');
            await waitFor(() => composer()?.textContent.includes('PR'), 'Selected PR must be echoed inside the composer');
            if (composer().querySelectorAll('button[aria-label^="移除："]').length !== 2) throw new Error('Both linked items must share the input container');
            await click('添加仓库或文件夹');
            await waitFor(() => button('添加仓库'), 'Missing resources picker');
            const resourcePickerDialog = dialog();
            if (resourcePickerDialog.textContent.includes('与设置中的仓库和文件夹共用资源列表')) throw new Error('Resource picker must not show shared-list description');
            assertDialogStack(2);
            window.delayResourceInspect = true;
            resourcePickerDialog.querySelector('[role="checkbox"]').click();
            await waitFor(() => window.resolveResourceInspect, 'Selection must inspect the repository');
            if (button('确认')) throw new Error('Pending resource inspection must disable confirmation');
            resourcePickerDialog.querySelector('[role="checkbox"]').click();
            window.delayResourceInspect = false;window.resolveResourceInspect();
            await new Promise(resolve => setTimeout(resolve,50));
            if (resourcePickerDialog.querySelector('[aria-label="源分支"]') || resourcePickerDialog.querySelector('[role="checkbox"]').getAttribute('aria-checked') !== 'false') throw new Error('Late inspection must not restore an unchecked repository');
            window.failResourceInspect = true;resourcePickerDialog.querySelector('[role="checkbox"]').click();
            await waitFor(() => resourcePickerDialog.querySelector('[role="alert"]'), 'Inspection failure must be visible');
            if (resourcePickerDialog.querySelector('[role="checkbox"]').getAttribute('aria-checked') !== 'false') throw new Error('Failed inspection must allow selecting again');
            window.failResourceInspect = false;
            fill(resourcePickerDialog.querySelector('input'), 'repo-a');
            for (const action of ['取消', '关闭']) {
              await click('添加仓库');
              await waitFor(() => button('选择本地文件夹'), 'Missing nested add repository dialog');
              assertDialogStack(3);
              await click(action);
              await waitFor(() => dialog() === resourcePickerDialog, 'Closing quick-add must retain both parent dialogs');
              if (resourcePickerDialog.querySelector('input').value !== 'repo-a') throw new Error('Parent resource filter must survive a nested dialog');
              await waitFor(() => document.activeElement === button('添加仓库'), 'Quick-add must return focus to its parent');
            }
            resourcePickerDialog.querySelector('[role="checkbox"]').click();
            await click('添加仓库');
            await click('选择本地文件夹');
            await waitFor(() => dialog()?.textContent.includes('extra'), 'Quick-added resource did not appear');
            assertDialogStack(2);
            for (const name of ['repo-a','extra']) {
              const row = [...dialog().querySelectorAll('label')].find(label => label.textContent.includes(name));
              if (!row) throw new Error('Missing resource: ' + name);
              if (row.querySelector('[role="checkbox"]').getAttribute('aria-checked') !== 'true') throw new Error('Quick-add must select the saved resource and preserve existing choices');
            }
            const pickerRepo = resourcePickerDialog.querySelector('[data-resource-id="repo-a"]');
            await waitFor(() => pickerRepo.querySelector('[aria-label="源分支"]'), 'Selected repository must expose source branch');
            if (resourcePickerDialog.querySelector('[aria-label="目标分支"]') || resourcePickerDialog.querySelector('[data-resource-id="extra"] [data-slot="button-group"]')) throw new Error('Picker must hide target branch and plain-folder Git options');
            const pickerWorktree = () => pickerRepo.querySelector('[data-slot="button-group"] [role="checkbox"]');
            if (pickerWorktree().getAttribute('aria-checked') !== 'true') throw new Error('Picker must use the default isolated mode');
            const pickerBranch = pickerRepo.querySelector('[aria-label="源分支"]');
            if (pickerWorktree().closest('label').getBoundingClientRect().right > pickerBranch.getBoundingClientRect().left) throw new Error('Isolated worktree must precede source branch');
            if (pickerBranch.getBoundingClientRect().height !== 28 || pickerBranch.getBoundingClientRect().width !== 144 || getComputedStyle(pickerBranch).borderTopWidth !== '0px') throw new Error('Picker branch controls must be compact and borderless');
            if (Math.abs(pickerRepo.querySelector(':scope > label').getBoundingClientRect().top + pickerRepo.querySelector(':scope > label').getBoundingClientRect().height / 2 - pickerBranch.getBoundingClientRect().top - 14) > 1) throw new Error('Resource identity and configuration must be vertically aligned');
            await window.testInput.captureResourcePicker();
            async function pickerSource(label) {
              pickerRepo.querySelector('[aria-label="源分支"]').click();
              await waitFor(() => document.querySelector('[aria-label="搜索分支"]'), 'Picker source menu missing');
              const popup = document.querySelector('[aria-label="搜索分支"]').parentElement;
              [...popup.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label).click();
              await waitFor(() => !document.querySelector('[aria-label="搜索分支"]'), 'Source selection should dismiss only its popover');
              if (dialog() !== resourcePickerDialog) throw new Error('Source selection must preserve the resource picker');
            }
            await pickerSource('使用当前分支');
            if (!pickerWorktree().disabled || pickerWorktree().getAttribute('aria-checked') !== 'false') throw new Error('Current branch must disable isolation');
            await pickerSource('main');
            pickerRepo.querySelector('[aria-label="源分支"]').click();await waitFor(() => document.querySelector('[aria-label="搜索分支"]'), 'Existing branch picker missing');
            await mouseClick(document.querySelector('[aria-label="分支选项：main"]'));
            await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent === '使用此分支'), 'Existing branch action missing');
            [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === '使用此分支').click();
            await waitFor(() => !document.querySelector('[aria-label="搜索分支"]'), 'Existing branch selection did not dismiss its popover');
            if (dialog() !== resourcePickerDialog || !pickerWorktree().disabled || pickerWorktree().getAttribute('aria-checked') !== 'false') throw new Error('Existing main worktree must be reused without isolation');
            await pickerSource('main');
            pickerWorktree().click();await waitFor(() => pickerWorktree().getAttribute('aria-checked') === 'true', 'Picker Worktree toggle failed');
            if (pickerRepo.querySelector(':scope > label [role="checkbox"]').getAttribute('aria-checked') !== 'true') throw new Error('Configuration must not toggle resource selection');
            pickerWorktree().click();await waitFor(() => pickerWorktree().getAttribute('aria-checked') === 'false', 'Picker Worktree toggle did not clear');
            await click('确认');
            await waitFor(() => dialog()?.querySelector('[aria-label="目标分支"]'), 'Missing branch configuration');
            const confirmedRepo = dialog().querySelector('[data-slot="button-group"][aria-label="repo-a"]');
            if (confirmedRepo.querySelector('[aria-label="源分支"]').textContent.trim() !== 'main' || confirmedRepo.querySelector('[role="checkbox"]').getAttribute('aria-checked') !== 'false') throw new Error('Picker configuration must survive confirmation');
            const addResource = () => dialog()?.querySelector('button[aria-label="添加仓库或文件夹"]');
            if (addResource().textContent.trim() || addResource().previousElementSibling?.getAttribute('aria-label') !== 'extra') throw new Error('Add resource must be an icon immediately after the last directory');
            addResource().click();
            await waitFor(() => button('添加仓库'), 'Plus button did not open the resource picker');
            const repeatedRepo = dialog().querySelector('[data-resource-id="repo-a"]');
            if (repeatedRepo.querySelector(':scope > label [role="checkbox"]').disabled || !repeatedRepo.textContent.includes('仓库已添加')) throw new Error('Same repository must remain selectable with a notice');
            repeatedRepo.querySelector(':scope > label [role="checkbox"]').click();await click('确认');
            await waitFor(() => dialog()?.querySelectorAll('[data-slot="button-group"][aria-label="repo-a"]').length === 2, 'Same repo must allow two independent draft rows');
            const repeatedRows = [...dialog().querySelectorAll('[data-slot="button-group"][aria-label="repo-a"]')];
            repeatedRows[1].querySelector('[aria-label="移除：repo-a"]').click();
            await waitFor(() => dialog().querySelectorAll('[data-slot="button-group"][aria-label="repo-a"]').length === 1, 'Removing one row must not remove the other same-repo row');
            if (repeatedRows[0].querySelector('[aria-label="源分支"]').textContent.trim() !== 'main') throw new Error('Repeated repo edit must not reset existing configuration');
            addResource().click();await waitFor(() => button('添加仓库'), 'Reopen resource picker failed');
            await click('取消');
            await waitFor(() => dialog()?.querySelector('textarea'), 'Cancel must return to the draft');
            dialog().querySelector('button[aria-label="移除：extra"]').click();
            await waitFor(() => addResource()?.previousElementSibling?.getAttribute('aria-label') === 'repo-a', 'Plus must follow the remaining directory');
            dialog().querySelector('button[aria-label="移除：repo-a"]').click();
            await waitFor(() => button('添加仓库或文件夹'), 'Removing all directories must restore the text button');
            await click('添加仓库或文件夹');
            await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing reopened resource picker');
            for (const name of ['repo-a', 'extra']) {
              [...dialog().querySelectorAll('label')].find(label => label.textContent.includes(name)).querySelector('[role="checkbox"]').click();
            }
            await click('确认');
            await waitFor(() => dialog()?.querySelector('[aria-label="目标分支"]'), 'Missing restored branch controls');
            if (dialog().textContent.includes('/fixtures/')) throw new Error('Working directories must not show filesystem paths');
            const targetButton = () => dialog()?.querySelector('button[aria-label="目标分支"]');
            const targetInput = () => dialog()?.querySelector('input[aria-label="目标分支"]');
            async function editTarget(value) {
              targetButton().click();
              await waitFor(() => targetInput(), 'Missing inline branch editor');
              if (targetInput().hasAttribute('placeholder')) throw new Error('Branch name input must not have a placeholder');
              fill(targetInput(), value);
            }
            async function confirmTarget(value) {
              await editTarget(value);
              dialog().querySelector('button[aria-label="确认分支名"]').click();
              await waitFor(() => targetButton()?.textContent === (value.trim() || 'Branch Name'), 'Branch name confirmation failed');
            }
            if (targetInput() || targetButton()?.textContent !== 'Branch Name') throw new Error('Automatic branch must initially show the Branch Name button');
            if (!dialog().textContent.includes('origin/main')) throw new Error('Remote default branch not selected');
            const resourceGroup = dialog().querySelector('[data-slot="button-group"][aria-label="repo-a"]');
            if (!resourceGroup || resourceGroup.children.length !== 5 || !resourceGroup.querySelector(':scope > button[aria-label="目标分支"]')) throw new Error('Working directory controls must share one connected group');
            await editTarget('discard-first-edit');
            const branchDraftInput = targetInput();
            await click('关联 PR');
            await waitFor(() => dialog() !== draftDialog && dialog()?.querySelector('[role="checkbox"]'), 'Missing PR picker above the active branch editor');
            assertDialogStack(2);
            await click('取消');
            await waitFor(() => targetInput() === branchDraftInput, 'Unconfirmed branch editor must stay mounted beneath child dialogs');
            if (targetInput().value !== 'discard-first-edit') throw new Error('Unconfirmed branch input must survive child dialogs');
            dialog().querySelector('button[aria-label="取消编辑分支名"]').click();
            await waitFor(() => targetButton()?.textContent === 'Branch Name', 'Cancel must leave automatic naming unchanged');
            await confirmTarget('  feature/confirmed  ');
            await editTarget('discard-later-edit');
            dialog().querySelector('button[aria-label="取消编辑分支名"]').click();
            await waitFor(() => targetButton()?.textContent === 'feature/confirmed', 'Cancel must preserve the confirmed branch');
            await editTarget('discard-with-escape');
            targetInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await waitFor(() => targetButton()?.textContent === 'feature/confirmed', 'Escape must cancel only branch editing, not close the task form');
            await editTarget('feature/keyboard');
            targetInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
            if (!targetInput()) throw new Error('IME Enter must not confirm the branch name');
            targetInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            await waitFor(() => targetButton()?.textContent === 'feature/keyboard', 'Enter must confirm the branch name');
            await confirmTarget('');
            async function replaceResource(current, next) {
              await click(current);
              await waitFor(() => document.querySelector('[aria-label="搜索资源"]'), 'Missing inline resource selector');
              if (!document.querySelector('textarea')) throw new Error('Resource selection must not replace the task dialog');
              const popover = document.querySelector('[aria-label="搜索资源"]').parentElement;
              const used = [...popover.querySelectorAll('button')].find(item => item.textContent.trim() === 'extra');
              if (!used?.disabled) throw new Error('Already selected resource must be disabled');
              fill(popover.querySelector('input'), next);
              await waitFor(() => [...popover.querySelectorAll('button')].filter(item => !item.disabled).length === 1, 'Resource search did not filter');
              button(next, popover).click();
              await waitFor(() => !document.querySelector('[aria-label="搜索资源"]'), 'Resource selector did not close');
            }
            dialog().querySelector('[aria-label="源分支"]').click();
            await waitFor(() => document.querySelector('[aria-label="搜索分支"]'), 'Missing source selector');
            button('main', document.querySelector('[aria-label="搜索分支"]').parentElement).click();
            await waitFor(() => dialog()?.querySelector('[aria-label="源分支"]')?.textContent === 'main', 'Source branch not changed');
            await confirmTarget('old-target');
            await replaceResource('repo-a', 'repo-b');
            await waitFor(() => dialog()?.querySelector('[aria-label="源分支"]')?.textContent === 'origin/develop', 'Source branch must reset for the new repository');
            if (targetButton()?.textContent !== 'Branch Name') throw new Error('Target branch must reset on repository switch');
            await replaceResource('repo-b', 'folder-b');
            await waitFor(() => dialog()?.querySelector('textarea') && !dialog().querySelector('[aria-label="目标分支"]'), 'Plain folder should not show branch controls');
            await replaceResource('folder-b', 'repo-a');
            await waitFor(() => dialog()?.querySelector('[aria-label="目标分支"]'), 'Git controls not restored after repo switch');
            const worktree = () => [...dialog().querySelectorAll('label')].find(label => label.textContent.includes('独立 Worktree')).querySelector('[role="checkbox"]');
            async function selectSource(label) {
              dialog().querySelector('[aria-label="源分支"]').click();
              await waitFor(() => document.querySelector('[aria-label="搜索分支"]'), 'Missing branch picker');
              const popover = document.querySelector('[aria-label="搜索分支"]').parentElement;
              const option = label === '使用当前分支' ? popover.querySelector('[aria-label="使用当前分支"]') : button(label, popover);
              option.click();
              await waitFor(() => !document.querySelector('[aria-label="搜索分支"]'), 'Branch picker did not close');
            }
            if (dialog().querySelector('[aria-label="任务执行模式"]') || dialog().textContent.includes('原仓库新建分支')) throw new Error('Execution mode selector must not be shown');
            worktree().click();
            await waitFor(() => worktree().getAttribute('data-state') === 'unchecked', 'Worktree must be optional');
            if (!dialog().querySelector('[aria-label="目标分支"]')) throw new Error('New branch input must remain without a worktree');
            worktree().click();
            await waitFor(() => worktree().getAttribute('data-state') === 'checked', 'Worktree must be selectable');
            await editTarget('discarded-target');
            await selectSource('使用当前分支');
            if (dialog().querySelector('[aria-label="目标分支"]') || !dialog().querySelector('[aria-label="源分支"]')?.textContent.includes('使用当前分支 · main')) throw new Error('Current branch selection must hide the target and show the actual branch');
            if (!worktree().disabled || worktree().getAttribute('data-state') !== 'unchecked') throw new Error('Current workspace must not create a worktree');
            await selectSource('main');
            if (targetButton()?.textContent !== 'Branch Name' || targetInput() || worktree().disabled) throw new Error('Ordinary local branch must restore branch creation and worktree selection');
            worktree().click();
            await waitFor(() => worktree().getAttribute('data-state') === 'checked', 'Worktree checkbox did not restore');
            const parentTaskDialog = dialog();
            async function attachmentOption(label) {
              await mouseClick(attachmentButton());
              await waitFor(() => document.querySelector('[role="menu"]'), 'Attachment menu did not open');
              const items = [...document.querySelectorAll('[role="menuitem"]')];
              if (items.length !== 2) throw new Error('Attachment menu must have exactly two options');
              await mouseClick(items.find(item => item.textContent.trim() === label));
            }
            async function openWebLink() {
              await attachmentOption('添加链接');
              await waitFor(() => dialog()?.querySelector('input[type="url"]'), 'Link dialog did not open');
              if (document.querySelectorAll('[role="dialog"]').length !== 2) throw new Error('Link dialog must retain the parent');
              await waitFor(() => document.activeElement === dialog().querySelector('input[type="url"]'), 'URL field must receive focus');
            }
            for (const action of ['escape', 'close', 'outside']) {
              await openWebLink();
              if (action === 'escape') await window.testInput.escape();
              else if (action === 'close') await click('关闭');
              else await window.testInput.click({ x: 5, y: 5 });
              await waitFor(() => dialog() === parentTaskDialog, 'Closing link dialog must not close the parent');
              await waitFor(() => document.activeElement === attachmentButton(), 'Attachment focus not restored');
            }
            await openWebLink();
            if (!dialog().querySelector('button[type="submit"]').disabled) throw new Error('URL must be required');
            fill(dialog().querySelector('input[type="url"]'), 'not a url');
            await click('添加');
            await waitFor(() => dialog()?.querySelector('[role="alert"]'), 'Invalid link must show validation');
            await window.setTestLanguage('en');
            await waitFor(() => dialog()?.textContent.includes('Any url - docs, a spec, a ticket.'), 'Link help must support English');
            if (dialog().querySelectorAll('input')[1].placeholder !== 'Optional') throw new Error('Optional hint must be in the title placeholder');
            await window.setTestLanguage('zh-CN');
            await waitFor(() => dialog()?.querySelectorAll('input')[1]?.placeholder === '选填', 'Title placeholder must support Chinese');
            const linkLabels = [...dialog().querySelectorAll('label')].map(label => label.textContent.trim());
            if (linkLabels.join(',') !== '链接,标题') throw new Error('Link labels must not show required or optional markers');
            fill(dialog().querySelector('input[type="url"]'), '  https://example.com/spec  ');
            fill(dialog().querySelectorAll('input')[1], '  设计规范  ');
            await click('添加');
            await waitFor(() => dialog() === parentTaskDialog && composer()?.textContent.includes('设计规范'), 'Named link not added');
            await openWebLink();
            fill(dialog().querySelector('input[type="url"]'), 'https://example.com/docs');
            await click('添加');
            await waitFor(() => dialog() === parentTaskDialog && composer()?.textContent.includes('https://example.com/docs'), 'Untitled link must show its URL');
            await openWebLink();
            fill(dialog().querySelector('input[type="url"]'), 'https://example.com/remove');
            await click('添加');
            await waitFor(() => dialog() === parentTaskDialog && composer()?.textContent.includes('https://example.com/remove'), 'Removable link not added');
            composer().querySelector('button[aria-label="移除：https://example.com/remove"]').click();
            await waitFor(() => !composer()?.textContent.includes('https://example.com/remove'), 'Link must be removable');
            await click('关闭');
            await waitFor(() => !dialog(), 'Task dialog did not close');
            document.querySelector('button[aria-label="创建任务"]').click();
            await waitFor(() => composer()?.textContent.includes('设计规范'), 'Closing and reopening must retain link draft');
            await attachmentOption('添加图片或文件');
            await waitFor(() => dialog()?.textContent.includes('reference.png'), 'Attachments were not shown');
            if (!composer()?.textContent.includes('reference.png') || !composer().textContent.includes('notes.txt')) throw new Error('Attachments must be echoed inside the composer');
            for (const name of ['reference.png', 'notes.txt']) {
              const chip = composer().querySelector('button[aria-label="移除：' + name + '"]').parentElement;
              if (chip.querySelector('img') || chip.textContent.trim() !== name || chip.firstElementChild?.tagName.toLowerCase() !== 'svg' || chip.firstElementChild.getAttribute('aria-hidden') !== 'true') throw new Error('Attachment echo must show a decorative link icon before the filename, without preview or size');
              if (chip.getBoundingClientRect().height > 30) throw new Error('Attachment echo must stay compact');
            }
            if (!composer().querySelector('textarea').value.includes('完整的任务描述')) throw new Error('Context selection must preserve the typed description');
            dialog().querySelector('button[aria-label="移除：reference.png"]').click();
            await waitFor(() => !composer()?.textContent.includes('reference.png'), 'Removing an attachment must update the inline echo');
            if (!composer().querySelector('textarea').value.includes('完整的任务描述')) throw new Error('Removing context must not edit the description');
            await click('创建');
            await waitFor(() => !dialog() && document.querySelector('.task-card'), 'Task was not created in board');
            const input = window.createdInputs[0];
            if(input.agent?.agentId!=='codex' || input.agent.modelId!=='runtime-model' || input.agent.effort!=='high' || input.agent.modeId!=='plan') throw new Error('Task must submit the chosen agent configuration');
            if (input.resources.length !== 2 || input.links.length !== 2 || input.attachmentIds.length !== 1) throw new Error('Task context was not submitted');
            if (input.webLinks.length !== 2 || input.webLinks[0].title !== '设计规范' || input.webLinks[0].url !== 'https://example.com/spec' || input.webLinks[1].title !== '') throw new Error('Web links must submit separately with optional trimmed titles');
            if (input.resources[0].targetBranch !== '' || input.resources[0].mode !== 'worktree') throw new Error('Branch settings not preserved');
            if (!document.querySelector('[data-status="TODO"] .task-card')) throw new Error('Task was not placed in TODO');
            const taskCard = document.querySelector('.task-card');
            const menuPosition = () => document.querySelector('[role="menu"]')?.getBoundingClientRect();
            taskCard.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:80,clientY:80}));
            await waitFor(() => Math.abs((menuPosition()?.top ?? -1000) - 80) < 5, 'Initial context menu not positioned');
            const firstPosition = menuPosition();
            taskCard.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:320,clientY:200}));
            await waitFor(() => Math.abs((menuPosition()?.left ?? -1000) - firstPosition.left - 240) < 5 && Math.abs((menuPosition()?.top ?? -1000) - 200) < 5, 'Repeated right-click must move the menu to the latest pointer');
            async function menu(action) {
              document.querySelector('.task-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:80,clientY:80}));
              await waitFor(() => document.querySelector('[role="menu"]'), 'Missing task context menu');
              const menu = document.querySelector('[role="menu"]');
              if ([...menu.querySelectorAll('[role="menuitem"]')].some(item => getComputedStyle(item).fontSize !== '12px')) throw new Error('Task context menus must use the same 12px typography as tabs');
              const item = [...menu.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === action);
              if (!item) throw new Error('Missing task action: ' + action);
              item.click();
            }
            await menu('重命名');
            await waitFor(() => dialog()?.querySelector('[aria-label="任务标题"]'), 'Missing rename dialog');
            fill(dialog().querySelector('[aria-label="任务标题"]'),'重命名后的任务');
            await click('确认');
            await waitFor(() => !dialog() && document.querySelector('.task-card').textContent.includes('重命名后的任务'), 'Rename not reflected');
            await menu('归档');
            await waitFor(() => document.querySelector('[data-status="ARCHIVED"] .task-card'), 'Archive failed');
            document.querySelector('.task-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:80,clientY:80}));
            await waitFor(() => document.querySelector('[role="menu"]'), 'Missing archived menu');
            if (document.querySelector('[role="menu"]').textContent.includes('添加资源')) throw new Error('Archived task has Add resource action');
            [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '恢复').click();
            await waitFor(() => document.querySelector('[data-status="TODO"] .task-card'), 'Restore failed');
            await menu('删除');
            await waitFor(() => dialog()?.textContent.includes('删除任务？'), 'Missing delete confirmation');
            await click('删除任务');
            await waitFor(() => !document.querySelector('.task-card'), 'Delete failed');
            for (const mode of ['new-branch', 'current-branch']) {
              document.querySelector('button[aria-label="创建任务"]').click();
              await waitFor(() => dialog()?.querySelector('textarea'), 'Missing next task form');
              fill(dialog().querySelector('textarea'), '分支模式回归任务');
              await click('添加仓库或文件夹');
              await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing repository selection');
              [...dialog().querySelectorAll('label')].find(label => label.textContent.includes('repo-a')).querySelector('[role="checkbox"]').click();
              await click('确认');
              await waitFor(() => dialog()?.querySelector('[aria-label="目标分支"]'), 'Missing new branch controls');
              if (mode === 'current-branch') await selectSource('使用当前分支');
              else {
                worktree().click();
                await waitFor(() => worktree().getAttribute('data-state') === 'unchecked', 'Worktree opt-out failed');
                await confirmTarget('feature/submitted');
                await editTarget('unconfirmed-not-submitted');
              }
              await click('创建');
              await waitFor(() => !dialog() && document.querySelector('.task-card'), 'Task submission failed');
              const resource = window.createdInputs.at(-1).resources[0];
              if (resource.mode !== mode) throw new Error('Wrong execution mode submitted: ' + resource.mode);
              if (mode === 'new-branch' && resource.targetBranch !== 'feature/submitted') throw new Error('Task creation must use only the confirmed branch name');
              if (mode === 'current-branch' && (resource.sourceBranch !== 'refs/heads/main' || resource.targetBranch !== '')) throw new Error('Current branch payload must not request a new branch');
              await menu('删除');
              await waitFor(() => dialog()?.textContent.includes('删除任务？'), 'Missing cleanup confirmation');
              await click('删除任务');
              await waitFor(() => !document.querySelector('.task-card'), 'Fixture cleanup failed');
            }
            if (document.querySelectorAll('[role="tab"]').length !== 0) throw new Error('Creating tasks must not automatically open task tabs');
            return 'Task creation, shared resources, attachments and task menu passed';
          })()\`);
          console.log(result);
          app.exit(0);
        } catch (error) { console.error(error.stack); app.exit(1); }
      });
    `);
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const result = await new Promise((resolve, reject) => {
      child = spawn(electron, [runner], { env: environment, stdio: ["ignore", "pipe", "pipe"], timeout: 45000 });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.once("error", reject);
      child.once("exit", (code) => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
  } finally {
    child?.kill();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
