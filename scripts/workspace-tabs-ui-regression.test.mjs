import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("真实任务标签：详情提升、拆分交换、布局调整与右键菜单", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-tabs-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({
    configFile: false, appType: "custom", root: process.cwd(),
    cacheDir: path.join(directory, "vite-cache"), logLevel: "error",
    plugins: [tailwindcss()],
    esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__tabs_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__tabs_test", `<style>*,*::before,*::after { animation: none !important; transition: none !important; }</style><div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import App from '/src/App.tsx';
      import { useTaskStore } from '/src/stores/taskStore.ts';
      import { useTaskTabsStore } from '/src/stores/taskTabsStore.ts';
      import { useSettingsStore } from '/src/stores/settingsStore.ts';
      import { defaultSettings } from '/src/domain/settings.ts';
      import i18n from '/src/i18n/index.ts';
      await i18n.changeLanguage('zh-CN');
      useSettingsStore.setState({ loaded: true, settings: {...defaultSettings, locale: 'zh-CN'} });
      const tasks = ['任务工作区', 'Agent 运行状态', '多项目上下文'].map((title, index) => ({
        id: ['workspace', 'agent', 'context'][index], title, description: '任务正文：' + title,
        status: 'TODO', date: '2026-10-04', projectName: 'navo', links: [], resources: [], attachments: [],
      }));
      window.navo = {
        window: { getIsFullScreen: async () => false, onFullScreenChange: () => () => {} },
        settings: { getLogsStatus: async () => ({ failed: false }) },
        tasks: { load: async () => ({ tasks, recoveryWarnings: [] }), previewAttachment: async () => null },
      };
      const root = createRoot(document.getElementById('root'));
      let version = 0;
      window.resetTabs = () => {
        useTaskStore.setState({ tasks, loaded: true });
        useTaskTabsStore.setState({ taskIds: [], activeTaskId: null, splits: [] });
        root.render(React.createElement(App, { key: ++version }));
      };
      window.seedTabs = () => {
        window.resetTabs();
        for (const task of tasks) useTaskTabsStore.getState().openTask(task.id);
        useTaskTabsStore.getState().activateTask('workspace');
      };
      window.updateTask = (id, changes) => useTaskStore.setState(state => ({ tasks: state.tasks.map(task => task.id === id ? {...task, ...changes} : task) }));
      window.removeTask = (id) => useTaskStore.setState(state => ({ tasks: state.tasks.filter(task => task.id !== id) }));
      window.addOpenTask = (id, title) => {
        useTaskStore.setState(state => ({ tasks: [...state.tasks, {...tasks[0], id, title}] }));
        useTaskTabsStore.getState().openTask(id);
      };
      window.resetTabs();
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const preload = path.join(directory, "test-input.cjs");
    await writeFile(preload, `const { contextBridge, ipcRenderer } = require('electron'); contextBridge.exposeInMainWorld('testInput', { drag: (from, to) => ipcRenderer.invoke('test:drag', from, to) });`);
    const runner = path.join(directory, "tabs.cjs");
    await writeFile(runner, `
      const { app, BrowserWindow, ipcMain } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async () => {
        app.dock?.hide();
        const window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { backgroundThrottling: false, preload: ${JSON.stringify(preload)} } });
        ipcMain.handle('test:drag', async (_event, from, to) => {
          window.webContents.sendInputEvent({ type: 'mouseMove', ...from });
          window.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
          for (let step = 1; step <= 12; step += 1) {
            await new Promise(resolve => setTimeout(resolve, 16));
            window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * step / 12), y: Math.round(from.y + (to.y - from.y) * step / 12), button: 'left', modifiers: ['leftButtonDown'] });
          }
          const feedback = await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.readResizeFeedback?.()))))");
          window.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 });
          return feedback;
        });
        try {
          await window.loadURL(${JSON.stringify(`http://127.0.0.1:${server.httpServer.address().port}/__tabs_test`)});
          await window.webContents.executeJavaScript(\`(async () => {
            async function waitFor(check, message) {
              const deadline = Date.now() + 10000;
              while (Date.now() < deadline) {
                if (check()) return;
                await new Promise(resolve => setTimeout(resolve, 25));
              }
              throw new Error(message);
            }
            const tabs = () => [...document.querySelectorAll('[role="tab"]')];
            const tab = (title) => tabs().find(item => item.textContent === title);
            const active = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
            const item = (label) => [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.startsWith(label));
            const menuRect = () => document.querySelector('[role="menu"]')?.getBoundingClientRect();
            window.readResizeFeedback = () => {
              const divider = [...document.querySelectorAll('[role="separator"][data-centered]')].find(element => element.closest('[data-resizing="true"]'));
              return divider ? {
                centered: divider.dataset.centered === 'true',
                lineVisible: Number(getComputedStyle(divider, '::after').opacity) > 0,
                value: Number(divider.getAttribute('aria-valuenow')),
              } : null;
            };
            async function checkSnap(divider, vertical = false) {
              const parent = divider.parentElement.getBoundingClientRect();
              const dragToOffset = async offset => {
                const rect = divider.getBoundingClientRect();
                const from = { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
                const to = vertical ? { x: from.x, y: Math.round(parent.y + parent.height / 2 + offset) } : { x: Math.round(parent.x + parent.width / 2 + offset), y: from.y };
                return window.testInput.drag(from, to);
              };
              const snapped = await dragToOffset(5);
              if (!snapped?.centered || !snapped.lineVisible || snapped.value !== 50) throw new Error('Dragging near the midpoint must snap exactly to 50/50 and highlight the divider');
              const held = await dragToOffset(12);
              if (!held?.centered || !held.lineVisible) throw new Error('Small pointer movement must stay snapped without flicker');
              const released = await dragToOffset(24);
              if (released?.centered) throw new Error('Moving beyond the release distance must leave the snap');
              await waitFor(() => !divider.closest('[data-resizing="true"]'), 'Pointer release must end resizing');
            }
            async function openMenu(title, clientX = 80, clientY = 80) {
              tab(title).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, isPrimary: true, pointerType: 'mouse' }));
              tab(title).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX, clientY }));
              await waitFor(() => document.querySelector('[role="menu"]'), 'Missing tab menu');
              if (getComputedStyle(item('关闭')).fontSize !== '12px') throw new Error('Tab context menu font must be 12px');
            }
            const visiblePage = () => document.querySelector('[role="tabpanel"]:not([hidden])');
            const sidebar = () => document.querySelector('aside.task-details-panel');
            const board = () => document.querySelector('.task-board');
            const taskItem = (title) => document.querySelector('[aria-label="查看任务：' + title + '"]');
            async function overview() {
              document.querySelector('button[aria-label="任务"]').click();
              await waitFor(() => !visiblePage() && !board()?.closest('[hidden]'), 'Tasks navigation must restore the board');
            }
            async function preview(title) {
              taskItem(title).click();
              await waitFor(() => sidebar()?.textContent.includes(title), 'Task without a tab must open the sidebar');
            }
            async function promote(title) {
              await preview(title);
              sidebar().querySelector('[aria-label="打开任务页面"]').click();
              await waitFor(() => active() === title && visiblePage()?.textContent.includes('任务正文：' + title), 'Promoting details must open the actual task page');
              await waitFor(() => !sidebar(), 'Promotion must close the sidebar');
            }
            async function openTaskInTab(title) {
              taskItem(title).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 160, clientY: 180 }));
              await waitFor(() => item('以标签页打开'), 'Task context menu must offer Open in tab');
              item('以标签页打开').click();
              await waitFor(() => active() === title && visiblePage()?.textContent.includes('任务正文：' + title), 'Context action must open the task page');
              await waitFor(() => !sidebar(), 'Open in tab must close the task sidebar');
            }
            await waitFor(() => document.querySelectorAll('.task-card').length === 3, 'Missing task fixture');
            if (tabs().length) throw new Error('Placeholder tabs must not be present');
            await preview('任务工作区');
            if (tabs().length) throw new Error('A normal task click must not create a tab');
            await checkSnap(document.querySelector('.task-panel-separator'));
            await openTaskInTab('任务工作区');
            if (tabs().length !== 1) throw new Error('Board context action must create one tab');
            await overview();
            await openTaskInTab('任务工作区');
            if (tabs().length !== 1) throw new Error('Repeated context action must not duplicate tabs');
            await openMenu('任务工作区');
            item('关闭').click();
            await waitFor(() => tabs().length === 0 && !visiblePage(), 'Closing context-opened tab must restore overview');
            await promote('任务工作区');
            const createEntry = () => document.querySelector('button[aria-label="创建任务"]');
            const tabList = () => document.querySelector('[role="tablist"]');
            if (Math.abs(createEntry().getBoundingClientRect().left - tabList().getBoundingClientRect().right - 8) > 1) throw new Error('Tab scroll viewport must reach within 8px of the create button');
            if (Math.abs(createEntry().getBoundingClientRect().right - (window.innerWidth - 16)) > 1 || tabList().clientWidth <= 720) throw new Error('Create button must stay at the right edge and the tab viewport must not be capped at 720px');
            await overview();
            taskItem('任务工作区').click();
            await waitFor(() => active() === '任务工作区' && visiblePage(), 'Existing task tab must activate directly');
            if (tabs().length !== 1 || sidebar()) throw new Error('Existing tab must not duplicate or reopen the sidebar');
            await overview();
            await promote('Agent 运行状态');
            document.querySelector('button[aria-label="Issue"]').click();
            await waitFor(() => !visiblePage() && !active(), 'Switching modules must deselect task pages without closing tabs');
            if (tabs().length !== 2) throw new Error('Module navigation must preserve tabs');
            tab('任务工作区').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            await waitFor(() => visiblePage()?.textContent.includes('任务正文：任务工作区'), 'Task tab must navigate back from Issue');
            window.updateTask('workspace', { title: '新任务名称', status: 'DONE' });
            await waitFor(() => tab('新任务名称') && visiblePage()?.textContent.includes('DONE'), 'Task title and status must synchronize with its page');
            window.removeTask('workspace');
            await waitFor(() => tabs().length === 1 && active() === 'Agent 运行状态' && visiblePage()?.textContent.includes('任务正文：Agent 运行状态'), 'Deleting the active task must clean up its tab and select a neighbor');
            await overview();
            document.querySelector('.task-panel-content [aria-label="显示选项"]').click();
            await waitFor(() => document.querySelector('[aria-label="任务显示方式"]'), 'Missing task display control');
            [...document.querySelectorAll('[role="radio"]')].find(item => item.textContent === '列表').click();
            document.querySelector('[aria-label="任务显示方式"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await waitFor(() => document.querySelector('.task-list-row'), 'Missing list view');
            taskItem('Agent 运行状态').click();
            await waitFor(() => visiblePage() && active() === 'Agent 运行状态', 'List rows must also activate existing tabs');
            await overview();
            await preview('多项目上下文');
            if (tabs().length !== 1) throw new Error('New list item must remain a sidebar preview');
            await openTaskInTab('多项目上下文');
            if (tabs().length !== 2) throw new Error('List context action must create one task tab');
            window.seedTabs();
            await waitFor(() => tabs().length === 3, 'Missing seeded task tabs');
            await openMenu('Agent 运行状态');
            await waitFor(() => Math.abs((menuRect()?.top ?? -1000) - 80) < 5, 'Initial menu not positioned');
            const first = menuRect();
            await openMenu('Agent 运行状态', 320, 200);
            await waitFor(() => Math.abs(menuRect().left - first.left - 240) < 5 && Math.abs(menuRect().top - 200) < 5, 'Repeated right-click must follow pointer');
            if (active() !== '任务工作区' || document.querySelector('[data-dragging="true"]')) throw new Error('Right-click must not activate or drag a tab');
            if (!item('与当前标签拆分') || item('与当前标签拆分').getAttribute('aria-disabled') === 'true') throw new Error('Inactive standalone tabs must offer pairing with the active tab');
            item('关闭').click();
            await waitFor(() => tabs().length === 2, 'Close must remove the targeted inactive tab');
            if (tab('Agent 运行状态') || active() !== '任务工作区') throw new Error('Closing an inactive tab must preserve selection');
            await openMenu('任务工作区');
            item('关闭').click();
            await waitFor(() => tabs().length === 1 && active() === '多项目上下文', 'Closing active tab must select the right neighbor');
            await openMenu('多项目上下文');
            if (item('关闭其他').getAttribute('aria-disabled') !== 'true') throw new Error('Close others must be disabled for one tab');
            item('关闭').click();
            await waitFor(() => tabs().length === 0, 'Last tab must be closable');
            await waitFor(() => !visiblePage() && !board()?.closest('[hidden]'), 'Closing the last tab must return to the task board');
            await preview('Agent 运行状态');
            if (tabs().length) throw new Error('Clicking a task after closing its tab must open a sidebar again');
            window.seedTabs();
            await waitFor(() => tabs().length === 3, 'Fixture reset failed');
            await openMenu('多项目上下文');
            item('关闭其他').click();
            await waitFor(() => tabs().length === 1 && active() === '多项目上下文', 'Close others must retain and activate its inactive target');
            document.querySelector('button[aria-label="关闭标签：多项目上下文"]').click();
            await waitFor(() => tabs().length === 0, 'Existing close button must still work');
            window.seedTabs();
            await waitFor(() => tabs().length === 3, 'Second reset failed');
            tab('多项目上下文').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            await waitFor(() => active() === '多项目上下文', 'Tab keyboard activation failed');
            await openMenu('多项目上下文');
            item('关闭').click();
            await waitFor(() => tabs().length === 2 && active() === 'Agent 运行状态', 'Closing rightmost active tab must select the left neighbor');
            const visiblePages = () => [...document.querySelectorAll('[role="tabpanel"]:not([hidden])')];
            const separator = () => document.querySelector('[aria-label="调整拆分视图大小"]');
            const page = (id) => document.getElementById('task-page-' + id);
            const picker = () => document.querySelector('section[aria-label="选择标签页"]');
            const center = (element) => { const rect = element.getBoundingClientRect(); return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }; };
            async function menuAction(title, label, submenu) {
              await openMenu(title);
              if (submenu) {
                item(submenu).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
                await waitFor(() => item(label), 'Missing split submenu action: ' + label);
                if (getComputedStyle(item(label)).fontSize !== '12px') throw new Error('Tab submenu font must match the 12px root menu');
              }
              if (!item(label) || item(label).getAttribute('aria-disabled') === 'true') throw new Error('Split action unavailable: ' + label);
              item(label).click();
              await waitFor(() => !document.querySelector('[role="menu"]'), 'Split menu did not close');
            }
            window.seedTabs();
            await waitFor(() => tabs().length === 3 && active() === '任务工作区', 'Missing split fixture');
            await overview();
            const workspaceNode = page('workspace');
            await menuAction('任务工作区', '拆分视图');
            await waitFor(() => picker() && separator(), 'No-active-tab split must open the tab picker');
            if (picker().textContent.includes('任务工作区') || !picker().textContent.includes('Agent 运行状态')) throw new Error('Picker must exclude the source and include other standalone tabs');
            [...picker().querySelectorAll('button')].find(button => button.textContent === 'Agent 运行状态').click();
            await waitFor(() => visiblePages().length === 2 && !picker(), 'Choosing a tab must create two visible task pages');
            if (document.querySelectorAll('.navo-tab-group[data-split="true"]').length !== 1 || tabs().length !== 3 || page('workspace') !== workspaceNode) throw new Error('Split must combine existing tabs without duplicate or remounted task pages');
            const combinedTab = document.querySelector('.navo-tab-group[data-split="true"]');
            if (Math.abs(combinedTab.getBoundingClientRect().width - 240) > 1) throw new Error('Combined tab width must be 240px');
            const splitSegments = [...document.querySelector('.navo-tab-group[data-split="true"]').querySelectorAll('.navo-workspace-tab')];
            if (splitSegments.some(segment => Math.abs(segment.getBoundingClientRect().width - 120) > 1)) throw new Error('Split tab halves must have equal 120px widths');
            if (getComputedStyle(combinedTab).boxShadow.includes('0px 0px 0px 1px') || parseFloat(getComputedStyle(combinedTab).borderLeftWidth) !== 0 || parseFloat(getComputedStyle(combinedTab).borderRightWidth) !== 0) throw new Error('Combined tab must not have an extra outer stroke');
            if (splitSegments.some(segment => segment.hasAttribute('data-focused')) || getComputedStyle(splitSegments[0]).boxShadow !== getComputedStyle(splitSegments[1]).boxShadow) throw new Error('Combined tabs must not visually mark the focused half');
            const initialLeft = page('workspace').getBoundingClientRect();
            const initialRight = page('agent').getBoundingClientRect();
            if (Math.abs(initialLeft.width - initialRight.width) > 2 || Math.abs(initialRight.left - initialLeft.right - 8) > 1) throw new Error('Split must begin 50/50 with an 8px separator');
            const dividerStart = center(separator());
            await window.testInput.drag(dividerStart, { x: dividerStart.x + 36, y: dividerStart.y });
            await waitFor(() => page('workspace').getBoundingClientRect().width > initialLeft.width + 25, 'Native pointer dragging must resize the split');
            await checkSnap(separator());
            separator().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
            await waitFor(() => page('workspace').getBoundingClientRect().width > initialLeft.width + 10, 'Horizontal split must support resizing');
            const horizontalRatio = separator().getAttribute('aria-valuenow');
            await menuAction('任务工作区', '堆叠显示', '调整视图');
            await waitFor(() => separator()?.getAttribute('aria-orientation') === 'horizontal', 'Stacking must use a horizontal divider');
            await checkSnap(separator(), true);
            const topRect = page('workspace').getBoundingClientRect();
            const bottomRect = page('agent').getBoundingClientRect();
            if (Math.abs(topRect.width - bottomRect.width) > 1 || Math.abs(bottomRect.top - topRect.bottom - 8) > 1) throw new Error('Stacked pages must appear top and bottom');
            separator().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
            await waitFor(() => Number(separator().getAttribute('aria-valuenow')) > 50, 'Vertical split must resize independently');
            await menuAction('Agent 运行状态', '反转视图', '调整视图');
            await waitFor(() => page('agent').getBoundingClientRect().top < page('workspace').getBoundingClientRect().top, 'Reverse must exchange page positions');
            await menuAction('多项目上下文', '与上方视图交换', '将标签页移至拆分视图');
            await waitFor(() => visiblePages().some(node => node.id === 'task-page-context') && page('agent').hidden, 'Standalone tab must swap into the first pane');
            if (tabs().map(node => node.textContent).join('|') !== '多项目上下文|任务工作区|Agent 运行状态') throw new Error('Displaced page must return to the incoming standalone tab position');
            await menuAction('Agent 运行状态', '与下方视图交换', '将标签页移至拆分视图');
            await waitFor(() => !page('agent').hidden && page('workspace').hidden, 'Standalone tab must swap into the second pane');
            if (page('workspace') !== workspaceNode) throw new Error('Swapping must preserve the existing task page node');
            await menuAction('多项目上下文', '并排显示', '调整视图');
            await waitFor(() => separator()?.getAttribute('aria-orientation') === 'vertical', 'Side-by-side mode must restore');
            if (separator().getAttribute('aria-valuenow') !== horizontalRatio) throw new Error('Each orientation must retain its own split ratio');
            await overview();
            taskItem('Agent 运行状态').click();
            await waitFor(() => visiblePages().length === 2 && active() === 'Agent 运行状态', 'Task clicks must activate the whole split and focus the selected member');
            await menuAction('多项目上下文', '取消拆分视图', '调整视图');
            await waitFor(() => !separator() && visiblePages().length === 1, 'Unsplit must restore a single active page');
            if (tabs().length !== 3) throw new Error('Unsplit must retain both task tabs');
            await menuAction('任务工作区', '与当前标签拆分');
            await waitFor(() => visiblePages().length === 2 && !picker(), 'Inactive standalone tab must pair directly with the active tab');
            if (page('agent').getBoundingClientRect().left >= page('workspace').getBoundingClientRect().left) throw new Error('Previously active tab must be the left view');
            document.querySelector('button[aria-label="关闭标签：任务工作区"]').click();
            await waitFor(() => !separator() && active() === 'Agent 运行状态', 'Closing one half must restore its partner as a standalone page');
            await menuAction('Agent 运行状态', '关闭其他');
            await menuAction('Agent 运行状态', '拆分视图');
            await waitFor(() => picker()?.textContent.includes('没有可用于拆分的标签页'), 'Picker must handle no eligible tabs');
            const cancelPicker = picker().querySelector('header button[aria-label="取消拆分视图"]');
            if (!cancelPicker || cancelPicker.textContent.trim() || [...picker().querySelectorAll('button')].some(button => button.textContent === '取消拆分视图')) throw new Error('Picker cancellation must be a top-right close icon, not a bottom text button');
            if (cancelPicker.getBoundingClientRect().left < picker().getBoundingClientRect().left + picker().getBoundingClientRect().width / 2) throw new Error('Picker close icon must be right-aligned');
            cancelPicker.click();
            await waitFor(() => !separator() && tabs().length === 1, 'Closing pending picker must cancel splitting, not close the task');
            window.seedTabs();
            await waitFor(() => tabs().length === 3, 'Missing multiple split fixture');
            await menuAction('Agent 运行状态', '与当前标签拆分');
            window.addOpenTask('fourth', '任务四');
            await waitFor(() => tabs().length === 4 && active() === '任务四', 'Additional standalone tab missing');
            await menuAction('任务四', '拆分视图');
            await waitFor(() => picker(), 'Second split picker missing');
            if (picker().textContent.includes('任务工作区') || picker().textContent.includes('Agent 运行状态') || !picker().textContent.includes('多项目上下文')) throw new Error('Picker must exclude all already-split pages');
            [...picker().querySelectorAll('button')].find(button => button.textContent === '多项目上下文').click();
            await waitFor(() => document.querySelectorAll('.navo-tab-group[data-split="true"]').length === 2, 'Multiple independent two-page groups must be supported');
            await openMenu('任务工作区');
            if (!item('调整视图') || item('将标签页移至拆分视图') || item('拆分视图')) throw new Error('Split members must not support further nested splitting');
            document.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await waitFor(() => !document.querySelector('[role="menu"]'), 'Menu must close');
            window.removeTask('context');
            await waitFor(() => visiblePages().length === 1 && active() === '任务四' && !separator(), 'Deleting a split member must collapse its active group');
            const combinedHeader = document.querySelector('.navo-tab-group[data-split="true"]');
            const singleHeader = document.querySelector('.navo-tab-group[data-split="false"]');
            const dragFrom = center(combinedHeader.querySelector('[role="tab"]'));
            const groupCenter = center(combinedHeader);
            const destination = center(singleHeader);
            await window.testInput.drag(dragFrom, { x: dragFrom.x + destination.x - groupCenter.x + 10, y: dragFrom.y });
            await waitFor(() => document.querySelector('.navo-tab-group')?.textContent.includes('任务四'), 'Dragging a split tab must reorder the entire combination');
            if (document.querySelector('.navo-tab-group[data-split="true"]').querySelectorAll('[role="tab"]').length !== 2) throw new Error('Dragging must not separate paired tabs');
            const initialCount = tabs().length;
            for (let index = 0; index < 8; index += 1) window.addOpenTask('overflow-' + index, '验证标签栏溢出时加号仍然紧邻并可见的任务 ' + index);
            await waitFor(() => tabs().length === initialCount + 8, 'Missing overflow tabs');
            if (tabList().scrollWidth <= tabList().clientWidth) throw new Error('Long tab lists must scroll instead of expanding the header');
            if (Math.abs(createEntry().getBoundingClientRect().right - (window.innerWidth - 16)) > 1 || Math.abs(createEntry().getBoundingClientRect().left - tabList().getBoundingClientRect().right - 8) > 1) throw new Error('Overflowing tabs must fill the available space up to the right-aligned create button');
          })()\`);
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
