import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { normalizeLocale } from "../../../../src/shared/locales";
import { bridge } from "../bridge";

/** 宿主握手与外观同步不改变插件内的查询和阅读状态。 */
export function useTraceHost(onRefresh: () => void) {
  const { i18n } = useTranslation(["trace"]);
  useEffect(() => bridge.subscribe((appearance) => {
    const locale = normalizeLocale(appearance.locale);
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
    document.documentElement.style.colorScheme = appearance.dark ? "dark" : "light";
    for (const [name, value] of Object.entries(appearance.tokens))
      if (/^[a-z-]+$/.test(name)) document.documentElement.style.setProperty("--" + name, value);
  }, onRefresh), [i18n, onRefresh]);
}
