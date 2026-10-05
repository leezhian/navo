import { useRef, useState } from "react";
import type { AppSettings } from "@/domain/types";
import type { IssueItem } from "@/domain/issues";
import type { TaskAttachment, TaskResourceInfo, TaskResourceInput, TaskWebLink } from "@/shared/taskTypes";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";

export interface TaskResourceDraft extends TaskResourceInput {
  /** 选择时探测到的目录与 Git 信息；提交时主进程再次校验。 */
  info: TaskResourceInfo;
}

export function useTaskDraft(settings: AppSettings) {
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<IssueItem[]>([]);
  const [webLinks, setWebLinks] = useState<TaskWebLink[]>([]);
  const [resources, setResources] = useState<TaskResourceDraft[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestId = useRef(crypto.randomUUID());

  async function addResources(ids: string[], replacingId?: string) {
    setWorking(true);
    setError(null);
    try {
      const infos = await Promise.all(ids.map((id) => getTasksApi().inspectResource(id)));
      const remaining = resources.filter((resource) => resource.resourceId !== replacingId);
      const roots = [...remaining.map((resource) => resource.info), ...infos].map((info) => info.git?.root ?? info.path);
      if (new Set(roots).size !== roots.length) throw new Error("TASK_DUPLICATE_RESOURCE");
      const additions = infos.map((info): TaskResourceDraft => ({
        info, resourceId: info.resourceId, mode: info.git ? settings.defaultTaskMode : "folder",
        sourceBranch: info.git && settings.defaultTaskMode === "current-branch"
          ? info.git.currentBranch ? `refs/heads/${info.git.currentBranch}` : "HEAD"
          : info.git?.defaultSource ?? "",
        targetBranch: "",
      }));
      if (replacingId) {
        setResources(resources.flatMap((resource) => resource.resourceId === replacingId ? additions : [resource]));
      } else setResources([...remaining, ...additions]);
    } finally { setWorking(false); }
  }

  async function chooseFiles() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const files = await getTasksApi().chooseFiles();
      setAttachments((current) => [...current, ...files.filter((file) => !current.some((existing) => existing.id === file.id))]);
    } catch (failure) { setError(failure); }
    finally { setWorking(false); }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((file) => file.id !== id));
    void getTasksApi().releaseFiles([id]).catch(setError);
  }

  function reset() {
    setDescription(""); setLinks([]); setWebLinks([]); setResources([]); setAttachments([]); setError(null);
    requestId.current = crypto.randomUUID();
  }

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      const task = await useTaskStore.getState().create({
        requestId: requestId.current, description,
        resources: resources.map(({ resourceId, mode, sourceBranch, targetBranch }) => ({ resourceId, mode, sourceBranch, targetBranch })),
        links, webLinks, attachmentIds: attachments.map((file) => file.id),
      });
      reset();
      return task;
    } catch (failure) {
      setError(failure);
      if (String(failure).includes("TASK_CREATE_RETAINED")) requestId.current = crypto.randomUUID();
      return null;
    } finally { setWorking(false); }
  }

  return { description, setDescription, links, setLinks, webLinks, setWebLinks, resources, setResources, attachments, working, error, addResources, chooseFiles, removeAttachment, submit };
}
