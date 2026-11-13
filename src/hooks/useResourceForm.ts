import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ResourceCommand, ResourceRecord } from "@/shared/settingsTypes";
import { resourceApi } from "@/services/resourceApi";
import { settingsApi } from "@/services/settingsApi";
import { useResourceStore } from "@/stores/resourceStore";
import { getRepositoryName } from "@/utils/resourceNames";
import type { ResourceCommandDetection } from "@/shared/resourceCommandDetection";
import { mergeDetectedCommands } from "@/utils/resourceCommandDetection";

interface ResourceFormOptions {
  /** 已有资源表示编辑，否则新增仓库。 */
  record?: ResourceRecord;
  /** 仓库克隆的父目录默认值。 */
  repositoriesDirectory: string;
  /** 保存成功后回传实际资源，供调用方更新选择并关闭弹窗。 */
  onSaved: (record: ResourceRecord) => void;
}

export function useResourceForm({ record, repositoriesDirectory, onSaved }: ResourceFormOptions) {
  const [name, setName] = useState(record?.name ?? "");
  const [localPath, setLocalPath] = useState(record?.localPath ?? "");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState(record?.description ?? "");
  const [commands, setCommands] = useState<ResourceCommand[]>(record?.commands ?? []);
  const commandsRef = useRef(commands);
  const [commandDetection, setCommandDetection] = useState<ResourceCommandDetection | undefined>(record?.commandDetection);
  const [detecting, setDetecting] = useState(false);
  const [detectionAdded, setDetectionAdded] = useState<number | null>(null);
  const scanRevision = useRef(0);
  const scanning = useRef(false);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<unknown>(null);
  const operationId = useRef<string | null>(null);
  const upsert = useResourceStore((state) => state.upsert);
  const isClone = !record;

  useEffect(() => {
    const unsubscribe = resourceApi.onCloneProgress((value) => {
      if (value.operationId === operationId.current) setProgress(value.message);
    });
    return () => {
      scanRevision.current += 1;
      unsubscribe();
      if (operationId.current) void resourceApi.cancelClone(operationId.current).catch(() => undefined);
    };
  }, []);

  function changeCommands(next: ResourceCommand[]) { commandsRef.current = next; setCommands(next); }
  function changePath(next: string) {
    scanRevision.current += 1; scanning.current = false; setDetecting(false);
    setCommandDetection(undefined); setDetectionAdded(null); setLocalPath(next);
  }
  async function detectCommands() {
    if (busy || choosing || scanning.current || !localPath) return;
    scanning.current = true; setDetecting(true); setDetectionAdded(null); setError(null);
    const revision = ++scanRevision.current;
    try {
      const result = await resourceApi.detectCommands(localPath);
      if (revision !== scanRevision.current) return;
      const merged = mergeDetectedCommands(commandsRef.current, result.commands);
      setDetectionAdded(merged.commands.length - commandsRef.current.length);
      changeCommands(merged.commands);
      setCommandDetection({ ...result, warnings: merged.limited ? [...result.warnings, { source: ".", code: "limitReached" as const }].slice(0,50) : result.warnings });
    } catch (failure) { if (revision === scanRevision.current) setError(failure); }
    finally { if (revision === scanRevision.current) { scanning.current = false; setDetecting(false); } }
  }

  async function chooseFolder() {
    if (busy || choosing) return;
    setChoosing(true);
    setError(null);
    try {
      if (record) {
        const path = await settingsApi.chooseDirectory();
        if (path) changePath(path);
      } else {
        const saved = await resourceApi.chooseAndAddFolder();
        if (saved) { upsert(saved); onSaved(saved); }
      }
    } catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (busy || choosing || event.dataTransfer.files.length !== 1) return;
    setChoosing(true);
    setError(null);
    try {
      const path = resourceApi.getDroppedPath(event.dataTransfer.files[0]);
      if (!path) throw new Error("INVALID_DIRECTORY");
      const saved = await resourceApi.addFolder(path);
      upsert(saved);
      onSaved(saved);
    } catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }

  async function submit() {
    if (busy || choosing || scanning.current) return;
    setBusy(true);
    setError(null);
    setProgress("");
    try {
      const saved = isClone
        ? await resourceApi.clone({ operationId: operationId.current = crypto.randomUUID(), url: url.trim(), name: getRepositoryName(url.trim()), directory: repositoriesDirectory })
        : await resourceApi.save({ id: record.id, name: name.trim(), kind: record.kind, localPath: localPath.trim(), description, commands, commandDetection });
      operationId.current = null;
      upsert(saved);
      onSaved(saved);
    } catch (failure) { setError(failure); }
    finally { operationId.current = null; setBusy(false); setCancelling(false); }
  }

  async function cancelClone() {
    if (!operationId.current || cancelling) return;
    setCancelling(true);
    try { await resourceApi.cancelClone(operationId.current); }
    catch (failure) { setError(failure); setCancelling(false); }
  }

  return {
    name, setName, localPath, setLocalPath: changePath, url, setUrl,
    description, setDescription, commands, setCommands: changeCommands,
    commandDetection, detecting, detectionAdded, detectCommands,
    busy, choosing, cancelling, progress, error, isClone, chooseFolder, handleDrop, submit, cancelClone,
  };
}
