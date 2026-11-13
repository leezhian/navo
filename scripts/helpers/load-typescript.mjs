import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);

export function createLoader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    if (absolute.endsWith(".json")) {
      module.exports = JSON.parse(readFileSync(absolute, "utf8"));
      return module.exports;
    }
    const { outputText } = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    });
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith(".") || name.startsWith("@/")) {
        const base = name.startsWith("@/") ? path.resolve("src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
        const resolved = [base + ".ts", base + ".tsx", path.join(base, "index.ts"), base.endsWith(".json") ? base : ""].find((candidate) => candidate && existsSync(candidate));
        if (!resolved) throw new Error("Cannot load test module: " + name);
        return load(resolved);
      }
      return require(name);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
