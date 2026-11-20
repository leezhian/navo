# 会话信号能力矩阵

本轮交付物：逐 Agent 记录可可靠取得的会话信号及其来源。只有标为「可靠」的项可在界面展示；其余整项隐藏，不扫描终端、不注入 hooks。代码中的对应常量为 `src/shared/taskSessionActivity.ts` 的 `NATIVE_ACTIVITY_CAPABILITIES`，两者需同步维护。

| Agent | 回答中 | 空闲 | 等待权限 | 等待回答 | 等待原因 | 后台任务 | 重连 | 助手回复（未读用） | 信号来源 |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code | 可靠 | 可靠 | 不支持 | 不支持 | 不支持 | 可靠（有作业标识时） | 不支持 | 可靠 | `projects/<cwd>/<id>.jsonl`：用户输入开启回合；`system` `turn_duration` 给出回复时间。结构化后台作业标识用于显示，完成通知移除对应作业 |
| Codex | 可靠 | 可靠 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 可靠 | `state_N.sqlite` `threads.rollout_path` 定位 rollout JSONL：`event_msg` `task_started` 开始，`task_complete` 结束并给出回复时间，`turn_aborted` 结束但不算回复。审批请求不落盘 |
| Grok Build | 可靠，另含思考中、执行工具、等待模型 | 可靠 | 可靠 | 不支持 | 可靠（工具名） | 不支持 | 不支持 | 可靠 | `sessions/<cwd>/<id>/events.jsonl`：`phase_changed` 的 `streaming_text`、`streaming_reasoning`、`tool_execution`、`waiting_for_model`、`permission_prompt`；`turn_started`、`turn_ended`（仅 `outcome=completed` 算回复）、`permission_requested{tool_name}`、`permission_resolved`。未列出的 `phase` 值忽略 |
| Antigravity | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | `transcript.jsonl` 无明确回合结束事件，`PLANNER_RESPONSE` 在一回合内多次出现，无法确认回复完成 |

取值：可靠／不支持。可靠项须写明事件或元数据来源，并有回归用例覆盖。

补充约定：

- 运行相位只在进程为「运行中」时展示，进程停止、失败或重启后清空；相位与等待原因只在内存中维护，不写入会话快照。
- 只按精确绑定的原生会话 ID 读取，未绑定时视为无信号；读取失败保留上次结果，不推断。
- 回复时间只前进不后退，写入快照但不更新会话的元数据时间或最近活动时间。
- 原生文件只读尾部（512 KB）。运行相位、回复时间及会话悬停信号共用运行期间的读取频率；会话名称按需读取。
- 后台工作只显示本次 Claude 运行记录里的作业。收到完成、失败或取消通知时移除，作业退出状态长期未更新时自动省略。
- 提示词缓存仅在 Claude 报告 5 分钟或 1 小时的缓存写入档位时估算到期时间。缓存命中且只有一个有效档位时更新估计，有多个候选时保留各档位原先的时间。其他 CLI 缺少可确认的有效期时隐藏。

上下文占用单独采集，不作为运行相位或回合完成信号：

| Agent | 占用来源 |
|---|---|
| Claude Code | 原生 `statusLine` 的 `context_window`；使用窗口及当前输入、缓存创建和缓存读取，缺少分项时使用 CLI 提供的占用比例 |
| Antigravity | 原生 `statusLine` 的 `context_window`，同时核对 `product=antigravity` 与 `conversation_id`；口径同 Claude |
| Codex | rollout 的 `token_count.info.last_token_usage.total_tokens` 与 `model_context_window`，缓存属于输入子集，不重复相加 |
| Grok Build | 当前会话 `signals.json` 的 `contextTokensUsed` 与 `contextWindowTokens`，不使用 `usage.json` 的整轮累计请求量 |

状态栏只通过会话启动参数配置，保留用户原有命令和输出。回调凭证按每次运行隔离，原生身份未绑定时暂存、绑定匹配后才展示；停止或重启撤销旧凭证。缺少可靠数据时整行隐藏，已确认的 0% 正常显示。
