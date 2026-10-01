import type { IntegrationStatus } from "@/shared/settingsTypes";

const providers: { id: IntegrationStatus["id"]; name: string }[] = [
  { id: "gitlab", name: "GitLab" }, { id: "gitlab-self-hosted", name: "GitLab Self-Hosted" },
  { id: "github", name: "GitHub" }, { id: "github-enterprise", name: "GitHub Enterprise" },
  { id: "linear", name: "Linear" },
];

/** 后续替换为真实连接状态请求；目前明确返回占位状态。 */
export async function loadIntegrationStatuses(): Promise<IntegrationStatus[]> {
  return providers.map((provider) => ({ ...provider, connected: false, placeholder: true }));
}
