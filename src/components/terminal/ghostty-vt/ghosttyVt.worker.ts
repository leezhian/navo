import { GhosttyVtSession } from "./ghosttyVtSession";
import type { GhosttyWorkerMessage } from "./ghosttyVtTypes";

const sessions = new Map<string, GhosttyVtSession>();
let commandQueue = Promise.resolve();

self.onmessage = (event: MessageEvent<GhosttyWorkerCommand>) => {
  // create 会异步加载 WASM；串行处理可保证随后到达的 write/destroy 不会越过它。
  commandQueue = commandQueue.then(() => handleCommand(event.data));
};

interface CreateCommand {
  type: "create";
  sessionId: string;
  cols: number;
  rows: number;
}

interface WriteCommand {
  type: "write";
  sessionId: string;
  data: string;
}

interface ResizeCommand {
  type: "resize";
  sessionId: string;
  cols: number;
  rows: number;
}

interface DestroyCommand {
  type: "destroy";
  sessionId: string;
}

type GhosttyWorkerCommand = CreateCommand | WriteCommand | ResizeCommand | DestroyCommand;

async function handleCommand(command: GhosttyWorkerCommand): Promise<void> {
  try {
    switch (command.type) {
      case "create":
        await createSession(command);
        return;
      case "write":
        writeSession(command);
        return;
      case "resize":
        resizeSession(command);
        return;
      case "destroy":
        destroySession(command.sessionId);
        return;
    }
  } catch (error) {
    postMessage({
      type: "error",
      sessionId: command.sessionId,
      message: error instanceof Error ? error.message : String(error),
    } satisfies GhosttyWorkerMessage);
  }
}

async function createSession(command: CreateCommand): Promise<void> {
  destroySession(command.sessionId);
  const session = await GhosttyVtSession.create(command.cols, command.rows);
  sessions.set(command.sessionId, session);
  postMessage({ type: "ready", sessionId: command.sessionId } satisfies GhosttyWorkerMessage);
}

function writeSession(command: WriteCommand): void {
  const session = sessions.get(command.sessionId);
  if (!session) {
    return;
  }

  postFrame(command.sessionId, session.write(command.data));
}

function resizeSession(command: ResizeCommand): void {
  const session = sessions.get(command.sessionId);
  if (!session) {
    return;
  }

  postFrame(command.sessionId, session.resize(command.cols, command.rows));
}

function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  session.dispose();
  sessions.delete(sessionId);
}

function postFrame(sessionId: string, html: string): void {
  postMessage({ type: "frame", sessionId, html } satisfies GhosttyWorkerMessage);
}
