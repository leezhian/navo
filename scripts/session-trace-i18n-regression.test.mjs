import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { resources } = load("src/i18n/resources.ts");
const { supportedLocales } = load("src/shared/locales.ts");
const pluralSuffix = /_(one|other)$/;
function flatten(value, prefix = "") {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    assert.match(key, /^[a-zA-Z][a-zA-Z0-9_]*$/);
    return typeof entry === "string" ? [[prefix + key, entry]] : Object.entries(flatten(entry, prefix + key + "."));
  }));
}

test("trace translations cover registered locales and plurals in the host catalog", async () => {
  const host = load("src/i18n/index.ts").default;
  const previous = host.language;
  await host.changeLanguage("en");
  assert.deepEqual(Object.keys(resources).sort(), supportedLocales.map(locale => locale.value).sort());
  const reference = flatten(resources.en.trace);
  const baseKeys = entries => [...new Set(Object.keys(entries).map(key => key.replace(pluralSuffix, "")))].sort();
  for (const { value: locale } of supportedLocales) {
    const current = flatten(resources[locale].trace);
    assert.deepEqual(baseKeys(current), baseKeys(reference));
    for (const [key, value] of Object.entries(current)) {
      assert.ok(value.trim(), key);
      const placeholders = text => [...text.matchAll(/{{(\w+)}}/g)].map(match => match[1]).sort();
      assert.deepEqual(placeholders(value), placeholders(reference[key] ?? reference[key.replace(pluralSuffix, "_other")]));
    }
    for (const key of Object.keys(reference).filter(key => key.endsWith("_other"))) {
      for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories)
        assert.ok(current[key.replace(/_other$/, "_" + category)], locale + ":" + key);
    }
  }
  for (const [key, singular, plural] of [["turns", "turn", "turns"], ["requests", "model request", "model requests"], ["tools", "tool", "tools"], ["events", "event", "events"], ["errors", "error", "errors"]]) {
    for (const count of [0, 1, 2]) assert.equal(host.t("trace:counts." + key, { count }), `${count} ${count === 1 ? singular : plural}`);
  }
  await host.changeLanguage("zh-CN");
  for (const count of [0, 1, 2]) assert.equal(host.t("trace:counts.events", { count }), `${count} 条事件`);
  assert.equal(host.t("trace:unknown.requests"), "— 次模型请求");
  await host.changeLanguage(previous);
});

test("trace TypeScript rejects unregistered translation keys and runtime strings", () => {
  const directory = path.resolve(".");
  const filename = path.join(directory, "src/i18n/__trace-typecheck__.ts");
  const source = [
    'import { useTranslation } from "react-i18next";',
    'const { t } = useTranslation(["trace", "settings"]);',
    't("trace:counts.events", { count: 1 });',
    't("trace:kinds.tool");',
    't("settings:labs.retry");',
    '// @ts-expect-error Missing keys must fail even with a default value.',
    't("trace:missingKey", { defaultValue: "Fallback" });',
    'declare const arbitrary: string;',
    '// @ts-expect-error Runtime messages are not translation keys.',
    't(arbitrary);',
  ].join("\n");
  const config = ts.readConfigFile(path.join(directory, "tsconfig.json"), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, ...rest) => path.resolve(file) === filename ? ts.createSourceFile(file, source, languageVersion, true) : getSourceFile(file, languageVersion, ...rest);
  const program = ts.createProgram([filename, path.join(directory, "src/i18n/i18next.d.ts")], { ...options, noEmit: true }, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
});
