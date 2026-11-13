import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";

interface TaskProjectSummaryProps {
  /** 按任务关联顺序展示各项目与分支，超出可用宽度时单行省略。 */
  task: Task;
}

export function TaskProjectSummary({ task }: TaskProjectSummaryProps) {
  const { t } = useTranslation(["common", "tasks"]);
  // 使用任务已保存的分支信息，避免渲染列表时逐个查询本地 Git。
  const projects = task.resources?.length
    ? task.resources.map((resource) => ({
      name: resource.name,
      branch: resource.mode === "folder" ? "" : resource.targetBranch || resource.sourceBranch,
    }))
    : [{ name: task.projectName || t("tasks:fields.noProject"), branch: "" }];
  const description = projects.map((project) => [project.name, project.branch].filter(Boolean).join(" · ")).join(", ");

  return <span className="task-project block text-xs text-muted-foreground" title={description}>
    {projects.map((project, index) => <span key={task.resources?.[index]?.resourceId ?? index} className="task-project-entry mr-3 last:mr-0">
      <span>{project.name}</span>
      {project.branch && <>
        <GitBranch className="mx-1 inline-block size-3 align-[-2px]" aria-hidden="true" />
        <span className="task-project-branch">{project.branch}</span>
      </>}
    </span>)}
  </span>;
}
