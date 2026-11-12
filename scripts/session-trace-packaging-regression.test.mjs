import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const parserImport = /(?:from|import)\s*['"][^'"]*(?:extensions\/session-trace|extension-dist)[^'"]*['"]|import\s*\(\s*['"][^'"]*(?:extensions\/session-trace|extension-dist)[^'"]*['"]\s*\)/;
const packagedParser = /extensions\/session-trace|extension-dist/;

function importsOf(source) {
  return [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1] ?? match[2]);
}

function resolveImport(importer, specifier) {
  if (specifier.startsWith("@/")) return path.join(root, "src", specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(importer), specifier);
  return null;
}

function existingFile(base) {
  const candidates = [base, base + ".ts", base + ".tsx", base + ".js", path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.find(file => existsSync(file) && !file.includes("node_modules") && statSync(file).isFile());
}

test("Navo install artifacts do not include the session-trace parser or plugin package", () => {
  const configs = ["forge.config.ts", "vite.main.config.ts", "vite.preload.config.ts", "vite.renderer.config.ts"].map(file => readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(configs, packagedParser, "Forge/Vite config must not package the parser or extension-dist");

  const queue = ["src/main.ts", "src/preload.ts", "src/main.tsx"].map(file => path.join(root, file));
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, parserImport, file + " must not import the parser or plugin package");
    for (const specifier of importsOf(source)) {
      const resolved = resolveImport(file, specifier);
      if (!resolved) continue;
      const next = existingFile(resolved);
      if (next && next.startsWith(path.join(root, "src") + path.sep)) queue.push(next);
    }
  }
  assert.ok(seen.size > 10, "Host import graph should be walked");
  assert.ok([...seen].some(file => file.endsWith("SessionTracePane.tsx") || file.includes(path.join("workspace", "trace"))), "Official trace UI may ship with the host");
});
