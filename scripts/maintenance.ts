// Compatibility entry for the server and existing TypeScript consumers.
// The implementation imports only node:* modules; SQLite runs in its own process.
export {
  acquireDatabaseLock,
  assertServerStopped,
  backupBeforeUpdate,
} from "./maintenance.mjs";
