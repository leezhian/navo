import { useEffect, useRef, useState } from "react";
import type { IssueItem } from "@/domain/issues";
import type { Task } from "@/domain/tasks";
import type { AddTaskResourcesInput, TaskFileReference, TaskResourceCategory } from "@/shared/taskResourceTypes";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import { isTaskLinkUrl } from "@/utils/taskWebLinks";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTaskResourceSelection } from "./useTaskResourceSelection";
import { resolveIssueUrl } from "@/services/integrationApi";
import { looksLikeProviderIssueQuery } from "@/utils/issueActions";

export function useTaskResourceDraft(task: Task, category: TaskResourceCategory) {
  const defaultMode = useSettingsStore((state) => state.settings.defaultTaskMode);
  const repositorySelection = useTaskResourceSelection(defaultMode, "single");
  const repositories = repositorySelection.selections.flatMap((item) => item.draft ? [item.draft] : []);
  const repositoriesReady = !repositorySelection.pending && repositories.every((resource) => !resource.info.git || resource.mode === "current-branch" || resource.sourceBranch);
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
  const [resolvedIssue, setResolvedIssue] = useState<IssueItem | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [preferPlainLink, setPreferPlainLink] = useState(false);
  const busyRef = useRef(false);
  const fileRef = useRef<TaskFileReference | null>(null);
  const alive = useRef(true);
  const requests = useRef<Partial<Record<TaskResourceCategory, string>>>({});
  const repositoryRequestKey = useRef("");
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (fileRef.current) void getTasksApi().releaseResourceFiles([fileRef.current.id]).catch(() => undefined); };
  }, []);
  useEffect(() => { setError(null); setAdded(false); }, [category]);
  useEffect(() => {
    if (category !== "links" || preferPlainLink || !looksLikeProviderIssueQuery(url)) {
      setResolvedIssue(null); setResolveError(null); setResolving(false); return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setResolving(true);
      void resolveIssueUrl(url.trim()).then((result) => {
        if (cancelled) return;
        if ("item" in result && result.item) { setResolvedIssue(result.item); setResolveError(null); }
        else { setResolvedIssue(null); setResolveError(("error" in result && result.error) || "unreadable"); }
      }).catch(() => { if (!cancelled) { setResolvedIssue(null); setResolveError("unreadable"); } })
        .finally(() => { if (!cancelled) setResolving(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [category, url, preferPlainLink]);

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
  const sameHref = (left: string, right: string) => { try { return new URL(left).href === new URL(right).href; } catch { return false; } };
  const archivedIds = new Set((task.archivedLinks ?? []).map((item) => item.id));
  const duplicateLink = isTaskLinkUrl(url.trim()) && (task.webLinks ?? []).some((link) => sameHref(link.url, url.trim()));
  const archivedLink = isTaskLinkUrl(url.trim()) && (task.archivedWebLinks ?? []).some((link) => sameHref(link.url, url.trim()));
  const duplicateFile = file !== null && (task.files ?? []).some((item) => item.path === file.path);
  const archivedFile = file !== null && (task.archivedFiles ?? []).some((item) => item.path === file.path);
  const selectedIssues = category === "pullRequests" ? prs : issues;
  const archivedIssue = (category === "issues" || category === "pullRequests") && selectedIssues.some((item) => archivedIds.has(item.id));
  const activeIssueCount = selectedIssues.filter((item) => !archivedIds.has(item.id)).length;
  const alreadyArchived = archivedLink || archivedFile || archivedIssue;
  const canAddResolved = Boolean(resolvedIssue && !preferPlainLink && !archivedIds.has(resolvedIssue.id) && !(task.links ?? []).some((item) => item.id === resolvedIssue.id));
  const count = category === "repositories" ? repositoriesReady ? repositories.length : 0 : category === "issues" || category === "pullRequests" ? activeIssueCount
    : category === "links" ? (canAddResolved ? 1 : Number(isTaskLinkUrl(url.trim()) && !duplicateLink && !archivedLink))
    : category === "notes" ? Number(Boolean(content.trim())) : category === "files" ? Number(file !== null && !duplicateFile && !archivedFile) : 0;

  async function submit() {
    if (busyRef.current || !count) return false;
    busyRef.current = true; setBusy(true); setError(null); setAdded(false);
    if (category === "repositories") {
      const key = JSON.stringify(repositories.map(({ draftId, mode, sourceBranch, useExistingBranch }) => [draftId, mode, sourceBranch, useExistingBranch]));
      if (repositoryRequestKey.current !== key) delete requests.current.repositories;
      repositoryRequestKey.current = key;
    }
    const requestId = requests.current[category] ?? crypto.randomUUID();
    requests.current[category] = requestId;
    const input: AddTaskResourcesInput = { requestId, links: [], webLinks: [], notes: [], fileIds: [] };
    if (category === "repositories") input.resources = repositories.map(({ resourceId, mode, sourceBranch, useExistingBranch }) => ({ resourceId, mode, sourceBranch, targetBranch: "", ...(useExistingBranch ? { useExistingBranch } : {}) }));
    if (category === "issues") input.links = issues.filter((item) => !archivedIds.has(item.id));
    if (category === "pullRequests") input.links = prs.filter((item) => !archivedIds.has(item.id));
    if (category === "links") {
      if (canAddResolved && resolvedIssue) input.links = [resolvedIssue];
      else input.webLinks = [{ id: requestId, url: url.trim(), title: linkTitle.trim() }];
    }
    if (category === "notes") input.notes = [{ id: requestId, title: noteTitle.trim(), content }];
    if (category === "files" && file) input.fileIds = [file.id];
    try {
      await useTaskStore.getState().addResources(task.id, input);
      delete requests.current[category];
      if (category === "repositories") repositorySelection.reset();
      if (category === "issues") setIssues([]);
      if (category === "pullRequests") setPrs([]);
      if (category === "links") { setUrl(""); setLinkTitle(""); setResolvedIssue(null); setResolveError(null); setPreferPlainLink(false); }
      if (category === "notes") { setNoteTitle(""); setContent(""); }
      if (category === "files") { fileRef.current = null; setFile(null); }
      setAdded(true);return true;
    } catch (failure) {
      if (String(failure).includes("TASK_CREATE_RETAINED")) delete requests.current[category];
      setError(failure);return false;
    }
    finally { busyRef.current = false; setBusy(false); }
  }
  return {
    repositorySelection, issues, setIssues, prs, setPrs, url, setUrl, linkTitle, setLinkTitle, noteTitle, setNoteTitle, content, setContent, file, chooseFile,
    busy, error, added, count, alreadyArchived, submit,
    resolvedIssue, resolveError, resolving, preferPlainLink, setPreferPlainLink,
  };
}
