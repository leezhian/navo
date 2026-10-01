import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { resourceApi } from "@/services/resourceApi";
import { settingsApi } from "@/services/settingsApi";
import { useResourceStore } from "@/stores/resourceStore";

interface ResourceFormOptions {
  /** 已有资源表示编辑，否则按 initialKind 新增。 */
  record?: ResourceRecord;
  initialKind: ResourceRecord["kind"];
  /** 仓库克隆的父目录默认值。 */
  repositoriesDirectory: string;
  /** 保存成功后关闭弹窗，不在失败时伪造成功。 */
  onSaved: () => void;
}

export function useResourceForm({ record, initialKind, repositoriesDirectory, onSaved }: ResourceFormOptions) {
  const [kind, setKind] = useState(record?.kind ?? initialKind);
  const [name, setName] = useState(record?.name ?? "");
  const [localPath, setLocalPath] = useState(record?.localPath ?? "");
  const [url, setUrl] = useState("");
  const [directory, setDirectory] = useState(repositoriesDirectory);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<unknown>(null);
  const operationId = useRef<string | null>(null);
  const upsert = useResourceStore((state) => state.upsert);
  const isClone = !record && kind === "repo";

  useEffect(() => {
    const unsubscribe = window.navo.resources.onCloneProgress((value) => {
      if (value.operationId === operationId.current) setProgress(value.message);
    });
    return () => {
      unsubscribe();
      if (operationId.current) void resourceApi.cancelClone(operationId.current).catch(() => undefined);
    };
  }, []);

  function applyFolder(path: string) {
    setLocalPath(path);
    if (!record) setKind("folder");
    const parts = path.split(/[\\/]/).filter(Boolean);
    if (!name) setName(parts[parts.length - 1] ?? "");
  }

  async function chooseFolder(forCloneDirectory = false) {
    setChoosing(true);
    setError(null);
    try {
      const path = await settingsApi.chooseDirectory();
      if (path) { if (forCloneDirectory) setDirectory(path); else applyFolder(path); }
    } catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (busy || choosing || event.dataTransfer.files.length !== 1) return;
    try {
      const path = window.navo.resources.getDroppedPath(event.dataTransfer.files[0]);
      if (!path) throw new Error("INVALID_DIRECTORY");
      applyFolder(path);
      setError(null);
    } catch (failure) { setError(failure); }
  }

  async function submit() {
    if (busy || choosing) return;
    setBusy(true);
    setError(null);
    setProgress("");
    try {
      const saved = isClone
        ? await resourceApi.clone({ operationId: operationId.current = crypto.randomUUID(), url: url.trim(), name: name.trim(), directory: directory.trim() })
        : await resourceApi.save({ id: record?.id, name: name.trim(), kind, localPath: localPath.trim() });
      operationId.current = null;
      upsert(saved);
      onSaved();
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
    kind, name, setName, localPath, setLocalPath, url, setUrl, directory, setDirectory,
    busy, choosing, cancelling, progress, error, isClone, chooseFolder, handleDrop, submit, cancelClone,
  };
}
