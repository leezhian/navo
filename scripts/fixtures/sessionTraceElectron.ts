import { app, BrowserWindow, dialog } from "electron";
import { mkdir, writeFile, appendFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { registerExtensionScheme, registerExtensionHandlers, shutdownExtensions } from "../../src/main-process/ipc/extensionHandlers";
import { TaskRepository } from "../../src/main-process/services/taskRepository";
import { SessionRepository } from "../../src/main-process/services/taskSessions/sessionRepository";
import { verifyTraceReading } from "./sessionTraceReading";

registerExtensionScheme();
const directory = process.env.NAVO_TRACE_TEST_DIRECTORY as string;
app.setPath("userData", path.join(directory, "user"));
Object.defineProperty(app, "getVersion", { value: () => "1.0.0" });
const id = "12345678-1234-1234-1234-123456789abc", cwd = path.join(directory, "workspace"), native = path.join(directory, "native");
const logs = path.join(native, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
const source = path.join(logs, id + ".jsonl");
const now = "2026-11-06T08:00:00Z";
const agent = { agentId: "claude" as const, modelId: "model", modelName: "Model", modeId: "default", modeName: "default", effort: null };
const rows = Array.from({ length: 220 }, (_, index) => JSON.stringify({ sessionId: id, cwd, type: "user", timestamp: now, message: { content: [{ type: "text", text: `fixture message ${index}` }] } })).join("\n") + "\n";

void app.whenReady().then(async () => {
  app.dock?.hide();
  try {
    await mkdir(logs, { recursive: true }); await mkdir(cwd, { recursive: true }); await writeFile(source, rows);
    const db = path.join(app.getPath("userData"), "app.db");
    await new TaskRepository(db, "development").importLegacy([{ id: "trace-task", title: "Trace fixture", date: now, projectName: "fixture", status: "TODO", resources: [] }]);
    await new SessionRepository(db, "development").save({ id: "trace-session", taskId: "trace-task", kind: "agent", title: "Trace fixture", cwd, nativeSessionId: id, nativeHistoryRoot: native, agent, status: "stopped", terminalId: "unused", resumable: true, createdAt: now, lastUpdateAt: now, lastActiveAt: now });
    // 只替换测试进程中的原生文件选择，始终使用本次构建的隔离安装包。
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [process.env.NAVO_TRACE_TEST_PACKAGE as string] });
    let updateDownloads = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/session-trace-catalog/catalog.json")) return new Response(await readFile(path.join(directory, "catalog.json"), "utf8"));
      if (url.endsWith("/session-trace-0.2.0.navo-extension")) {
        updateDownloads++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return new Response(updateDownloads === 1 ? "corrupt package" : new Uint8Array(await readFile(path.join(directory, "updated.navo-extension"))));
      }
      throw Error("Unexpected fixture request");
    };
    await registerExtensionHandlers();
    const win = new BrowserWindow({ show: false, width: 1100, height: 850, webPreferences: { preload: path.join(directory, "preload.cjs"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.webContents.on("console-message", event => { if (event.level === "error") console.error(event.message); });
    await win.loadURL(process.env.NAVO_TRACE_TEST_URL as string);
    const checks = async () => {
      const pause = () => new Promise(resolve => setTimeout(resolve, 40));
      const wait = async (predicate: () => boolean, message: string) => { for (let i = 0; i < 250; i++) { if (predicate()) return; await pause(); } throw Error(message); };
      const api = window.navo.extensions;
      if ((await api.status()).version !== null) throw Error("Expected fresh uninstalled state");
      await wait(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.includes("从安装包安装")), "Labs install action missing");
      Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes("从安装包安装"))?.click();
      await wait(() => Boolean(document.querySelector('[role="switch"]')), "Installed state missing");
      if ((await api.status()).enabled) throw Error("Install enabled extension implicitly");
      (document.querySelector('[role="switch"]') as HTMLButtonElement).click();
      await wait(() => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "true", "Enable did not persist");
      const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === text);
      button("检查更新")?.click();
      await wait(() => document.body.innerText.includes("有可用更新：v0.2.0"), "Update notice missing");
      if ((await api.status()).version !== "0.1.0" || !(await api.status()).enabled) throw Error("Check changed installed state");
      button("更新")?.click();
      await wait(() => Boolean(document.querySelector('[role="alert"]')), "Update failure was hidden");
      if ((await api.status()).version !== "0.1.0" || !(await api.status()).enabled) throw Error("Failed update lost old enabled package");
      button("更新")?.click();
      await wait(() => document.body.innerText.includes("v0.2.0") && document.body.innerText.includes("当前已是最新兼容版本"), "Update did not finish");
      if ((await api.status()).version !== "0.2.0" || !(await api.status()).enabled) throw Error("Update lost enable preference");
      await (window as unknown as { setFixtureLanguage: (language: string) => Promise<unknown> }).setFixtureLanguage("en");
      (window as unknown as { showLabs: (value: boolean) => void }).showLabs(false);
      await wait(() => Boolean(document.querySelector("iframe")), "Plugin frame missing");
      return true;
    };
    await win.webContents.executeJavaScript(`(${checks.toString()})()`);
    // 与正式嵌入相同的跨来源 iframe，检查其 DOM 与主进程通道隔离。
    let frame = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith("navo-extension:"));
    for (let attempt = 0; !frame && attempt < 100; attempt++) { await new Promise(resolve => setTimeout(resolve, 50)); frame = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith("navo-extension:")); }
    if (!frame) throw Error("Custom protocol frame missing");
    const uiChecks = async () => {
      const pause = () => new Promise(resolve => setTimeout(resolve, 40));
      const wait = async (predicate: () => boolean) => { for (let i = 0; i < 250; i++) { if (predicate()) return; await pause(); } throw Error(document.body.innerText); };
      await wait(() => document.body.innerText.includes("220"));
      if ("navo" in window || "require" in window) throw Error("Host capabilities leaked into iframe");
      const count = document.querySelectorAll(".event-row").length;
      if (count >= 80 || count < 1) throw Error("List was not virtualized");
      (document.querySelector(".event-row") as HTMLButtonElement).click();
      await wait(() => Boolean(document.querySelector(".detail pre")?.textContent?.includes("fixture message")));
      const raw = Array.from(document.querySelectorAll<HTMLButtonElement>(".detail-toolbar button")).find(button => /JSON/.test(button.textContent ?? "")); raw?.click();
      await wait(() => Boolean(document.querySelector(".detail pre")?.textContent?.includes("sessionId")));
      const search = document.querySelector<HTMLInputElement>("input[type=search]");
      if (!search) throw Error("Search missing");
      const searchFor = (value: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, value);
        search.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const jump = () => {
        const marker = document.querySelector<HTMLButtonElement>('.timeline button[aria-label="User · fixture message 149"]');
        if (!marker) throw Error("Timeline target missing");
        marker.click();
      };
      const assertJump = async () => {
        await wait(() => Boolean(document.querySelector('.event-row[aria-expanded="true"][title="fixture message 149"]')));
        // 等防抖窗口过去，确认目标页不会被后来的搜索回调覆盖。
        await new Promise(resolve => setTimeout(resolve, 400));
        if (search.value || !document.querySelector("footer")?.textContent?.includes("2 / 3") ||
          !document.querySelector('.event-row[aria-expanded="true"][title="fixture message 149"]')) throw Error("Timeline jump was reset by search");
      };
      searchFor("fixture message 219");
      await wait(() => document.querySelector('[role="status"]')?.textContent === "1 event" && Boolean(document.querySelector('.event-row[title="fixture message 219"]')));
      jump(); await assertJump();
      searchFor("fixture message 23");
      await pause(); // 输入已进入 React 状态，但 180ms 防抖尚未触发。
      jump(); await assertJump();
      searchFor("fixture message 219");
      await wait(() => document.querySelector('[role="status"]')?.textContent === "1 event" && Boolean(document.querySelector('.event-row[title="fixture message 219"]')));
      if (document.documentElement.lang !== "en" || !document.querySelector(".stats")?.textContent?.includes("220 turns")) throw Error("English locale was not applied");
      if (!document.querySelector(".stats")?.textContent?.includes("— model requests")) throw Error("Unknown requests were displayed as zero");
      return { virtualRows: count, text: document.body.innerText };
    };
    const result = await frame.executeJavaScript(`(${uiChecks.toString()})()`);
    assert.match(result.text, /fixture message 219/);
    await appendFile(source, JSON.stringify({ sessionId: id, cwd, type: "user", timestamp: now, message: { content: "fixture message 219 appended" } }) + "\n");
    for (let attempt = 0; attempt < 100; attempt++) { const count = await frame.executeJavaScript("document.querySelectorAll('.event-row').length"); if (count === 2) break; if (attempt === 99) throw Error("Incremental update missing"); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal(await frame.executeJavaScript(`document.querySelector('[role="status"]').textContent`), "2 events");
    await verifyTraceReading(win, frame, () => appendFile(source, JSON.stringify({
      sessionId: id, cwd, type: "user", timestamp: now, message: { content: "fixture message follow appended" },
    }) + "\n"));
    const screenshot = await win.webContents.capturePage(); await writeFile(path.join(directory, "trace.png"), screenshot.toPNG());
    await win.webContents.executeJavaScript("window.navo.extensions.setEnabled(false)");
    await assert.rejects(win.webContents.executeJavaScript("window.navo.extensions.openTrace('trace-session', crypto.randomUUID())"), /EXTENSION_DISABLED/);
    await win.webContents.executeJavaScript(`(async () => {
      await window.setFixtureLanguage('zh-CN');
      window.showLabs(true);
      const wait = async (predicate) => { for (let i=0;i<200;i++) { if(predicate())return; await new Promise(resolve=>setTimeout(resolve,40)); } throw Error('Labs uninstall UI timed out'); };
      const uninstall = () => Array.from(document.querySelectorAll('button')).find(button => button.textContent === '卸载');
      await wait(uninstall);
      const installedStatus = await window.navo.extensions.status();
      window.setFixtureExtensionStatus({...installedStatus, operation:'updating', error:'UPDATE_ROLLBACK_FAILED'});
      await wait(()=>document.querySelector('[role=alert]'));
      if(uninstall().disabled) throw Error('Failed rollback must allow uninstall recovery');
      window.setFixtureExtensionStatus(installedStatus);
      await wait(()=>!document.querySelector('[role=alert]'));
      uninstall().click(); await wait(()=>document.querySelector('[role=dialog]'));
      if(document.activeElement.textContent !== '取消') throw Error('Uninstall must focus cancel');
      Array.from(document.querySelectorAll('[role=dialog] button')).find(button=>button.textContent==='取消').click();
      if(!(await window.navo.extensions.status()).version) throw Error('Cancel removed package');
      uninstall().click(); await wait(()=>document.querySelector('[role=dialog]'));
      Array.from(document.querySelectorAll('[role=dialog] button')).find(button=>button.textContent==='卸载').click();
      await wait(()=>!document.querySelector('[role=dialog]'));
      if((await window.navo.extensions.status()).version !== null) throw Error('Uninstall did not finish');
    })()`);
    await assert.rejects(access(path.join(app.getPath("userData"), "extensions/development/session-trace/installed")));
    assert.ok((await readFile(source, "utf8")).includes("appended"));
    await shutdownExtensions(); console.log("TRACE_UI_OK " + JSON.stringify({ virtualRows: result.virtualRows })); app.exit(0);
  } catch (error) { console.error(error); await shutdownExtensions(); app.exit(1); }
});
