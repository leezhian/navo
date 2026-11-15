export type TaskFilePreviewType = "text" | "markdown" | "image" | "unsupported";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown"]);
const OFFICE_EXTENSIONS = new Set([
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf",
]);
const TEXT_EXTENSIONS = new Set([
  ".txt", ".text", ".log", ".json", ".jsonc", ".json5", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".css", ".scss", ".less", ".html", ".htm", ".xml", ".yml", ".yaml", ".toml", ".ini", ".cfg",
  ".conf", ".env", ".sh", ".bash", ".zsh", ".fish", ".ps1", ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".php", ".swift", ".sql", ".graphql", ".proto", ".lua",
  ".r", ".pl", ".pm", ".vue", ".svelte", ".astro", ".gitignore", ".dockerignore", ".editorconfig",
  ".csv", ".tsv", ".mdx", ".lock",
]);

function extensionOf(name: string) {
  const base = name.toLowerCase();
  const index = base.lastIndexOf(".");
  return index >= 0 ? base.slice(index) : "";
}

export function classifyTaskFilePreview(name: string, sample: Buffer | null): TaskFilePreviewType {
  const extension = extensionOf(name);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (OFFICE_EXTENSIONS.has(extension)) return "unsupported";
  if (MARKDOWN_EXTENSIONS.has(extension)) return sampleContainsNull(sample) ? "unsupported" : "markdown";
  if (TEXT_EXTENSIONS.has(extension)) return sampleContainsNull(sample) ? "unsupported" : "text";
  if (!sample || sampleContainsNull(sample) || !looksLikeText(sample)) return "unsupported";
  return "text";
}

function sampleContainsNull(sample: Buffer | null) {
  return Boolean(sample && sample.includes(0));
}

function looksLikeText(sample: Buffer) {
  try { new TextDecoder("utf-8", { fatal: true }).decode(sample); }
  catch { return false; }
  const text = sample.toString("utf8");
  return ![...text].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
}
