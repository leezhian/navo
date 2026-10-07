import type { EditorId } from "../../../shared/workspaceOpenTypes";

export interface EditorDefinition {
  id: EditorId;
  name: string;
  /** 只识别已知 Bundle ID，不将任意 .app 当作可执行目标。 */
  bundleIds: string[];
  appNames: string[];
}
export const editorCatalog: EditorDefinition[] = [
  { id: "vscode", name: "VS Code", bundleIds: ["com.microsoft.VSCode"], appNames: ["Visual Studio Code"] },
  { id: "vscode-insiders", name: "VS Code Insiders", bundleIds: ["com.microsoft.VSCodeInsiders"], appNames: ["Visual Studio Code - Insiders"] },
  { id: "vscodium", name: "VSCodium", bundleIds: ["com.vscodium"], appNames: ["VSCodium"] },
  { id: "cursor", name: "Cursor", bundleIds: ["com.todesktop.230313mzl4w4u92"], appNames: ["Cursor"] },
  { id: "windsurf", name: "Windsurf", bundleIds: ["com.exafunction.windsurf"], appNames: ["Windsurf"] },
  { id: "xcode", name: "Xcode", bundleIds: ["com.apple.dt.Xcode"], appNames: ["Xcode"] },
  { id: "idea", name: "IntelliJ IDEA", bundleIds: ["com.jetbrains.intellij", "com.jetbrains.intellij.ce"], appNames: ["IntelliJ IDEA", "IntelliJ IDEA CE"] },
  { id: "webstorm", name: "WebStorm", bundleIds: ["com.jetbrains.WebStorm"], appNames: ["WebStorm"] },
  { id: "pycharm", name: "PyCharm", bundleIds: ["com.jetbrains.pycharm", "com.jetbrains.pycharm.ce"], appNames: ["PyCharm", "PyCharm CE"] },
  { id: "goland", name: "GoLand", bundleIds: ["com.jetbrains.goland"], appNames: ["GoLand"] },
  { id: "clion", name: "CLion", bundleIds: ["com.jetbrains.CLion"], appNames: ["CLion"] },
  { id: "rider", name: "Rider", bundleIds: ["com.jetbrains.rider"], appNames: ["Rider"] },
  { id: "phpstorm", name: "PhpStorm", bundleIds: ["com.jetbrains.PhpStorm"], appNames: ["PhpStorm"] },
  { id: "rustrover", name: "RustRover", bundleIds: ["com.jetbrains.rustrover"], appNames: ["RustRover"] },
  { id: "android-studio", name: "Android Studio", bundleIds: ["com.google.android.studio"], appNames: ["Android Studio"] },
  { id: "zed", name: "Zed", bundleIds: ["dev.zed.Zed", "dev.zed.Zed-Preview"], appNames: ["Zed", "Zed Preview"] },
  { id: "sublime", name: "Sublime Text", bundleIds: ["com.sublimetext.4", "com.sublimetext.3"], appNames: ["Sublime Text"] },
];
