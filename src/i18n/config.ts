import { DEFAULT_LOCALE, supportedLocales } from "../shared/locales";
import { defaultNS, namespaces, resources } from "./resources";

/** 主进程和渲染进程各自创建实例，共用资源和回退规则。 */
export const i18nOptions = {
  resources,
  ns: namespaces,
  defaultNS,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales.map((locale) => locale.value),
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
} as const;
