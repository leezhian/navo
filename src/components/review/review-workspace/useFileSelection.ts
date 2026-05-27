import type { AppSettings, DiffFile } from "@/domain/types";

export function useFileSelection({
  readingMode,
  onSelectedFileChange,
}: {
  readingMode: AppSettings["readingMode"];
  onSelectedFileChange: (fileId: string) => void;
}) {
  function selectFile(file: DiffFile) {
    onSelectedFileChange(file.id);

    if (readingMode === "continuous") {
      // 连续模式中选择文件应定位到对应 diff；单文件模式会通过状态切换内容，无需滚动。
      document.getElementById(`diff-file-${file.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  return { selectFile };
}
