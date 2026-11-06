import { MAX_PACKAGE_BYTES } from "./extensionPackage";
import type { ExtensionRelease } from "./extensionPackage";

/** 只请求目录中的官方 Release；GitHub 下载可重定向到官方资源域名。 */
export async function downloadExtension(release: ExtensionRelease, signal: AbortSignal, progress: (value: number) => void) {
  let url = release.url;
  for (let redirect = 0; redirect < 5; redirect++) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(parsed.hostname)
    )
      throw Error("DOWNLOAD_FAILED");
    const response = await fetch(url, { signal, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) throw Error("DOWNLOAD_FAILED");
      url = new URL(next, url).href;
      continue;
    }
    if (!response.ok || !response.body) throw Error(response.status === 404 ? "RELEASE_UNAVAILABLE" : "DOWNLOAD_FAILED");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > MAX_PACKAGE_BYTES || size > release.bytes) throw Error("PACKAGE_INVALID");
        chunks.push(next.value);
        progress(Math.min(95, Math.floor((size / release.bytes) * 95)));
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return Buffer.concat(chunks);
  }
  throw Error("DOWNLOAD_FAILED");
}
