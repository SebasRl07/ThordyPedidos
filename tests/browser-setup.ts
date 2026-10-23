import { mkdirSync, rmSync } from "node:fs";
import { openDB, hash } from "../server/db.ts";
rmSync("data/browser-tests", { recursive: true, force: true });
mkdirSync("data/browser-tests", { recursive: true });
const db = openDB("data/browser-tests/test.sqlite");
db.prepare(
  "INSERT INTO users(username,password,role) VALUES('admin',?,'admin')",
).run(hash("browser-test-only-password"));
db.close();
