const ids = new Set<string>();

/** 记录当前真正显示在屏幕上的会话面板，供系统提醒避开用户正在看的会话。 */
export function setSessionForeground(id: string, active: boolean) {
  if (active) ids.add(id);
  else ids.delete(id);
}

export function foregroundSessionIds() {
  return new Set(ids);
}
