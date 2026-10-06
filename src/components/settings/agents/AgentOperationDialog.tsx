import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TerminalWorkspace } from "@/components/terminal/TerminalWorkspace";
import { destroyManagedTerminalSession } from "@/components/terminal/terminalSessionManager";
import type { TerminalSessionStatus } from "@/components/terminal/terminalSessionManager";
import { onTerminalExit } from "@/services/terminalApi";
import { getAgentsApi } from "@/services/agentApi";
import { agentNames } from "@/domain/agents";
import type { AgentOperationPlan } from "@/shared/agentTypes";

interface AgentOperationDialogProps {
  /** 已确认有效且按序执行的命令计划，不包含明文环境变量。 */
  plans: AgentOperationPlan[];
  /** 操作面板关闭后重新检测安装和登录状态。 */
  onClose: () => void;
}

export function AgentOperationDialog({ plans, onClose }: AgentOperationDialogProps) {
  const { t } = useTranslation(["agents", "common"]);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, "success" | "failed" | "cancelled">>({});
  const [selected, setSelected] = useState<number | null>(null);
  const cancelled = useRef(false);
  const finished = useRef(new Set<string>());
  const running = started && index < plans.length && !cancelled.current;
  const current = plans[index];
  const finish = useCallback((token: string, success: boolean) => {
    if (cancelled.current || finished.current.has(token)) return;
    finished.current.add(token);
    setResults((values) => ({ ...values, [token]: success ? "success" : "failed" }));
    setSelected(null);
    setIndex((value) => value + 1);
  }, []);
  useEffect(() => onTerminalExit((payload) => {
    if (current && payload.sessionId === "agent-" + current.token) finish(current.token, payload.exitCode === 0);
  }), [current, finish]);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      for (const plan of plans) void destroyManagedTerminalSession("agent-" + plan.token);
    };
  }, [plans]);
  const onStatus = useCallback((status: TerminalSessionStatus) => { if (status === "error" && current) finish(current.token, false); }, [current, finish]);
  async function cancel() {
    cancelled.current = true;
    setResults((values) => ({ ...values, ...Object.fromEntries(plans.slice(index).map((plan) => [plan.token, "cancelled" as const])) }));
    if (current) await destroyManagedTerminalSession("agent-" + current.token);
    setIndex(plans.length);
    await getAgentsApi().discardPlans().catch(() => undefined);
  }
  const shown = selected ?? Math.min(index, plans.length - 1);
  return <Dialog open onOpenChange={(open) => { if (!open && !running) onClose(); }}>
    <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[760px]" showCloseButton={!running} onEscapeKeyDown={(event) => { if (running) event.preventDefault(); }} onInteractOutside={(event) => { if (running) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{t("agents:operation.title")}</DialogTitle><DialogDescription className="text-xs">{t("agents:operation.description")}</DialogDescription></DialogHeader>
      <div className="max-h-44 space-y-2 overflow-auto text-xs">
        {plans.map((plan, position) => <div key={plan.token} className="rounded-lg bg-muted/40 p-3">
          <Button variant="ghost" className="h-auto w-full justify-between p-0 text-xs" disabled={!started || running || position > index} onClick={() => setSelected(position)}><span>{agentNames[plan.id]} · {t(`agents:actions.${plan.action}`)}</span><span>{t(results[plan.token] ? `agents:operation.${results[plan.token]}` : started && position === index ? "agents:operation.running" : "agents:operation.waiting")}</span></Button>
          {!started && <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-muted-foreground">{plan.command}</pre>}
        </div>)}
      </div>
      {plans.some((plan) => plan.action === "manageLogin") && <p className="text-xs text-muted-foreground">{t("agents:operation.manageHint")}</p>}
      {started && <div className="h-80 min-h-40 overflow-hidden rounded-lg border border-border">
        {plans.map((plan, position) => position <= index && results[plan.token] !== "cancelled" && <div key={plan.token} className="h-full" hidden={shown !== position}>
          <TerminalWorkspace compact sessionId={"agent-" + plan.token} operationToken={plan.token} title={agentNames[plan.id]} onStatusChange={position === index ? onStatus : undefined} />
        </div>)}
        {results[plans[shown].token] === "cancelled" && <p className="p-4 text-xs text-muted-foreground">{t("agents:operation.cancelled")}</p>}
      </div>}
      <DialogFooter>{running ? <Button variant="secondary" onClick={() => void cancel()}>{t("agents:operation.stop")}</Button> : <Button variant="ghost" onClick={onClose}>{t("common:actions.close")}</Button>}
        {!started && <Button onClick={() => setStarted(true)}>{t("agents:operation.run")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
