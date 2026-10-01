import { Menu } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { AppSettings } from "../domain/types";

/** 原生菜单与应用语言保持一致，角色操作交给 Electron。 */
export function updateApplicationMenu(locale: AppSettings["locale"]) {
  const labels = locale === "zh-CN" ? {
    about: "关于 Navo", services: "服务", hide: "隐藏 Navo", hideOthers: "隐藏其他", unhide: "显示全部", quit: "退出 Navo",
    edit: "编辑", undo: "撤销", redo: "重做", cut: "剪切", copy: "复制", paste: "粘贴", selectAll: "全选",
    view: "显示", reload: "重新加载", toggleDevTools: "开发者工具", togglefullscreen: "切换全屏",
    window: "窗口", minimize: "最小化", zoom: "缩放", close: "关闭窗口", front: "全部置于前面",
  } : {
    about: "About Navo", services: "Services", hide: "Hide Navo", hideOthers: "Hide Others", unhide: "Show All", quit: "Quit Navo",
    edit: "Edit", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select All",
    view: "View", reload: "Reload", toggleDevTools: "Developer Tools", togglefullscreen: "Toggle Full Screen",
    window: "Window", minimize: "Minimize", zoom: "Zoom", close: "Close Window", front: "Bring All to Front",
  };
  const item = (role: NonNullable<MenuItemConstructorOptions["role"]>, key: keyof typeof labels): MenuItemConstructorOptions => ({ role, label: labels[key] });
  const separator: MenuItemConstructorOptions = { type: "separator" };
  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") template.push({ label: "Navo", submenu: [item("about", "about"), separator, item("services", "services"), separator, item("hide", "hide"), item("hideOthers", "hideOthers"), item("unhide", "unhide"), separator, item("quit", "quit")] });
  template.push(
    { label: labels.edit, submenu: [item("undo", "undo"), item("redo", "redo"), separator, item("cut", "cut"), item("copy", "copy"), item("paste", "paste"), item("selectAll", "selectAll")] },
    { label: labels.view, submenu: [...(!process.defaultApp ? [] : [item("reload", "reload"), item("toggleDevTools", "toggleDevTools"), separator]), item("togglefullscreen", "togglefullscreen")] },
    { label: labels.window, submenu: [item("minimize", "minimize"), item("zoom", "zoom"), item("close", "close"), ...(process.platform === "darwin" ? [separator, item("front", "front")] : [separator, item("quit", "quit")])] },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
