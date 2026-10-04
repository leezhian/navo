import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("顶部标签右键菜单：定位、关闭、关闭其他与占位项", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-tabs-ui-"));
  const server = await createServer({
    configFile: false, appType: "custom", root: process.cwd(),
    cacheDir: path.join(directory, "vite-cache"), logLevel: "error",
    esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__tabs_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__tabs_test", `<div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { WorkspaceHeaderTabs } from '/src/components/layout/WorkspaceHeaderTabs.tsx';
      import i18n from '/src/i18n/index.ts';
      await i18n.changeLanguage('zh-CN');
      const root = createRoot(document.getElementById('root'));
      let version = 0;
      window.resetTabs = () => root.render(React.createElement(WorkspaceHeaderTabs, { key: ++version }));
      window.resetTabs();
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "tabs.cjs");
    await writeFile(runner, `
      const { app, BrowserWindow } = require('electron');
      app.setPath('userData', ${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async () => {
        app.dock?.hide();
        const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
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
            async function openMenu(title, clientX = 80, clientY = 80) {
              tab(title).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, isPrimary: true, pointerType: 'mouse' }));
              tab(title).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX, clientY }));
              await waitFor(() => document.querySelector('[role="menu"]'), 'Missing tab menu');
            }
            await waitFor(() => tabs().length === 3, 'Missing placeholder tabs');
            await openMenu('Agent 运行状态');
            await waitFor(() => Math.abs((menuRect()?.top ?? -1000) - 80) < 5, 'Initial menu not positioned');
            const first = menuRect();
            await openMenu('Agent 运行状态', 320, 200);
            await waitFor(() => Math.abs(menuRect().left - first.left - 240) < 5 && Math.abs(menuRect().top - 200) < 5, 'Repeated right-click must follow pointer');
            if (active() !== '任务工作区' || document.querySelector('[data-dragging="true"]')) throw new Error('Right-click must not activate or drag a tab');
            if (!item('拆分视图')?.textContent.includes('TODO') || item('拆分视图').getAttribute('aria-disabled') !== 'true') throw new Error('Split view must be a disabled TODO');
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
            window.resetTabs();
            await waitFor(() => tabs().length === 3, 'Fixture reset failed');
            await openMenu('多项目上下文');
            item('关闭其他').click();
            await waitFor(() => tabs().length === 1 && active() === '多项目上下文', 'Close others must retain and activate its inactive target');
            document.querySelector('button[aria-label="关闭标签：多项目上下文"]').click();
            await waitFor(() => tabs().length === 0, 'Existing close button must still work');
            window.resetTabs();
            await waitFor(() => tabs().length === 3, 'Second reset failed');
            tab('多项目上下文').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            await waitFor(() => active() === '多项目上下文', 'Tab keyboard activation failed');
            await openMenu('多项目上下文');
            item('关闭').click();
            await waitFor(() => tabs().length === 2 && active() === 'Agent 运行状态', 'Closing rightmost active tab must select the left neighbor');
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
