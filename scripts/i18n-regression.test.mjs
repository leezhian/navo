import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createInstance } from "i18next";
import ts from "typescript";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { resources, namespaces } = load("src/i18n/resources.ts");
const { supportedLocales, DEFAULT_LOCALE, normalizeLocale } = load("src/shared/locales.ts");
const pluralSuffix = /_(zero|one|two|few|many|other)$/;
const placeholders = (value) => [...value.matchAll(/\{\{\s*([\w.]+)(?:,[^}]+)?\s*\}\}/g)].map((match) => match[1]).sort();

function flatten(value, prefix = "") {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    assert.match(key, /^[a-zA-Z][a-zA-Z0-9_]*$/, "Resource keys must be semantic identifiers");
    const fullKey = prefix + key;
    return typeof entry === "string" ? [[fullKey, entry]] : Object.entries(flatten(entry, fullKey + "."));
  }));
}

test("注册语言的命名空间、语义 key、插值及复数资源完整，无需回退掩盖漏译", async () => {
  const locales = supportedLocales.map((locale) => locale.value);
  assert.deepEqual(Object.keys(resources).sort(), [...locales].sort());
  assert.deepEqual(readdirSync("src/i18n/locales").sort(), [...locales].sort());
  assert.equal(new Set(locales).size, locales.length);
  for (const locale of locales) {
    assert.deepEqual(readdirSync("src/i18n/locales/" + locale).sort(), namespaces.map((namespace) => namespace + ".json").sort());
    const instance = createInstance();
    await instance.init({ resources, lng: locale, fallbackLng: false, ns: namespaces, initAsync: false });
    for (const namespace of namespaces) {
      const reference = flatten(resources[DEFAULT_LOCALE][namespace]);
      const current = flatten(resources[locale][namespace]);
      const baseKeys = (dictionary) => [...new Set(Object.keys(dictionary).map((key) => key.replace(pluralSuffix, "")))].sort();
      assert.deepEqual(baseKeys(current), baseKeys(reference), locale + ":" + namespace);
      for (const [key, value] of Object.entries(current)) {
        assert.ok(value.trim(), "Empty translation: " + locale + ":" + namespace + ":" + key);
        const base = key.replace(pluralSuffix, "");
        const expected = reference[base] ?? reference[base + "_other"];
        assert.deepEqual(placeholders(value), placeholders(expected), locale + ":" + namespace + ":" + key);
        assert.ok(instance.exists(namespace + ":" + key), key);
      }
      for (const key of Object.keys(reference).filter((key) => key.endsWith("_other"))) {
        const base = key.slice(0, -6);
        for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories) {
          assert.ok(current[base + "_" + category], "Missing plural: " + locale + ":" + namespace + ":" + base + "_" + category);
        }
      }
    }
  }
});

test("调用使用语义 key，静态中文不直接写入 JSX", () => {
  const knownKeys = new Set(namespaces.flatMap((namespace) => Object.keys(flatten(resources[DEFAULT_LOCALE][namespace])).flatMap((key) => [namespace + ":" + key, namespace + ":" + key.replace(pluralSuffix, "")])));
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (file !== "src/i18n/locales") inspect(file); continue; }
      if (!/\.tsx?$/.test(file) || file.endsWith(".d.ts")) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function inspectKey(node) {
        if (ts.isStringLiteral(node)) assert.ok(knownKeys.has(node.text), "Unknown translation key in " + file + ": " + node.text);
        else if (ts.isConditionalExpression(node)) { inspectKey(node.whenTrue); inspectKey(node.whenFalse); }
        else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) inspectKey(node.right);
      }
      function visit(node) {
        if (ts.isJsxText(node)) assert.ok(!/\p{Script=Han}/u.test(node.text), "Untranslated JSX text in " + file);
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "translate"].includes(node.expression.text) && node.arguments[0] && file !== "src/main-process/applicationMenu.ts") inspectKey(node.arguments[0]);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  inspect("src");
});

