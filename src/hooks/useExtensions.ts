import { useEffect } from "react";
import { useExtensionStore } from "@/stores/extensionStore";

let readers = 0;
let unsubscribe: (() => void) | undefined;
/** 多任务面板共用一份宿主状态与事件订阅，不在 renderer 持久化副本。 */
export function useExtensions() {
  const state = useExtensionStore();
  useEffect(() => {
    readers++;
    if (readers === 1) {
      unsubscribe = window.navo?.extensions?.onChanged((status) => useExtensionStore.setState({ status }));
      void useExtensionStore.getState().refresh();
    }
    return () => {
      readers--;
      if (!readers) {
        unsubscribe?.();
        unsubscribe = undefined;
      }
    };
  }, []);
  return state;
}
