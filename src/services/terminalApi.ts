import type {
  CreateTerminalParams,
  ResizeTerminalParams,
  TerminalDataListener,
  TerminalExitListener,
  TerminalSessionParams,
  WriteTerminalParams,
} from "../shared/terminalTypes";

export function createTerminal(params: CreateTerminalParams): Promise<void> {
  return window.vibeReviewer.terminal.create(params);
}

export function writeTerminal(params: WriteTerminalParams): Promise<void> {
  return window.vibeReviewer.terminal.write(params);
}

export function resizeTerminal(params: ResizeTerminalParams): Promise<void> {
  return window.vibeReviewer.terminal.resize(params);
}

export function destroyTerminal(params: TerminalSessionParams): Promise<void> {
  return window.vibeReviewer.terminal.destroy(params);
}

export function onTerminalData(listener: TerminalDataListener): () => void {
  try {
    return window.vibeReviewer.terminal.onData(listener);
  } catch {
    return () => undefined;
  }
}

export function onTerminalExit(listener: TerminalExitListener): () => void {
  try {
    return window.vibeReviewer.terminal.onExit(listener);
  } catch {
    return () => undefined;
  }
}
