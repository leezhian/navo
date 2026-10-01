/** 从 HTTPS、SSH 或 SCP 风格地址提取名称，目标目录仍由主进程校验。 */
export function getRepositoryName(url: string) {
  try {
    const remotePath = url.includes("://") ? new URL(url).pathname : url.slice(url.indexOf(":") + 1);
    const segments = remotePath.replace(/\/+$/, "").split("/");
    const name = decodeURIComponent(segments[segments.length - 1]).replace(/\.git$/i, "");
    if (!name) throw new Error("INVALID_REPOSITORY_URL");
    return name;
  } catch { throw new Error("INVALID_REPOSITORY_URL"); }
}

/** 本地目录名用于默认展示名称，根目录回退为原路径。 */
export function getFolderName(localPath: string) {
  const segments = localPath.split(/[\\/]/).filter(Boolean);
  return (segments[segments.length - 1] ?? localPath).slice(0, 100);
}
