# 会话信号能力矩阵

本轮交付物：逐 Agent 记录可可靠取得的会话信号及其来源。只有标为「可靠」的项可在界面展示；其余整项隐藏，不扫描终端、不注入 hooks。代码中的对应常量为 `src/shared/taskSessionActivity.ts` 的 `NATIVE_ACTIVITY_CAPABILITIES`，两者需同步维护。

| Agent | 回答中 | 空闲 | 等待权限 | 等待回答 | 等待原因 | 后台任务 | 重连 | 助手回复（未读用） | 信号来源 |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code | 可靠 | 可靠 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 可靠 | `projects/<cwd>/<id>.jsonl`：非 meta、非子代理、非工具结果的 `user` 记录开始回合；`system` `turn_duration` 结束回合并给出回复时间。权限弹窗不落盘 |
| Codex | 可靠 | 可靠 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 可靠 | `state_N.sqlite` `threads.rollout_path` 定位 rollout JSONL：`event_msg` `task_started` 开始，`task_complete` 结束并给出回复时间，`turn_aborted` 结束但不算回复。审批请求不落盘 |
| Grok Build | 可靠 | 可靠 | 可靠 | 不支持 | 可靠（工具名） | 不支持 | 不支持 | 可靠 | `sessions/<cwd>/<id>/events.jsonl`：`turn_started`、`turn_ended`（仅 `outcome=completed` 算回复）、`permission_requested{tool_name}`、`permission_resolved` |
| Antigravity | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | `transcript.jsonl` 无明确回合结束事件，`PLANNER_RESPONSE` 在一回合内多次出现，无法确认回复完成 |

取值：可靠／不支持。可靠项须写明事件或元数据来源，并有回归用例覆盖。

补充约定：

- 运行相位只在进程为「运行中」时展示，进程停止、失败或重启后清空；相位与等待原因只在内存中维护，不写入会话快照。
- 只按精确绑定的原生会话 ID 读取，未绑定时视为无信号；读取失败保留上次结果，不推断。
- 回复时间只前进不后退，写入快照但不更新会话的元数据时间或最近活动时间。
- 原生文件只读尾部（512 KB），后台随名称同步约每 5 秒轮询一次。
