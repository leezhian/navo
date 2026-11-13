import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionManifest } from "../../../shared/extensionTypes";

export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
export interface ExtensionRelease {
  version: string;
  sha256: string;
  bytes: number;
  url: string;
}
export interface ExtensionPackage {
  manifest: ExtensionManifest;
  files: Record<string, string>;
}
const allowedPath = /^runtime\/[a-zA-Z0-9_./-]+$/;

/** 摘要来自宿主内固定目录或通过公钥验签的官方清单，不信任下载内容自报的 hash。文件仅为 UTF-8，避免归档链接和执行解包命令。 */
export function decodePackage(bytes: Buffer, release: ExtensionRelease): ExtensionPackage {
  if (
    bytes.length > MAX_PACKAGE_BYTES ||
    bytes.length !== release.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== release.sha256
  )
    throw Error("PACKAGE_INVALID");
  const value = JSON.parse(bytes.toString("utf8")) as ExtensionPackage;
  const m = value.manifest;
  if (
    !m ||
    m.id !== "session-trace" ||
    m.version !== release.version ||
    m.apiVersion !== 1 ||
    m.hostMajor !== 1 ||
    m.runtime !== "runtime/index.cjs" ||
    "ui" in m
  )
    throw Error("INCOMPATIBLE");
  if (!value.files || typeof value.files !== "object" || Array.isArray(value.files)) throw Error("PACKAGE_INVALID");
  const entries = Object.entries(value.files);
  if (entries.length > 40 || !entries.length || !value.files[m.runtime]) throw Error("PACKAGE_INVALID");
  for (const [name, contents] of entries) {
    if (!allowedPath.test(name) || name.split("/").some((part) => !part || part === "." || part === "..") || typeof contents !== "string")
      throw Error("PACKAGE_INVALID");
  }
  return value;
}
export async function unpackPackage(bytes: Buffer, release: ExtensionRelease, directory: string) {
  const value = decodePackage(bytes, release);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const [name, contents] of Object.entries(value.files)) {
    const filename = path.join(directory, name);
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    await writeFile(filename, contents, { flag: "wx", mode: 0o600 });
  }
  await writeFile(path.join(directory, "package.navo-extension"), bytes, { flag: "wx", mode: 0o600 });
}
export async function verifyInstallation(directory: string, release: ExtensionRelease) {
  const root = await realpath(directory);
  if ((await lstat(directory)).isSymbolicLink()) throw Error("PACKAGE_INVALID");
  const value = decodePackage(await readFile(path.join(root, "package.navo-extension")), release);
  for (const [name, expected] of Object.entries(value.files)) {
    const filename = path.join(root, name);
    if ((await realpath(filename)) !== filename || (await readFile(filename, "utf8")) !== expected) throw Error("PACKAGE_INVALID");
  }
  return value.manifest;
}
