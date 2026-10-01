import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { english } from "./translations";

export const chinese = Object.fromEntries(Object.keys(english).map((key) => [key, key]));
const i18next = createInstance();

void i18next.use(initReactI18next).init({
  resources: { en: { translation: english }, "zh-CN": { translation: chinese } },
  lng: "en",
  fallbackLng: "en",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initAsync: false,
});

export default i18next;
if (typeof document !== "undefined") {
  document.documentElement.lang = i18next.language;
  i18next.on("languageChanged", (language) => { document.documentElement.lang = language; });
}
export const t = (key: string, values?: Record<string, unknown>) => i18next.t(key, values);

export function formatDate(value: string) {
  const date = new Date(value.length === 10 ? value + "T00:00:00" : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(i18next.language, { year: "numeric", month: "short", day: "numeric" }).format(date);
}
