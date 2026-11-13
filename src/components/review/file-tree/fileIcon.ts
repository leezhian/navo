export type FileIconType =
  | "css"
  | "html"
  | "image"
  | "javascript"
  | "json"
  | "markdown"
  | "react"
  | "rust"
  | "style"
  | "typescript"
  | "vue"
  | "generic";

const extensionIconMap: Record<string, FileIconType> = {
  css: "css",
  gif: "image",
  html: "html",
  jpeg: "image",
  jpg: "image",
  js: "javascript",
  json: "json",
  jsx: "react",
  md: "markdown",
  mdx: "markdown",
  png: "image",
  rs: "rust",
  sass: "style",
  scss: "style",
  svg: "image",
  ts: "typescript",
  tsx: "react",
  vue: "vue",
};

export function getFileIconType(path: string): FileIconType {
  return extensionIconMap[getFileExtension(path)] ?? "generic";
}

function getFileExtension(path: string) {
  const fileName = path.split("/").pop() ?? "";
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName ? extension.toLowerCase() : "";
}
