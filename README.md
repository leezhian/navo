# Navo

Navo 是面向本地开发者的 Agent 开发环境（ADE），使用 Electron Forge、Vite、React、Tailwind CSS、shadcn 和 Radix UI 构建。正式应用已使用新版 Tasks / Issue 导航壳层，设置也迁入相同的独立圆角块风格。

## 项目文档

- [PRD.md](PRD.md)：产品概述、范围边界与页面需求索引。
- [docs/prd/](docs/prd/)：按页面维护的功能、交互、布局细节及验收标准；设置按子页面拆分。
- [DESIGN.md](DESIGN.md)：通用设计风格和规范，不收录具体功能方案。
- [docs/i18n.md](docs/i18n.md)：语义翻译 key、语言资源、类型约束及新增语言流程。
- [docs/diagnostics.md](docs/diagnostics.md)：诊断日志入口、字段白名单、兼容、限流与异常上报。
- [docs/backlog.md](docs/backlog.md)：未实现能力、已有基础及当前非目标的核对清单。

## 功能概览

- Tasks：TODO、DONE、ARCHIVED 三列，卡片只显示标题、日期和项目摘要；多项目显示首项 +N。支持右键打开、重命名、归档/恢复与删除；添加资源统一窗口支持 Issue/PR、链接、原文件引用和笔记，仓库与文件夹增补暂未开放。
- 顶部创建任务弹窗支持描述、Issue/PR 多选预览、图片/文件附件、可选标题的普通链接及多个工作目录。标题自动取描述首行；可复用设置中的资源选择与快捷添加。
- 支持列内排序、跨列状态调整、页面内圆角浮动卡片、框占位与重排动画；任务状态和顺序保存在本地。
- Tasks 工具栏支持状态/项目过滤、看板/列表切换、日期/标题/项目属性排序和独立升降序切换，以及日期/项目显隐；两种布局均支持拖拽切换状态，落位后自动排序，不支持手动排序。
- Issue：PR / ISSUE 两个默认展开且可收起的分组，左侧标签与标题，右侧自然宽度的项目、彩色状态文字和时间。
- Issue 工具栏支持分组/状态/项目/标签过滤、列表/看板切换、日期/标题/项目属性排序和独立升降序切换及字段显隐；看板按 PR / ISSUE 分列，不支持手动排序或跨类型拖拽。过滤与显示设置独立于 Tasks。
- 点击未打开标签的任务或 Issue 展开独立右侧详情，通过 8px 分隔条拖动调整宽度；任务侧栏可提升为标签页，已有标签的任务点击后直接激活对应页面。
- 顶部提供模块历史后退与前进及真实任务标签，支持去重、切换、关闭、关闭其他和横向拖拽排序，标题与内容随任务数据同步；标签仅保留在当前窗口。左侧底部为设置，不再提供旧会话列表。
- 任务标签支持非嵌套的双页组合、选页、左右/上下排列、拖动调整比例、反转和取消拆分；独立标签可与激活组合的任意一侧互换，被换出的页面回到其原独立位置。组合整体排序，关闭一侧后另一侧恢复独立显示。
- 设置提供常规、外观、Agents、仓库与文件夹、集成和关于，保留主题与 diff 预览；关于的版本与更新合为一行。
- 创建任务底栏的 Agent 入口位于创建按钮左侧，两者独立；图标和配置回显整体可点击，通过锚定浮层选择模型、模式及分档思考滑条，选项保留 CLI 原始文案。已启用的 CLI 仅在明确未安装或未登录时排除，未知和检测失败状态仍可尝试查询。Claude 使用只读初始化握手和本机帮助，Codex 使用本地 app-server 的 `model/list`、`collaborationMode/list`；Grok 使用 `agent --no-leader stdio` 初始化结果和本机帮助，Antigravity 使用 `models` 与 `--help`，不填充预设模型。配置浮层不展示查询失败、旧接口或要求重启等错误文案，内部校验仍阻止无效配置提交。配置随任务保存，保存成功后独立启动首个原生 CLI 会话。开发时新增 IPC 后需完整重启主进程。
- Agent 设置管理本机 Claude Code、Codex、Grok Build、Antigravity CLI：安装/版本检测、可验证的登录状态、默认选择、启用及自定义可执行文件路径。首次检测保持卡片显示，重复扫描保留已有内容；高级设置仅编辑路径。安装/登录命令经用户确认后在现有 PTY 终端执行，更新按队列进行；不支持富聊天、多账号或全局 hooks/MCP 注入。
- 全局英文/简体中文切换立即生效，首次默认英文；设置由主进程 SQLite 持久化，Zustand 仅作为渲染缓存。
- 统一通过“添加仓库”入口新增：输入 HTTPS / SSH 地址时自动提取名称并使用常规设置中的仓库目录，支持克隆进度与取消；也可在弹窗中选择或拖入本地目录并自动登记，系统目录选择器默认打开当前用户主目录。支持编辑/移除，移除记录不会删除文件，编辑不会修改 Git remote。
- 诊断日志使用单文件，最高约 20 MB，支持修改文件路径、在文件管理器中定位、复制路径和清理日志，使用 INFO/WARN/ERROR 分级 JSONL 记录关键运行事件与脱敏异常，不记录业务正文、完整路径或认证凭证；任务模式已用于创建时的工作目录配置，保持唤醒暂仅保存偏好，仓库目录扫描和远程访问尚未接入，集成状态明确为占位。
- 保留可复用 ReviewDialog、Git diff / 文件树 / 评论 / Git 操作和终端基础组件，当前新版不提供审查或终端入口。

