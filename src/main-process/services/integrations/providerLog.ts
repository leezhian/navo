import { writeDiagnosticEvent } from "../../diagnostics/diagnosticLogger";
import type { IntegrationProviderId } from "../../../shared/integrationTypes";

export interface ProviderGraphqlError {
  type?: string;
  message?: string;
  extensions?: { type?: string; code?: string };
}

/** 集成拉取失败写入 navo.log：只保留 HTTP 状态和 GraphQL type/message，不写 token。 */
export function logProviderFetchFailure(input: {
  provider: IntegrationProviderId;
  status?: number;
  errors?: ProviderGraphqlError[];
}) {
  void writeDiagnosticEvent("integration.fetch.failed", {
    providerId: input.provider,
    httpStatus: input.status,
    graphqlErrors: (input.errors ?? []).map((error) => ({
      type: error.type ?? error.extensions?.type ?? error.extensions?.code,
      message: error.message,
    })),
  });
}

/** 列表拉空时记 count=0，方便区分「成功但没有条目」和查询失败。不写 token 或检索词。 */
export function logProviderFetchResult(input: { provider: IntegrationProviderId; count: number }) {
  if (input.count !== 0) return;
  void writeDiagnosticEvent("integration.fetch.succeeded", {
    providerId: input.provider,
    count: 0,
  });
}
