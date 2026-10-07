import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import type { AgentAction, AgentId, SaveAgentConfiguration } from "../../shared/agentTypes";
import type { CreateTerminalParams } from "../../shared/terminalTypes";
import { ipcChannels } from "../../shared/ipcChannels";
import { AgentService } from "../services/agents/agentService";
import { agentCatalog } from "../services/agents/agentCatalog";
import { requireAgentId } from "../services/agents/agentRepository";
import type { TaskAgentSelection } from "../../shared/agentCapabilities";
import { matchesAgentCapabilities } from "../../utils/taskAgentSelection";

let service: AgentService | null = null;
export function getAgentService() {
  if (!service) throw new Error("AGENT_UNAVAILABLE");
  return service;
}
export async function flushAgentSettings() {
  await service?.capabilityCache.stop();
  await service?.repository.flush();
}

export async function resolveTaskAgentSelection(selection: TaskAgentSelection): Promise<TaskAgentSelection> {
  if (!service) throw new Error("TASK_AGENT_UNAVAILABLE");
  try {
    const capabilities = await service.capabilities(selection.agentId);
    const model = capabilities.models.find((item) => item.id === selection.modelId);
    const mode = capabilities.modes.find((item) => item.id === selection.modeId);
    if (!model || !mode || !matchesAgentCapabilities(selection, capabilities)) throw new Error("TASK_AGENT_UNAVAILABLE");
    return { ...selection, modelName: model.name, modeName: mode.name };
  } catch { throw new Error("TASK_AGENT_UNAVAILABLE"); }
}

export function registerAgentHandlers() {
  const agents = new AgentService(path.join(app.getPath("userData"), "app.db"), () => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.webContents.isDestroyed()) window.webContents.send(ipcChannels.agentsCapabilitiesChanged);
  });
  service = agents;
  agents.capabilityCache.start();
  const owners = new Set<number>();
  function owner(event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("AGENT_INVALID");
    if (!owners.has(event.sender.id)) {
      owners.add(event.sender.id);
      event.sender.once("destroyed", () => { agents.discardPlans(event.sender.id); owners.delete(event.sender.id); });
    }
    return event.sender;
  }
  ipcMain.handle(ipcChannels.agentsLoad, (event) => { owner(event); return agents.repository.snapshot(); });
  ipcMain.handle(ipcChannels.agentsScan, (event) => { owner(event); return agents.scan(); });
  ipcMain.handle(ipcChannels.agentsCapabilities, (event, id: AgentId) => { owner(event); return agents.capabilities(id); });
  ipcMain.handle(ipcChannels.agentsCapabilitySnapshot, (event) => { owner(event); return agents.capabilityCache.snapshot(); });
  ipcMain.handle(ipcChannels.agentsSave, (event, input: SaveAgentConfiguration) => { owner(event); return agents.save(input); });
  ipcMain.handle(ipcChannels.agentsSetDefault, (event, id: AgentId | null) => { owner(event); return agents.setDefault(id); });
  ipcMain.handle(ipcChannels.agentsChooseBinary, async (event) => {
    const window = BrowserWindow.fromWebContents(owner(event));
    if (!window) throw new Error("AGENT_INVALID");
    const result = await dialog.showOpenDialog(window, { defaultPath: app.getPath("home"), properties: ["openFile", "showHiddenFiles"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(ipcChannels.agentsOpenDocumentation, (event, id: AgentId) => { owner(event); requireAgentId(id); return shell.openExternal(agentCatalog[id].documentation); });
  ipcMain.handle(ipcChannels.agentsPrepare, (event, id: AgentId, action: AgentAction) => agents.prepare(id, action, owner(event).id));
  ipcMain.handle(ipcChannels.agentsStartOperation, (event, params: CreateTerminalParams & { operationToken: string }) => agents.start(params, owner(event)));
  ipcMain.handle(ipcChannels.agentsDiscardPlans, (event) => agents.discardPlans(owner(event).id));
}
