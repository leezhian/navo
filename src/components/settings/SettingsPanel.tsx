import { useEffect, useState } from "react";
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { defaultSettings } from "@/domain/mockData";
import type { AgentType, AppSettings } from "@/domain/types";
import type { AppInfo, CheckForUpdatesResult, ExternalLinkTarget } from "@/shared/electronApi";
import { SESSION_SIDEBAR_WIDTH } from "@/shared/windowLayout";
import { checkForAppUpdates, loadAppInfo, openAppExternalLink } from "@/services/appApi";
import { ArrowLeft, Bug, ExternalLink, Info, Palette, RefreshCw, Search, Settings } from "lucide-react";
import classNames from "classnames";

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
  /** 更新本地偏好设置，例如 Agent 开关和主题。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function SettingsPanel({ settings, onBack, updateSettings }: SettingsPanelProps) {
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
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput
              className="bg-background/70 pl-8 focus-visible:border-input focus-visible:ring-0 dark:bg-background/45"
              placeholder="搜索设置..."
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
          </label>
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
          {activePage === "appearance" && <AppearanceSettingsPage settings={settings} updateSettings={updateSettings} />}
          {activePage === "about" && <AboutPage />}
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
  const agents = Object.keys(defaultSettings.enabledAgents) as AgentType[];

  return (
    <>
      <SettingsPageHeader title="常规" />

      <section className="mb-10">
        <SettingsSectionHeader
          title="集成"
          description="选择需要监听的本地 Agent，会话结束后自动进入审查列表。"
        />
        <SettingsList>
          {agents.map((agent) => (
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
  /** 当前偏好设置数据。 */
  settings: AppSettings;
  /** 更新主题偏好时触发。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

function AppearanceSettingsPage({ settings, updateSettings }: AppearanceSettingsPageProps) {
  return (
    <>
      <SettingsPageHeader title="外观" />

      <section className="mb-10">
        <SettingsSectionHeader title="主题" description="选择 Vibe Reviewer 的界面颜色模式。" />
        <SettingsList>
          <SettingsSelectRow label="应用主题" description="设置页面、会话列表和审查区都会同步该主题。">
            <Select
              value={settings.theme}
              onValueChange={(theme) =>
                updateSettings((current) => ({
                  ...current,
                  theme: theme as AppSettings["theme"],
                }))
              }
            >
              <SelectTrigger className="w-[220px] bg-muted/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">跟随系统</SelectItem>
                <SelectItem value="light">浅色</SelectItem>
                <SelectItem value="dark">深色</SelectItem>
              </SelectContent>
            </Select>
          </SettingsSelectRow>
        </SettingsList>
      </section>
    </>
  );
}

function AboutPage() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateResult, setUpdateResult] = useState<CheckForUpdatesResult | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  useEffect(() => {
    loadAppInfo().then(setAppInfo).catch(() => setAppInfo({ name: "vibe-reviewer", version: "未知" }));
  }, []);

  async function handleCheckForUpdates() {
    setIsCheckingUpdates(true);
    setUpdateResult(null);

    try {
      const result = await checkForAppUpdates();
      setUpdateResult(result);
    } catch (error) {
      setUpdateResult({
        hasUpdate: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  }

  return (
    <>
      <SettingsPageHeader title="关于" />

      <section className="mb-10">
        <SettingsSectionHeader
          title={appInfo?.name ?? "vibe-reviewer"}
          description="本地 AI 代码审查桌面应用"
        />
        <SettingsList>
          <AboutInfoRow label="当前版本" value={appInfo ? `v${appInfo.version}` : "读取中"} />
          <AboutInfoRow label="更新状态" value={updateResult?.message ?? "尚未检查更新"} />
        </SettingsList>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <Button
          className="font-normal"
          disabled={isCheckingUpdates}
          type="button"
          variant="secondary"
          onClick={handleCheckForUpdates}
        >
          <RefreshCw className={classNames("size-4", isCheckingUpdates && "animate-spin")} />
          {isCheckingUpdates ? "检查中" : "检查更新"}
        </Button>
        <ExternalLinkButton target="website">
          <ExternalLink className="size-4" />
          官网
        </ExternalLinkButton>
        <ExternalLinkButton target="report-bug">
          <Bug className="size-4" />
          报告 Bug
        </ExternalLinkButton>
      </div>
    </>
  );
}

interface SettingsPageHeaderProps {
  /** 右侧设置页面主标题。 */
  title: string;
}

function SettingsPageHeader({ title }: SettingsPageHeaderProps) {
  return <h1 className="mb-14 text-xl font-medium tracking-normal">{title}</h1>;
}

interface SettingsSectionHeaderProps {
  /** 分区标题。 */
  title: string;
  /** 分区说明，帮助用户理解当前配置影响范围。 */
  description?: string;
}

function SettingsSectionHeader({ title, description }: SettingsSectionHeaderProps) {
  return (
    <header className="mb-5">
      <h2 className="mb-1 text-sm font-normal">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}

interface SettingsListProps {
  /** 设置列表中的行内容。 */
  children: ReactNode;
}

function SettingsList({ children }: SettingsListProps) {
  return <div className="overflow-hidden rounded-xl border bg-card">{children}</div>;
}

interface SettingsSwitchRowProps {
  /** 当前开关是否开启。 */
  checked: boolean;
  /** 设置项补充说明，部分简洁配置项可以不展示。 */
  description?: string;
  /** 设置项标题。 */
  title: string;
  /** 用户切换开关时触发。 */
  onCheckedChange: (checked: boolean) => void;
}

function SettingsSwitchRow({ checked, description, title, onCheckedChange }: SettingsSwitchRowProps) {
  return (
    <div className="flex min-h-18 items-center justify-between gap-6 border-b px-4 last:border-b-0">
      <div className="min-w-0">
        <h3 className="text-sm font-normal">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <Switch aria-label={`启用 ${title}`} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

interface SettingsSelectRowProps {
  /** 设置项右侧控件。 */
  children: ReactNode;
  /** 设置项补充说明。 */
  description: string;
  /** 设置项标题。 */
  label: string;
}

function SettingsSelectRow({ children, description, label }: SettingsSelectRowProps) {
  return (
    <div className="flex min-h-18 items-center justify-between gap-6 border-b px-4 last:border-b-0">
      <div className="min-w-0">
        <h3 className="text-sm font-normal">{label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface AboutInfoRowProps {
  /** 左侧信息项名称。 */
  label: string;
  /** 右侧信息项内容。 */
  value: string;
}

function AboutInfoRow({ label, value }: AboutInfoRowProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

interface ExternalLinkButtonProps {
  /** 外部链接白名单目标，由主进程转换成真实 URL。 */
  target: ExternalLinkTarget;
  /** 按钮内容，通常是图标加文字。 */
  children: ReactNode;
}

function ExternalLinkButton({ target, children }: ExternalLinkButtonProps) {
  return (
    <Button className="font-normal" type="button" variant="outline" onClick={() => void openAppExternalLink(target)}>
      {children}
    </Button>
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
