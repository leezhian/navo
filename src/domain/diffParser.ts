import type { DiffFile, DiffHunk, DiffLine, ReviewSummary } from "./types";

const LARGE_FILE_LINE_THRESHOLD = 3000;
const LARGE_DIFF_LINE_THRESHOLD = 6000;

export function parseGitDiff(rawDiff: string): ReviewSummary {
  const files: DiffFile[] = [];
  const lines = rawDiff.split(/\r?\n/);
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentFile) {
        files.push(currentFile);
      }
      currentHunk = null;
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      const oldPath = match?.[1] ?? null;
      const newPath = match?.[2] ?? oldPath ?? "unknown";
      currentFile = {
        id: normalizeFileId(newPath),
        oldPath,
        newPath,
        displayPath: newPath,
        status: "modified",
        additions: 0,
        deletions: 0,
        isBinary: false,
        isLarge: false,
        hunks: [],
      };
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith("new file mode")) {
      currentFile.status = "added";
      continue;
    }

    if (line.startsWith("deleted file mode")) {
      currentFile.status = "deleted";
      continue;
    }

    if (line.startsWith("similarity index") || line.startsWith("rename from ")) {
      currentFile.status = "renamed";
      continue;
    }

    if (line.startsWith("Binary files ")) {
      currentFile.status = "binary";
      currentFile.isBinary = true;
      continue;
    }

    if (line.startsWith("@@")) {
      const hunkMatch = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      oldLine = Number(hunkMatch?.[1] ?? 0);
      newLine = Number(hunkMatch?.[3] ?? 0);
      currentHunk = {
        id: `${currentFile.id}-hunk-${currentFile.hunks.length + 1}`,
        oldStart: oldLine,
        newStart: newLine,
        header: line,
        leadingContext: 0,
        trailingContext: 0,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk || line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }

    const diffLine = parseDiffLine(line, currentHunk.id, oldLine, newLine);
    currentHunk.lines.push(diffLine);

    if (diffLine.type === "add") {
      currentFile.additions += 1;
      newLine += 1;
    } else if (diffLine.type === "delete") {
      currentFile.deletions += 1;
      oldLine += 1;
    } else {
      oldLine += 1;
      newLine += 1;
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  for (const file of files) {
    const lineCount = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    file.isLarge = lineCount > LARGE_FILE_LINE_THRESHOLD;
  }

  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const totalLines = files.reduce(
    (sum, file) => sum + file.hunks.reduce((hunkSum, hunk) => hunkSum + hunk.lines.length, 0),
    0,
  );

  return {
    files,
    additions,
    deletions,
    fileCount: files.length,
    isLargeDiff: totalLines > LARGE_DIFF_LINE_THRESHOLD || files.some((file) => file.isLarge),
  };
}

function parseDiffLine(line: string, hunkId: string, oldLine: number, newLine: number): DiffLine {
  const marker = line[0];
  const content = line.slice(1);

  if (marker === "+") {
    return {
      id: `${hunkId}-new-${newLine}`,
      type: "add",
      oldLineNumber: null,
      newLineNumber: newLine,
      content,
    };
  }

  if (marker === "-") {
    return {
      id: `${hunkId}-old-${oldLine}`,
      type: "delete",
      oldLineNumber: oldLine,
      newLineNumber: null,
      content,
    };
  }

  return {
    id: `${hunkId}-context-${oldLine}-${newLine}`,
    type: "context",
    oldLineNumber: oldLine,
    newLineNumber: newLine,
    content: marker === " " ? content : line,
  };
}

function normalizeFileId(path: string) {
  return path.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

