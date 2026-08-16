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
  destroyAllTerminals,
  destroyTerminal,
  resizeTerminal,
  writeTerminal,
} from "../services/terminal/terminalService";

export function registerTerminalHandlers(): void {
  ipcMain.handle(ipcChannels.terminalCreate, (event, params: CreateTerminalParams) => {
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
