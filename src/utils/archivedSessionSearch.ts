/** 按会话名称和工作范围过滤归档列表；空白查询保留全部。 */
export function archivedSessionMatches(title: string, workspaceLabel: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${title}\n${workspaceLabel}`.toLowerCase().includes(needle);
}