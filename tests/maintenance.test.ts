import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import Database from "better-sqlite3";
import {
  acquireDatabaseLock,
  assertServerStopped,
  backupBeforeUpdate,
} from "../scripts/maintenance.ts";
import { openDB, hash } from "../server/db.ts";

const root = resolve(".");
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "THORDY tests",
      GIT_AUTHOR_EMAIL: "tests@localhost",
      GIT_COMMITTER_NAME: "THORDY tests",
      GIT_COMMITTER_EMAIL: "tests@localhost",
    },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "thordy-update-"));
  return {
    dir,
    close() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
function legacy(path: string) {
  const db = new Database(path);
  db.exec(
    readFileSync(join(root, "server/migrations/001_initial.sql"), "utf8"),
  );
  db.pragma("journal_mode=WAL");
  db.prepare(
    "INSERT INTO users(id,username,password,role) VALUES(1,'legacy',?,'admin')",
  ).run(hash("legacy-test-only"));
  db.prepare(
    "INSERT INTO products(id,name,price) VALUES(1,'Producto existente',18000)",
  ).run();
  db.prepare(
    "INSERT INTO orders(request_key,customer,channel,payment,subtotal,discount,delivery,total,created_at,user_id) VALUES('original','Cliente existente','WhatsApp','Efectivo',18000,0,0,18000,'2026-10-25T18:00:00Z',1)",
  ).run();
  db.prepare(
    "INSERT INTO order_items(order_id,product_id,name,quantity,price) VALUES(1,1,'Producto existente',1,18000)",
  ).run();
  db.prepare(
    "INSERT INTO order_status_history(order_id,status,at,user_id) VALUES(1,'received','2026-10-25T18:00:00Z',1)",
  ).run();
  db.prepare(
    "UPDATE app_settings SET value='local-config' WHERE key='operation'",
  ).run();
  return db;
}

test("bloqueo compartido: servidor y actualizador son mutuamente excluyentes", () => {
  const f = scratch();
  try {
    const path = join(f.dir, "db.sqlite");
    const release = acquireDatabaseLock(path, "server");
    assert.throws(() => acquireDatabaseLock(path, "update"), /bloqueo/);
    release();
    const second = acquireDatabaseLock(path, "update");
    assert.throws(() => acquireDatabaseLock(path, "server"), /bloqueo/);
    second();
    assert.equal(existsSync(path + ".server-lock"), false);
  } finally {
    f.close();
  }
});
test("actualización rechaza servidor vivo aunque sea anterior al bloqueo", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      () => assertServerStopped((server.address() as { port: number }).port),
      /ocupado/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("respaldo pre-migración incluye WAL y conserva v1 y configuración", async () => {
  const f = scratch();
  const path = join(f.dir, "db.sqlite");
  const db = legacy(path);
  try {
    const snapshot = await backupBeforeUpdate(path);
    assert.ok(snapshot);
    const copy = new Database(snapshot!, { readonly: true });
    assert.equal(
      (copy.prepare("SELECT count(*) n FROM orders").get() as { n: number }).n,
      1,
    );
    assert.equal(
      (
        copy.prepare("SELECT max(version) v FROM migrations").get() as {
          v: number;
        }
      ).v,
      1,
    );
    copy.close();
    db.close();
    const migrated = openDB(path);
    assert.equal(
      (
        migrated.prepare("SELECT max(version) v FROM migrations").get() as {
          v: number;
        }
      ).v,
      2,
    );
    assert.equal(
      (
        migrated.prepare("SELECT value FROM app_settings").get() as {
          value: string;
        }
      ).value,
      "local-config",
    );
    assert.equal(
      (
        migrated.prepare("SELECT customer FROM orders").get() as {
          customer: string;
        }
      ).customer,
      "Cliente existente",
    );
    assert.deepEqual(migrated.pragma("foreign_key_check"), []);
    migrated.close();
    const again = openDB(path);
    assert.equal(
      (
        again.prepare("SELECT count(*) n FROM order_items").get() as {
          n: number;
        }
      ).n,
      1,
    );
    again.close();
  } finally {
    if (db.open) db.close();
    f.close();
  }
});
for (const failBuild of [false, true])
  test(`actualizador real con Git local: ${failBuild ? "fallo de build conserva datos y respaldo" : "fast-forward, respaldo y migración preservan datos"}`, async () => {
    const f = scratch();
    try {
      const origin = join(f.dir, "origin.git"),
        source = join(f.dir, "source"),
        checkout = join(f.dir, "checkout");
      mkdirSync(source);
      git(f.dir, "init", "--bare", "--initial-branch=master", origin);
      git(source, "init", "-b", "master");
      git(source, "remote", "add", "origin", origin);
      writeFileSync(join(source, ".gitignore"), "data/\n.env\n");
      writeFileSync(
        join(source, "package.json"),
        JSON.stringify({
          name: "thordy-update-test",
          version: "1.0.0",
          scripts: {
            build: 'node -e "process.exit(0)"',
            init: `node --import "${join(root, "node_modules/tsx/dist/loader.mjs")}" "${join(root, "server/init.ts")}"`,
          },
        }),
      );
      writeFileSync(
        join(source, "package-lock.json"),
        JSON.stringify({
          name: "thordy-update-test",
          version: "1.0.0",
          lockfileVersion: 3,
          requires: true,
          packages: { "": { name: "thordy-update-test", version: "1.0.0" } },
        }),
      );
      git(source, "add", ".");
      git(source, "commit", "-m", "old");
      git(source, "push", "-u", "origin", "master");
      git(f.dir, "clone", origin, checkout);
      mkdirSync(join(checkout, "data"));
      const path = join(checkout, "data", "db.sqlite");
      legacy(path).close();
      writeFileSync(join(checkout, ".env"), "LOCAL_CONFIGURATION=preserved\n");
      const pkg = JSON.parse(
        readFileSync(join(source, "package.json"), "utf8"),
      );
      if (failBuild) pkg.scripts.build = 'node -e "process.exit(1)"';
      writeFileSync(join(source, "package.json"), JSON.stringify(pkg));
      writeFileSync(join(source, "release.txt"), "version-new");
      git(source, "add", ".");
      git(source, "commit", "-m", "new");
      git(source, "push");
      const port = await freePort();
      const r = spawnSync(
        process.execPath,
        [join(root, "scripts/update.mjs")],
        {
          cwd: checkout,
          encoding: "utf8",
          env: {
            ...process.env,
            DB_PATH: path,
            PORT: String(port),
            HOST: "127.0.0.1",
            npm_config_cache: join(f.dir, "npm-cache"),
          },
        },
      );
      assert.equal(r.status, failBuild ? 1 : 0, r.stderr + "\n" + r.stdout);
      assert.equal(
        readFileSync(join(checkout, ".env"), "utf8"),
        "LOCAL_CONFIGURATION=preserved\n",
      );
      assert.equal(
        git(checkout, "rev-parse", "HEAD"),
        git(source, "rev-parse", "HEAD"),
      );
      const db = new Database(path, { readonly: true });
      assert.equal(
        (
          db.prepare("SELECT customer FROM orders").get() as {
            customer: string;
          }
        ).customer,
        "Cliente existente",
      );
      assert.equal(
        (
          db.prepare("SELECT max(version) v FROM migrations").get() as {
            v: number;
          }
        ).v,
        failBuild ? 1 : 2,
      );
      db.close();
      const snapshots = readdirSync(join(checkout, "data", "update-backups"));
      assert.equal(snapshots.length, 1);
      const copy = new Database(
        join(checkout, "data", "update-backups", snapshots[0]),
        { readonly: true },
      );
      assert.equal(copy.pragma("integrity_check", { simple: true }), "ok");
      assert.equal(
        (
          copy.prepare("SELECT max(version) v FROM migrations").get() as {
            v: number;
          }
        ).v,
        1,
      );
      copy.close();
      assert.equal(existsSync(path + ".server-lock"), false);
    } finally {
      f.close();
    }
  });
