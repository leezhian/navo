import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/** 只检查所选目录的直接子目录；不遍历依赖树、不跟随目录链接、不执行仓库代码。 */
export async function discoverResourceDirectories(parent: string): Promise<string[]> {
  const repositories: string[] = [];
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const directory = path.join(parent, entry.name);
    const marker = await stat(path.join(directory, ".git")).catch(() => null);
    if (marker?.isDirectory() || marker?.isFile()) repositories.push(directory);
  }
  return repositories.sort();
}
