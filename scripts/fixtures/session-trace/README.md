# 会话轨迹日志夹具

按本机真实日志的结构手写，正文、路径与 ID 均为占位符，不含任何真实会话内容。

- `grok/`：`chat_history.jsonl`（正文，无时间）+ `events.jsonl`（时间与耗时，只覆盖部分轮次）+ `updates.jsonl`（补全仍缺的时间）。第 2 轮的 `events` `turn_number` 与 `prompt_index` 不符，改由 `updates` 的 `user_message_chunk._meta.promptIndex` 补全；`call_fixture_3` 只在 `updates` 里有时间。`updates` 里还有对不上的 promptIndex 和 toolCallId，以及空行、坏行。
- `antigravity/transcript_full.jsonl`：工具调用无 id，按顺序与紧随的 `GENERIC` 配对；含 ERROR、RUNNING、INVALID、孤立结果、CHECKPOINT、空行、坏行和未知类型。
