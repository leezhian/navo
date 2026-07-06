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
  lineDiffType: "word",
  tokenizeMaxLineLength: 3000,
};

function createDiffWorker() {
  return new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
    name: "vibe-reviewer-diff-worker",
    type: "module",
  });
}

function getDiffWorkerPoolSize() {
  const hardwareConcurrency = typeof navigator === "undefined" ? DIFF_WORKER_POOL_SIZE_LIMIT : navigator.hardwareConcurrency;
  return Math.max(1, Math.min(hardwareConcurrency || DIFF_WORKER_POOL_SIZE_LIMIT, DIFF_WORKER_POOL_SIZE_LIMIT));
}
