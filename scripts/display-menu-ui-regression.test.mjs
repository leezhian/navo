import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("显示选项内的排序下拉：外部点击、选值、Escape 与父弹层保持", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-display-menu-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({
    configFile: false, appType: "custom", root: process.cwd(),
    cacheDir: path.join(directory, "vite-cache"), logLevel: "error",
    plugins: [tailwindcss()], esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__display_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__display_test", `<style>*,*::before,*::after { animation:none !important; transition:none !important; }</style><div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/App.css';
      import i18n from '/src/i18n/index.ts';
      import { TooltipProvider } from '/src/components/ui/tooltip.tsx';
      import { TaskDisplayMenu } from '/src/components/tasks/TaskDisplayMenu.tsx';
      import { IssueDisplayMenu } from '/src/components/issues/IssueDisplayMenu.tsx';
      await i18n.changeLanguage('zh-CN');
      function Fixture() {
        const [tasks, setTasks] = React.useState({ mode: 'board', sortField: 'date', sortDirection: 'desc', showDate: true, showProject: true });
        const [issues, setIssues] = React.useState({ mode: 'list', sortField: 'date', sortDirection: 'desc', showDate: true, showProject: true, showStatus: true, showTag: true });
        return React.createElement(TooltipProvider, null, React.createElement('div', { style: { position: 'fixed', top: 60, right: 100, display: 'flex', gap: 20 } },
          React.createElement('section', { 'data-module': 'tasks' }, React.createElement(TaskDisplayMenu, { display: tasks, onDisplayChange: setTasks })),
          React.createElement('section', { 'data-module': 'issues' }, React.createElement(IssueDisplayMenu, { display: issues, onDisplayChange: setIssues })),
        ));
      }
      createRoot(document.getElementById('root')).render(React.createElement(Fixture));
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const preload = path.join(directory, "input.cjs");
    await writeFile(preload, `const { contextBridge, ipcRenderer } = require('electron'); contextBridge.exposeInMainWorld('input', { click: point => ipcRenderer.invoke('test:click', point), escape: () => ipcRenderer.invoke('test:escape') });`);
    const runner = path.join(directory, "run.cjs");
    await writeFile(runner, `
      const { app, BrowserWindow, ipcMain } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async () => {
        app.dock?.hide();
        const window = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { backgroundThrottling: false, preload: ${JSON.stringify(preload)} } });
        ipcMain.handle('test:click', async (_event, point) => {
          window.webContents.sendInputEvent({ type: 'mouseMove', ...point });
          window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
          await new Promise(resolve => setTimeout(resolve, 20));
          window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
        });
        ipcMain.handle('test:escape', () => {
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
          window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
        });
        try {
          await window.loadURL(${JSON.stringify(`http://127.0.0.1:${server.httpServer.address().port}/__display_test`)});
          window.webContents.debugger.attach('1.3');
          await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
          await window.webContents.executeJavaScript(\`(async () => {
            const pause = () => new Promise(resolve => setTimeout(resolve, 100));
            async function waitFor(check, message) {
              const deadline = Date.now() + 6000;
              while (Date.now() < deadline) { if (check()) return; await pause(); }
              throw new Error(message);
            }
            const panel = () => document.querySelector('[role="dialog"]');
            const list = () => document.querySelector('[role="listbox"]');
            const point = element => { const rect = element.getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }; };
            async function click(element) { await window.input.click(point(element)); await pause(); }
            async function openSort() {
              await click(panel().querySelector('[aria-label="排序属性"]'));
              await waitFor(() => list(), 'Missing sort dropdown');
            }
            for (const module of ['tasks', 'issues']) {
              await waitFor(() => document.querySelector('[data-module="' + module + '"] button'), 'Missing display trigger');
              const trigger = document.querySelector('[data-module="' + module + '"] button');
              await click(trigger);
              await waitFor(() => panel(), 'Missing display panel');
              for (let attempt = 0; attempt < 3; attempt += 1) {
                await openSort();
                const bounds = panel().getBoundingClientRect();
                const dismissPoint = attempt === 1 ? point(panel().querySelector('[role="radio"]')) : { x: Math.round(bounds.left + 5), y: Math.round(bounds.bottom - 5) };
                await window.input.click(dismissPoint);
                await waitFor(() => !list(), 'Clicking parent panel must close sort dropdown');
                if (!panel()) throw new Error(module + ': dismissing the sort dropdown inside the display panel must not close its parent');
                await waitFor(() => document.activeElement === panel().querySelector('[aria-label="排序属性"]'), 'Outside dismissal must restore dropdown trigger focus');
              }
              await openSort();
              await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === '标题'));
              await waitFor(() => !list(), 'Selecting a property must close dropdown');
              if (!panel() || !panel().querySelector('[aria-label="排序属性"]').textContent.includes('标题')) throw new Error('Selection must update sorting without closing display options');
              await openSort();
              await window.input.escape();
              await waitFor(() => !list(), 'First Escape must close only dropdown');
              if (!panel()) throw new Error('Escape must preserve parent while child is open');
              await waitFor(() => document.activeElement === panel().querySelector('[aria-label="排序属性"]'), 'Dropdown must return focus to its trigger');
              await window.input.escape();
              await waitFor(() => !panel(), 'Second Escape must close parent');
              await click(trigger);
              await openSort();
              await window.input.click({ x: 30, y: 600 });
              await waitFor(() => !list() && !panel(), 'Clicking outside both layers must dismiss the stack');
              await click(trigger);
              await waitFor(() => panel(), 'Parent must reopen after dismissal');
              await window.input.click({ x: 30, y: 600 });
              await waitFor(() => !panel(), 'Parent alone must still close on outside click');
            }
          })().catch(error => { throw new Error(error.stack); })\`);
          app.exit(0);
        } catch (error) { console.error(error.stack); app.exit(1); }
      });
    `);
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const result = await new Promise((resolve, reject) => {
      child = spawn(electron, [runner], { env: environment, stdio: ["ignore", "pipe", "pipe"], timeout: 45000 });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { output += chunk; });
      child.once("error", reject);
      child.once("exit", code => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
  } finally {
    child?.kill();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
