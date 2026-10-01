import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { resourceApi } from "@/services/resourceApi";
import { settingsApi } from "@/services/settingsApi";
import { useResourceStore } from "@/stores/resourceStore";
import { getRepositoryName } from "@/utils/resourceNames";

interface ResourceFormOptions {
  /** 已有资源表示编辑，否则新增仓库。 */
  record?: ResourceRecord;
  /** 仓库克隆的父目录默认值。 */
  repositoriesDirectory: string;
  /** 保存成功后关闭弹窗，不在失败时伪造成功。 */
  onSaved: () => void;
}

export function useResourceForm({ record, repositoriesDirectory, onSaved }: ResourceFormOptions) {
  const [name, setName] = useState(record?.name ?? "");
  const [localPath, setLocalPath] = useState(record?.localPath ?? "");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<unknown>(null);
  const operationId = useRef<string | null>(null);
  const upsert = useResourceStore((state) => state.upsert);
  const isClone = !record;

  useEffect(() => {
    const unsubscribe = window.navo.resources.onCloneProgress((value) => {
      if (value.operationId === operationId.current) setProgress(value.message);
    });
    return () => {
      unsubscribe();
      if (operationId.current) void resourceApi.cancelClone(operationId.current).catch(() => undefined);
    };
  }, []);

  async function chooseFolder() {
    if (busy || choosing) return;
    setChoosing(true);
    setError(null);
    try {
      if (record) {
        const path = await settingsApi.chooseDirectory();
        if (path) setLocalPath(path);
      } else {
        const saved = await resourceApi.chooseAndAddFolder();
        if (saved) { upsert(saved); onSaved(); }
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
      const path = window.navo.resources.getDroppedPath(event.dataTransfer.files[0]);
      if (!path) throw new Error("INVALID_DIRECTORY");
      const saved = await resourceApi.addFolder(path);
      upsert(saved);
      onSaved();
    } catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }

  async function submit() {
    if (busy || choosing) return;
    setBusy(true);
    setError(null);
    setProgress("");
    try {
      const saved = isClone
        ? await resourceApi.clone({ operationId: operationId.current = crypto.randomUUID(), url: url.trim(), name: getRepositoryName(url.trim()), directory: repositoriesDirectory })
        : await resourceApi.save({ id: record.id, name: name.trim(), kind: record.kind, localPath: localPath.trim() });
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
    name, setName, localPath, setLocalPath, url, setUrl,
    busy, choosing, cancelling, progress, error, isClone, chooseFolder, handleDrop, submit, cancelClone,
  };
}
