import { ApplicationShell } from "./components/layout/ApplicationShell";
import { TaskBoard } from "./components/tasks/TaskBoard";
import { TaskPages } from "./components/tasks/TaskPages";
import { useTaskTabs } from "./hooks/useTaskTabs";
import { IssueList } from "./components/issues/IssueList";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { TooltipProvider } from "./components/ui/tooltip";
import { useLocalSettings } from "./hooks/useLocalSettings";
import { useAppNavigation } from "./hooks/useAppNavigation";
import "./App.css";
import { useEffect, useState } from "react";
import { TaskCreateDialog } from "./components/tasks/create/TaskCreateDialog";
import { useTaskStore } from "./stores/taskStore";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "./stores/settingsStore";
import { Button } from "./components/ui/button";
import { getSettingsError } from "./services/settingsErrors";

function App() {
  const { resolvedTheme, settings, updateSettings } = useLocalSettings();
  const navigation = useAppNavigation();
  const taskTabs = useTaskTabs();
  const [creatingTask, setCreatingTask] = useState(false);
  const { t } = useTranslation();
  const { loaded, loading, loadError, saveError, saving, bootstrap, retrySave } = useSettingsStore();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        navigation.selectSection("settings");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigation.selectSection]);

  if (!loaded) return <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-sm">
    {loading || loadError === null ? t("读取中") : <>
      <p role="alert">{t("设置加载失败，未覆盖已有配置。")}</p><p className="text-xs text-muted-foreground">{getSettingsError(loadError)}</p>
      <Button variant="secondary" onClick={() => void bootstrap()}>{t("重试")}</Button>
    </>}
  </div>;

  return (
    <TooltipProvider delayDuration={250}>
      <ApplicationShell section={navigation.section} canGoBack={navigation.canGoBack} canGoForward={navigation.canGoForward}
        onGoBack={navigation.goBack} onGoForward={navigation.goForward} onSelectSection={navigation.selectSection} onCreateTask={() => setCreatingTask(true)}>
        {saveError !== null && <div role="alert" className="settings-save-alert">
          <span>{t("设置尚未保存，请重试。")} {getSettingsError(saveError)}</span><Button className="h-7 text-xs" variant="secondary" onClick={retrySave}>{t("重试")}</Button>
        </div>}
        <span role="status" className="sr-only">{saving ? t("保存中…") : ""}</span>
        <div className="h-full" hidden={navigation.section !== "tasks" || taskTabs.activeTaskId !== null}><TaskBoard /></div>
        <TaskPages visible={navigation.section === "tasks" && taskTabs.activeTaskId !== null} />
        <div className="h-full" hidden={navigation.section !== "issue"}><IssueList /></div>
        <div className="h-full" hidden={navigation.section !== "settings"}>
          <SettingsPanel settings={settings} resolvedTheme={resolvedTheme} updateSettings={updateSettings} />
        </div>
      </ApplicationShell>
      <TaskCreateDialog open={creatingTask} onOpenChange={setCreatingTask} settings={settings} onCreated={(task) => {
        navigation.selectSection("tasks"); useTaskStore.getState().requestOpen(task.id);
      }} />
    </TooltipProvider>
  );
}

export default App;
