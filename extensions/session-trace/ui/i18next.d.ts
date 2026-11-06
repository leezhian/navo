import "i18next";
import type trace from "./locales/en/trace.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "trace";
    resources: { trace: typeof trace };
    returnNull: false;
    strictKeyChecks: true;
  }
}
