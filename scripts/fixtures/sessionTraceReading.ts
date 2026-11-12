import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";

/** 在宿主页面验证阅读交互，追加内容仍由外层隔离日志夹具提供。 */
export async function verifyTraceReading(window: BrowserWindow, appendEvent: () => Promise<void>) {
  const followLastPage = async () => {
    const wait = async (predicate: () => boolean) => {
      for (let i = 0; i < 250; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      throw Error("Follow did not reveal the final event: " + document.body.innerText);
    };
    const checkbox = (label: string) => Array.from(document.querySelectorAll("footer label")).find(item => item.textContent?.includes(label))?.querySelector<HTMLButtonElement>("[role=checkbox]");
    const search = document.querySelector<HTMLInputElement>("input[type=search]") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "");
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(() => document.querySelector('[role="status"]')?.textContent === "221 events");
    checkbox("Follow new events")?.click();
    await wait(() => Boolean(document.querySelector('.event-row[title="fixture message 219 appended"]')));
    const scroller = document.querySelector(".events") as HTMLElement;
    if (scroller.scrollHeight <= scroller.clientHeight || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1)
      throw Error("Follow must scroll within the last page");
  };
  await window.webContents.executeJavaScript(`(${followLastPage.toString()})()`);
  await appendEvent();
  const searchAndSelect = async () => {
    const wait = async (predicate: () => boolean, message: string) => {
      for (let i = 0; i < 250; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      throw Error(message + ": " + document.body.innerText);
    };
    await wait(() => Boolean(document.querySelector('.event-row[title="fixture message follow appended"]')), "New event is not visible");
    const scroller = document.querySelector(".events") as HTMLElement;
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1) throw Error("Append lost the follow position");
    const search = document.querySelector<HTMLInputElement>("input[type=search]") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "fixture message");
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const checkbox = (label: string) => Array.from(document.querySelectorAll("footer label")).find(item => item.textContent?.includes(label))?.querySelector<HTMLButtonElement>("[role=checkbox]");
    await wait(() => checkbox("Follow new events")?.getAttribute("aria-checked") !== "true" &&
      Boolean(document.querySelector("footer")?.textContent?.includes("1 / 3")) &&
      document.querySelector('[role="status"]')?.textContent === "222 events", "Search must leave follow and return to page one");
    // 多页搜索结果中选中详情，语言切换必须保留整组阅读状态。
    (document.querySelector("footer [data-trace-page=next]") as HTMLButtonElement).click();
    await wait(() => Boolean(document.querySelector("footer")?.textContent?.includes("2 / 3")) &&
      document.querySelector('[role="status"]')?.textContent === "222 events", "Second search page missing");
    (document.querySelector(".event-row") as HTMLButtonElement).click();
    await wait(() => Boolean(document.querySelector(".detail pre")), "Selected detail missing");
    const raw = Array.from(document.querySelectorAll<HTMLButtonElement>(".detail-toolbar button"))
      .find(button => /JSON/.test(button.textContent ?? ""));
    raw?.click();
    await wait(() => Boolean(document.querySelector(".detail pre")?.textContent?.includes("sessionId")), "Raw detail missing");
    return {
      search: search.value,
      selected: document.querySelector('.event-row[aria-expanded="true"]')?.getAttribute("title"),
      scrollTop: scroller.scrollTop,
    };
  };
  const before = await window.webContents.executeJavaScript(`(${searchAndSelect.toString()})()`);
  await window.webContents.executeJavaScript("window.setFixtureLanguage('zh-CN').then(() => undefined)");
  const readAfterLanguageChange = async () => {
    for (let i = 0; i < 250 && document.documentElement.lang !== "zh-CN"; i++)
      await new Promise(resolve => setTimeout(resolve, 40));
    return {
      language: document.documentElement.lang,
      search: document.querySelector<HTMLInputElement>("input[type=search]")?.value,
      selected: document.querySelector('.event-row[aria-expanded="true"]')?.getAttribute("title"),
      scrollTop: (document.querySelector(".events") as HTMLElement).scrollTop,
      secondPage: document.querySelector("footer")?.textContent?.includes("2 / 3"),
      raw: document.querySelector(".detail pre")?.textContent?.includes("sessionId"),
    };
  };
  const after = await window.webContents.executeJavaScript(`(${readAfterLanguageChange.toString()})()`);
  assert.equal(after.language, "zh-CN");
  assert.equal(after.search, before.search);
  assert.equal(after.selected, before.selected);
  assert.equal(after.scrollTop, before.scrollTop);
  assert.equal(after.secondPage, true);
  assert.equal(after.raw, true);
}
