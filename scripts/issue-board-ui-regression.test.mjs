import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("属性排序、任务跨状态拖拽、列表看板与刷新冷却", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-issue-board-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({
    configFile: false, appType: "custom", root: process.cwd(),
    cacheDir: path.join(directory, "vite-cache"), logLevel: "error",
    plugins: [tailwindcss()],
    esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__issue_board_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__issue_board_test", `<style>*,*::before,*::after { animation: none !important; transition: none !important; }</style><div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import App from '/src/App.tsx';
      import { useTaskStore } from '/src/stores/taskStore.ts';
      import { useIssueStore } from '/src/stores/issueStore.ts';
      import { useSettingsStore } from '/src/stores/settingsStore.ts';
      import { defaultSettings } from '/src/domain/settings.ts';
      import i18n from '/src/i18n/index.ts';
      await i18n.changeLanguage('zh-CN');
      useSettingsStore.setState({ loaded: true, settings: {...defaultSettings, locale: 'zh-CN'} });
      const tasks = ['任务工作区', 'Agent 运行状态', '多项目上下文'].map((title, index) => ({
        id: ['workspace', 'agent', 'context'][index], title, description: '任务正文：' + title,
        status: 'TODO', date: ['2026-10-02', '2026-10-03', '2026-10-01'][index], projectName: 'navo', links: [], resources: [], attachments: [],
      }));
      window.navo = {
        window: { getIsFullScreen: async () => false, onFullScreenChange: () => () => {} },
        settings: { getLogsStatus: async () => ({ failed: false }) },
        tasks: { load: async () => ({ tasks, recoveryWarnings: [] }), previewAttachment: async () => null },
      };
      const root = createRoot(document.getElementById('root'));
      useIssueStore.setState({ items: [
        { id: 'pr1', group: 'PR', title: 'PR One', tag: 'feature', projectName: 'navo', status: 'review', date: '2026-10-01' },
        { id: 'pr2', group: 'PR', title: 'PR Two', tag: 'fix', projectName: 'other', status: 'draft', date: '2026-10-04' },
        { id: 'pr3', group: 'PR', title: 'PR Three', tag: 'feature', projectName: 'navo', status: 'merged', date: '2026-10-02' },
        { id: 'issue1', group: 'ISSUE', title: 'Issue One', tag: 'fix', projectName: 'navo', status: 'todo', date: '2026-10-03' },
        { id: 'issue2', group: 'ISSUE', title: 'Issue Two', tag: 'discussion', projectName: 'navo', status: 'progress', date: '2026-10-02' },
      ] });
      window.issueItems = () => useIssueStore.getState().items;
      window.taskItems = () => useTaskStore.getState().tasks;
      let clockOffset = 0;
      const actualNow = Date.now;
      Date.now = () => actualNow() + clockOffset;
      window.advanceClock = (milliseconds) => { clockOffset += milliseconds; window.dispatchEvent(new Event('focus')); };
      window.refreshCalls = 0;
      window.navo.tasks.load = () => {
        window.refreshCalls += 1;
        return new Promise(resolve => { window.finishRefresh = () => resolve({ tasks: useTaskStore.getState().tasks.map(task => ({ ...task, title: task.title + ' refreshed' })), recoveryWarnings: [] }); });
      };
      window.taskMoves = [];
      window.navo.tasks.move = async (id, status, beforeId) => {
        window.taskMoves.push({ id, status, beforeId });
        const tasks = useTaskStore.getState().tasks;
        const current = tasks.find(task => task.id === id);
        const remaining = tasks.filter(task => task.id !== id);
        const index = beforeId === null ? remaining.length : remaining.findIndex(task => task.id === beforeId);
        remaining.splice(index, 0, {...current, status});
        return remaining;
      };
      useTaskStore.setState({ tasks, loaded: true });
      root.render(React.createElement(App));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const preload = path.join(directory, "test-input.cjs");
    await writeFile(preload, `const { contextBridge, ipcRenderer } = require('electron'); contextBridge.exposeInMainWorld('testInput', { drag: (from, to) => ipcRenderer.invoke('test:drag', from, to), hover: point => ipcRenderer.invoke('test:hover', point), click: point => ipcRenderer.invoke('test:click', point), press: key => ipcRenderer.invoke('test:press', key) });`);
    const runner = path.join(directory, "issue-board.cjs");
    await writeFile(runner, `
      const { app, BrowserWindow, ipcMain } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async () => {
        app.dock?.hide();
        const window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { backgroundThrottling: false, preload: ${JSON.stringify(preload)} } });
        ipcMain.handle('test:hover', (_event, point) => window.webContents.sendInputEvent({ type: 'mouseMove', ...point }));
        ipcMain.handle('test:click', (_event, point) => {
          window.webContents.sendInputEvent({ type: 'mouseMove', ...point });
          window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
          window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
        });
        ipcMain.handle('test:press', (_event, key) => {
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
          window.webContents.sendInputEvent({ type: 'char', keyCode: key === 'Enter' ? String.fromCharCode(13) : ' ' });
          window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
        });
        ipcMain.handle('test:drag', async (_event, from, to) => {
          window.webContents.sendInputEvent({ type: 'mouseMove', ...from });
          window.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
          for (let step = 1; step <= 12; step += 1) {
            await new Promise(resolve => setTimeout(resolve, 16));
            window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * step / 12), y: Math.round(from.y + (to.y - from.y) * step / 12), button: 'left', modifiers: ['leftButtonDown'] });
          }
          const feedback = await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.readDragFeedback?.()))))");
          window.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 });
          return feedback;
        });
        try {
          await window.loadURL(${JSON.stringify(`http://127.0.0.1:${server.httpServer.address().port}/__issue_board_test`)});

          window.webContents.debugger.attach("1.3");
          await window.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
          await window.webContents.executeJavaScript(\`(async () => {
            const pause = (duration = 300) => new Promise(resolve => setTimeout(resolve, duration));
            async function waitFor(check, message) {
              const deadline = Date.now() + 6000;
              while (Date.now() < deadline) { if (check()) return; await pause(25); }
              throw new Error(message);
            }
            const board = () => document.querySelector('.issue-board');
            const card = id => board()?.querySelector('[data-board-item="' + id + '"]');
            const group = name => board()?.querySelector('[data-board-group="' + name + '"]');
            const order = name => [...group(name).querySelectorAll('[data-board-item]')].map(item => item.dataset.boardItem).join(',');
            const center = element => { const rect = element.getBoundingClientRect(); return {x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2)}; };
            const sidebar = () => document.querySelector('aside.task-details-panel');
            window.readDragFeedback = () => ({
              groups: [...document.querySelectorAll('[data-drop-target="true"]')].map(group => group.dataset.boardGroup),
              targetPlaceholders: document.querySelectorAll('[data-drop-target="true"] [data-board-placeholder]').length,
              sourcePlaceholders: document.querySelectorAll('[data-board-placeholder]').length,
            });
            async function closePanel() {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
              await pause();
            }
            async function displayPanel() {
              if (!document.querySelector('[aria-label="Issue 显示方式"]')) document.querySelector('.issue-panel-content button[aria-label="Issue 显示选项"]').click();
              await waitFor(() => document.querySelector('[aria-label="Issue 显示方式"]'), 'Missing Issue display menu');
            }
            async function mode(value) {
              await displayPanel();
              document.querySelector('[aria-label="Issue 显示方式"] [value="' + value + '"]').click();
              await closePanel();
            }
            async function sorting(label) {
              await displayPanel();
              document.querySelector('[aria-label="排序属性"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              await waitFor(() => document.querySelector('[role="option"]'), 'Missing sort options');
              if ([...document.querySelectorAll('[role="option"]')].some(option => option.textContent === '自定义顺序')) throw new Error('Manual sorting must be removed');
              [...document.querySelectorAll('[role="option"]')].find(option => option.textContent === label).click();
              await waitFor(() => !document.querySelector('[role="listbox"]'), 'Sort selection must close');
              await closePanel();
            }
            async function dragCard(id, to) {
              await window.testInput.drag(center(card(id)), to);
              await pause();
              await waitFor(() => !document.querySelector('.task-drag-overlay'), 'Drag must settle');
            }
            async function filterProject() {
              document.querySelector('[aria-label="过滤条目"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              await waitFor(() => document.querySelector('[role="menu"]'), 'Missing filter menu');
              [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === '项目').click();
              await waitFor(() => document.querySelector('[role="menuitemcheckbox"]'), 'Missing projects');
              [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(item => item.textContent.startsWith('navo')).click();
              await closePanel();
              await closePanel();
            }
            await waitFor(() => document.querySelector('[aria-label="Issue"]'), 'Missing app');
            const initiallyDark = document.documentElement.classList.contains('dark');
            for (const dark of [false, true]) {
              document.documentElement.classList.toggle('dark', dark);
              document.querySelector('[aria-label="查看任务：任务工作区"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 160, clientY: 180 }));
              const deleteItem = () => [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === '删除');
              await waitFor(() => deleteItem(), 'Missing task delete menu item');
              await pause(80);
              const warningColor = getComputedStyle(deleteItem()).color;
              const initialBackground = getComputedStyle(deleteItem()).backgroundColor;
              await window.testInput.hover({ x: 20, y: 20 });
              await window.testInput.hover(center(deleteItem()));
              await waitFor(() => document.activeElement === deleteItem(), 'Delete item must receive focus');
              if (getComputedStyle(deleteItem()).color !== warningColor) throw new Error('Delete hover must preserve warning text color');
              if (getComputedStyle(deleteItem()).backgroundColor === initialBackground) throw new Error('Delete hover must show a warning background');
              await closePanel();
            }
            document.documentElement.classList.toggle('dark', initiallyDark);
            document.querySelector('[aria-label="Issue"]').click();
            await waitFor(() => document.querySelectorAll('.issue-row').length === 5, 'Default must be list');
            if (board()) throw new Error('Board must not be the default');
            document.querySelector('[aria-label="PR 分组"]').click();
            await pause();
            await mode('board');
            if (board().querySelectorAll('[data-board-group]').length !== 2 || order('PR') !== 'pr2,pr3,pr1') throw new Error('Board must group by type and default to newest date');
            const originalIssues = JSON.stringify(window.issueItems());
            await dragCard('pr1', center(card('pr2')));
            await dragCard('pr3', center(card('issue1')));
            if (JSON.stringify(window.issueItems()) !== originalIssues || order('PR') !== 'pr2,pr3,pr1') throw new Error('Issue dragging must not reorder or change type');
            await displayPanel();
            document.querySelector('[aria-label="降序，点击切换为升序"]').click();
            await closePanel();
            if (order('PR') !== 'pr1,pr3,pr2') throw new Error('Direction icon must reverse date order');
            await sorting('项目');
            if (order('PR') !== 'pr1,pr3,pr2') throw new Error('Project sorting must preserve ascending direction');
            await displayPanel();
            document.querySelector('[aria-label="升序，点击切换为降序"]').click();
            await closePanel();
            if (order('PR') !== 'pr2,pr1,pr3') throw new Error('Project descending must be independent of date order');
            await sorting('标题');
            if (order('PR') !== 'pr2,pr3,pr1') throw new Error('Title property must preserve descending direction');
            await sorting('项目');
            await mode('list');
            if (document.querySelector('[aria-label="PR 分组"]').getAttribute('aria-expanded') !== 'false') throw new Error('List collapse must survive view switching');
            document.querySelector('[aria-label="PR 分组"]').click();
            await pause();
            const rowTitles = [...document.querySelectorAll('#issue-group-pr + div .issue-row-title')].map(item => item.textContent);
            if (rowTitles.join(',') !== 'PR Two,PR One,PR Three') throw new Error('List must share sort property and direction');
            await mode('board');
            await filterProject();
            if (card('pr2') || order('PR') !== 'pr1,pr3') throw new Error('Filtering must preserve attribute sorting');
            document.querySelector('.issue-panel-content .workspace-toolbar button').click();
            await waitFor(() => card('pr2'), 'Reset must restore hidden item');
            card('pr1').querySelector('[role="button"]').click();
            await waitFor(() => sidebar()?.textContent.includes('PR One'), 'Board card opens details');
            await mode('list');
            if (!sidebar()?.textContent.includes('PR One')) throw new Error('View switch must preserve details selection');
            await mode('board');
            document.querySelector('[aria-label="Tasks"]').click();
            await pause();
            document.querySelector('[aria-label="Issue"]').click();
            await pause();
            if (!board() || board().closest('[hidden]')) throw new Error('Module switch must preserve board mode');
            document.querySelector('[aria-label="Tasks"]').click();
            await pause();
            const taskRoot = () => document.querySelector('.task-panel-content');
            const taskCard = id => taskRoot().querySelector('[data-task-id="' + id + '"]');
            const taskGroup = status => taskRoot().querySelector('[data-board-group="' + status + '"]');
            const taskOrder = status => [...taskGroup(status).querySelectorAll('[data-task-id]')].map(item => item.dataset.taskId).join(',');
            async function taskDrag(id, target) {
              const expectedStatus = document.elementFromPoint(target.x, target.y)?.closest('[data-board-group]')?.dataset.boardGroup;
              const sourceStatus = window.taskItems().find(item => item.id === id).status;
              const feedback = await window.testInput.drag(center(taskCard(id)), target);
              if (feedback.targetPlaceholders || feedback.sourcePlaceholders !== 1) throw new Error('Only the source may keep a placeholder while dragging');
              if (expectedStatus && expectedStatus !== sourceStatus) {
                if (feedback.groups.join(',') !== expectedStatus) throw new Error('Valid drop group must highlight');
              } else if (feedback.groups.length) throw new Error('Same-status and invalid drop areas must not show acceptance feedback');
              await waitFor(() => !document.querySelector('.task-drag-overlay'), 'Task drag must settle or cancel');
              await pause();
              if (document.querySelector('[data-drop-target="true"]')) throw new Error('Drop feedback must clear after the drag');
            }
            if (taskOrder('TODO') !== 'agent,workspace,context') throw new Error('Tasks must default to date descending');
            await taskDrag('workspace', center(taskCard('agent')));
            if (window.taskMoves.length || taskOrder('TODO') !== 'agent,workspace,context') throw new Error('Dragging within the same status must not save or change order');
            const emptyTarget = taskGroup('DONE').querySelector('[data-board-content]').getBoundingClientRect();
            await taskDrag('workspace', { x: Math.round(emptyTarget.x + emptyTarget.width / 2), y: Math.round(emptyTarget.y + 35) });
            if (window.taskItems().find(item => item.id === 'workspace').status !== 'DONE') throw new Error('Task cross-status dragging must work under date sorting');
            const doneBounds = taskGroup('DONE').getBoundingClientRect();
            await taskDrag('agent', { x: Math.round(doneBounds.x + doneBounds.width / 2), y: Math.round(doneBounds.bottom - 25) });
            if (taskOrder('DONE') !== 'agent,workspace') throw new Error('Cross-status drop must use attribute order, not pointer insertion position');
            await taskDrag('context', { x: 1100, y: 30 });
            if (window.taskMoves.length !== 2) throw new Error('Invalid drop must not save');
            taskRoot().querySelector('[aria-label="显示选项"]').click();
            await waitFor(() => document.querySelector('[aria-label="任务显示方式"]'), 'Missing Tasks display settings');
            document.querySelector('[aria-label="任务显示方式"] [value="list"]').click();
            await closePanel();
            const groupButton = status => taskGroup(status).querySelector('[aria-expanded]');
            if (['TODO', 'DONE', 'ARCHIVED'].some(status => groupButton(status).getAttribute('aria-expanded') !== 'true')) throw new Error('Task list groups must default to expanded');
            await window.testInput.click(center(groupButton('DONE')));
            await waitFor(() => groupButton('DONE').getAttribute('aria-expanded') === 'false' && !taskCard('workspace'), 'Clicking the group header must collapse its items');
            if (groupButton('TODO').getAttribute('aria-expanded') !== 'true') throw new Error('Task groups must collapse independently');
            for (const value of ['board', 'list']) {
              taskRoot().querySelector('[aria-label="显示选项"]').click();
              await waitFor(() => document.querySelector('[aria-label="任务显示方式"]'), 'Missing view controls');
              document.querySelector('[aria-label="任务显示方式"] [value="' + value + '"]').click();
              await closePanel();
            }
            if (groupButton('DONE').getAttribute('aria-expanded') !== 'false') throw new Error('Collapsed task groups must survive layout switching');
            document.querySelector('[aria-label="Issue"]').click();
            await pause();
            document.querySelector('[aria-label="Tasks"]').click();
            await pause();
            if (groupButton('DONE').getAttribute('aria-expanded') !== 'false') throw new Error('Collapsed task groups must survive module navigation');
            groupButton('ARCHIVED').focus();
            await waitFor(() => document.activeElement === groupButton('ARCHIVED'), 'Group header must be keyboard focusable');
            await window.testInput.press('Enter');
            await waitFor(() => groupButton('ARCHIVED').getAttribute('aria-expanded') === 'false', 'Enter must collapse an empty group');
            await window.testInput.press('Space');
            await waitFor(() => groupButton('ARCHIVED').getAttribute('aria-expanded') === 'true', 'Space must expand an empty group');
            await window.testInput.click(center(groupButton('DONE')));
            await waitFor(() => taskCard('workspace'), 'Reopening must restore the task rows');
            await taskDrag('workspace', center(taskCard('agent')));
            if (window.taskMoves.length !== 2 || taskOrder('DONE') !== 'agent,workspace') throw new Error('List must not allow manual reordering');
            await window.testInput.click(center(groupButton('DONE')));
            await waitFor(() => !taskCard('workspace'), 'Destination group must be collapsed before drop');
            await taskDrag('context', center(taskGroup('DONE').querySelector('header')));
            if (groupButton('DONE').getAttribute('aria-expanded') !== 'false' || !groupButton('DONE').textContent.includes('3')) throw new Error('Dropping into a collapsed group must update count without opening it');
            await window.testInput.click(center(groupButton('DONE')));
            await waitFor(() => taskCard('workspace'), 'Group must reopen after accepting a drop');
            if (taskOrder('DONE') !== 'agent,workspace,context') throw new Error('List drag onto group header must change status and auto-sort');
            await taskDrag('workspace', center(taskGroup('TODO').querySelector('header')));
            if (taskOrder('TODO') !== 'workspace') throw new Error('List must accept a drop into an empty status group');
            taskRoot().querySelector('[aria-label="显示选项"]').click();
            await waitFor(() => document.querySelector('[aria-label="任务显示方式"]'), 'Missing Tasks display settings');
            document.querySelector('[aria-label="降序，点击切换为升序"]').click();
            await closePanel();
            await taskDrag('workspace', center(taskGroup('DONE').querySelector('header')));
            if (taskOrder('DONE') !== 'context,workspace,agent') throw new Error('List cross-status drop must respect ascending sort');
            if (window.taskMoves.some(move => move.beforeId !== null)) throw new Error('Drag must not submit a manual insertion position');
            const taskRefresh = () => document.querySelector('.task-panel-content [aria-label="刷新"]');
            const issueRefresh = () => document.querySelector('.issue-panel-content [aria-label="刷新"]');
            const initialStorage = JSON.stringify({ ...localStorage });
            if (taskRefresh().disabled || issueRefresh().disabled) throw new Error('Fresh app must allow immediate refresh');
            const taskToolbarButtons = [...document.querySelectorAll('.task-panel-content .workspace-toolbar button')];
            if (taskToolbarButtons.at(-1) !== taskRefresh()) throw new Error('Refresh must be after display options');
            taskRefresh().click();
            taskRefresh().click();
            await waitFor(() => taskRefresh().getAttribute('aria-busy') === 'true', 'Refresh must show loading');
            if (!taskRefresh().disabled || window.refreshCalls !== 1) throw new Error('Repeated refresh must not start duplicate loads');
            if (!document.querySelector('[data-task-id="workspace"]')) throw new Error('Refreshing must not empty the list');
            window.advanceClock(61000);
            if (!taskRefresh().disabled) throw new Error('Pending requests must stay disabled even after a minute');
            window.finishRefresh();
            await waitFor(() => taskRefresh().parentElement.getAttribute('aria-label') === '60 秒', 'Cooldown must start at 60 after completion');
            if (!window.taskItems()[0].title.endsWith(' refreshed')) throw new Error('Refresh must update actual task data');
            await window.testInput.hover(center(taskRefresh().parentElement));
            await waitFor(() => document.querySelector('[role="tooltip"]')?.textContent === '60 秒', 'Disabled refresh must show only seconds on hover');
            await waitFor(() => document.querySelector('[role="tooltip"]')?.textContent === '59 秒', 'Tooltip countdown must tick');
            taskRefresh().click();
            if (window.refreshCalls !== 1) throw new Error('Cooldown must block refresh');
            document.querySelector('[aria-label="Issue"]').click();
            await pause();
            if (issueRefresh().disabled) throw new Error('Issue and Tasks must have independent cooldowns');
            const issueIds = window.issueItems().map(item => item.id).reverse().join(',');
            const displayedIssueOrder = order('PR');
            localStorage.setItem('navo:development:issues', JSON.stringify(window.issueItems().slice().reverse().map(item => ({ ...item, title: item.title + ' updated' }))));
            issueRefresh().click();
            await waitFor(() => issueRefresh().disabled, 'Issue refresh must enter cooldown');
            if (window.issueItems().map(item => item.id).join(',') !== issueIds || !window.issueItems()[0].title.endsWith(' updated') || order('PR') !== displayedIssueOrder) throw new Error('Issue refresh must read data and preserve sort settings');
            await mode('list');
            if (!issueRefresh().disabled) throw new Error('View switching must preserve cooldown');
            document.querySelector('[aria-label="Tasks"]').click();
            await pause();
            if (!taskRefresh().disabled) throw new Error('Module switching must preserve cooldown');
            window.advanceClock(61000);
            await waitFor(() => !taskRefresh().disabled && !issueRefresh().disabled, 'Elapsed wall time must release cooldown');
            window.navo.tasks.load = async () => { throw new Error('Refresh test failure'); };
            const previousTasks = JSON.stringify(window.taskItems());
            taskRefresh().click();
            await waitFor(() => document.querySelector('.task-panel-content [role="alert"]'), 'Failed refresh must show an error');
            if (!taskRefresh().disabled || previousTasks !== JSON.stringify(window.taskItems())) throw new Error('Failed refresh must preserve data and keep cooldown');
            const finalStorage = { ...localStorage };
            delete finalStorage['navo:development:issues'];
            if (JSON.stringify(finalStorage) !== initialStorage) throw new Error('Cooldown must not write persistent storage');
          })().catch(error => { throw new Error(error.stack); })\`);
          await window.loadURL(window.webContents.getURL());
          await window.webContents.executeJavaScript(\`(async () => {
            const deadline = Date.now() + 6000;
            while (!document.querySelector('.issue-panel-content [aria-label="刷新"]')) {
              if (Date.now() > deadline) throw new Error('App did not remount');
              await new Promise(resolve => setTimeout(resolve, 25));
            }
            if (document.querySelector('.task-panel-content [aria-label="刷新"]').disabled || document.querySelector('.issue-panel-content [aria-label="刷新"]').disabled) throw new Error('New app runtime must allow refresh immediately');
          })()\`);
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
