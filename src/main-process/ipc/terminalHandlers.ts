import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type {
  CreateTerminalParams,
  ResizeTerminalParams,
  TerminalSessionParams,
  WriteTerminalParams,
} from "../../shared/terminalTypes";
import {
  createTerminal,
  attachTerminal,
  destroyAllTerminals,
  destroyTerminal,
  resizeTerminal,
  writeTerminal,
} from "../services/terminal/terminalService";

export function registerTerminalHandlers(): void {
  ipcMain.handle(ipcChannels.terminalCreate, (event, params: CreateTerminalParams) => {
    if (params.attachOnly) return attachTerminal(params, event.sender.id);
    createTerminal(params, event.sender);
  });
  ipcMain.handle(ipcChannels.terminalWrite, (event, params: WriteTerminalParams) => {
    writeTerminal(params, event.sender.id);
  });
  ipcMain.handle(ipcChannels.terminalResize, (event, params: ResizeTerminalParams) => {
    resizeTerminal(params, event.sender.id);
  });
  ipcMain.handle(ipcChannels.terminalDestroy, (event, params: TerminalSessionParams) => {
    destroyTerminal(params, event.sender.id);
  });
}

export { destroyAllTerminals };
