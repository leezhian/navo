import type { AgentType, ReviewSession } from "./types";

export interface SessionGroup {
  /** 分组唯一键，使用项目绝对路径避免同名项目误合并。 */
  projectPath: string;
  /** 组头展示的项目名。 */
  projectName: string;
  /** 组内会话，沿用传入顺序（调用方保证按更新时间倒序）。 */
  sessions: ReviewSession[];
  /** 组内未读会话数量，用于组头角标，折叠后仍可见。 */
  unreadCount: number;
}

/**
 * 按项目路径聚合会话。传入列表已按更新时间倒序，
 * 因此组的先后顺序天然等于「组内最新会话」的时间倒序，活跃项目排在最前。
 */
export function groupSessionsByProject(orderedSessions: ReviewSession[]): SessionGroup[] {
  const groups: SessionGroup[] = [];
  const groupByPath = new Map<string, SessionGroup>();

  for (const session of orderedSessions) {
    let group = groupByPath.get(session.projectPath);
    if (!group) {
      group = {
        projectPath: session.projectPath,
        projectName: session.projectName,
        sessions: [],
        unreadCount: 0,
      };
      groupByPath.set(session.projectPath, group);
      groups.push(group);
    }

    group.sessions.push(session);
    if (session.unread) {
      group.unreadCount += 1;
    }
  }

  return groups;
}

/** 按关键字（标题/项目名/分支名模糊匹配）和启用的 Agent 集合过滤会话。 */
export function filterSessions(
  sessions: ReviewSession[],
  searchText: string,
  enabledAgents: ReadonlySet<AgentType>,
): ReviewSession[] {
  const keyword = searchText.trim().toLowerCase();

  return sessions.filter((session) => {
    if (!enabledAgents.has(session.agent)) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return (
      session.projectName.toLowerCase().includes(keyword) ||
      session.branchName.toLowerCase().includes(keyword) ||
      (session.title ?? "").toLowerCase().includes(keyword)
    );
  });
}
