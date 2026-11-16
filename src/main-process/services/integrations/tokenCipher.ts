export interface TokenCipher {
  available(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export function createSafeStorageCipher(safeStorage: {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?: () => string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}): TokenCipher {
  return {
    available() {
      return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text";
    },
    encrypt(value) {
      if (!this.available()) throw new Error("INTEGRATION_SECURE_STORAGE");
      return safeStorage.encryptString(value).toString("base64");
    },
    decrypt(value) {
      if (!this.available()) throw new Error("INTEGRATION_SECURE_STORAGE");
      try { return safeStorage.decryptString(Buffer.from(value, "base64")); }
      catch { throw new Error("INTEGRATION_SECURE_STORAGE"); }
    },
  };
}
