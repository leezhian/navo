import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { DiagnosticEvent, DiagnosticMetadata, DiagnosticOperation } from "../../shared/diagnosticTypes";
import { DiagnosticWriter } from "./diagnosticWriter";
import { diagnosticErrorCode, makeDiagnosticEntry } from "./diagnosticSanitizer";

export const diagnosticWriter = new DiagnosticWriter();
const operations = new AsyncLocalStorage<DiagnosticMetadata>();
const reportedErrors = new WeakSet<object>();

export function writeDiagnosticEvent(event: DiagnosticEvent, metadata: DiagnosticMetadata = {}) {
  const details = { ...operations.getStore(), ...metadata };
  const error = details.error;
  const canTrack = error !== null && typeof error === "object";
  const includeStack = !canTrack || !reportedErrors.has(error);
  if (canTrack) reportedErrors.add(error);
  const entry = makeDiagnosticEntry(event, details, includeStack);
  return entry ? diagnosticWriter.write(entry) : Promise.resolve();
}

/** 显式业务入口调用；上下文只传白名单元信息，队列等待不串用其他操作的 ID。 */
export function diagnosticOperation<Result>(
  operation: DiagnosticOperation,
  metadata: DiagnosticMetadata,
  run: () => Promise<Result>,
  options: { started?: boolean; success?: boolean } = {},
): Promise<Result> {
  const inherited = operations.getStore();
  const context = { ...inherited, ...metadata, operationId: inherited?.operationId ?? randomUUID() };
  return operations.run(context, async () => {
    const started = Date.now();
    if (options.started) void writeDiagnosticEvent(operation + ".started" as DiagnosticEvent);
    try {
      const result = await run();
      if (options.success !== false) void writeDiagnosticEvent(operation + ".succeeded" as DiagnosticEvent, { durationMs: Date.now() - started });
      return result;
    } catch (error) {
      if (diagnosticErrorCode(error) === "CLONE_CANCELLED") void writeDiagnosticEvent(operation + ".cancelled" as DiagnosticEvent, { durationMs: Date.now() - started });
      else void writeDiagnosticEvent(operation + ".failed" as DiagnosticEvent, { durationMs: Date.now() - started, error });
      throw error;
    }
  });
}

export function writeFatalDiagnostic(error: unknown, origin: string) {
  const entry = makeDiagnosticEntry(origin === "unhandledRejection" ? "app.unhandled_rejection" : "app.uncaught", { error });
  if (entry) diagnosticWriter.fatal(entry);
}
