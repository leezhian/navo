import type { VibeReviewerApi } from "@/shared/electronApi";

declare global {
  interface Window {
    vibeReviewer: VibeReviewerApi;
  }
}

export {};
