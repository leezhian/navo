# 本地诊断日志

日志用于运行问题排查，不是业务恢复依据或全量操作审计。产品约定见常规设置 PRD。

## 分层与调用

- `src/shared/diagnosticTypes.ts`：固定事件集合、操作名称、元信息及渲染上报契约。
- `src/main-process/diagnostics/diagnosticLogger.ts`：显式事件入口及操作上下文。
- `diagnosticSanitizer.ts`：运行时字段白名单与安全异常摘要。
- `diagnosticWriter.ts`：有限队列、重复汇总、文件上限、串行清理与退出刷新。
- `diagnosticRuntime.ts`：进程/窗口异常与受限渲染上报 IPC。
- `src/main-process/services/diagnosticLogService.ts`：沿用设置中的实际文件路径和管理入口，不被业务服务反向依赖。

业务代码通过显式入口记录，不拦截所有 IPC，不重定向 console，不将任意对象 stringify 到文件：

```ts
return diagnosticOperation("task.create", { taskId: input.requestId }, async () => {
  return createTask();
}, { started: true });
```

普通操作省略 started；高频成功读取设置 success: false，只记录失败。操作上下文使用 AsyncLocalStorage 传递内部 operationId，嵌套 Git/数据库步骤共享标识，不把业务参数塞进上下文。只记录已接入功能，服务商、Agent 等后续能力新增事件时同时定义字段与测试。

## 格式与安全边界

```json
{"schemaVersion":1,"time":"2026-10-05T04:00:00.000Z","level":"WARN","scope":"task","event":"task.delete.failed","data":{"operationId":"00000000-0000-4000-8000-000000000001","taskId":"00000000-0000-4000-8000-000000000002","durationMs":128},"error":{"name":"Error","code":"TASK_DELETE_CHANGED","message":"Operation reported TASK_DELETE_CHANGED."}}
```

- JSONL 每行最多 8 KiB；时间、级别、scope、event 为固定结构，元信息位于 data。
- event/code 使用稳定英文，不跟随 UI 语言翻译。
- UUID 型内部标识、有限数值、固定状态/原因、已知设置字段名通过运行时白名单；未知字段直接丢弃。
- 原始异常 message、stdout、stderr、cause 或自定义附加属性不直接记录。只识别已知错误码，未知错误使用固定摘要；Git 子进程失败保留退出码，不保留命令参数和输出。
- 堆栈丢弃原始首行、函数信息、路径及 URL，仅保留最多 12 层的脱敏行列位置。同一异常对象跨层传播时详细堆栈只写一次，父操作仍记录失败结果。
- 不记录任务标题、描述、项目名称、代码、diff、对话、文件路径、URL、分支名、认证凭证、环境变量和终端内容。
- 新增错误码需同步白名单；不要仅通过正则猜测未知消息中的敏感字段。

## 文件与生命周期

- 设置读取之前使用有限启动缓冲，读取结束后启用实际日志路径；初始加载失败仍可写默认路径。
- 入队时固定目的路径。修改设置不会移动原文件，已入队事件仍属于原路径，后续事件使用新路径。
- 兼容旧 `{time,event}` 日志；首行校验上限与新单条长度一致，新旧行可混存，不重写旧内容。非 Navo 文件拒绝覆盖。
- 单文件上限 20 MiB，超过后以当前新事件重置，不创建轮转文件。
- 写入使用约 1000 条的有限业务事件队列，为 WARN/ERROR 预留容量，优先丢弃 INFO；控制请求和内部汇总另有固定数量边界。重复告警/错误按事件、错误类别、脱敏位置及业务标识做 30 秒窗口汇总，键集合最多 128 项。
- 清理与写入共用队列，清理时丢弃对应文件尚未写出的旧重复统计，不在清理后回填。重复/丢弃总数记录为 log.repeated / log.dropped。
- 文件不可写时仅更新诊断失败状态，不让正常业务失败，不通过同一日志器递归报告自身错误。
- 正常退出先等待已排队业务，再记录 app.stopped 并有界刷新日志。致命异常使用 uncaughtExceptionMonitor 尽力同步写入，不安装吞掉错误的 handler，不阻止 Node 默认退出。未处理 Promise 拒绝在默认升级为致命异常时同样记录。
- SIGKILL、掉电或致命写盘竞争无法保证最后事件写入，日志不能替代 SQLite 操作进度。

## 渲染异常

主进程监听渲染进程退出及窗口无响应/恢复。渲染进程捕获窗口 error、unhandledrejection 与 React 错误边界；不发送原始错误消息或组件栈。同一异常对象去重，上报失败被吞掉，不能再次上报自己。

IPC 仅接受主 frame 的固定异常类别和有限长度的名称/堆栈，由主进程再次脱敏；每窗口 30 秒最多接收 30 次报告，超额汇总计数。没有任意 event、路径、日志级别或正文写入接口。

## 验证

```bash
node --test --test-concurrency=1 scripts/diagnostic-log-regression.test.mjs scripts/diagnostic-ui-regression.test.mjs scripts/settings-resources-regression.test.mjs
npx tsc --noEmit
npm run lint
npm run test:i18n
git diff --check
```

回归覆盖敏感字段、旧格式与长首行、并发关联、级别/重复错误、容量/清理、路径切换、日志不可写、真实任务与 Worktree 操作、受限 IPC、致命退出及渲染恢复入口。