数据边界：任务创建与工作区准备已接入；已接入任务内原生 CLI 运行，尚未接入远程 PR/Issue 平台。开发态与正式构建均不自动填充演示数据，首次启动显示空看板和空列表，两者使用独立的本地存储命名空间，不将旧会话当作任务。历史演示记录按明确身份清理，保留真实记录和已修改或具有真实上下文的任务。测试数据仅由测试显式注入，外观设置中的 diff 示例保留。旧审查记录保持在磁盘中，但上轮对话审查模式已移除。

## 技术栈

- Electron Forge：桌面应用运行、开发启动和打包。
- Vite：主进程、preload 和 renderer 构建。
- React：前端界面。
- Tailwind CSS：样式系统。
- shadcn：基础 UI 组件源码。
- lucide-react：图标。
- @pierre/diffs：Git diff 解析和 diff 内容渲染。
- motion：界面动效。
- i18next / react-i18next：语义 key 与模块命名空间，各语言独立 JSON 资源；渲染进程和原生菜单共用语言注册表。
- zustand：设置、资源记录及集成占位状态的渲染缓存，不重复持久化主进程配置。
- node:sqlite：Electron 主进程内置 SQLite，无需额外原生依赖。
- node-pty：创建和管理真实 Shell 伪终端。
- libghostty-vt：解析终端 VT 序列并生成终端画面。

## 环境要求

- Node.js 22.13+（测试使用内置 node:sqlite；SQLite 在部分 Node 版本中仍会输出实验性 API 警告）。
- pnpm
- Git
- macOS 本地预览需要安装 Electron 运行所需环境。
- “在 VS Code 中打开”功能需要安装 VS Code，并可使用 `code` 命令，或 macOS 已安装 Visual Studio Code 应用。

## 安装依赖

```bash
pnpm install
```

项目使用 `pnpm-lock.yaml` 锁定依赖。脚本仍可通过 `npm run <script>` 执行，但新增或更新依赖时应使用 pnpm，避免锁文件漂移。

## 本地开发

启动真实 Electron 桌面窗口：

```bash
npm run start
```

这个命令会执行 `electron-forge start`，适合日常开发和交互预览。

开发窗口聚焦后，macOS 使用 `⌘ + ⌥ + I`，Windows / Linux 使用 `Ctrl + Shift + I`，或按 `F12` 打开/关闭 DevTools（部分 Mac 键盘需要 `Fn + F12`）。在 Elements 面板选取节点，通过 Styles / Computed 查看样式；临时修改不会写回源码。这些快捷键仅在开发模式绑定，修改主进程后需要重启开发应用。

## 构建打包

生成本地 Electron 应用包：

```bash
npm run build
```

当前 `build` 实际执行的是：

```bash
electron-forge package
```

构建过程会先运行 Vite 构建，再执行 Electron Forge 打包。首次打包可能需要访问网络下载或校验 Electron 相关资源；如果卡在 `Packaging application`、`Copying files`、`Preparing native dependencies` 或 `Finalizing package`，优先检查网络和 Electron 缓存。

应用图标位于 `assets/icons/`：`icon.png` 为 1024 × 1024 透明底主图，`icon.icns` 用于 macOS，`icon.ico` 用于 Windows。更换图标时需同步更新三种格式并重新打包；开发模式下需重启 Electron 主进程才能更新 Dock 图标。

