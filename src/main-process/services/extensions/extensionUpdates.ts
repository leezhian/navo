import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionErrorCode } from "../../../shared/extensionErrors";
import { normalizeExtensionErrorCode } from "../../../shared/extensionErrors";
import type { ExtensionRelease } from "./extensionPackage";
import { downloadOfficialFile } from "./extensionDownload";
import { compareVersions, MAX_CATALOG_BYTES, readCatalogFile, verifyCatalog } from "./extensionCatalog";
import type { SignedCatalog, TrustedRelease } from "./extensionCatalog";
import trust from "./sessionTraceTrust.json";

export class ExtensionUpdates {
  candidate: TrustedRelease;
  checking = false;
  checkedAt: string | null = null;
  error: ExtensionErrorCode | null = null;
  private current?: SignedCatalog;
  private pending?: Promise<void>;
  private abort?: AbortController;
  constructor(
    private directory: string,
    private bundled: ExtensionRelease,
    private hostMajor: number,
    private changed: () => void,
    private source = trust,
  ) {
    this.candidate = { release: bundled };
  }
  private accept(envelope: SignedCatalog) {
    const catalog = verifyCatalog(envelope, this.source.publicKey);
    const bundled = catalog.releases.find((item) => item.version === this.bundled.version);
    if (bundled && (bundled.sha256 !== this.bundled.sha256 || bundled.bytes !== this.bundled.bytes)) throw Error("CATALOG_INVALID");
    if (this.current) {
      const previous = verifyCatalog(this.current, this.source.publicKey);
      if (Date.parse(catalog.publishedAt) < Date.parse(previous.publishedAt)) throw Error("CATALOG_INVALID");
      for (const release of catalog.releases) {
        const old = previous.releases.find((item) => item.version === release.version);
        if (
          old &&
          (old.sha256 !== release.sha256 ||
            old.bytes !== release.bytes ||
            old.hostMajor !== release.hostMajor ||
            old.apiVersion !== release.apiVersion)
        )
          throw Error("CATALOG_INVALID");
      }
    }
    const compatible = catalog.releases
      .filter((item) => item.hostMajor === this.hostMajor && item.apiVersion === 1)
      .sort((a, b) => compareVersions(b.version, a.version));
    const latest = compatible[0];
    if (!latest) throw Error("NO_COMPATIBLE_RELEASE");
    if (compareVersions(latest.version, this.bundled.version) >= 0) this.candidate = { release: latest, catalog: envelope };
    this.current = envelope;
  }
  async initialize() {
    try {
      this.accept(await readCatalogFile(path.join(this.directory, "updates.json")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.error = "CATALOG_INVALID";
    }
  }
  check() {
    if (this.pending) return this.pending;
    this.checking = true;
    this.error = null;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const timeout = setTimeout(() => this.abort?.abort(), 20000);
    this.changed();
    this.pending = (async () => {
      try {
        const bytes = await downloadOfficialFile(this.source.url, MAX_CATALOG_BYTES, signal);
        let envelope: SignedCatalog;
        try {
          envelope = JSON.parse(bytes.toString("utf8")) as SignedCatalog;
        } catch {
          throw Error("CATALOG_INVALID");
        }
        // 校验成功后才覆盖缓存；检查失败仍可使用之前已验证的更新。
        const previous = { candidate: this.candidate, current: this.current };
        try {
          this.accept(envelope);
          await mkdir(this.directory, { recursive: true, mode: 0o700 });
          const temporary = path.join(this.directory, "updates.tmp");
          await writeFile(temporary, JSON.stringify(envelope), { mode: 0o600 });
          await rename(temporary, path.join(this.directory, "updates.json"));
        } catch (error) {
          this.candidate = previous.candidate;
          this.current = previous.current;
          throw error;
        }
        this.checkedAt = new Date().toISOString();
      } catch (error) {
        const code = normalizeExtensionErrorCode(error instanceof Error ? error.message : undefined);
        this.error = ["CATALOG_INVALID", "NO_COMPATIBLE_RELEASE", "RELEASE_UNAVAILABLE"].includes(code) ? code : "UPDATE_CHECK_FAILED";
        throw Error(this.error);
      } finally {
        clearTimeout(timeout);
        this.abort = undefined;
        this.checking = false;
        this.pending = undefined;
        this.changed();
      }
    })();
    return this.pending;
  }
  async shutdown() {
    this.abort?.abort();
    await this.pending?.catch(() => undefined);
  }
}
