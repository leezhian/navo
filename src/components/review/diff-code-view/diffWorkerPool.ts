import type { LineDiffTypes } from "@pierre/diffs";
import type { WorkerInitializationRenderOptions, WorkerPoolOptions } from "@pierre/diffs/react";

const DIFF_WORKER_POOL_SIZE_LIMIT = 4;
const DIFF_WORKER_AST_CACHE_SIZE = 200;

export const diffWorkerPoolOptions: WorkerPoolOptions = {
  poolSize: getDiffWorkerPoolSize(),
  totalASTLRUCacheSize: DIFF_WORKER_AST_CACHE_SIZE,
  workerFactory: createDiffWorker,
};

export const diffWorkerHighlighterOptions: WorkerInitializationRenderOptions = {
  langs: ["typescript", "tsx", "javascript", "jsx", "json", "css", "scss", "markdown", "text"],
  // Worker 池会用这套初始化；运行时切换文字差异需再调 setRenderOptions。
  lineDiffType: "word-alt",
  tokenizeMaxLineLength: 3000,
};

/** 查看选项里“文字差异”开关映射到 Pierre 的 lineDiffType。 */
export function getLineDiffType(enableTextDiff: boolean): LineDiffTypes {
  return enableTextDiff ? "word-alt" : "none";
}

function createDiffWorker() {
  return new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
    name: "navo-diff-worker",
    type: "module",
  });
}

function getDiffWorkerPoolSize() {
  const hardwareConcurrency = typeof navigator === "undefined" ? DIFF_WORKER_POOL_SIZE_LIMIT : navigator.hardwareConcurrency;
  return Math.max(1, Math.min(hardwareConcurrency || DIFF_WORKER_POOL_SIZE_LIMIT, DIFF_WORKER_POOL_SIZE_LIMIT));
}
