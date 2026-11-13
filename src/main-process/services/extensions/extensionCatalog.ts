import { verify } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { MAX_PACKAGE_BYTES } from "./extensionPackage";
import type { ExtensionRelease } from "./extensionPackage";
import trust from "./sessionTraceTrust.json";

export const MAX_CATALOG_BYTES = 128 * 1024;
export interface SignedCatalog {
  payload: string;
  signature: string;
}
export interface CatalogRelease extends ExtensionRelease {
  apiVersion: number;
  hostMajor: number;
}
export interface ExtensionCatalog {
  schemaVersion: 1;
  id: "session-trace";
  publishedAt: string;
  releases: CatalogRelease[];
}
export interface TrustedRelease {
  release: ExtensionRelease;
  /** 随安装保存原始签名，离线重启时重新验证，不信任单独存储的摘要。 */
  catalog?: SignedCatalog;
}
const versionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
export function isReleaseVersion(value: unknown): value is string {
  return typeof value === "string" && versionPattern.test(value);
}
export function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number),
    b = right.split(".").map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
export function releaseUrl(version: string) {
  return `https://github.com/leezhian/navo/releases/download/session-trace-v${version}/session-trace-${version}.navo-extension`;
}
/** 必须先验签再解释清单；安装地址、插件身份、大小和兼容接口都受签名保护。 */
export function verifyCatalog(value: unknown, publicKey = trust.publicKey): ExtensionCatalog {
  try {
    const envelope = value as SignedCatalog;
    if (
      !envelope ||
      typeof envelope.payload !== "string" ||
      typeof envelope.signature !== "string" ||
      envelope.payload.length > MAX_CATALOG_BYTES ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.payload)
    )
      throw Error();
    const payload = Buffer.from(envelope.payload, "base64");
    const signature = Buffer.from(envelope.signature, "base64");
    if (signature.length !== 64 || !verify(null, payload, publicKey, signature)) throw Error();
    const catalog = JSON.parse(payload.toString("utf8")) as ExtensionCatalog;
    if (
      catalog.schemaVersion !== 1 ||
      catalog.id !== "session-trace" ||
      typeof catalog.publishedAt !== "string" ||
      !Number.isFinite(Date.parse(catalog.publishedAt)) ||
      !Array.isArray(catalog.releases) ||
      !catalog.releases.length ||
      catalog.releases.length > 100
    )
      throw Error();
    const versions = new Set<string>();
    for (const release of catalog.releases) {
      if (
        !release ||
        !isReleaseVersion(release.version) ||
        versions.has(release.version) ||
        !/^[a-f0-9]{64}$/.test(release.sha256) ||
        !Number.isSafeInteger(release.bytes) ||
        release.bytes <= 0 ||
        release.bytes > MAX_PACKAGE_BYTES ||
        !Number.isSafeInteger(release.hostMajor) ||
        release.hostMajor < 1 ||
        !Number.isSafeInteger(release.apiVersion) ||
        release.apiVersion < 1 ||
        release.url !== releaseUrl(release.version)
      )
        throw Error();
      versions.add(release.version);
    }
    return catalog;
  } catch {
    throw Error("CATALOG_INVALID");
  }
}
export async function readCatalogFile(filename: string) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CATALOG_BYTES) throw Error("CATALOG_INVALID");
  return JSON.parse(await readFile(filename, "utf8")) as SignedCatalog;
}
export async function installedRelease(
  directory: string,
  version: string,
  bundled: ExtensionRelease,
  hostMajor: number,
  publicKey = trust.publicKey,
) {
  let envelope: SignedCatalog;
  try {
    envelope = await readCatalogFile(path.join(directory, "catalog.json"));
  } catch (error) {
    // 兼容尚未采用签名清单的首版安装；只接受宿主固定的原始包。
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && version === bundled.version && hostMajor === 1) return bundled;
    throw Error("CATALOG_INVALID");
  }
  const release = verifyCatalog(envelope, publicKey).releases.find(
    (item) => item.version === version && item.apiVersion === 1 && item.hostMajor === hostMajor,
  );
  if (!release) throw Error("INCOMPATIBLE");
  return release;
}
