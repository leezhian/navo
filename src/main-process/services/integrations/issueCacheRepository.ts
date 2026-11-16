import type { DatabaseSync } from "node:sqlite";
import type { IssueItem } from "../../../domain/issues";
import { isIssueItem } from "../../../utils/adeDataValidation";
import { openAppDatabase } from "../appDatabase";
import type { IntegrationProviderId } from "../../../shared/integrationTypes";

const MINE_SCOPE = "mine";

export class IssueCacheRepository {
  constructor(private readonly filename: string) {}

  private async access<T>(operation: (database: DatabaseSync) => T): Promise<T> {
    const database = await openAppDatabase(this.filename);
    try { return operation(database); } finally { database.close(); }
  }

  put(items: IssueItem[], fetchedAt = new Date().toISOString()) {
    return this.access((database) => {
      const statement = database.prepare("INSERT INTO issue_cache(id,data,fetched_at,source) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at,source=excluded.source");
      for (const item of items) {
        const source = item.source ?? "remote";
        statement.run(item.id, JSON.stringify({ ...item, fetchError: undefined }), fetchedAt, source);
      }
    });
  }

  rememberFailure(id: string, error: string) {
    return this.access((database) => {
      const row = database.prepare("SELECT data FROM issue_cache WHERE id=?").get(id);
      if (!row) return;
      const item = JSON.parse(String(row.data)) as IssueItem;
      database.prepare("UPDATE issue_cache SET data=? WHERE id=?").run(JSON.stringify({ ...item, fetchError: error }), id);
    });
  }

  get(id: string): Promise<IssueItem | null> {
    return this.access((database) => {
      const row = database.prepare("SELECT data FROM issue_cache WHERE id=?").get(id);
      if (!row) return null;
      const value = JSON.parse(String(row.data));
      return isIssueItem(value) ? value : null;
    });
  }

  all(): Promise<IssueItem[]> {
    return this.access((database) => database.prepare("SELECT data FROM issue_cache").all().flatMap((row) => {
      try {
        const value = JSON.parse(String(row.data));
        return isIssueItem(value) ? [value] : [];
      } catch { return []; }
    }));
  }

  setMineIds(ids: string[], fetchedAt: string, stale = false) {
    return this.access((database) => {
      database.prepare("INSERT INTO issue_list_state(scope_key,item_ids,fetched_at,stale) VALUES(?,?,?,?) ON CONFLICT(scope_key) DO UPDATE SET item_ids=excluded.item_ids,fetched_at=excluded.fetched_at,stale=excluded.stale")
        .run(MINE_SCOPE, JSON.stringify(ids), fetchedAt, stale ? 1 : 0);
    });
  }

  markMineStale() {
    return this.access((database) => {
      database.prepare("UPDATE issue_list_state SET stale=1 WHERE scope_key=?").run(MINE_SCOPE);
    });
  }

  mine(): Promise<{ items: IssueItem[]; fetchedAt: string | null; stale: boolean }> {
    return this.access((database) => {
      const state = database.prepare("SELECT item_ids,fetched_at,stale FROM issue_list_state WHERE scope_key=?").get(MINE_SCOPE);
      if (!state) {
        const locals = database.prepare("SELECT data FROM issue_cache WHERE source='local'").all().flatMap((row) => {
          try {
            const value = JSON.parse(String(row.data));
            return isIssueItem(value) ? [value] : [];
          } catch { return []; }
        });
        return { items: locals, fetchedAt: null, stale: false };
      }
      const ids = JSON.parse(String(state.item_ids)) as string[];
      const items = ids.flatMap((id) => {
        const row = database.prepare("SELECT data FROM issue_cache WHERE id=?").get(id);
        if (!row) return [];
        try {
          const value = JSON.parse(String(row.data));
          return isIssueItem(value) ? [value] : [];
        } catch { return []; }
      });
      const locals = database.prepare("SELECT data FROM issue_cache WHERE source='local'").all().flatMap((row) => {
        try {
          const value = JSON.parse(String(row.data));
          return isIssueItem(value) && !ids.includes(value.id) ? [value] : [];
        } catch { return []; }
      });
      return { items: [...items, ...locals], fetchedAt: state.fetched_at ? String(state.fetched_at) : null, stale: Number(state.stale) === 1 };
    });
  }

  deleteProvider(providerId: IntegrationProviderId) {
    return this.access((database) => {
      const rows = database.prepare("SELECT id,data FROM issue_cache").all();
      for (const row of rows) {
        try {
          const item = JSON.parse(String(row.data)) as IssueItem;
          if (item.providerId === providerId && item.source !== "local") database.prepare("DELETE FROM issue_cache WHERE id=?").run(row.id);
        } catch { /* keep malformed rows for later cleanup */ }
      }
    });
  }

  addExclusion(namespace: string, taskId: string, issueId: string) {
    return this.access((database) => {
      database.prepare("INSERT OR IGNORE INTO issue_autolink_exclusions(namespace,task_id,issue_id) VALUES(?,?,?)").run(namespace, taskId, issueId);
    });
  }

  removeExclusion(namespace: string, taskId: string, issueId: string) {
    return this.access((database) => {
      database.prepare("DELETE FROM issue_autolink_exclusions WHERE namespace=? AND task_id=? AND issue_id=?").run(namespace, taskId, issueId);
    });
  }

  exclusions(namespace: string, taskId?: string): Promise<{ taskId: string; issueId: string }[]> {
    return this.access((database) => {
      const rows = taskId
        ? database.prepare("SELECT task_id,issue_id FROM issue_autolink_exclusions WHERE namespace=? AND task_id=?").all(namespace, taskId)
        : database.prepare("SELECT task_id,issue_id FROM issue_autolink_exclusions WHERE namespace=?").all(namespace);
      return rows.map((row) => ({ taskId: String(row.task_id), issueId: String(row.issue_id) }));
    });
  }
}
