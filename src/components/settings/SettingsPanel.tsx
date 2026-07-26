import { useState } from "react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { AboutSettingsPage } from "@/components/settings/AboutSettingsPage";
import { AppearanceThemeSettings } from "@/components/settings/AppearanceThemeSettings";
import { DiffAppearanceSettings } from "@/components/settings/DiffAppearanceSettings";
import {
  SettingsList,
  SettingsPageHeader,
  SettingsSectionHeader,
  SettingsSwitchRow,
} from "@/components/settings/settingsPrimitives";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AGENT_TYPES, type AgentType, type AppSettings, type ResolvedTheme } from "@/domain/types";
import { setAgentIntegrationEnabled } from "@/services/reviewApi";
import { SESSION_SIDEBAR_WIDTH } from "@/shared/windowLayout";
import { ArrowLeft, Info, Palette, Search, Settings } from "lucide-react";

type SettingsPage = "general" | "appearance" | "about";

const settingsNavigation: SettingsNavigationGroup[] = [
  {
    title: "个人",
    items: [
      {
        icon: Settings,
        id: "general",
        title: "常规",
      },
      {
        icon: Palette,
        id: "appearance",
        title: "外观",
      },
    ],
  },
  {
    title: "应用",
    items: [
      {
        icon: Info,
        id: "about",
        title: "关于",
      },
    ],
  },
];

interface SettingsPanelProps {
  /** 当前本地偏好设置。 */
  settings: AppSettings;
  /** 点击返回按钮时关闭设置页，并回到上层决定的工作区。 */
  onBack: () => void;
  /** 应用主题解析后的实际浅深色模式，用于设置页实时预览。 */
  resolvedTheme: ResolvedTheme;
  /** 更新本地偏好设置，例如 Agent 开关和主题。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function SettingsPanel({ resolvedTheme, settings, onBack, updateSettings }: SettingsPanelProps) {
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const [searchKeyword, setSearchKeyword] = useState("");
  const visibleNavigation = filterSettingsNavigation(searchKeyword);

  return (
    <SidebarProvider
      className="h-full min-h-0 overflow-hidden text-foreground"
      style={{ "--sidebar-width": `${SESSION_SIDEBAR_WIDTH}px` } as CSSProperties}
    >
      <Sidebar
        collapsible="none"
        className="relative overflow-hidden border-r border-sidebar-border bg-sidebar/58 pt-16 pb-4 backdrop-blur-[120px] backdrop-saturate-175 supports-[backdrop-filter]:bg-sidebar/52 dark:bg-sidebar/78 dark:backdrop-blur-[120px] dark:backdrop-saturate-125 dark:supports-[backdrop-filter]:bg-sidebar/72"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/22 via-white/10 to-white/4 dark:from-black/18 dark:via-black/14 dark:to-black/20" />
        <button
          className="relative mx-3 mb-5 flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
          <span>返回应用</span>
        </button>

        <SidebarHeader className="relative">
          <InputGroup className="bg-background/70 shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-background/45">
            <InputGroupAddon>
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="搜索设置"
              placeholder="搜索设置..."
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
          </InputGroup>
        </SidebarHeader>

        <SettingsNavigation
          activePage={activePage}
          groups={visibleNavigation}
          onPageChange={setActivePage}
        />
      </Sidebar>

      <main className="min-h-0 flex-1 overflow-y-auto bg-background px-14 pt-18 pb-12">
        <div className="mx-auto w-full max-w-[820px]">
          {activePage === "general" && <GeneralSettingsPage settings={settings} updateSettings={updateSettings} />}
          {activePage === "appearance" && (
            <AppearanceSettingsPage
              resolvedTheme={resolvedTheme}
              settings={settings}
              updateSettings={updateSettings}
            />
          )}
          {activePage === "about" && <AboutSettingsPage />}
        </div>
      </main>
    </SidebarProvider>
  );
}

interface SettingsNavigationItem {
  /** 导航项对应的设置页面。 */
  id: SettingsPage;
  /** 导航项展示文案。 */
  title: string;
  /** 导航项左侧图标组件。 */
  icon: typeof Settings;
}