macOS 构建产物通常位于：

```bash
out/Navo-darwin-arm64/Navo.app
```

可以直接双击打开，或使用：

```bash
open out/Navo-darwin-arm64/Navo.app
```

## 常用脚本

```bash
npm run start
npm run build
npm run package
npm run make
npm run publish
npm run lint
npm run test:i18n
```

- `start`：启动开发态 Electron 应用。
- `build` / `package`：打包本地应用目录。
- `make`：生成分发安装包。
- `publish`：发布分发产物。
- `lint`：运行 ESLint。
- `test:i18n`：检查翻译完整性、插值、复数、语言切换、原生菜单及 key 类型约束。

## 项目结构

- src/components/layout：窗口壳层、一级导航和共用的可调整双区域布局。
- src/components/tasks：任务看板、任务卡片与详情。
- src/components/issues：PR/ISSUE 分组列表、看板、状态标签及详情。
- src/components/settings：常规、外观与 diff 预览、仓库/文件夹、集成占位和关于。
- src/i18n：分语言/命名空间的资源、类型声明、初始化及按语言格式化日期。
- src/stores：设置与资源渲染缓存、迁移和保存状态。
- src/components/review：保留的 diff 弹窗与审查组件。
- src/components/terminal：保留的终端渲染和生命周期能力。
- src/hooks：导航历史、任务拖拽、本地任务及分隔条调整。
- src/domain：任务、Issue、审查与设置的业务类型。
- src/services：渲染进程本地数据访问及 Electron IPC 封装。
- src/main-process / src/shared：主进程服务与共用 IPC 类型。
- src/utils：任务排序、本地数据校验等纯函数。

## 本地数据兼容

新安装使用 Navo 数据目录；如果仅存在旧版 Vibe Reviewer 数据目录，则继续使用旧目录，不移动历史 patch。设置保存在 Electron `userData/app.db`，资源仍写入 `userData/resources.json` 并串行原子替换。设置数据库使用内置 `node:sqlite`，按字段存入 `settings(key, value)`，值为 JSON 编码，开启 WAL、FULL 同步与 3 秒忙等待；整组更新以事务提交，主进程读写共用队列，提交成功才更新缓存，退出时等待已排队的保存。连接按操作打开并关闭，数据库文件新建权限为 `0600`，`user_version = 10` 记录当前结构版本，拒绝写入更高版本的数据库。v5 在升级事务中清理身份匹配的历史演示任务和 Issue/PR 关联，保留设置、真实上下文与初始化标记，不操作工作目录或分支。v6 新增 `agent_configurations` 与 `agent_preferences`，与通用设置分开读写；环境变量值通过 Electron `safeStorage` 加密，禁用明文后端，渲染进程只读取变量名称。v7 新增 `task_agents`，保存任务级 Agent 配置快照，删除任务时级联清理，旧任务保持无配置。v8 新增 `agent_capability_cache` 与 `agent_capability_state`，分别保存按 Agent/可执行路径区分的最后成功能力及当前检测状态，刷新失败不覆盖成功结果。

