import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import electron from "electron";
import { createServer } from "vite";

async function browserAssertions() {
  const wait = async (check, message) => { for (let i = 0; i < 150; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error(message); };
  const button = () => document.querySelector("button");
  await wait(() => button(), "Context action missing");
  if (!button().getAttribute("aria-label").includes("上下文文件")) throw Error("File mode label missing");
  if (document.querySelector("input,textarea,[contenteditable=true]")) throw Error("A separate composer must not be added");
  button().click(); await wait(() => window.copied.length === 1, "Reading reminder not copied");
  if (window.copied[0] !== "Read /fixture/context.json" || window.reads !== 1 || window.writes !== 0) throw Error("Copy must refresh context without writing to terminal");
  await wait(() => button().querySelector(".lucide-check"), "Copy feedback missing");
  if (document.querySelector("[role=dialog]")) throw Error("Copy must not open a dialog");
  window.renderMode("file", false); await wait(() => button().disabled, "Stopped session must not offer a stale file");
  window.renderMode("file", true, true); await wait(() => !button().disabled, "Retry must remain available");
  await wait(() => button().getAttribute("aria-label").includes("同步失败"), "File sync failure is not visible");
  window.fail = true; button().click(); await wait(() => button().getAttribute("aria-label").includes("无法更新"), "Copy failure not reported");
  if (window.copied.length !== 1 || window.writes !== 0) throw Error("Failed read must not copy or submit data");
  window.fail = false; window.renderMode("dynamic"); await wait(() => button().getAttribute("aria-label").includes("动态共享上下文"), "MCP mode changed");
  button().click(); if (window.reads !== 2) throw Error("MCP tooltip must not request file data");
  window.renderMode("file", true, false, true); await wait(() => button().disabled, "Archived task must not expose copy");
  await window.setLocale("en"); window.renderMode("file", true); await wait(() => button().getAttribute("aria-label").includes("context file"), "English label missing");
  if (window.writes !== 0) throw Error("Context action must never submit PTY input");
}

test("Context action copies the reading reminder with clear status and adds no composer or terminal writes", { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-context-action-ui-"));
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const server = await createServer({ configFile: false, appType: "custom", root: process.cwd(), cacheDir: path.join(directory, "cache"), logLevel: "error",
    plugins: [tailwindcss()], esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve("src") } }, server: { host: "127.0.0.1", port: 0 } });
  server.middlewares.use("/__context_action", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__context_action", `<div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';import '/src/App.css';
      import i18n from '/src/i18n/index.ts';import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {TaskSessionContextAction} from '/src/components/tasks/workspace/TaskSessionContextAction.tsx';
      await i18n.changeLanguage('zh-CN');window.setLocale=locale=>i18n.changeLanguage(locale);
      window.reads=0;window.writes=0;window.copied=[];
      window.navo={taskSessions:{contextReminder:async()=>{window.reads++;if(window.fail)throw Error('fixture failure');return 'Read /fixture/context.json';}},terminal:{write:async()=>window.writes++}};
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied.push(text)},configurable:true});
      const root=createRoot(document.getElementById('root'));let revision=0;
      window.renderMode=(mode,running=true,failed=false,archived=false)=>root.render(React.createElement(TooltipProvider,null,React.createElement(TaskSessionContextAction,{key:++revision,session:{id:'one',contextMode:mode,status:running?'running':'stopped',contextSyncFailed:failed},archived})));
      window.renderMode('file');
    </script>`));
  });
  let child;
  try {
    await server.listen();
    const runner = path.join(directory, "runner.cjs");
    await writeFile(runner, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, "data"))});app.whenReady().then(async()=>{
      app.dock?.hide();const win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{backgroundThrottling:false}});
      try {await win.loadURL(${JSON.stringify("http://127.0.0.1:" + server.httpServer.address().port + "/__context_action")});await win.webContents.executeJavaScript(${JSON.stringify(`(${browserAssertions.toString()})()`)});console.log('CONTEXT_ACTION_OK');app.exit(0);}catch(error){console.error(error);app.exit(1);}
    });`);
    let output = "";
    child = spawn(electron, [runner], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
    const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
    assert.equal(code, 0, output); assert.match(output, /CONTEXT_ACTION_OK/);
  } finally { child?.kill("SIGKILL"); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
