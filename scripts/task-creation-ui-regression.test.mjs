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
          chooseFiles: async () => [{ id: 'file-1', name: 'notes.txt', size: 12 }, { id: 'file-2', name: 'reference.png', size: 24, preview: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }],
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
    const preload = path.join(directory, "test-preload.cjs");
    await writeFile(preload, `
      const { contextBridge, ipcRenderer } = require('electron');
      contextBridge.exposeInMainWorld('testInput', { click: (point) => ipcRenderer.invoke('test:click', point) });
    `);
    const runner = path.join(directory, "task-create.cjs");
    await writeFile(runner, `
      const { app, BrowserWindow, ipcMain } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async () => {
        app.dock?.hide();
        const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, preload: ${JSON.stringify(preload)} } });
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
            if (!composer()?.contains(description) || !composer().parentElement.nextElementSibling?.contains(button('添加仓库或文件夹'))) throw new Error('Resource entry must directly follow the combined input container');
            if (composer().children.length !== 2) throw new Error('Empty composer must contain only the textarea and bottom bar');
            const attachmentButton = () => composer()?.querySelector('button[aria-label="添加图片或文件"]');
            if (!attachmentButton() || attachmentButton().textContent.trim() || !description.nextElementSibling?.contains(attachmentButton())) throw new Error('Attachment entry must be an icon in the bottom bar');
            const createButton = [...composer().querySelectorAll('button')].find(item => item.textContent === '创建');
            if (!createButton?.disabled || createButton.parentElement !== attachmentButton().parentElement) throw new Error('Create must share the input bottom bar and remain disabled for an empty description');
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
              if (layers.length !== count || !draftTextarea.isConnected || draftDialog.getAttribute('data-state') !== 'open') throw new Error('Parent dialogs must stay mounted and open beneath children');
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
            dialog().querySelector('[role="checkbox"]').click();
            await click('确认');
            await waitFor(() => composer()?.textContent.includes('PR'), 'Selected PR must be echoed inside the composer');
            if (composer().querySelectorAll('button[aria-label^="移除："]').length !== 2) throw new Error('Both linked items must share the input container');
            await click('添加仓库或文件夹');
            await waitFor(() => button('添加仓库'), 'Missing resources picker');
            const resourcePickerDialog = dialog();
            assertDialogStack(2);
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
            fill(resourcePickerDialog.querySelector('input'), '');
            await click('添加仓库');
            await click('选择本地文件夹');
            await waitFor(() => dialog()?.textContent.includes('extra'), 'Quick-added resource did not appear');
            assertDialogStack(2);
            for (const name of ['repo-a','extra']) {
              const row = [...dialog().querySelectorAll('label')].find(label => label.textContent.includes(name));
              if (!row) throw new Error('Missing resource: ' + name);
              row.querySelector('[role="checkbox"]').click();
            }
            await click('确认');
            await waitFor(() => dialog()?.querySelector('[aria-label="目标分支"]'), 'Missing branch configuration');
            const addResource = () => dialog()?.querySelector('button[aria-label="添加仓库或文件夹"]');
            if (addResource().textContent.trim() || addResource().previousElementSibling?.getAttribute('aria-label') !== 'extra') throw new Error('Add resource must be an icon immediately after the last directory');
            addResource().click();
            await waitFor(() => button('添加仓库'), 'Plus button did not open the resource picker');
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
            await waitFor(() => dialog()?.querySelector('[role="checkbox"]'), 'Missing PR picker above the active branch editor');
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
            attachmentButton().click();
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
            if (input.resources.length !== 2 || input.links.length !== 2 || input.attachmentIds.length !== 1) throw new Error('Task context was not submitted');
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
              await click('确认');
              await waitFor(() => !document.querySelector('.task-card'), 'Fixture cleanup failed');
            }
            if (document.querySelectorAll('[role="tab"]').length !== 0) throw new Error('Creating tasks must not automatically open task tabs');
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
