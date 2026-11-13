/** 语言入口统一从此注册表读取；标签使用该语言的自称。 */
export const supportedLocales = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
] as const;

export type AppLocale = (typeof supportedLocales)[number]["value"];
export const DEFAULT_LOCALE: AppLocale = "en";

export function isAppLocale(value: unknown): value is AppLocale {
  return supportedLocales.some((locale) => locale.value === value);
}

export function normalizeLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}
