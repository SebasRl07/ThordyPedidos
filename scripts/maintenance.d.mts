export function acquireDatabaseLock(
  dbPath: string,
  purpose: "server" | "update",
): () => void;
export function assertServerStopped(port: number, host?: string): Promise<void>;
export function backupBeforeUpdate(dbPath: string): Promise<string | null>;
