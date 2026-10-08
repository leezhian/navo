import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { createLoader } from "./helpers/load-typescript.mjs";

const { taskTimeLabel, parseTaskDate } = createLoader()("src/utils/taskTime.ts");
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const now = new Date(2026, 9, 8, 12, 0, 0).getTime();
const label = elapsed => taskTimeLabel(new Date(now - elapsed).toISOString(), now);

test("分钟、小时、天数边界向下取整，超过而非达到 30 天才使用日期", () => {
  const cases = [
    [-minute, "justNow", 0], [0, "justNow", 0], [minute - 1, "justNow", 0],
    [minute, "minutes", 1], [5 * minute + 59_999, "minutes", 5], [hour - 1, "minutes", 59],
    [hour, "hours", 1], [2 * hour + 59 * minute, "hours", 2], [day - 1, "hours", 23],
    [day, "days", 1], [3 * day, "days", 3], [30 * day, "days", 30],
  ];
  for (const [elapsed, unit, count] of cases) assert.deepEqual(label(elapsed), { kind: "relative", unit, count });
  assert.deepEqual(label(30 * day + 1), { kind: "absolute", text: "2026.09.08" });
});

test("具体日期补齐两位月日，旧日期按本地午夜解析，无效日期安全回退", () => {
  assert.deepEqual(taskTimeLabel("2026-01-02", now), { kind: "absolute", text: "2026.01.02" });
  assert.equal(parseTaskDate("2026-01-02").getHours(), 0);
  assert.equal(parseTaskDate("2026-01-02").getDate(), 2);
  assert.deepEqual(taskTimeLabel("invalid", now), { kind: "absolute", text: "invalid" });
});

test("日期组件中英文随语言设置切换，保留真实 datetime 和完整时间悬停", async () => {
  const i18n = createInstance();
  const resources = Object.fromEntries(["en", "zh-CN"].map(locale => [locale, { tasks: JSON.parse(readFileSync(`src/i18n/locales/${locale}/tasks.json`, "utf8")) }]));
  await i18n.init({ resources, lng: "en", defaultNS: "tasks", initAsync: false });
  const { TaskTime } = createLoader({
    "react-i18next": { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) },
    "@/hooks/useMinuteClock": { useMinuteClock: () => now },
  })("src/components/tasks/TaskTime.tsx");
  const render = elapsed => renderToStaticMarkup(React.createElement(TaskTime, { value: new Date(now - elapsed).toISOString() }));
  for (const [elapsed, text] of [[0, "just now"], [5 * minute, "5m ago"], [2 * hour, "2h ago"], [3 * day, "3d ago"], [31 * day, "2026.09.07"]]) {
    assert.ok(render(elapsed).endsWith(`>${text}</time>`));
  }
  assert.match(render(0), /dateTime="[^"]+" title="[^"]+12:00:00"/i);
  await i18n.changeLanguage("zh-CN");
  assert.ok(render(0).endsWith(">刚刚</time>"));
  assert.ok(render(5 * minute).endsWith(">5 分钟前</time>"));
  assert.ok(render(31 * day).endsWith(">2026.09.07</time>"));
});

test("任务共用一个分钟时钟，最后一个订阅卸载后清理，重新挂载立即更新时间", context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now });
  let subscribe;
  let snapshot;
  const { useMinuteClock } = createLoader({ react: { useSyncExternalStore: (subscribeClock, getSnapshot) => {
    subscribe = subscribeClock; snapshot = getSnapshot; return getSnapshot();
  } } })("src/hooks/useMinuteClock.ts");
  useMinuteClock();
  let firstUpdates = 0;
  let secondUpdates = 0;
  const unsubscribeFirst = subscribe(() => firstUpdates++);
  const unsubscribeSecond = subscribe(() => secondUpdates++);
  context.mock.timers.tick(minute);
  assert.equal(snapshot(), now + minute);
  assert.equal(firstUpdates, 2);
  assert.equal(secondUpdates, 1);
  unsubscribeFirst(); unsubscribeSecond();
  context.mock.timers.tick(5 * minute);
  assert.equal(firstUpdates, 2);
  assert.equal(secondUpdates, 1);
  const unsubscribe = subscribe(() => {});
  assert.equal(snapshot(), now + 6 * minute);
  unsubscribe();
});
