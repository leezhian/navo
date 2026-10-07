export function getTaskSessionsApi() {
  if (!window.navo?.taskSessions) throw new Error("SESSION_UNAVAILABLE");
  return window.navo.taskSessions;
}
