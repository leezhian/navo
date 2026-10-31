# Navo 未实现功能清单

依据当前代码和页面 PRD 核对，日期：2026-10-07。这里区分明确占位、尚未接入的基础能力和待定义范围，不代表所有项目都已承诺排期。页面行为以 [PRD](../PRD.md) 为准。

## 1. 明确 TODO 与功能缺口

任务创建后的资源增补已接入；已支持正文编辑和资源解除关联，剩余范围为普通链接等已有资源的原位编辑。代码中的 `TODO` 多数是任务状态，不是开发待办。

| 功能 | 已有基础 | 尚未实现 | 核对入口 |
| --- | --- | --- | --- |
| 任务内 Agent 运行 | 本地任务、描述、附件、关联条目和工作目录；四种本机 CLI 的设置与检测，未知状态不隐藏；创建时按真实能力选择 Claude/Codex/Grok/Antigravity、模型、模式、思考等级并保存到任务 | 已接入四种原生 CLI 的启动/停止/重启及按精确 ID 恢复，当前可见会话按条件自动恢复；Codex/Antigravity 新会话核对原生记录后绑定 ID，旧记录不猜测；待补 Codex 非 default 模式、可靠等待输入状态、多账号及富聊天 | [任务页](../src/components/tasks/TaskPage.tsx)、[Agent 设置](prd/settings/agents.md) |
| 多项目共享上下文 | 单个任务可关联多个仓库，准备分支或 Worktree | Claude/Codex 已支持任务级 MCP，按需读取最新正文和资源，并按独立版本读写当前任务 Notes；Grok/Antigravity 使用实时上下文文件及每轮读取约定，尚不支持笔记写回；待补它们的会话级 MCP、可靠逐轮交付确认及更多协作规则 | [创建任务需求](prd/task-create.md)、[产品范围](../PRD.md) |
| 服务商授权 | GitHub、GitHub Enterprise、GitLab、GitLab Self-Hosted、Linear 列表 | 真实连接、凭证安全存储、失效处理与断开；具体采用 OAuth、Device Flow 或 Token 仍需按平台确定 | [集成服务](../src/services/integrationApi.ts)、[集成需求](prd/settings/integrations.md) |
| Issue / PR 远程数据 | 本地列表/看板、筛选、详情及创建任务时关联 | 远程拉取与刷新、描述/评论等详情、与服务商状态同步；当前刷新仅重读本地数据 | [Issue 数据](../src/stores/issueStore.ts)、[Issue 需求](prd/issues.md) |
| 已有任务增补上下文 | 创建时可添加资源、Issue/PR、附件和普通链接；创建后可增补仓库/文件夹、配置分支及隔离 Worktree，也可改名及调整状态 | 已支持增补 Issue/PR、普通链接、原文件引用及任务笔记，笔记支持预览、编辑和删除；已支持任务正文编辑及其他资源解除关联；待补普通链接等资源的原位编辑 | [任务工作台](prd/task-workspace.md) |
| 任务内代码审查 | 已有 diff 弹窗、文件树、评论及 Git 操作 | 已接入分支/变更面板和原有完整 Diff 弹窗；单个 commit 的 Diff 尚未接入 | [审查需求](prd/review.md)、[审查弹窗](../src/components/review/ReviewDialog.tsx) |
| 任务内终端 | 已有终端渲染、独立 Shell 与主进程 PTY 服务 | 已接入任务内普通 Shell、工作目录绑定及关闭终止；跨重启输出和终端恢复未接入 | [终端需求](prd/terminal.md)、[终端组件](../src/components/terminal/TerminalWorkspace.tsx) |
| 保持唤醒 | 设置开关可保存 | 实际系统防休眠及 Agent/远程访问生命周期联动 | [常规设置需求](prd/settings/general.md)、[设置页](../src/components/settings/GeneralSettingsPage.tsx) |
| 仓库目录扫描 | 目录设置、手动登记本地仓库、Git 克隆 | 修改仓库目录后扫描，以及显式扫描入口；启动时不扫描仍是目标规则 | [常规设置需求](prd/settings/general.md)、[资源需求](prd/settings/resources.md) |
| 应用更新 | 关于页面与检查更新入口 | 真实版本检查、下载及安装；当前固定返回更新服务未接入 | [应用 IPC](../src/main-process/ipc/appHandlers.ts)、[关于需求](prd/settings/about.md) |

## 2. 仍需定义或可后续增强

- 远程开发环境与 Remote Access：当前未接入；本机使用 SSH 地址克隆仓库不等于远程执行 Agent。
- 普通链接可在系统浏览器打开，附件可定位应用管理的副本；正文可编辑，自动网页抓取未接入。
- 历史审查记录如何进入新任务流程、AI 审查建议、审查笔记同步、自定义 diff 忽略规则、项目固定、全局变更查看及默认对比分支策略，在产品索引中仍有待确认项，需要逐项细化而非直接视为已承诺功能。
- 未跟踪文件的完整 diff 展示仍是审查文档中的后续范围，当前应区分文件状态提示与内容 diff。

## 3. 不应误记为 TODO

- 已完成：本地任务及 SQLite 持久化、多个仓库/Worktree 的创建、附件副本和普通链接、真实任务标签与双页拆分、拖拽切换任务状态、删除二次确认及可选安全清理、诊断日志、语义 key 国际化、设置持久化、仓库登记与克隆。
- 当前约定不跨重启恢复：标签/拆分布局、过滤和显示偏好、列表折叠状态；任务和设置本身会持久化。若要改变需先调整对应 PRD。
- 明确移除：任务手动拖拽排序、外部 Agent hooks 注入、旧会话列表、上轮对话审查。
- 当前非目标：应用账号登录与云端团队协作、完整 Git 客户端、自动修复代码；远程 Issue/PR 写操作也未纳入当前页面范围。
- 清除演示数据后，空 Tasks / Issue 和关联选择器的空状态是正常结果。测试夹具、外观页 diff 预览，以及明确标注未接入的服务商目录继续保留，不当作业务演示记录删除。

## 4. 建议推进顺序

1. 补齐各 CLI 原生恢复、Codex 非 default 模式、可靠等待输入状态和保持唤醒联动。
2. 实现服务商授权与 Issue/PR 真实读取，让关联任务形成可用的数据闭环。
3. 补齐任务创建后的上下文维护、仓库扫描和更新服务。
4. 再定义多项目上下文协调、远程执行与需要持久化的工作台状态。