Agent 主进程模块位于 `src/main-process/services/agents`，IPC 契约位于 `src/shared/agentTypes.ts` 和 `src/shared/agentCapabilities.ts`；设置面板、状态 hook 和 API 分层复用现有模式。Agents 设置页与创建任务界面挂载时读取本地快照并订阅后台事件，进入或切回设置、打开弹窗、切换 Agent、提交任务只使用缓存，不触发 CLI 检测或过期校验。启动 30 秒后、此后每 4 小时由主进程检查已启用 Agent 的缓存；顶部手动扫描检查全部启用项，路径重扫和配置/操作变更仅刷新对应 Agent。安装/版本与登录检测分开缓存，登录结果复用 5 秒（非轮询）；登录操作只失效登录和能力结果，安装/路径变更、定时检查与手动扫描同时失效安装检测。相同 Agent 的请求合并，变更前的旧请求不会写回；失败保留缓存，变更环境的旧配置只展示不提交，退出时停止调度并等待存储队列。`node --test scripts/agent-detection-cache-regression.test.mjs scripts/agent-capability-cache-regression.test.mjs scripts/agent-settings-regression.test.mjs scripts/agent-settings-ui-regression.test.mjs scripts/task-agent-regression.test.mjs scripts/task-creation-regression.test.mjs scripts/task-creation-ui-regression.test.mjs` 覆盖存储、过期调度、定向失效、并发合并、页面只读缓存、保密、真实协议解析、认证筛选、任务配置持久化与子弹窗交互；测试使用临时数据和模拟终端操作，不登录或退出真实账号。Codex 协议参考[官方 app-server 文档](https://developers.openai.com/codex/app-server/)；能力接口失败时不回退到静态模型表。

失效指纹包含配置、可执行路径、CLI 版本、可识别的认证状态/身份、相关认证环境变量摘要，以及 Claude/Codex/Grok 支持的凭证文件元数据；不读取凭证文件内容，不存储账号或 token 明文。未知认证状态不等同于未登录。无法提供稳定身份或凭证变更信号的 CLI（当前 Antigravity）通过 Navo 内登录管理操作和定期过期查询更新；外部账号切换不保证立即发现。

Grok 能力探测仅发送 ACP `initialize`，读取 `_meta.modelState` 中的模型与模型级思考等级，不创建会话、不复用用户 leader。Antigravity 模型来自 `agy models` 的真实列表，模式及会话级思考等级来自 `agy --help`；帮助兼容 stdout/stderr，未返回模型级限制时不推断。协议探测及 Antigravity 模型查询均设 20 秒上限，普通帮助命令为 5 秒，不新增 SDK 或下载辅助服务。

v9 新增 `task_sessions`，持久化 Agent 配置、工作目录、进程状态与可用的原生恢复标识；应用重启仅恢复记录，不自动启动。普通终端、认证内容和输出不入库。

常规设置提供独立的任务目录 `tasksDirectory`，默认 `~/navo/tasks`，支持输入路径或系统目录选择，并沿用 SQLite 设置存储。旧配置缺少该字段或留空时使用默认值；无目录或多目录任务启动会话时使用此目录下的任务专属目录，写入独占的 `navo-task.md`；单目录默认使用实际工作区，不修改仓库规则文件、不搬迁已有任务。

配置读取优先级为：SQLite 设置 → 旧 `settings.json` → localStorage 的 `navo-settings` / `vibe-reviewer-settings` → 默认值。仅在数据库尚无设置时尝试旧 JSON，规范化后整组导入，成功保留原文件作为备份，之后不再回读或写入；没有旧 JSON 时才由渲染进程迁移旧浏览器设置，写入成功后移除旧键。损坏的数据库、非法 JSON、迁移或保存失败会明确提示，不静默回退默认值或覆盖旧记录。Tasks 及其关联保存在同一 SQLite 数据库中，以 development/production 命名空间隔离。首次加载且任务库尚未初始化时，迁移原 localStorage 任务键，保留标识与顺序，成功后清理旧键；损坏数据不静默覆盖，空列表有独立初始化标记。官网与报告 Bug 链接继续指向现有 GitHub 仓库，不因更名而假定远端已改名。

仓库与 Worktree 默认目录分别为 `~/navo/repos`、`~/navo/worktrees`；诊断日志默认为 `userData/logs/navo.log`，macOS 新安装通常为 `/Users/<用户名>/Library/Application Support/Navo/logs/navo.log`。SQLite 设置中的 `logFilePath` 保存用户选择的完整文件路径，空值使用默认位置。修改路径不迁移或删除旧文件，后续事件写入新位置；已有非空文件需符合 Navo 诊断日志格式，文件扩展名必须为 `.log`。定位操作通过 `shell.showItemInFolder` 打开系统文件管理器，并保证文件存在。日志始终记录，最大 `20 * 1024 * 1024` 字节，达到上限后重置同一文件并继续记录，不生成轮转文件。清理与写入共用串行队列，手动清理只清空当前文件，不删除目录或其他文件；旧开关、目录和保留时间偏好不再读取。仓库克隆依赖系统 Git 与现有 HTTPS 凭证 / SSH agent，不提供交互式密码输入。克隆失败或取消只清理本次独占创建的目录；记录保存失败则保留成功克隆的仓库。浏览器模式不提供配置/文件系统能力，使用真实 Electron 窗口验证。

## 任务创建与恢复

- 任务契约位于 `src/shared/taskTypes.ts`；主进程 `TaskService` 校验并串行创建，`taskStore` 为渲染缓存。
- `appDatabase.ts` 统一升级数据库；任务、资源关联、条目关联、普通链接、附件分别保存在 `tasks`、`task_resources`、`task_links`、`task_web_links`、`task_attachments`。创建日志使用 `task_operations`，保留的工作区使用 `managed_workspaces`，分步删除进度使用 `task_deletions`。v10 增加 `task_notes`、`task_file_references` 和 `task_resource_batches`，保存任务笔记、外部原文件引用和资源提交幂等记录；原文件不复制、不修改，删除任务只级联清理引用。
- 实际探测 Git 能力，选择本地/远程跟踪分支。空目标名按设置前缀加八位随机短 ID 生成；手动名称不加前缀，自动名冲突重试，不覆盖已有分支。
- Worktree 统一平铺在设置目录下，使用 `<项目名>-<随机八位>`，不再创建任务或批次子目录。自动分支沿用其随机后缀，手动或已有分支另生成目录短 ID；创建前检查重名并独占预留目录，回滚只清理本次工作区，保留共用根目录。旧工作区不搬迁，旧操作清单仍按原路径恢复。关闭隔离后明确选择原目录新建分支或当前分支，要求干净，不覆盖被忽略的文件。
- 文件选择器签发窗口专属标识，创建接口不接收任意附件路径。附件副本位于 `userData/task-files/<命名空间>/<任务 UUID>/`，数据库只记录元信息，图片按需生成小预览。
- 创建先记录操作清单，再准备文件和 Git 工作区，最后事务写入任务。失败和启动恢复只撤销本次已确认生成、HEAD 未变化且没有用户改动的内容；无法安全撤销则保留现场并提示。SQLite 不承担 Git/文件系统回滚。
- 新建独立 Worktree 使用 `git worktree add --lock --reason` 默认加锁，并保存唯一锁原因。复用已有目录不改变锁状态；安全回滚或确认清理时核对目录身份及锁原因，只解除应用自己的锁，删除失败后恢复该锁。
- 删除任务默认保留所有目录和分支；确认弹窗可选择清理本任务创建且身份可验证的独立 Worktree 及本地分支。当前分支模式、原仓库、共享工作区、由外部锁定的工作区与无法证明归属的旧记录始终保留；不删除远端引用。主进程签发窗口绑定的一次性预检查凭据，复核文件状态及分支 tip 后执行，清理进度持久化，失败保留任务、不自动续删。删除成功同步关闭任务标签；单独关闭标签不删除任务。

## Electron 通信

Renderer 不直接访问 Node.js 能力。主进程能力通过 preload 暴露到：

```ts
window.navo
```

当前暴露的能力包括：

- `review.runGitDiff`：执行 Git diff 并返回 diff 内容和文件快照。
- `tasks.loadBranch`：按任务和已关联仓库 ID 读取实际分支、文件统计与相对源分支的提交列表，不接受任意目录或执行 Git 写操作。
- `review.loadLocalBranches`：读取当前项目本地分支。
- `review.openFileInVsCode`：在 VS Code 中打开文件。
- `terminal.create/write/resize/destroy`：管理与当前窗口绑定的 PTY 会话。
- `terminal.onData/onExit`：订阅 Shell 输出和退出状态。

IPC 通道定义位于 `src/shared/ipcChannels.ts`，类型定义位于 `src/shared/electronApi.ts`。

## Diff 渲染

Diff 数据加载流程：

```text
ReviewWorkspace
  -> services/reviewApi.ts
  -> window.navo.review.runGitDiff
  -> main-process/services/gitReviewService.ts
  -> domain/diffParser.ts
  -> @pierre/diffs
```

`@pierre/diffs` 负责 patch 解析和 diff 内容渲染。应用层继续保留文件树、文件头、右键菜单、本地评论、折叠、大 diff 单文件模式等外围能力。

## 内嵌终端

任务工作台使用 Ghostty VT 与 node-pty 展示原生 CLI 和普通 Shell。任务服务负责进程创建、停止及 SQLite 会话记录，视图仅附着已有 PTY；关闭页面不结束进程，关闭普通终端会结束进程树。渲染重挂载保留缓冲，输出只在内存中保存有界重放内容，不记录到诊断日志。

任务侧栏和标签复用工作台，以实际容器宽度控制上下文折叠。资源分组为 CHANGES、PULL REQUESTS、ISSUES、LINKS、NOTES，无子项时隐藏；仓库条目打开实际工作目录的分支栏，支持文件筛选、暂存/未暂存统计和相对源分支的提交列表；完整 Diff 复用原有审查组件，以弹窗展示。Notes 支持手动添加 Markdown 笔记并只读查看，空分组隐藏。任务标签页只保留标签关闭，侧栏保留关闭入口；会话面板和上下文的新建菜单在单目录时直接选 Agent，多目录时先选工作范围再选 Agent；模型、模式和思考等级采用真实能力默认值。关闭会话面板只隐藏模块，点击上下文恢复原实例；面板不重复展示配置/运行状态文案。Claude/Grok 使用精确 UUID 恢复；Codex/Antigravity 暂不提供原生恢复，Codex 暂只支持 default 模式，不支持时明确报错。

任务上下文的会话展示 Agent 品牌图标、真实 CLI 名称和文字状态；Claude/Grok 按精确原生标识读取本地元数据，约每 5 秒更新名称，缺失时显示未命名，不推断其他会话。归档会话会终止其进程树并保存归档标识，保留历史记录，但从活动列表和标签状态统计排除；这与只改状态的任务归档不同。会话菜单支持重命名、归档、删除；Claude/Grok 的重命名与删除同步原生记录，确认后先停止进程，原生删除成功才移除 Navo 记录。不支持可靠原生管理的 CLI 禁用相应选项，不能仅改本地记录冒充同步成功。

`node --test scripts/native-session-title-regression.test.mjs scripts/task-session-regression.test.mjs scripts/task-workspace-ui-regression.test.mjs` 验证生命周期、参数、SQLite、资源上下文、窄屏与终端同步；测试不调用真实模型。

## UI 组件

基础组件来自 shadcn，本地源码放在：

```text
src/components/ui
```

当前 shadcn 配置位于 `components.json`，style 使用：

```json
"style": "radix-nova"
```

同步 shadcn 组件时，注意不要覆盖项目自定义组件，例如：

```text
src/components/ui/icon-tooltip.tsx
```

项目约定 tooltip 不显示小尖尖，如果重新拉取 `tooltip` 组件，需要确认没有重新引入 `TooltipPrimitive.Arrow`。

## 开发约束

- 用户可见文案默认使用中文。
- UI 优先使用 Tailwind CSS 和 shadcn 组件。
- 图标优先使用 `lucide-react`。
- 新增依赖前需要先确认。
- 页面负责组装，组件负责展示，hooks 负责逻辑，utils 负责纯函数处理。
- 自定义组件 props 类型需要写必要注释。
- 复杂逻辑不要堆在 JSX 中，优先拆到组件、hooks、utils 或 domain 层。

## 验证建议

- npm run lint：检查所有 TypeScript / TSX。
- npx tsc --noEmit：检查类型及模块集成。
- npm run test:i18n：检查所有已注册语言的资源完整性和国际化回归。
- node --test scripts/*.test.mjs：审查、任务、SQLite 设置读写/迁移/事务回滚/损坏保护、资源 CRUD、克隆错误与取消、日志和翻译回归；预览回归使用隔离用户目录启动隐藏 Electron 窗口，需要桌面环境（Linux CI 需提供虚拟显示）。
- git diff --check：检查补丁空白错误。
- npm run build：打包 Electron 应用；包含 Vite renderer 构建和原生依赖准备。

重点检查 Tasks 与 Issue 的点击/拖拽区分、跨列数量、分组收起、右侧详情、8px 分隔条、模块前进后退以及主题切换。开发样例与正式空状态分别验收。

新增设置检查：语言立即切换及重启恢复、旧设置迁移、无权限目录、重复真实路径、克隆取消/失败/目标已存在、移除保留磁盘文件、诊断日志隐私/20 MB 上限/清理/失败重试、集成占位和更新未接入提示。`⌘ ,`（Windows/Linux 为 `Ctrl ,`）打开设置；真实 CLI 会话已接入；远端 Issue 同步仍不在本阶段范围内。
- `settings.load/save/chooseDirectory/chooseLogFile/revealLogFile/clearLogs/getLogsStatus`：配置、目录选择、日志定位与清理、日志状态。日志路径输入框可直接编辑完整路径；`chooseLogFile` 使用目录选择器并沿用当前日志文件名，返回新文件路径，不调用保存文件对话框。
- `resources.list/save/remove/clone/cancelClone/onCloneProgress/getDroppedPath`：本地资源、所属窗口的克隆操作与拖入目录路径解析。
