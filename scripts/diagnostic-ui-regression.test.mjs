import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import electron from "electron";
import { createServer } from "vite";

test("React 异常显示恢复入口并上报一次，窗口异常上报不包含原始消息且不会递归", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-diagnostic-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({
    configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error",
    plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use("/__diagnostic", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__diagnostic", `<div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/App.css';
      import i18n from '/src/i18n/index.ts';
      import { ApplicationErrorBoundary } from '/src/components/layout/ApplicationErrorBoundary.tsx';
      import { bindRendererDiagnostics, reportRendererError } from '/src/services/rendererDiagnostics.ts';
      await i18n.changeLanguage('zh-CN');
      window.reports=[];
      window.navo={diagnostics:{report:async value=>{window.reports.push(value);if(window.rejectReports)throw new Error('offline');}}};
      bindRendererDiagnostics(); bindRendererDiagnostics();
      function BrokenView(){
        const [broken,setBroken]=React.useState(false);
        if(broken)throw new Error('PRIVATE_TASK_DESCRIPTION');
        return React.createElement('button',{onClick:()=>setBroken(true)},'trigger');
      }
      createRoot(document.getElementById('root'),{onUncaughtError:error=>reportRendererError('react-error',error)}).render(
        React.createElement(ApplicationErrorBoundary,null,React.createElement(BrokenView))
      );
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "run.cjs");
    await writeFile(runner, `
      const {app,BrowserWindow}=require('electron');
      app.setPath('userData',${JSON.stringify(path.join(directory, "user-data"))});
      app.whenReady().then(async()=>{
        app.dock?.hide();
        const window=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
        try{
          await window.loadURL(${JSON.stringify("http://127.0.0.1:" + server.httpServer.address().port + "/__diagnostic")});
          await window.webContents.executeJavaScript(\`(async()=>{
            async function wait(check){const end=Date.now()+6000;while(Date.now()<end){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Missing renderer diagnostic state');}
            await wait(()=>document.querySelector('button')?.textContent==='trigger');
            document.querySelector('button').click();
            await wait(()=>document.querySelector('[role="alert"]'));
            if(document.querySelector('button').textContent!=='重新加载')throw new Error('Missing reload action');
            if(window.reports.length!==1||window.reports[0].kind!=='react-error')throw new Error('React error must be reported exactly once');
            if(JSON.stringify(window.reports).includes('PRIVATE_TASK_DESCRIPTION')||'message' in window.reports[0])throw new Error('Raw React error messages must not be sent');
            const error=new TypeError('PRIVATE_RUNTIME_ERROR');
            window.dispatchEvent(new ErrorEvent('error',{error}));
            window.dispatchEvent(new ErrorEvent('error',{error}));
            await wait(()=>window.reports.length===2);
            window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('PRIVATE_REJECTION')}));
            await wait(()=>window.reports.length===3);
            window.rejectReports=true;
            window.dispatchEvent(new ErrorEvent('error',{error:new Error('PRIVATE_REPORT_FAILURE')}));
            await new Promise(resolve=>setTimeout(resolve,100));
            if(window.reports.length!==4||JSON.stringify(window.reports).includes('PRIVATE_'))throw new Error('Reporting must not recurse or expose messages');
          })()\`);
          app.exit(0);
        }catch(error){console.error(error.stack);app.exit(1);}
      });
    `);
    let output = "";
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(electron, [runner], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(code, 0, output);
  } finally {
    child?.kill(); await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
