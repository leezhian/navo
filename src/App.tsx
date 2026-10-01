import { ApplicationShell } from "./components/layout/ApplicationShell";
import { TaskBoard } from "./components/tasks/TaskBoard";
import { IssueList } from "./components/issues/IssueList";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { TooltipProvider } from "./components/ui/tooltip";
import { useLocalSettings } from "./hooks/useLocalSettings";
import { useAppNavigation } from "./hooks/useAppNavigation";
import "./App.css";

function App() {
  const { resolvedTheme, settings, updateSettings } = useLocalSettings();
  const navigation = useAppNavigation();

  return (
    <TooltipProvider delayDuration={250}>
      <ApplicationShell section={navigation.section} canGoBack={navigation.canGoBack} canGoForward={navigation.canGoForward}
        onGoBack={navigation.goBack} onGoForward={navigation.goForward} onSelectSection={navigation.selectSection}>
        <div className="h-full" hidden={navigation.section !== "tasks"}><TaskBoard /></div>
        <div className="h-full" hidden={navigation.section !== "issue"}><IssueList /></div>
        <div className="h-full" hidden={navigation.section !== "settings"}>
          <SettingsPanel settings={settings} resolvedTheme={resolvedTheme} updateSettings={updateSettings} />
        </div>
      </ApplicationShell>
    </TooltipProvider>
  );
}

export default App;
