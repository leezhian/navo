import { File, FileCode2, FileImage, FileJson, FileText } from "lucide-react";
import { getFileIconType, type FileIconType } from "./fileIcon";

export function FileTypeIcon({ path }: { path: string }) {
  const iconType = getFileIconType(path);
  const className = getFileIconClassName(iconType);
  const Icon = getFileIconComponent(iconType);

  return <Icon className={className} />;
}

function getFileIconComponent(iconType: FileIconType) {
  if (iconType === "image") {
    return FileImage;
  }

  if (iconType === "json") {
    return FileJson;
  }

  if (iconType === "markdown") {
    return FileText;
  }

  if (["css", "html", "javascript", "react", "rust", "style", "typescript", "vue"].includes(iconType)) {
    return FileCode2;
  }

  return File;
}

function getFileIconClassName(iconType: FileIconType) {
  const base = "size-[18px] shrink-0";
  const classes: Record<FileIconType, string> = {
    css: "text-sky-500",
    generic: "text-muted-foreground",
    html: "text-orange-500",
    image: "text-emerald-500",
    javascript: "text-yellow-500",
    json: "text-amber-500",
    markdown: "text-slate-500 dark:text-slate-300",
    react: "text-cyan-500",
    rust: "text-orange-700 dark:text-orange-400",
    style: "text-pink-500",
    typescript: "text-blue-600 dark:text-blue-400",
    vue: "text-green-500",
  };

  return `${base} ${classes[iconType]}`;
}
