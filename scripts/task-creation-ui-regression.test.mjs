import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("任务创建界面完整流程与卡片菜单", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-task-ui-"));
  const server = await createServer({
    configFile: false,
    appType: "custom",
    root: process.cwd(),
    cacheDir: path.join(directory, "vite-cache"),
    logLevel: "error",
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__task_create_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__task_create_test", `<div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/i18n/index.ts';

      import { ApplicationShell } from '/src/components/layout/ApplicationShell.tsx';
      import { TaskBoard } from '/src/components/tasks/TaskBoard.tsx';
      import { TaskCreateDialog } from '/src/components/tasks/create/TaskCreateDialog.tsx';
      import { TooltipProvider } from '/src/components/ui/tooltip.tsx';
      import { defaultSettings } from '/src/domain/settings.ts';
      import { useTaskStore } from '/src/stores/taskStore.ts';
      import i18n from '/src/i18n/index.ts';
      await i18n.changeLanguage('zh-CN');
      let persisted = [];
      let records = [
        { id: 'repo-a', name: 'repo-a', kind: 'repo', localPath: '/fixtures/repo-a', available: true },
        { id: 'repo-b', name: 'repo-b', kind: 'repo', localPath: '/fixtures/repo-b', available: true },
        { id: 'folder-b', name: 'folder-b', kind: 'folder', localPath: '/fixtures/folder-b', available: true },
      ];
      window.createdInputs = [];
      const info = (id) => {
        const record = records.find(record => record.id === id);
        const branch = id === 'repo-b' ? 'develop' : 'main';
        return { resourceId: id, name: record.name, path: record.localPath, git: id.startsWith('repo-') ? {
          root: record.localPath, currentBranch: branch, defaultSource: 'refs/remotes/origin/' + branch,
          branches: [{ ref: 'refs/remotes/origin/' + branch, name: 'origin/' + branch, kind: 'remote' }, { ref: 'refs/heads/' + branch, name: branch, kind: 'local' }],
        } : null };
      };
      window.navo = {
        window: { getIsFullScreen: async () => false, onFullScreenChange: () => () => {} },
        settings: { chooseDirectory: async () => '/fixtures/extra' },
        resources: {
          list: async () => records,
          save: async (value) => { const record = { ...value, id: 'extra', available: true }; records.push(record); return record; },
          onCloneProgress: () => () => {},
        },
        tasks: {
          load: async () => ({ tasks: persisted, recoveryWarnings: [] }),
          inspectResource: async (id) => info(id),
          chooseFiles: async () => [{ id: 'file-1', name: 'notes.txt', size: 12 }, { id: 'file-2', name: 'reference.png', size: 24 }],
          releaseFiles: async () => {},
          previewAttachment: async () => null,
          create: async (input) => {
            window.createdInputs.push(input);
            const resources = input.resources.map(resource => ({ ...resource, name: info(resource.resourceId).name, originalPath: info(resource.resourceId).path, workingPath: info(resource.resourceId).path }));
            const task = { id: input.requestId, title: input.description.trim().split(String.fromCharCode(10))[0], description: input.description, date: new Date().toISOString(), projectName: resources[0]?.name ?? '', status: 'TODO', resources, links: input.links, attachments: input.attachmentIds.map(id => ({ id, name: 'notes.txt', size: 12 })) };
            persisted = [task, ...persisted]; return task;
          },
          rename: async (id,title) => persisted = persisted.map(task => task.id === id ? { ...task,title } : task),
          move: async (id,status) => persisted = persisted.map(task => task.id === id ? { ...task,status,archivedFrom: task.status } : task),
          restore: async (id) => persisted = persisted.map(task => task.id === id ? { ...task,status: task.archivedFrom || 'TODO' } : task),
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
    const runner = path.join(directory, "task-create.cjs");
    await writeFile(runner, `
      const { app, BrowserWindow } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async () => {
        app.dock?.hide();
        const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
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
              button(text).click();
            }
            function fill(element,value) {
              const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
              element.dispatchEvent(new Event('input',{bubbles:true}));
            }
            await waitFor(() => document.querySelector('button[aria-label="创建任务"]'), 'Missing create entry');
            document.querySelector('button[aria-label="创建任务"]').click();
            await waitFor(() => dialog()?.querySelector('textarea'), 'Missing task dialog');
            fill(dialog().querySelector('textarea'),'界面回归任务' + String.fromCharCode(10) + '完整的任务描述');
            if (button('取消') || dialog().textContent.includes('创建本地任务，不会自动启动 Agent。')) throw new Error('Obsolete create-dialog controls are still present');
            await click('关闭');
            await waitFor(() => !dialog(), 'Close did not close dialog');
            document.querySelector('button[aria-label="创建任务"]').click();
            await waitFor(() => dialog()?.querySelector('textarea')?.value.includes('界面回归任务'), 'Draft was lost on close');
            await click('关联 Issue');
            await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing issue selection');
            await click('取消');
            await waitFor(() => dialog()?.querySelector('textarea')?.value.includes('界面回归任务'), 'Canceling issue selection must return to draft');
            await click('关联 Issue');
            await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing reopened issue selection');
            dialog().querySelector('[role="checkbox"]').click();
            const preview = dialog().querySelector('button[aria-label^="预览："]');
            preview.click();
            await waitFor(() => dialog().querySelector('aside h3'), 'Missing issue preview');
            await click('确认');
            await waitFor(() => dialog()?.querySelector('textarea'), 'Did not return to task form');
            await click('添加仓库或文件夹');
            await waitFor(() => button('添加仓库'), 'Missing resources picker');
            await click('添加仓库');
            await click('选择本地文件夹');
            await waitFor(() => dialog()?.textContent.includes('extra'), 'Quick-added resource did not appear');
            for (const name of ['repo-a','extra']) {
              const row = [...dialog().querySelectorAll('label')].find(label => label.textContent.includes(name));
              if (!row) throw new Error('Missing resource: ' + name);
              row.querySelector('[role="checkbox"]').click();
            }
            await click('确认');
            await waitFor(() => dialog()?.querySelector('[aria-label="目标分支"]'), 'Missing branch configuration');
            if (dialog().textContent.includes('/fixtures/')) throw new Error('Working directories must not show filesystem paths');
            if (dialog().querySelector('[aria-label="目标分支"]').value !== '') throw new Error('Automatic branch must stay empty');
            if (!dialog().textContent.includes('origin/main')) throw new Error('Remote default branch not selected');
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
            fill(dialog().querySelector('[aria-label="目标分支"]'), 'old-target');
            await replaceResource('repo-a', 'repo-b');
            await waitFor(() => dialog()?.querySelector('[aria-label="源分支"]')?.textContent === 'origin/develop', 'Source branch must reset for the new repository');
            if (dialog().querySelector('[aria-label="目标分支"]').value !== '') throw new Error('Target branch must reset on repository switch');
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
            fill(dialog().querySelector('[aria-label="目标分支"]'), 'discarded-target');
            await selectSource('使用当前分支');
            if (dialog().querySelector('[aria-label="目标分支"]') || !dialog().querySelector('[aria-label="源分支"]')?.textContent.includes('使用当前分支 · main')) throw new Error('Current branch selection must hide the target and show the actual branch');
            if (!worktree().disabled || worktree().getAttribute('data-state') !== 'unchecked') throw new Error('Current workspace must not create a worktree');
            await selectSource('main');
            if (!dialog().querySelector('[aria-label="目标分支"]') || dialog().querySelector('[aria-label="目标分支"]').value !== '' || worktree().disabled) throw new Error('Ordinary local branch must restore branch creation and worktree selection');
            worktree().click();
            await waitFor(() => worktree().getAttribute('data-state') === 'checked', 'Worktree checkbox did not restore');
            await click('添加图片或文件');
            await waitFor(() => dialog()?.textContent.includes('reference.png'), 'Attachments were not shown');
            dialog().querySelector('button[aria-label="移除：reference.png"]').click();
            await click('创建任务');
            await waitFor(() => !dialog() && document.querySelector('.task-card'), 'Task was not created in board');
            const input = window.createdInputs[0];
            if (input.resources.length !== 2 || input.links.length !== 1 || input.attachmentIds.length !== 1) throw new Error('Task context was not submitted');
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
            await click('确认');
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
              }
              await click('创建任务');
              await waitFor(() => !dialog() && document.querySelector('.task-card'), 'Task submission failed');
              const resource = window.createdInputs.at(-1).resources[0];
              if (resource.mode !== mode) throw new Error('Wrong execution mode submitted: ' + resource.mode);
              if (mode === 'current-branch' && (resource.sourceBranch !== 'refs/heads/main' || resource.targetBranch !== '')) throw new Error('Current branch payload must not request a new branch');
              await menu('删除');
              await waitFor(() => dialog()?.textContent.includes('删除任务？'), 'Missing cleanup confirmation');
              await click('确认');
              await waitFor(() => !document.querySelector('.task-card'), 'Fixture cleanup failed');
            }
            if (document.querySelectorAll('[role="tab"]').length !== 3) throw new Error('Placeholder tabs were changed');
            return 'Task creation, shared resources, attachments and task menu passed';
          })()\`);
          console.log(result);
          app.exit(0);
        } catch (error) { console.error(error.message); app.exit(1); }
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
