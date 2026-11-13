import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("目录拖入高亮、嵌套元素、移出、松开及禁用反馈", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-drop-feedback-"));
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
  server.middlewares.use("/__drop_area_test", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__drop_area_test", `<div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/i18n/index.ts';
      import { ResourceDropArea } from '/src/components/settings/ResourceDropArea.tsx';
      import { flushSync } from 'react-dom';
      const root = createRoot(document.getElementById('root'));
      window.dropCount = 0;
      window.flushReact = flushSync;
      window.renderDropArea = (disabled = false) => flushSync(() => root.render(
        React.createElement(ResourceDropArea, { disabled, onChooseFolder: () => {}, onDrop: () => { window.dropCount += 1; } })
      ));
      window.renderDropArea();

    </script>`));
  });
  let child;
  try {
    await server.listen();
    const address = server.httpServer.address();
    const runner = path.join(directory, "drop-area.cjs");
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
          await window.loadURL(${JSON.stringify(`http://127.0.0.1:${address.port}/__drop_area_test`)});
          const result = await window.webContents.executeJavaScript(\`(async () => {
            async function waitFor(check, message) {
              const deadline = Date.now() + 12000;
              while (Date.now() < deadline) {
                if (check()) return;
                await new Promise(resolve => setTimeout(resolve, 25));
              }
              throw new Error(message);
            }
            await waitFor(() => document.querySelector('.resource-drop-area'), 'Drop area did not mount');
            const area = document.querySelector('.resource-drop-area');
            const button = area.querySelector('button');
            const payload = new DataTransfer();
            payload.items.add(new File([''], 'folder'));
            const textPayload = new DataTransfer();
            textPayload.setData('text/plain', 'not a folder');
            async function dispatch(target, type, dataTransfer = payload) {
              const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
              if (type === 'dragenter' && dataTransfer === payload && !event.dataTransfer.types.includes('Files')) throw new Error('Missing file transfer types');
              window.flushReact(() => target.dispatchEvent(event));
              if (type === 'dragenter' && !event.defaultPrevented) throw new Error('Drag handler was not invoked: ' + area.outerHTML);
              await new Promise(resolve => setTimeout(resolve, 0));
            }
            async function assertActive(expected) {
              await waitFor(() => area.dataset.dragActive === String(expected), 'Drag state did not settle');
            }
            await dispatch(area, 'dragenter');
            await assertActive(true);
            if (!area.textContent.includes('Release to add folder')) throw new Error('Missing release feedback');
            await dispatch(button, 'dragenter');
            await dispatch(area, 'dragleave');
            await assertActive(true);
            await dispatch(button, 'dragleave');
            await assertActive(false);
            await dispatch(area, 'dragenter');
            await dispatch(area, 'drop');
            await assertActive(false);
            if (window.dropCount !== 1) throw new Error('Folder drop was not forwarded exactly once');
            await dispatch(area, 'dragenter', textPayload);
            await assertActive(false);
            await dispatch(area, 'drop', textPayload);
            if (window.dropCount !== 1) throw new Error('Text drop should not import a folder');
            await dispatch(area, 'dragenter');
            window.renderDropArea(true);
            await assertActive(false);
            await dispatch(area, 'dragover');
            if (payload.dropEffect !== 'none') throw new Error('Disabled drop should be rejected');
            await dispatch(area, 'drop');
            if (window.dropCount !== 1) throw new Error('Disabled drop should not import');
            window.renderDropArea(false);
            await assertActive(false);
            await dispatch(area, 'dragenter');
            await dispatch(area, 'dragend');
            await assertActive(false);
            return 'Drop feedback passed';

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
