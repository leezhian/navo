import type {
  CreateTerminalParams,
  ResizeTerminalParams,
  TerminalDataListener,
  TerminalExitListener,
  TerminalSessionParams,
  WriteTerminalParams,
} from "../shared/terminalTypes";
import { getAgentsApi } from "./agentApi";

export function createTerminal(params: CreateTerminalParams): Promise<void> {
  if (params.operationToken) return getAgentsApi().startOperation({ ...params, operationToken: params.operationToken });
  return window.navo.terminal.create(params);
}

export function writeTerminal(params: WriteTerminalParams): Promise<void> {
  return window.navo.terminal.write(params);
}

export function resizeTerminal(params: ResizeTerminalParams): Promise<void> {
  return window.navo.terminal.resize(params);
}

export function destroyTerminal(params: TerminalSessionParams): Promise<void> {
  return window.navo.terminal.destroy(params);
}

export function onTerminalData(listener: TerminalDataListener): () => void {
  try {
    return window.navo.terminal.onData(listener);
  } catch {
    return () => undefined;
  }
}

export function onTerminalExit(listener: TerminalExitListener): () => void {
  try {
    return window.navo.terminal.onExit(listener);
  } catch {
    return () => undefined;
  }
}
