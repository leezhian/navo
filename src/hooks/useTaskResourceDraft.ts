import { useEffect, useRef, useState } from "react";
import type { IssueItem } from "@/domain/issues";
import type { Task } from "@/domain/tasks";
import type { AddTaskResourcesInput, TaskFileReference, TaskResourceCategory } from "@/shared/taskResourceTypes";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import { isTaskLinkUrl } from "@/utils/taskWebLinks";

export function useTaskResourceDraft(task: Task, category: TaskResourceCategory) {
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [prs, setPrs] = useState<IssueItem[]>([]);
  const [url, setUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<TaskFileReference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [added, setAdded] = useState(false);
  const busyRef = useRef(false);
  const fileRef = useRef<TaskFileReference | null>(null);
  const alive = useRef(true);
  const requests = useRef<Partial<Record<TaskResourceCategory, string>>>({});
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (fileRef.current) void getTasksApi().releaseResourceFiles([fileRef.current.id]).catch(() => undefined); };
  }, []);
  useEffect(() => { setError(null); setAdded(false); }, [category]);

  async function chooseFile() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setAdded(false);
    try {
      const chosen = await getTasksApi().chooseResourceFile();
      if (!chosen) return;
      if (!alive.current) { await getTasksApi().releaseResourceFiles([chosen.id]); return; }
      const previous = fileRef.current;
      fileRef.current = chosen; setFile(chosen);
      if (previous && previous.id !== chosen.id) await getTasksApi().releaseResourceFiles([previous.id]);
    } catch (failure) { if (alive.current) setError(failure); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const duplicateLink = isTaskLinkUrl(url.trim()) && (task.webLinks ?? []).some((link) => new URL(link.url).href === new URL(url.trim()).href);
  const duplicateFile = file !== null && (task.files ?? []).some((item) => item.path === file.path);
  const count = category === "issues" ? issues.length : category === "pullRequests" ? prs.length
    : category === "links" ? Number(isTaskLinkUrl(url.trim()) && !duplicateLink)
    : category === "notes" ? Number(Boolean(content.trim())) : category === "files" ? Number(file !== null && !duplicateFile) : 0;

  async function submit() {
    if (busyRef.current || !count) return false;
    busyRef.current = true; setBusy(true); setError(null); setAdded(false);
    const requestId = requests.current[category] ?? crypto.randomUUID();
    requests.current[category] = requestId;
    const input: AddTaskResourcesInput = { requestId, links: [], webLinks: [], notes: [], fileIds: [] };
    if (category === "issues") input.links = issues;
    if (category === "pullRequests") input.links = prs;
    if (category === "links") input.webLinks = [{ id: requestId, url: url.trim(), title: linkTitle.trim() }];
    if (category === "notes") input.notes = [{ id: requestId, title: noteTitle.trim(), content }];
    if (category === "files" && file) input.fileIds = [file.id];
    try {
      await useTaskStore.getState().addResources(task.id, input);
      delete requests.current[category];
      if (category === "issues") setIssues([]);
      if (category === "pullRequests") setPrs([]);
      if (category === "links") { setUrl(""); setLinkTitle(""); }
      if (category === "notes") { setNoteTitle(""); setContent(""); }
      if (category === "files") { fileRef.current = null; setFile(null); }
      setAdded(true);return true;
    } catch (failure) { setError(failure);return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  return { issues, setIssues, prs, setPrs, url, setUrl, linkTitle, setLinkTitle, noteTitle, setNoteTitle, content, setContent, file, chooseFile, busy, error, added, count, duplicateLink, duplicateFile, submit };
}
