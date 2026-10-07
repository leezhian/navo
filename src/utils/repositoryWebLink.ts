import type { RepositoryWebLink } from "../shared/workspaceOpenTypes";

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

/** 将本地 Git 远端转换为网页地址，不携带认证信息，不访问远端探测服务商。 */
export function repositoryWebLink(remote: string | null): RepositoryWebLink | null {
  if (!remote || /\s/.test(remote) || hasControlCharacters(remote)) return null;
  try {
    const scp = !remote.includes("://") && remote.match(/^(?:[^/@:]+@)?([a-zA-Z0-9.-]+):(.+)$/);
    if (scp && !remote.includes("@") && !scp[1].includes(".")) return null;
    const parsed = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : remote);
    if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol) || !parsed.hostname) return null;
    const segments = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (!segments.length || segments.some((part) => part === "." || part === ".." || hasControlCharacters(part) || /[\\/?#]/.test(part))) return null;
    const url = new URL(`${parsed.protocol === "http:" ? "http:" : "https:"}//${parsed.hostname}`);
    if (["http:", "https:"].includes(parsed.protocol)) url.port = parsed.port;
    url.pathname = "/" + segments.map(encodeURIComponent).join("/");
    const host = parsed.hostname.toLowerCase();
    const provider = host === "github.com" ? "GitHub" : host === "gitlab.com" || host.startsWith("gitlab.") ? "GitLab"
      : host === "bitbucket.org" ? "Bitbucket" : host === "gitee.com" ? "Gitee" : parsed.hostname;
    return { provider, url: url.href };
  } catch { return null; }
}
