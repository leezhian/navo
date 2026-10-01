import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("外观预览在冷启动 StrictMode、重新挂载和切换主题后均显示代码", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-preview-"));
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
  server.middlewares.use("/__preview_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__preview_test", `<div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/i18n/index.ts';
      import { DiffPreview } from '/src/components/settings/DiffPreview.tsx';
      import { defaultSettings } from '/src/domain/settings.ts';
      const root = createRoot(document.getElementById('root'));
      window.renderPreview = (visible, overrides = {}) => root.render(
        React.createElement(React.StrictMode, null, visible && React.createElement(DiffPreview, {
          resolvedTheme: 'light', settings: { ...defaultSettings, ...overrides }
        }))
      );
      window.renderPreview(true);
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const address = server.httpServer.address();
    const runner = path.join(directory, "preview.cjs");
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
          await window.loadURL(${JSON.stringify(`http://127.0.0.1:${address.port}/__preview_test`)});
          const result = await window.webContents.executeJavaScript(\`(async () => {
            async function waitFor(check, message) {
              const deadline = Date.now() + 12000;
              while (Date.now() < deadline) {
                if (check()) return;
                await new Promise(resolve => setTimeout(resolve, 25));
              }
              throw new Error(message);
            }
            const codeVisible = () => [...document.querySelectorAll('diffs-container')].some(
              element => element.shadowRoot?.querySelector('code')?.textContent.includes('config')
            );
            await waitFor(() => document.querySelector('.settings-preview'), 'Preview component failed to mount');
            await waitFor(codeVisible, 'Cold first mount: preview code is missing');
            window.renderPreview(false);
            await waitFor(() => !document.querySelector('.settings-preview'), 'Preview did not unmount');
            window.renderPreview(true, { diffCodeFontSize: 18, diffViewMode: 'unified' });
            await waitFor(codeVisible, 'Remounted preview code is missing');
            const previousPreview = document.querySelector('diffs-container');
            window.renderPreview(true, { diffLightTheme: 'github-light', diffDarkTheme: 'github-dark' });
            await waitFor(() => document.querySelector('diffs-container') !== previousPreview && codeVisible(), 'Preview code is missing after changing theme');
            return 'Preview code visible on cold mount, remount and theme change';
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
