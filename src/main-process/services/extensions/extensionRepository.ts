import { openAppDatabase } from "../appDatabase";

export interface InstalledExtension {
  version: string | null;
  enabled: boolean;
  operation: "idle" | "installing" | "updating" | "uninstalling";
}
export class ExtensionRepository {
  constructor(
    private filename: string,
    private namespace: string,
  ) {}
  async load(): Promise<InstalledExtension> {
    const db = await openAppDatabase(this.filename);
    try {
      const row = db.prepare("SELECT data FROM extensions WHERE namespace=? AND id='session-trace'").get(this.namespace);
      if (!row) return { version: null, enabled: false, operation: "idle" };
      const value = JSON.parse(String(row.data)) as InstalledExtension;
      if (
        (value.version !== null && !/^\d+\.\d+\.\d+$/.test(value.version)) ||
        typeof value.enabled !== "boolean" ||
        (value.operation === "updating" && value.version === null) ||
        !["idle", "installing", "updating", "uninstalling"].includes(value.operation)
      )
        throw Error("INVALID_STORAGE");
      return value;
    } finally {
      db.close();
    }
  }
  async save(value: InstalledExtension) {
    const db = await openAppDatabase(this.filename);
    try {
      db.prepare(
        "INSERT INTO extensions(namespace,id,data) VALUES(?,'session-trace',?) ON CONFLICT(namespace,id) DO UPDATE SET data=excluded.data",
      ).run(this.namespace, JSON.stringify(value));
    } finally {
      db.close();
    }
  }
}
