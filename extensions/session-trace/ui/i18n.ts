import { createInstance } from "i18next";
import { DEFAULT_LOCALE, supportedLocales } from "../../../src/shared/locales";
import en from "./locales/en/trace.json";
import zhCN from "./locales/zh-CN/trace.json";

export const resources = { en: { trace: en }, "zh-CN": { trace: zhCN } };
// 插件运行在独立 iframe 中，语言由宿主传入，不读写宿主的 i18n 单例或设置。
const i18n = createInstance();
void i18n.init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales.map((locale) => locale.value),
  ns: ["trace"],
  defaultNS: "trace",
  initAsync: false,
  returnNull: false,
  interpolation: { escapeValue: false },
});
export default i18n;
