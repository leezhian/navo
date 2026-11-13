import { app, BrowserWindow, dialog } from "electron";
import { mkdir, writeFile, appendFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { registerExtensionHandlers, shutdownExtensions } from "../../src/main-process/ipc/extensionHandlers";
import { TaskRepository } from "../../src/main-process/services/taskRepository";
import { SessionRepository } from "../../src/main-process/services/taskSessions/sessionRepository";
import { verifyTraceReading } from "./sessionTraceReading";

const directory = process.env.NAVO_TRACE_TEST_DIRECTORY as string;
app.setPath("userData", path.join(directory, "user"));
Object.defineProperty(app, "getVersion", { value: () => "1.0.0" });
const id = "12345678-1234-1234-1234-123456789abc", cwd = path.join(directory, "workspace"), native = path.join(directory, "native");
const logs = path.join(native, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
const source = path.join(logs, id + ".jsonl");
const now = "2026-11-06T08:00:00Z";
const agent = { agentId: "claude" as const, modelId: "model", modelName: "Model", modeId: "default", modeName: "default", effort: null };
const at = (seconds: number) => new Date(Date.parse(now) + seconds * 1000).toISOString();
// 第 i 条消息在第 i 秒；第 10 条换成从 10s 持续到 150s 的长工具调用，用来验证框选命中起点在选区之前的事件。
const rows = Array.from({ length: 220 }, (_, index) => index === 10
  ? [
    JSON.stringify({ sessionId: id, cwd, type: "assistant", uuid: "long-tool", timestamp: at(10), message: { content: [{ type: "tool_use", id: "long-call", name: "Bash", input: { command: "fixture long tool" } }] } }),
    JSON.stringify({ sessionId: id, cwd, type: "user", timestamp: at(150), message: { content: [{ type: "tool_result", tool_use_id: "long-call", content: "done" }] } }),
  ].join("\n")
  : JSON.stringify({ sessionId: id, cwd, type: "user", timestamp: at(index), message: { content: [{ type: "text", text: `fixture message ${index}` }] } })).join("\n") + "\n";

void app.whenReady().then(async () => {
  app.dock?.hide();
  try {
    await mkdir(logs, { recursive: true }); await mkdir(cwd, { recursive: true }); await writeFile(source, rows);
    const grokId = "00000000-0000-4000-8000-00000000000a", grokRoot = path.join(directory, "grok-native");
    const grokDir = path.join(grokRoot, "sessions", encodeURIComponent(cwd), grokId);
    await mkdir(grokDir, { recursive: true });
    await writeFile(path.join(grokDir, "chat_history.jsonl"), [
      JSON.stringify({ type: "system", content: "fixture system prompt" }),
      JSON.stringify({ type: "user", content: [{ type: "text", text: "fixture untimed prompt" }], prompt_index: 1 }),
      JSON.stringify({ type: "assistant", content: "fixture untimed reply", model_id: "grok-model" }),
    ].join("\n") + "\n");
    await writeFile(path.join(grokDir, "summary.json"), JSON.stringify({ info: { id: grokId, cwd }, generated_title: "untimed" }));
    const db = path.join(app.getPath("userData"), "app.db");
    await new TaskRepository(db, "development").importLegacy([{ id: "trace-task", title: "Trace fixture", date: now, projectName: "fixture", status: "TODO", resources: [] }]);
    const sessions = new SessionRepository(db, "development");
    await sessions.save({ id: "trace-session", taskId: "trace-task", kind: "agent", title: "Trace fixture", cwd, nativeSessionId: id, nativeHistoryRoot: native, agent, status: "stopped", terminalId: "unused", resumable: true, createdAt: now, lastUpdateAt: now, lastActiveAt: now });
    await sessions.save({ id: "trace-untimed", taskId: "trace-task", kind: "agent", title: "Untimed fixture", cwd, nativeSessionId: grokId, nativeHistoryRoot: grokRoot, agent: { ...agent, agentId: "grok" }, status: "stopped", terminalId: "unused-grok", resumable: true, createdAt: now, lastUpdateAt: now, lastActiveAt: now });
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
      const button = (name: string) => {
        // 检查更新是图标按钮，使用无障碍名称定位；必需按钮缺失时立即报错，避免静默跳过点击。
        const target = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
          .find(item => (item.getAttribute("aria-label") ?? item.textContent) === name);
        if (!target) throw Error(`Required button missing: ${name}`);
        return target;
      };
      button("检查更新").click();
      await wait(() => document.body.innerText.includes("有可用更新：v0.2.0"), "Update notice missing");
      if ((await api.status()).version !== "0.1.0" || !(await api.status()).enabled) throw Error("Check changed installed state");
      button("更新").click();
      await wait(() => Boolean(document.querySelector('[role="alert"]')), "Update failure was hidden");
      if ((await api.status()).version !== "0.1.0" || !(await api.status()).enabled) throw Error("Failed update lost old enabled package");
      button("更新").click();
      await wait(() => document.body.innerText.includes("v0.2.0") && document.body.innerText.includes("当前已是最新兼容版本"), "Update did not finish");
      if ((await api.status()).version !== "0.2.0" || !(await api.status()).enabled) throw Error("Update lost enable preference");
      await (window as unknown as { setFixtureLanguage: (language: string) => Promise<unknown> }).setFixtureLanguage("en");
      (window as unknown as { showLabs: (value: boolean) => void }).showLabs(false);
      await wait(() => Boolean(document.querySelector(".session-trace")) && !document.querySelector("iframe"), "Host trace view missing");
      return true;
    };
    await win.webContents.executeJavaScript(`(${checks.toString()})()`);
    const uiChecks = async () => {
      const pause = () => new Promise(resolve => setTimeout(resolve, 40));
      const wait = async (predicate: () => boolean) => { for (let i = 0; i < 250; i++) { if (predicate()) return; await pause(); } throw Error(document.body.innerText); };
      await wait(() => document.body.innerText.includes("220"));
      if (document.querySelector("iframe")) throw Error("Official trace UI must not use an iframe");
      if (!("navo" in window)) throw Error("Host trace UI must run in the application page");
      const count = document.querySelectorAll(".event-row").length;
      if (count >= 80 || count < 1) throw Error("List was not virtualized");
      // 首次打开停在最新事件；滚到顶部时按需取回更早的窗口。
      const scroller = document.querySelector(".events") as HTMLElement;
      if (!document.querySelector('.event-row[title="fixture message 219"]') || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1)
        throw Error("Trace must open at the newest event");
      if (document.querySelector('.event-row[title="fixture message 0"]')) throw Error("Earliest window should load on demand");
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll"));
      await wait(() => Boolean(document.querySelector('.event-row[title="fixture message 0"]')) && scroller.scrollTop < 400);
      if (document.querySelector('[aria-label="Inspector"]') || document.body.innerText.includes("Inspector"))
        throw Error("Inspector toggle must be removed");
      if (document.querySelector(".detail.trace-detail") || document.querySelector(".events .detail"))
        throw Error("Detail pane must stay closed until an event is selected");
      return { virtualRows: count, text: document.body.innerText };
    };
    const opened = await win.webContents.executeJavaScript(`(${uiChecks.toString()})()`);
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    // 夹具每个下标对应一条事件（工具结果合并到调用），ID 从 1 开始；时间线提示不再包含消息摘要。
    const timelineMark = (index: number) => `.timeline button[data-event-id="${index + 1}"]`;
    const pointOf = (selector: string) => win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw Error(${JSON.stringify(selector)} + " missing");
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    const clickPoint = async (x: number, y: number) => {
      win.webContents.sendInputEvent({ type: "mouseMove", x, y });
      await delay(40);
      win.webContents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
      await delay(40);
      win.webContents.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
      await delay(80);
    };
    const clickSelector = async (selector: string) => {
      const point = await pointOf(selector);
      await clickPoint(point.x, point.y);
    };
    const dragRange = async () => {
      const axis = await win.webContents.executeJavaScript(`(() => {
        const axis = document.querySelector(".timeline .cursor-crosshair");
        if (!axis) throw Error("Timeline axis missing");
        const rect = axis.getBoundingClientRect();
        const x = (seconds) => Math.round(rect.left + rect.width * seconds / 219);
        return { from: x(120), to: x(125), y: Math.round(rect.top + 6) };
      })()`);
      const pointer = async (type: "mouseDown" | "mouseMove" | "mouseUp", x: number) => {
        win.webContents.sendInputEvent({ type, x, y: axis.y, button: "left", clickCount: 1 });
        await delay(60);
      };
      await pointer("mouseMove", axis.from);
      await pointer("mouseDown", axis.from);
      await pointer("mouseMove", Math.round((axis.from + axis.to) / 2));
      await pointer("mouseMove", axis.to);
      await pointer("mouseUp", axis.to);
    };
    const waitInPage = (predicate: string, message: string) => win.webContents.executeJavaScript(`(async () => {
      const pause = () => new Promise(resolve => setTimeout(resolve, 40));
      for (let i = 0; i < 250; i++) { if ((${predicate})()) return; await pause(); }
      throw Error(${JSON.stringify(message)} + ": " + document.body.innerText);
    })()`);
    // 真实鼠标点时间线块，列表应定位并展开；不用 element.click()，以覆盖指针捕获路径。
    await clickSelector(timelineMark(12));
    await waitInPage(`() => {
      const pane = document.querySelector(".detail.trace-detail");
      return Boolean(document.querySelector('.event-row[aria-current="true"][title="fixture message 12"]')) &&
        Boolean(pane) && !document.querySelector(".events .detail") &&
        Boolean(pane?.querySelector("pre")?.textContent?.includes("fixture message"));
    }`, "Timeline click did not open the right-hand detail");
    // 真实鼠标按下、移动、松开分隔条后，详情宽度应变化；并断言热区可被命中且有高度。
    const beforeSplit = await win.webContents.executeJavaScript(`(() => {
      const handle = document.querySelector(".session-trace [role=separator]");
      const pane = document.querySelector(".detail.trace-detail");
      if (!handle || !pane) throw Error("Detail separator missing");
      const rect = handle.getBoundingClientRect();
      if (rect.height < 40) throw Error("Separator hit area has no height");
      const x = Math.round(rect.left + rect.width / 2), y = Math.round(rect.top + rect.height / 2);
      const hit = document.elementFromPoint(x, y);
      if (hit !== handle && !handle.contains(hit)) throw Error("Separator is not hittable at " + x + "," + y + ": " + ((hit && hit.className) || hit?.nodeName || "null"));
      return { x, y, width: Math.round(pane.getBoundingClientRect().width), value: Number(handle.getAttribute("aria-valuenow")) };
    })()`);
    win.webContents.sendInputEvent({ type: "mouseMove", x: beforeSplit.x, y: beforeSplit.y });
    await delay(40);
    win.webContents.sendInputEvent({ type: "mouseDown", x: beforeSplit.x, y: beforeSplit.y, button: "left", clickCount: 1 });
    await delay(40);
    for (let step = 1; step <= 12; step++) {
      win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(beforeSplit.x + 80 * step / 12), y: beforeSplit.y, button: "left", modifiers: ["leftButtonDown"] });
      await delay(16);
    }
    win.webContents.sendInputEvent({ type: "mouseUp", x: beforeSplit.x + 80, y: beforeSplit.y, button: "left", clickCount: 1 });
    await delay(80);
    await waitInPage(`() => {
      const handle = document.querySelector(".session-trace [role=separator]");
      const pane = document.querySelector(".detail.trace-detail");
      const width = pane?.getBoundingClientRect().width ?? 0;
      const value = Number(handle?.getAttribute("aria-valuenow"));
      return width < ${beforeSplit.width} - 20 && value < ${beforeSplit.value} - 20;
    }`, "Dragging the separator did not resize the detail pane");
    await dragRange();
    const rangeChecks = async () => {
      const pause = () => new Promise(resolve => setTimeout(resolve, 40));
      const wait = async (predicate: () => boolean, message: string) => { for (let i = 0; i < 250; i++) { if (predicate()) return; await pause(); } throw Error(message + ": " + document.body.innerText); };
      const scroller = document.querySelector(".events") as HTMLElement;
      const tool = () => document.querySelector<HTMLElement>('.event-row[data-kind="tool"]');
      await wait(() => Boolean(document.querySelector(".event-row[data-dimmed]")), "Range did not dim rows");
      // 框选不再过滤。默认等宽记录，拖动落在大约第 120–125 格，第一条是 fixture message 120，不是更早开始的长工具。
      if (document.querySelector('[role="status"]')?.textContent !== "220 events") throw Error("Range must not filter the list");
      const firstHit = () => document.querySelector<HTMLElement>('.event-row[title="fixture message 120"]');
      await wait(() => {
        const row = firstHit();
        if (!row || row.dataset.dimmed) return false;
        const rowRect = row.getBoundingClientRect(), listRect = scroller.getBoundingClientRect();
        return rowRect.top >= listRect.top - 1 && rowRect.bottom <= listRect.bottom + 1;
      }, "Range must scroll to the first in-range event");
      const toolRow = tool();
      if (toolRow && !toolRow.dataset.dimmed) throw Error("The long tool is an early slot and must be dimmed");
      // 选中的是第 12 条，滚到第 120 条后它不在当前窗口里。详情还停在它身上，就说明选中没被框选清掉。
      if (document.querySelector('.event-row[aria-current="true"]')) throw Error("The scrolled window must not replace the selected row");
      const pane = document.querySelector(".detail.trace-detail");
      if (!pane || document.querySelector(".events .detail") || !pane.querySelector("pre")?.textContent?.includes("fixture message 12"))
        throw Error("Selected detail must stay open in the right-hand pane");
      const mark = (index: number) => document.querySelector<HTMLElement>(`.timeline button[data-event-id="${index + 1}"]`);
      const outside = mark(0), inside = mark(122);
      if (!outside || !inside || !outside.dataset.dimmed || inside.dataset.dimmed) throw Error("Timeline marks outside the range must be dimmed");
      if (Array.from(document.querySelectorAll(".trace-events .event-row")).some(row => !row.hasAttribute("data-dimmed") && /fixture message (1[0-1]?[0-9]|[0-9])$/.test(row.getAttribute("title") ?? "")))
        throw Error("Out-of-range rows must be dimmed");
      if (document.body.innerText.includes("Selected range") || document.body.innerText.includes("Clear range")) throw Error("Range badge must be removed");
      const marks = Array.from(document.querySelectorAll<HTMLElement>(".timeline [data-event-id]"));
      if (!marks.some(item => item.dataset.dimmed) || marks.find(item => item.getAttribute("aria-current"))?.dataset.dimmed) throw Error("Selected mark must stay bright while others fade");
      return true;
    };
    await win.webContents.executeJavaScript(`(${rangeChecks.toString()})()`);
    const assertRangeClearedKeeping = (opened: string, message: string) => waitInPage(`() => {
      const pane = document.querySelector(".detail.trace-detail pre");
      return !document.querySelector(".event-row[data-dimmed]") &&
        Boolean(pane?.textContent?.includes("fixture message 12")) &&
        !document.querySelector(${JSON.stringify('.event-row[aria-current="true"][title="' + opened + '"]')});
    }`, message);
    // 点一条仍在视口里的置灰行：只取消框选。第 11 条已经滚出虚拟列表，不能再点它。
    const dimmedTitle = await win.webContents.executeJavaScript(`(() => {
      const scroller = document.querySelector(".events");
      if (!scroller) throw Error("Event list missing");
      const listRect = scroller.getBoundingClientRect();
      const row = Array.from(document.querySelectorAll(".event-row[data-dimmed]")).find(item => {
        const rect = item.getBoundingClientRect();
        return rect.top >= listRect.top && rect.bottom <= listRect.bottom && item.getAttribute("title") !== "fixture message 12";
      });
      if (!row) throw Error("No visible dimmed row");
      return row.getAttribute("title");
    })()`);
    await clickSelector(`.event-row[data-dimmed][title="${dimmedTitle}"]`);
    await assertRangeClearedKeeping(dimmedTitle, "Dimmed list row should only clear the range");
    await dragRange();
    await waitInPage('() => Boolean(document.querySelector(".event-row[data-dimmed]"))', "Range was not reapplied");
    // 点框选外的时间线块：同样只取消框选。
    await clickSelector(timelineMark(0));
    await assertRangeClearedKeeping("fixture message 0", "Dimmed timeline mark should only clear the range");
    await dragRange();
    await waitInPage('() => Boolean(document.querySelector(".event-row[data-dimmed]"))', "Range was not reapplied");
    // 点选区内的时间线块：仍应定位并展开。
    await clickSelector(timelineMark(122));
    await waitInPage(`() => Boolean(document.querySelector('.event-row[aria-current="true"][title="fixture message 122"]:not([data-dimmed])')) && Boolean(document.querySelector(".detail.trace-detail")) && !document.querySelector(".events .detail")`, "In-range timeline click did not locate");
    await clickSelector('.event-row[title="fixture message 123"]:not([data-dimmed])');
    await waitInPage(`() => Boolean(document.querySelector('.event-row[aria-current="true"][title="fixture message 123"]:not([data-dimmed])')) && Boolean(document.querySelector(".detail.trace-detail"))`, "In-range list row click did not select");
    await win.webContents.executeJavaScript(`document.querySelector(".timeline")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await waitInPage('() => !document.querySelector(".event-row[data-dimmed]")', "Escape did not clear the range");
    await clickSelector('.event-row[aria-current="true"][title="fixture message 123"]');
    await waitInPage(`() => !document.querySelector('.event-row[aria-current="true"]') && !document.querySelector(".detail.trace-detail") && !document.querySelector("[data-dimmed]")`, "Deselect must hide the detail pane");
    const readingChecks = async () => {
      const pause = () => new Promise(resolve => setTimeout(resolve, 40));
      const wait = async (predicate: () => boolean) => { for (let i = 0; i < 250; i++) { if (predicate()) return; await pause(); } throw Error(document.body.innerText); };
      const count = document.querySelectorAll(".event-row").length;
      (document.querySelector(".event-row") as HTMLButtonElement).click();
      await wait(() => Boolean(document.querySelector(".detail.trace-detail pre")?.textContent?.includes("fixture message")) && !document.querySelector(".events .detail"));
      const raw = Array.from(document.querySelectorAll<HTMLButtonElement>(".detail-toolbar button")).find(button => /JSON/.test(button.textContent ?? "")); raw?.click();
      await wait(() => Boolean(document.querySelector(".detail pre")?.textContent?.includes("sessionId")));
      const search = document.querySelector<HTMLInputElement>("input[type=search]");
      if (!search) throw Error("Search missing");
      const searchFor = (value: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, value);
        search.dispatchEvent(new Event("input", { bubbles: true }));
      };
      searchFor("fixture message 219");
      await wait(() => document.querySelector('[role="status"]')?.textContent === "1 event" && Boolean(document.querySelector('.event-row[title="fixture message 219"]')));
      if (document.documentElement.lang !== "en" || !document.querySelector(".stats")?.textContent?.includes("219 turns")) throw Error("English locale was not applied");
      // 顶部统计只保留轮次、模型请求、工具和错误；时间线不画刻度和两端时间。
      const statsBar = document.querySelector(".stats");
      if (statsBar?.querySelector("svg") || /tokens|3m 39s|Not recorded/i.test(statsBar?.textContent ?? "")) throw Error("Duration and tokens must not be shown: " + statsBar?.textContent);
      const timelineText = document.querySelector(".timeline")?.textContent ?? "";
      if (!timelineText.includes("Input") || /[0-9][smhd]/.test(timelineText)) throw Error("Timeline must keep lane labels and drop time ticks: " + timelineText);
      // 等宽记录共 220 格。第 r 轮（r ≤ 10）的第一条在槽位 r-1，其余轮在槽位 r；相距不足 4px 合并。
      const axisEl = document.querySelector<HTMLElement>(".timeline .cursor-crosshair");
      const lines = Array.from(document.querySelectorAll<HTMLElement>(".timeline [data-round-line]"));
      if (!axisEl || !lines.length) throw Error("Round lines missing");
      const width = axisEl.clientWidth;
      let expected = 0, lastX = -Infinity;
      for (let round = 1; round <= 219; round++) {
        const x = (round <= 10 ? round - 1 : round) / 220 * width;
        if (x - lastX >= 4) { expected++; lastX = x; }
      }
      if (lines.length !== expected) throw Error("Round line count " + lines.length + " != " + expected + " at width " + width);
      const covered = lines.reduce((sum, line) => { const [from, to = from] = (line.dataset.roundLine ?? "").split("-").map(Number); return sum + to - from + 1; }, 0);
      if (covered !== 219) throw Error("Merged round lines must cover all 219 timed rounds: " + covered);
      if (lines.some(line => line.textContent || getComputedStyle(line).pointerEvents !== "none")) throw Error("Round lines must have no text and ignore the pointer");
      if (/Round|轮/.test(timelineText)) throw Error("Timeline must not show round text: " + timelineText);
      const axisRect = axisEl.getBoundingClientRect();
      for (const line of lines.slice(0, 40)) {
        const rect = line.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left, axisRect.top + 6);
        if (!hit || hit.hasAttribute("data-round-line") || !axisEl.contains(hit)) throw Error("Round line must not intercept the pointer");
      }
      if (!document.querySelector(".stats")?.textContent?.includes("— model requests")) throw Error("Unknown requests were displayed as zero");
      return { virtualRows: count, text: document.body.innerText };
    };
    const result = await win.webContents.executeJavaScript(`(${readingChecks.toString()})()`);
    const searchInPage = (value: string) => win.webContents.executeJavaScript(`(() => {
      const search = document.querySelector("input[type=search]");
      if (!search) throw Error("Search missing");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, ${JSON.stringify(value)});
      search.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    const assertJump = (title: string) => waitInPage(`() => {
      const search = document.querySelector("input[type=search]");
      return !search?.value && Boolean(document.querySelector(${JSON.stringify('.event-row[aria-current="true"][title="' + title + '"]')}));
    }`, "Timeline jump was reset by search");
    await searchInPage("fixture message 219");
    await waitInPage(`() => document.querySelector('[role="status"]')?.textContent === "1 event" && Boolean(document.querySelector('.event-row[title="fixture message 219"]'))`, "Search for 219 failed");
    await clickSelector(timelineMark(149));
    await delay(400);
    await assertJump("fixture message 149");
    await searchInPage("fixture message 23");
    await delay(40); // 输入已进入 React 状态，但 180ms 防抖尚未触发。再次点同一块会取消选中，所以改点另一块。
    await clickSelector(timelineMark(148));
    await delay(400);
    await assertJump("fixture message 148");
    await searchInPage("fixture message 219");
    await waitInPage(`() => document.querySelector('[role="status"]')?.textContent === "1 event" && Boolean(document.querySelector('.event-row[title="fixture message 219"]'))`, "Search for 219 failed");
    assert.ok(opened.virtualRows < 80);
    assert.match(result.text, /fixture message 219/);
    await appendFile(source, JSON.stringify({ sessionId: id, cwd, type: "user", timestamp: now, message: { content: "fixture message 219 appended" } }) + "\n");
    for (let attempt = 0; attempt < 100; attempt++) { const count = await win.webContents.executeJavaScript("document.querySelectorAll('.event-row').length"); if (count === 2) break; if (attempt === 99) throw Error("Incremental update missing"); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[role="status"]').textContent`), "2 events");
    await verifyTraceReading(win, () => appendFile(source, JSON.stringify({
      sessionId: id, cwd, type: "user", timestamp: now, message: { content: "fixture message follow appended" },
    }) + "\n"));
    await win.webContents.executeJavaScript(`(async () => {
      const wait = async (predicate, message) => { for (let i = 0; i < 250; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 40)); } throw Error(message + ": " + document.body.innerText); };
      window.setFixtureSession({ id: "trace-untimed", nativeSessionId: "00000000-0000-4000-8000-00000000000a" });
      await wait(() => document.body.innerText.includes("该会话未记录时间，无法使用时间线和框选"), "Untimed hint missing");
      if (document.querySelector(".timeline")) throw Error("Timeline must be hidden when the session has no times");
      if (/未记录|Token/.test(document.querySelector(".stats")?.textContent ?? "")) throw Error("Untimed session must not show duration or tokens");
      const rows = Array.from(document.querySelectorAll(".event-row")).map(row => row.getAttribute("title"));
      if (rows.length !== 3 || !rows.includes("fixture untimed prompt") || !rows.includes("fixture untimed reply"))
        throw Error("Untimed list should still show every event: " + rows.join(","));
    })()`);
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