test("语言切换即时更新服务文案、日期、HTML lang，业务数据不作为 key", async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: "" } };
  try {
    const runtime = createLoader();
    const module = runtime("src/i18n/index.ts");
    const { getTaskError } = runtime("src/services/taskErrors.ts");
    const { getSettingsError } = runtime("src/services/settingsErrors.ts");
    const title = "自定义任务 / settings:pages.appearance";
    assert.equal(module.default.language, "en");
    assert.equal(globalThis.document.documentElement.lang, "en");
    assert.equal(module.t("tasks:actions.viewLabel", { title }), "View task: " + title);
    assert.equal(getTaskError(new Error("TASK_NOT_FOUND")), "This task was removed. Refresh the list.");
    assert.equal(getSettingsError(new Error("unknown")), "Operation failed. Please retry.");
    assert.match(module.formatDate("2026-09-30"), /Sep/);
    assert.equal(module.formatDate("invalid date"), "invalid date");
    await module.default.changeLanguage("zh-CN");
    assert.equal(globalThis.document.documentElement.lang, "zh-CN");
    assert.equal(module.t("settings:pages.appearance"), "外观");
    assert.equal(module.t("tasks:actions.viewLabel", { title }), "查看任务：" + title);
    assert.equal(getTaskError(new Error("TASK_NOT_FOUND")), "任务已被删除，请刷新列表。");
    assert.equal(getSettingsError(new Error("unknown")), "操作失败，请重试。");
    assert.match(module.formatDate("2026-09-30"), /年/);
    await module.default.changeLanguage("en");
    assert.equal(module.t("settings:pages.appearance"), "Appearance");
    assert.equal(globalThis.document.documentElement.lang, "en");
  } finally { globalThis.document = previousDocument; }
});

test("数量文案使用 i18next 语言复数规则", async () => {
  const module = createLoader()("src/i18n/index.ts");
  assert.equal(module.t("tasks:counts.tasks", { count: 0 }), "0 tasks");
  assert.equal(module.t("tasks:counts.tasks", { count: 1 }), "1 task");
  assert.equal(module.t("tasks:counts.tasks", { count: 2 }), "2 tasks");
  assert.equal(module.t("issues:counts.items", { count: 1 }), "1 item");
  assert.equal(module.t("review:commit.pushCount", { count: 1 }), "Push 1 unpushed commit");
  await module.default.changeLanguage("zh-CN");
  for (const count of [0, 1, 2]) assert.equal(module.t("tasks:counts.tasks", { count }), count + " 个任务");
});

test("语言设置沿用已有持久化值，未知语言回退默认值", () => {
  const { normalizeAppSettings, defaultSettings } = load("src/domain/settings.ts");
  assert.equal(defaultSettings.locale, "en");
  for (const { value } of supportedLocales) {
    assert.equal(normalizeLocale(value), value);
    assert.equal(normalizeAppSettings({ locale: value }).locale, value);
  }
  for (const value of [undefined, null, "", "unknown", 42]) {
    assert.equal(normalizeLocale(value), DEFAULT_LOCALE);
    assert.equal(normalizeAppSettings({ locale: value }).locale, DEFAULT_LOCALE);
  }
});

test("原生菜单共用语言资源，不改变 Electron 角色及渲染进程语言", () => {
  let template;
  const renderer = createLoader()("src/i18n/index.ts");
  const { updateApplicationMenu } = createLoader({
    electron: { Menu: { buildFromTemplate: (value) => value, setApplicationMenu: (value) => { template = value; } } },
  })("src/main-process/applicationMenu.ts");
  const roles = (items) => items.flatMap((item) => item.submenu ? roles(item.submenu) : item.role ? [item.role] : []);
  updateApplicationMenu("en");
  const englishRoles = roles(template);
  assert.ok(template.some((item) => item.label === "Edit"));
  updateApplicationMenu("zh-CN");
  assert.ok(template.some((item) => item.label === "编辑"));
  assert.deepEqual(roles(template), englishRoles);
  assert.equal(renderer.default.language, "en");
});

test("TypeScript 拒绝缺失 key、中文 key 和任意动态字符串", () => {
  const filename = path.resolve("src/i18n/__typecheck__.ts");
  const source = [
    'import { t } from "./index";',
    'import { useTranslation } from "react-i18next";',
    'import type { TranslationKey } from "./types";',
    't("settings:pages.appearance");',
    't("tasks:counts.tasks", { count: 1 });',
    'const label: TranslationKey<"issues"> = "issues:statuses.draft";',
    'const { t: translate } = useTranslation(["issues", "common"]);',
    'translate(label);',
    '// @ts-expect-error Invalid semantic key must not compile.',
    't("settings:missingKey");',
    '// @ts-expect-error Default text must not bypass strict keys.',
    't("settings:missingKey", { defaultValue: "Fallback" });',
    '// @ts-expect-error Source copy is not a key.',
    't("外观");',
    'declare const runtimeMessage: string;',
    '// @ts-expect-error Backend messages must not become translation keys.',
    't(runtimeMessage);',
    '// @ts-expect-error Dynamic maps must reference registered keys.',
    'const invalid: TranslationKey = "issues:missing";',
    '// @ts-expect-error A hook must declare the namespace it uses.',
    'translate("settings:pages.appearance");',
  ].join("\n");
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, ...rest) => path.resolve(file) === filename ? ts.createSourceFile(file, source, languageVersion, true) : getSourceFile(file, languageVersion, ...rest);
  const program = ts.createProgram([filename, path.resolve("src/i18n/i18next.d.ts")], { ...options, noEmit: true }, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: (file) => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
});
