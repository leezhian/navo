import { useRef, useState } from "react";
import type { AppSettings } from "@/domain/types";
import type { IssueItem } from "@/domain/issues";
import type { TaskAttachment, TaskWebLink } from "@/shared/taskTypes";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import type { TaskAgentSelection } from "@/shared/agentCapabilities";

import { createTaskResourceDraft, mergeTaskResourceDrafts } from "@/domain/taskResourceDraft";
import type { TaskResourceDraft } from "@/domain/taskResourceDraft";

export function useTaskDraft(settings: AppSettings) {
  const [agent, setAgent] = useState<TaskAgentSelection | null>(null);
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
      const additions = infos.map((info) => createTaskResourceDraft(info, settings.defaultTaskMode));
      setResources(mergeTaskResourceDrafts(resources, additions, replacingId));
    } finally { setWorking(false); }
  }

  function addSelectedResources(additions: TaskResourceDraft[]) {
    setResources(mergeTaskResourceDrafts(resources, additions));
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
    setAgent(null);
    setDescription(""); setLinks([]); setWebLinks([]); setResources([]); setAttachments([]); setError(null);
    requestId.current = crypto.randomUUID();
  }

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      const task = await useTaskStore.getState().create({
        requestId: requestId.current, description,
        ...(agent ? { agent } : {}),
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

  return { agent, setAgent, description, setDescription, links, setLinks, webLinks, setWebLinks, resources, setResources, attachments, working, error, addResources, addSelectedResources, chooseFiles, removeAttachment, submit };
}
