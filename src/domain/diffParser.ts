import { parsePatchFiles, processFile } from "@pierre/diffs";
import type { ChangeTypes, FileContents, FileDiffMetadata } from "@pierre/diffs";
import type { DiffFile, FileStatus, ReviewSummary } from "./types";

const LARGE_FILE_LINE_THRESHOLD = 3000;
const LARGE_DIFF_LINE_THRESHOLD = 6000;

export interface GitFileSnapshot {
  /** diff 旧侧文件路径，新增文件时为空。 */
  old_path: string | null;
  /** diff 新侧文件路径，删除文件时为空。 */
  new_path: string | null;
  /** 旧侧完整文件内容，缺失时 Pierre 只能展示 patch 中已有上下文。 */
  old_content: string | null;
  /** 新侧完整文件内容，缺失时 Pierre 只能展示 patch 中已有上下文。 */
  new_content: string | null;
}

export function parseGitDiff(
  rawDiff: string,
  cacheKeyPrefix = "review-diff",
  fileSnapshots: GitFileSnapshot[] = [],
): ReviewSummary {
  // cacheKeyPrefix 只承载会话/模式等稳定前缀，不要混入整份 rawDiff hash；
  // 否则任一文件改动会导致所有文件 cacheKey 失效，CodeView 全量重建并滚回顶部。
  const parsedPatches = parsePatchFiles(rawDiff, cacheKeyPrefix);
  const rawDiffFiles = splitRawDiffFiles(rawDiff);
  const snapshotMap = createSnapshotMap(fileSnapshots);
  const binaryFilePaths = getBinaryFilePaths(rawDiff);
  let globalFileIndex = 0;
  const files = parsedPatches.flatMap((patch) =>
    patch.files.map((file) => {
      const rawDiffFile = rawDiffFiles[globalFileIndex];
      globalFileIndex += 1;
      const fileCacheKey = createFileCacheKey(cacheKeyPrefix, file, rawDiffFile);

      return toDiffFile(
        resolveExpandablePierreFile(file, rawDiffFile, snapshotMap, fileCacheKey),
        binaryFilePaths,
      );
    }),
  );
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const totalLines = files.reduce((sum, file) => sum + getRenderedLineCount(file.pierreFile), 0);

  return {
    files,
    additions,
    deletions,
    fileCount: files.length,
    isLargeDiff: totalLines > LARGE_DIFF_LINE_THRESHOLD || files.some((file) => file.isLarge),
  };
}

function resolveExpandablePierreFile(
  fallbackFile: FileDiffMetadata,
  rawDiffFile: string | undefined,
  snapshotMap: Map<string, GitFileSnapshot>,
  cacheKey: string,
) {
  // 即使无法展开上下文，也要写回稳定 cacheKey，供 CodeView item version 做增量更新。
  const withStableKey = assignCacheKey(fallbackFile, cacheKey);

  if (!rawDiffFile) {
    return withStableKey;
  }

  const snapshot = snapshotMap.get(fallbackFile.name) ?? snapshotMap.get(fallbackFile.prevName ?? "");

  if (!snapshot || snapshot.old_content == null || snapshot.new_content == null) {
    return withStableKey;
  }

  // Pierre 只有拿到完整的新旧文件内容时，才能展开 diff 中折叠的未修改行。
  return (
    processFile(rawDiffFile, {
      cacheKey,
      isGitDiff: true,
      newFile: createFileContents(snapshot.new_path ?? fallbackFile.name, snapshot.new_content),
      oldFile: createFileContents(snapshot.old_path ?? fallbackFile.prevName ?? fallbackFile.name, snapshot.old_content),
    }) ?? withStableKey
  );
}

/** 按文件路径 + 该文件 patch 内容生成 cacheKey，未改动的文件在软刷新后可复用。 */
function createFileCacheKey(prefix: string, file: FileDiffMetadata, rawDiffFile: string | undefined) {
  const pathPart = file.name || file.prevName || "file";
  return `${prefix}:${pathPart}:${hashString(rawDiffFile ?? "")}`;
}

function assignCacheKey(file: FileDiffMetadata, cacheKey: string): FileDiffMetadata {
  if (file.cacheKey === cacheKey) {
    return file;
  }

  return {
    ...file,
    cacheKey,
  };
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function createFileContents(name: string, contents: string): FileContents {
  return { name, contents };
}

function createSnapshotMap(fileSnapshots: GitFileSnapshot[]) {
  const snapshotMap = new Map<string, GitFileSnapshot>();

  for (const snapshot of fileSnapshots) {
    if (snapshot.new_path) {
      snapshotMap.set(snapshot.new_path, snapshot);
    }
    if (snapshot.old_path) {
      snapshotMap.set(snapshot.old_path, snapshot);
    }
  }

  return snapshotMap;
}

function splitRawDiffFiles(rawDiff: string) {
  const firstFileIndex = rawDiff.startsWith("diff --git ") ? 0 : rawDiff.indexOf("\ndiff --git ");

  if (firstFileIndex < 0) {
    return [];
  }

  const diffOnly = rawDiff.slice(firstFileIndex === 0 ? 0 : firstFileIndex + 1);
  // parsePatchFiles 会把所有文件合并到 patch 结构里；这里保留原始文件级 patch 供 processFile 展开上下文。
  return diffOnly.split(/\n(?=diff --git )/);
}

function toDiffFile(pierreFile: FileDiffMetadata, binaryFilePaths: Set<string>): DiffFile {
  const displayPath = pierreFile.name;
  const lineCount = getRenderedLineCount(pierreFile);
  const isBinary = binaryFilePaths.has(displayPath);
  const status = isBinary ? "binary" : getFileStatus(pierreFile.type);

  return {
    id: normalizeFileId(displayPath),
    oldPath: pierreFile.prevName ?? displayPath,
    newPath: displayPath,
    displayPath,
    status,
    additions: pierreFile.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
    deletions: pierreFile.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0),
    isBinary,
    isLarge: lineCount > LARGE_FILE_LINE_THRESHOLD,
    pierreFile,
  };
}

function getBinaryFilePaths(rawDiff: string) {
  const binaryFilePaths = new Set<string>();
  const binaryFilePattern = /^Binary files (?:a\/(.+)|\/dev\/null) and (?:b\/(.+)|\/dev\/null) differ$/;

  for (const line of rawDiff.split(/\r?\n/)) {
    const match = binaryFilePattern.exec(line);
    const path = match?.[2] ?? match?.[1];

    if (path) {
      binaryFilePaths.add(path);
    }
  }

  return binaryFilePaths;
}

function getRenderedLineCount(file: FileDiffMetadata) {
  return Math.max(file.splitLineCount, file.unifiedLineCount, file.additionLines.length, file.deletionLines.length);
}

function getFileStatus(changeType: ChangeTypes): FileStatus {
  switch (changeType) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-changed":
    case "rename-pure":
      return "renamed";
    default:
      return "modified";
  }
}

function normalizeFileId(path: string) {
  return path.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}
