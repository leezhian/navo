import { Menu } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { AppSettings } from "../domain/types";
import { createInstance } from "i18next";
import { i18nOptions } from "../i18n/config";
import { normalizeLocale } from "../shared/locales";

const menuI18n = createInstance();
void menuI18n.init(i18nOptions);

/** 原生菜单与应用语言保持一致，角色操作交给 Electron。 */
export function updateApplicationMenu(locale: AppSettings["locale"]) {
  const translate = menuI18n.getFixedT(normalizeLocale(locale), "nativeMenu");
  const item = (role: NonNullable<MenuItemConstructorOptions["role"]>, key: keyof typeof i18nOptions.resources.en.nativeMenu): MenuItemConstructorOptions => ({ role, label: translate(key) });
  const separator: MenuItemConstructorOptions = { type: "separator" };
  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") template.push({ label: "Navo", submenu: [item("about", "about"), separator, item("services", "services"), separator, item("hide", "hide"), item("hideOthers", "hideOthers"), item("unhide", "unhide"), separator, item("quit", "quit")] });
  template.push(
    { label: translate("edit"), submenu: [item("undo", "undo"), item("redo", "redo"), separator, item("cut", "cut"), item("copy", "copy"), item("paste", "paste"), item("selectAll", "selectAll")] },
    { label: translate("view"), submenu: [...(!process.defaultApp ? [] : [item("reload", "reload"), item("toggleDevTools", "toggleDevTools"), separator]), item("togglefullscreen", "togglefullscreen")] },
    { label: translate("window"), submenu: [item("minimize", "minimize"), item("zoom", "zoom"), item("close", "close"), ...(process.platform === "darwin" ? [separator, item("front", "front")] : [separator, item("quit", "quit")])] },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
