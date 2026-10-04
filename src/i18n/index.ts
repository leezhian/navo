import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { i18nOptions } from "./config";
import { namespaces } from "./resources";

const i18next = createInstance();

void i18next.use(initReactI18next).init(i18nOptions);

export default i18next;
if (typeof document !== "undefined") {
  document.documentElement.lang = i18next.language;
  i18next.on("languageChanged", (language) => { document.documentElement.lang = language; });
}
export const t = i18next.getFixedT(null, namespaces);

export function formatDate(value: string) {
  const date = new Date(value.length === 10 ? value + "T00:00:00" : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(i18next.language, { year: "numeric", month: "short", day: "numeric" }).format(date);
}