interface SettingsNavigationGroup {
  /** 分组标题，用于形成参考 macOS 设置页的左侧层级。 */
  title: string;
  /** 该分组下可切换的设置页面。 */
  items: SettingsNavigationItem[];
}

interface SettingsNavigationProps {
  /** 当前右侧正在展示的设置页面。 */
  activePage: SettingsPage;
  /** 已按搜索关键词过滤后的导航分组。 */
  groups: SettingsNavigationGroup[];
  /** 点击导航项时触发页面切换。 */
  onPageChange: (page: SettingsPage) => void;
}

function SettingsNavigation({ activePage, groups, onPageChange }: SettingsNavigationProps) {
  return (
    <SidebarContent className="relative">
      {groups.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">没有匹配的设置项</p>
      ) : (
        groups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => (
                  <SettingsNavigationButton
                    active={item.id === activePage}
                    item={item}
                    key={item.id}
                    onClick={() => onPageChange(item.id)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))
      )}
    </SidebarContent>
  );
}

interface SettingsNavigationButtonProps {
  /** 导航项是否处于激活状态。 */
  active: boolean;
  /** 当前导航项信息。 */
  item: SettingsNavigationItem;
  /** 点击导航项时切换右侧内容。 */
  onClick: () => void;
}

function SettingsNavigationButton({ active, item, onClick }: SettingsNavigationButtonProps) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="data-active:!font-normal" isActive={active} onClick={onClick}>
        <Icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

interface GeneralSettingsPageProps {
  /** 当前偏好设置数据。 */
  settings: AppSettings;
  /** 更新偏好设置时触发，保持与上层 localStorage 状态一致。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

function GeneralSettingsPage({ settings, updateSettings }: GeneralSettingsPageProps) {
  return (
    <>
      <SettingsPageHeader title="常规" />

      <section className="mb-10">
        <SettingsSectionHeader
          title="集成"
          description="选择需要监听的本地 Agent，会话结束后自动进入审查列表。"
        />
        <SettingsList>
          {AGENT_TYPES.map((agent) => (
            <SettingsSwitchRow
              checked={settings.enabledAgents[agent]}
              key={agent}
              title={agent}
              onCheckedChange={(enabled) => updateAgent(agent, enabled, updateSettings)}
            />
          ))}
        </SettingsList>
      </section>
    </>
  );
}

interface AppearanceSettingsPageProps {
  /** 应用主题解析后的实际浅深色模式，用于设置页实时预览。 */
  resolvedTheme: ResolvedTheme;
  /** 当前偏好设置数据。 */
  settings: AppSettings;
  /** 更新主题偏好时触发。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

function AppearanceSettingsPage({ resolvedTheme, settings, updateSettings }: AppearanceSettingsPageProps) {
  return (
    <>
      <SettingsPageHeader title="外观" />
      <AppearanceThemeSettings
        resolvedTheme={resolvedTheme}
        settings={settings}
        updateSettings={updateSettings}
      />
      <DiffAppearanceSettings settings={settings} updateSettings={updateSettings} />
    </>
  );
}

function updateAgent(
  agent: AgentType,
  enabled: boolean,
  updateSettings: Dispatch<SetStateAction<AppSettings>>,
) {
  updateSettings((current) => ({
    ...current,
    enabledAgents: {
      ...current.enabledAgents,
      [agent]: enabled,
    },
    agentStatuses: {
      ...current.agentStatuses,
      [agent]: enabled ? "listening" : "disabled",
    },
  }));

  setAgentIntegrationEnabled(agent, enabled).catch(() => {
    updateSettings((current) => ({
      ...current,
      enabledAgents: {
        ...current.enabledAgents,
        [agent]: !enabled,
      },
      agentStatuses: {
        ...current.agentStatuses,
        [agent]: "failed",
      },
    }));
  });
}

function filterSettingsNavigation(searchKeyword: string) {
  const normalizedKeyword = searchKeyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return settingsNavigation;
  }

  return settingsNavigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.title.toLowerCase().includes(normalizedKeyword)),
    }))
    .filter((group) => group.items.length > 0);
}
