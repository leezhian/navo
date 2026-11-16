import type { DatabaseSync } from "node:sqlite";
import type { IntegrationAccount, IntegrationAuthMethod, IntegrationProviderId, IntegrationWarning } from "../../../shared/integrationTypes";
import { INTEGRATION_PROVIDER_IDS } from "../../../shared/integrationTypes";
import { openAppDatabase } from "../appDatabase";
import type { TokenCipher } from "./tokenCipher";

export interface StoredConnection {
  id: IntegrationProviderId;
  authMethod: IntegrationAuthMethod;
  host: string;
  apiBase: string;
  account?: IntegrationAccount;
  scopes: string[];
  missingScopes: string[];
  warning?: IntegrationWarning;
  deniedOrganizations?: string[];
  expiresAt?: string;
  tokenType?: string;
}

export interface StoredSecrets {
  accessToken: string;
  refreshToken?: string;
}

function isProviderId(value: string): value is IntegrationProviderId {
  return (INTEGRATION_PROVIDER_IDS as readonly string[]).includes(value);
}

export class IntegrationRepository {
  constructor(private readonly filename: string, private readonly cipher: TokenCipher) {}

  private async access<T>(operation: (database: DatabaseSync) => T): Promise<T> {
    const database = await openAppDatabase(this.filename);
    try { return operation(database); } finally { database.close(); }
  }

  list(): Promise<StoredConnection[]> {
    return this.access((database) => database.prepare("SELECT id,data FROM integration_connections").all().flatMap((row) => {
      if (!isProviderId(String(row.id))) return [];
      try { return [{ id: String(row.id) as IntegrationProviderId, ...JSON.parse(String(row.data)) } as StoredConnection]; }
      catch { return []; }
    }));
  }

  get(id: IntegrationProviderId): Promise<StoredConnection | null> {
    return this.access((database) => {
      const row = database.prepare("SELECT data FROM integration_connections WHERE id=?").get(id);
      if (!row) return null;
      return { id, ...JSON.parse(String(row.data)) } as StoredConnection;
    });
  }

  secrets(id: IntegrationProviderId): Promise<StoredSecrets | null> {
    return this.access((database) => {
      const row = database.prepare("SELECT access_token,refresh_token FROM integration_secrets WHERE id=?").get(id);
      if (!row) return null;
      return {
        accessToken: this.cipher.decrypt(String(row.access_token)),
        refreshToken: row.refresh_token ? this.cipher.decrypt(String(row.refresh_token)) : undefined,
      };
    });
  }

  async save(connection: StoredConnection, secrets: StoredSecrets) {
    const encryptedAccess = this.cipher.encrypt(secrets.accessToken);
    const encryptedRefresh = secrets.refreshToken ? this.cipher.encrypt(secrets.refreshToken) : null;
    const { id, ...data } = connection;
    await this.access((database) => {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("INSERT INTO integration_connections(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(id, JSON.stringify(data));
        database.prepare("INSERT INTO integration_secrets(id,access_token,refresh_token) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET access_token=excluded.access_token,refresh_token=excluded.refresh_token")
          .run(id, encryptedAccess, encryptedRefresh);
        database.exec("COMMIT");
      } catch (error) { database.exec("ROLLBACK"); throw error; }
    });
  }

  remove(id: IntegrationProviderId) {
    return this.access((database) => {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("DELETE FROM integration_secrets WHERE id=?").run(id);
        database.prepare("DELETE FROM integration_connections WHERE id=?").run(id);
        database.exec("COMMIT");
      } catch (error) { database.exec("ROLLBACK"); throw error; }
    });
  }

  updateMetadata(id: IntegrationProviderId, patch: Partial<StoredConnection>) {
    return this.access((database) => {
      const row = database.prepare("SELECT data FROM integration_connections WHERE id=?").get(id);
      if (!row) return;
      const current = JSON.parse(String(row.data)) as Omit<StoredConnection, "id">;
      database.prepare("UPDATE integration_connections SET data=? WHERE id=?").run(JSON.stringify({ ...current, ...patch }), id);
    });
  }
}
