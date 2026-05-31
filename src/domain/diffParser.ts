import { parsePatchFiles } from "@pierre/diffs";
import type { ChangeTypes, FileDiffMetadata } from "@pierre/diffs";
import type { DiffFile, FileStatus, ReviewSummary } from "./types";

const LARGE_FILE_LINE_THRESHOLD = 3000;
const LARGE_DIFF_LINE_THRESHOLD = 6000;

export function parseGitDiff(rawDiff: string, cacheKeyPrefix = "review-diff"): ReviewSummary {
  const parsedPatches = parsePatchFiles(rawDiff, cacheKeyPrefix);
  const binaryFilePaths = getBinaryFilePaths(rawDiff);
  const files = parsedPatches.flatMap((patch) => patch.files.map((file) => toDiffFile(file, binaryFilePaths)));
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
