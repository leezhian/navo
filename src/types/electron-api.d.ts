import type { NavoApi } from "@/shared/electronApi";

declare global {
  interface Window {
    navo: NavoApi;
  }
}

export {};
