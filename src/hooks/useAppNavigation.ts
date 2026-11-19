import { useAppNavigationStore } from "@/stores/appNavigationStore";

/** 应用主导航；空状态等跨模块跳转共享同一份历史。 */
export function useAppNavigation() {
  return useAppNavigationStore();
}
