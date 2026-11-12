import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { TraceDetail, TraceEvent, TracePage, TraceQuery, TraceStats } from "../../../src/shared/extensionTypes";
import { parseRecord } from "./adapters";
import type { Parsed, ParserState } from "./adapters";

const PREVIEW_LIMIT = 220,
  CONTENT_LIMIT = 128 * 1024,
  RAW_LIMIT = 512 * 1024;
const MAX_LINE = 8 * 1024 * 1024,
  MAX_CACHE = 128 * 1024 * 1024;
interface Checkpoint {
  offset: number;
  identity: string;
  tail: string;
  modified?: number;
  parser: ParserState;
}
interface EventRow {
  seq: number;
  data: string;
  content: string;
  result: string | null;
  loc: number;
  len: number;
  result_loc: number | null;
  result_len: number | null;
  truncated: number;
}

export class TraceIndex {
  private db: DatabaseSync;
  private checkpoint: Checkpoint;
  constructor(
    private filename: string,
    cache: string,
    provider: "claude" | "codex",
    private validateSource?: () => Promise<unknown>,
  ) {
    this.db = new DatabaseSync(cache);
    this.db.exec(`PRAGMA journal_mode=DELETE;
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, key TEXT UNIQUE, kind TEXT, request TEXT, call_id TEXT, data TEXT, content TEXT, result TEXT, search TEXT, loc INTEGER, len INTEGER, result_loc INTEGER, result_len INTEGER, truncated INTEGER);
      CREATE INDEX IF NOT EXISTS calls ON events(call_id);
      CREATE TABLE IF NOT EXISTS usage(key TEXT PRIMARY KEY, tokens INTEGER);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT);`);
    const saved = this.db.prepare("SELECT value FROM metadata WHERE key='checkpoint-v3'").get();
    this.checkpoint = saved ? JSON.parse(String(saved.value)) : { offset: 0, identity: "", tail: "", parser: { provider, round: 0 } };
  }
  private async fingerprint(offset: number) {
    const file = await open(this.filename, "r");
    try {
      const bytes = Buffer.alloc(Math.min(offset, 4096));
      const read = await file.read(bytes, 0, bytes.length, Math.max(0, offset - bytes.length));
      return createHash("sha256").update(bytes.subarray(0, read.bytesRead)).digest("hex");
    } finally {
      await file.close();
    }
  }
  async refresh() {
    const info = await stat(this.filename),
      identity = `${info.dev}:${info.ino}`;
    if (!info.isFile()) throw Error("SOURCE_INVALID");
    const checkpoint = this.checkpoint;
    if (
      checkpoint.identity !== identity ||
      info.size < checkpoint.offset ||
      (info.size === checkpoint.offset && checkpoint.modified !== info.mtimeMs) ||
      (checkpoint.offset > 0 && (await this.fingerprint(checkpoint.offset)) !== checkpoint.tail)
    ) {
      await this.validateSource?.();
      this.db.exec("DELETE FROM events; DELETE FROM usage; DELETE FROM metadata;");
      checkpoint.offset = 0;
      checkpoint.parser = { provider: checkpoint.parser.provider, round: 0 };
    }
    checkpoint.identity = identity;
    if (info.size === checkpoint.offset) return false;
    const before = checkpoint.offset,
      file = await open(this.filename, "r");
    let pending = Buffer.alloc(0),
      position = checkpoint.offset;
    try {
      while (position < info.size) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, info.size - position));
        const read = await file.read(chunk, 0, chunk.length, position);
        if (!read.bytesRead) break;
        position += read.bytesRead;
        pending = Buffer.concat([pending, chunk.subarray(0, read.bytesRead)]);
        let end: number;
        this.db.exec("BEGIN");
        try {
          while ((end = pending.indexOf(10)) >= 0) {
            if (end > MAX_LINE) throw Error("LINE_TOO_LARGE");
            const bytes = pending.subarray(0, end),
              length = end + 1;
            let raw: unknown;
            try {
              raw = JSON.parse(bytes.toString("utf8"));
            } catch {
              raw = { type: "invalid_json", content: bytes.toString("utf8") };
            }
            for (const event of parseRecord(raw, checkpoint.offset, checkpoint.parser)) this.insert(event, checkpoint.offset, length);
            checkpoint.offset += length;
            pending = pending.subarray(length);
          }
          this.db.exec("COMMIT");
        } catch (error) {
          this.db.exec("ROLLBACK");
          throw error;
        }
        if (pending.length > MAX_LINE) throw Error("LINE_TOO_LARGE");
        const pages = this.db.prepare("PRAGMA page_count").get()?.page_count;
        if (Number(pages) * 4096 > MAX_CACHE) throw Error("CACHE_LIMIT");
      }
      // 留下未完成尾行，下次从最后一个完整换行继续，避免半个 UTF-8 字符或半条 JSON 被丢弃。
      checkpoint.tail = await this.fingerprint(checkpoint.offset);
      checkpoint.modified = info.mtimeMs;
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('checkpoint-v3',?)").run(JSON.stringify(checkpoint));
      return checkpoint.offset !== before;
    } finally {
      await file.close();
    }
  }
  private insert(event: Parsed, offset: number, length: number) {
    if (event.usage)
      this.db
        .prepare("INSERT INTO usage VALUES(?,?) ON CONFLICT(key) DO UPDATE SET tokens=MAX(tokens,excluded.tokens)")
        .run(event.usage.key, event.usage.tokens);
    const clipped = event.content.slice(0, CONTENT_LIMIT),
      truncated = Number(event.content.length > CONTENT_LIMIT);
    if (event.resultFor) {
      const original = this.db
        .prepare("SELECT seq,data,content FROM events WHERE call_id=? ORDER BY seq DESC LIMIT 1")
        .get(event.resultFor);
      if (original) {
        const data = JSON.parse(String(original.data)) as TraceEvent;
        if (event.kind === "error") data.kind = "error";
        if (event.timestamp && data.timestamp) data.durationMs = Math.max(0, Date.parse(event.timestamp) - Date.parse(data.timestamp));
        this.db
          .prepare("UPDATE events SET data=?,kind=?,result=?,result_loc=?,result_len=?,search=?,truncated=MAX(truncated,?) WHERE seq=?")
          .run(
            JSON.stringify(data),
            data.kind,
            clipped,
            offset,
            length,
            String(original.content) + "\n" + event.content,
            truncated,
            original.seq,
          );
        return;
      }
    }
    // 已配对的工具结果不能被后续重放的调用记录覆盖为“待执行”。
    if (event.callId && this.db.prepare("SELECT seq FROM events WHERE key=? AND result_loc IS NOT NULL").get(event.key)) return;
    const data: Omit<TraceEvent, "id"> = {
      kind: event.kind,
      round: event.round,
      request: event.request,
      timestamp: event.timestamp,
      preview: event.content.replace(/\s+/g, " ").slice(0, PREVIEW_LIMIT),
      tool: event.tool,
      callId: event.callId,
      synthetic: event.synthetic,
      bookkeeping: event.bookkeeping,
    };
    this.db
      .prepare(
        `INSERT INTO events(key,kind,request,call_id,data,content,search,loc,len,truncated) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET kind=excluded.kind,request=excluded.request,call_id=excluded.call_id,data=excluded.data,content=excluded.content,search=excluded.search,loc=excluded.loc,len=excluded.len,truncated=excluded.truncated`,
      )
      .run(
        event.key,
        data.kind,
        event.request ?? null,
        event.callId ?? null,
        JSON.stringify(data),
        clipped,
        event.content,
        offset,
        length,
        truncated,
      );
  }
  private summary(row: { seq?: unknown; data?: unknown }): TraceEvent {
    return { ...JSON.parse(String(row.data)), id: Number(row.seq) };
  }
  private visible(showBookkeeping?: boolean) {
    return showBookkeeping ? "" : "AND ifnull(json_extract(data,'$.bookkeeping'),0)=0";
  }
  /** 框选命中规则：有持续时间按闭区间重叠，仅有时间戳则时刻需落在闭区间内；无时间戳不算命中。 */
  private rangeClause(query: Pick<TraceQuery, "from" | "to">) {
    if (query.from == null || query.to == null) return { sql: "", args: [] as number[] };
    const fromMs = Date.parse(query.from),
      toMs = Date.parse(query.to);
    const start = "CAST(round(unixepoch(json_extract(data,'$.timestamp'), 'subsec') * 1000) AS INTEGER)";
    const duration = "json_extract(data,'$.durationMs')";
    const sql = `AND json_extract(data,'$.timestamp') IS NOT NULL AND (
      CASE WHEN ${duration} IS NOT NULL THEN ${start} <= ? AND ${start} + ${duration} >= ?
      ELSE ${start} >= ? AND ${start} <= ? END
    )`;
    return { sql, args: [toMs, fromMs, fromMs, toMs] };
  }
  private scope(query: Pick<TraceQuery, "filter" | "search" | "showBookkeeping">) {
    const filter = query.filter ?? "all",
      search = query.search ?? "";
    const where = `WHERE (?='all' OR kind=? OR (?='tool' AND call_id IS NOT NULL)) AND instr(lower(search),lower(?))>0 ${this.visible(query.showBookkeeping)}`;
    return { where, args: [filter, filter, filter, search] };
  }
  stats(): TraceStats {
    const hidden = this.visible();
    const counts =
      this.db
        .prepare(
          `SELECT COUNT(*) events, COUNT(DISTINCT request) requests, SUM(call_id IS NOT NULL) tools, SUM(kind='error') errors FROM events WHERE 1=1 ${hidden}`,
        )
        .get() ?? {};
    const timing =
      this.db.prepare("SELECT MIN(json_extract(data,'$.timestamp')) start, MAX(json_extract(data,'$.timestamp')) end FROM events").get() ??
      {};
    const tokens = this.db.prepare("SELECT SUM(tokens) tokens FROM usage").get()?.tokens;
    return {
      events: Number(counts.events),
      requests: Number(counts.requests) || null,
      rounds: this.checkpoint.parser.round,
      tools: Number(counts.tools),
      errors: Number(counts.errors),
      tokens: tokens == null ? null : Number(tokens),
      start: timing.start ? String(timing.start) : undefined,
      end: timing.end ? String(timing.end) : undefined,
    };
  }
  page(query: TraceQuery): TracePage {
    const { where, args } = this.scope(query);
    const limit = query.limit ?? 80;
    let offset = query.offset ?? 0;
    // 事件序号包含隐藏记账行，定位时按当前筛选计算其所在页，避免按 id 直接换算翻到空页。
    if (query.eventId != null) {
      const before = this.db.prepare(`SELECT COUNT(*) total FROM events ${where} AND seq<?`).get(...args, query.eventId)?.total;
      offset = Math.floor(Number(before) / limit) * limit;
    }
    // 框选只用于高亮，不收窄列表：这里只算出当前结果中第一条命中的位置。
    let rangeFirstIndex: number | null | undefined;
    if (query.from != null && query.to != null) {
      const range = this.rangeClause(query);
      const first = this.db.prepare(`SELECT MIN(seq) seq FROM events ${where} ${range.sql}`).get(...args, ...range.args)?.seq;
      rangeFirstIndex =
        first == null ? null : Number(this.db.prepare(`SELECT COUNT(*) total FROM events ${where} AND seq<?`).get(...args, Number(first))?.total);
      // 未指定起点时直接返回命中所在的窗口，宿主一次查询即可滚过去。
      if (rangeFirstIndex != null && query.offset == null && query.eventId == null) offset = Math.floor(rangeFirstIndex / limit) * limit;
    }
    const rows = this.db.prepare(`SELECT seq,data FROM events ${where} ORDER BY seq LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const total = Number(this.db.prepare(`SELECT COUNT(*) total FROM events ${where}`).get(...args)?.total);
    const page: TracePage = { events: rows.map((row) => this.summary(row)), total, stats: this.stats(), offset };
    if (rangeFirstIndex !== undefined) page.rangeFirstIndex = rangeFirstIndex;
    return page;
  }
  timeline(query: TraceQuery = { kind: "timeline" }) {
    const rows = this.db
      .prepare(
        `SELECT seq,data FROM events WHERE json_extract(data,'$.timestamp') IS NOT NULL ${this.visible(query.showBookkeeping)} ORDER BY seq LIMIT 1001`,
      )
      .all();
    return { events: rows.slice(0, 1000).map((row) => this.summary(row)), truncated: rows.length > 1000 };
  }
  async detail(id: number): Promise<TraceDetail> {
    await this.validateSource?.();
    const row = this.db.prepare("SELECT * FROM events WHERE seq=?").get(id) as unknown as EventRow | undefined;
    if (!row) throw Error("EVENT_MISSING");
    const file = await open(this.filename, "r");
    try {
      const parts = [[row.loc, row.len], ...(row.result_loc != null ? [[row.result_loc, row.result_len ?? 0]] : [])];
      const raw: string[] = [];
      for (const [offset, length] of parts) {
        const bytes = Buffer.alloc(Math.min(length, RAW_LIMIT));
        const read = await file.read(bytes, 0, bytes.length, offset);
        raw.push(bytes.subarray(0, read.bytesRead).toString("utf8"));
      }
      return {
        ...this.summary(row),
        content: row.content,
        result: row.result ?? undefined,
        raw: raw.join("\n"),
        truncated: Boolean(row.truncated) || parts.some(([, length]) => length > RAW_LIMIT),
      };
    } finally {
      await file.close();
    }
  }
  close() {
    this.db.close();
  }
}
