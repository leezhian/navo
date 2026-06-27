import type { AppSettings, DiffFile } from "@/domain/types";

interface UseFileSelectionOptions {
  /** 当前阅读模式；连续模式需要滚动定位，单文件模式只需切换选中文件。 */
  readingMode: AppSettings["readingMode"];
  /** 选择文件时同步上层的 selectedFileId。 */
  onSelectedFileChange: (fileId: string) => void;
}

export function useFileSelection({ readingMode, onSelectedFileChange }: UseFileSelectionOptions) {
  function selectFile(file: DiffFile) {
    onSelectedFileChange(file.id);

    if (readingMode === "continuous") {
      // 连续模式中选择文件应定位到对应 diff；单文件模式会通过状态切换内容，无需滚动。
      document.getElementById(`diff-file-${file.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  return { selectFile };
}
