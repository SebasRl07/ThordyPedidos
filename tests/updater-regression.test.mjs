// Runs directly on Node: verifies bootstrap without requiring tsx or dotenv.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  existsSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
const root = fileURLToPath(new URL("..", import.meta.url));
function command(cwd, program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    result.error?.message || result.stderr + "\n" + result.stdout,
  );
  return result.stdout.trim();
}
function git(cwd, ...args) {
  return command(cwd, "git", args, {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "THORDY tests",
      GIT_AUTHOR_EMAIL: "tests@localhost",
      GIT_COMMITTER_NAME: "THORDY tests",
      GIT_COMMITTER_EMAIL: "tests@localhost",
    },
  });
}
function copyAddon(target) {
  for (const name of [
    "better-sqlite3",
    "bindings",
    "file-uri-to-path",
    "dotenv",
  ])
    cpSync(
      join(root, "node_modules", name),
      join(target, "node_modules", name),
      { recursive: true },
    );
  return join(
    target,
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  );
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function seed(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "PRAGMA journal_mode=WAL;PRAGMA user_version=42;CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password TEXT);CREATE TABLE orders(id INTEGER PRIMARY KEY,customer TEXT,total INTEGER);CREATE TABLE app_settings(key TEXT,value TEXT);INSERT INTO users VALUES(1,'existente','hash-solo-de-prueba');INSERT INTO orders VALUES(1,'Pedido existente',18000);INSERT INTO app_settings VALUES('local','se conserva');",
    );
  } finally {
    db.close();
  }
}
function verify(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 42);
    assert.equal(
      db.prepare("SELECT password FROM users").get().password,
      "hash-solo-de-prueba",
    );
    assert.equal(db.prepare("SELECT total FROM orders").get().total, 18000);
    assert.equal(
      db.prepare("SELECT value FROM app_settings").get().value,
      "se conserva",
    );
  } finally {
    db.close();
  }
}

for (const incomplete of [false, true])
  test(
    `actualizador ${process.platform}: npm ci ${incomplete ? "recupera node_modules incompleto sin dotenv" : "reemplaza better_sqlite3.node después del respaldo"}`,
    { timeout: 120000 },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "thordy update á & "));
      try {
        const origin = join(dir, "origin.git"),
          source = join(dir, "source"),
          checkout = join(dir, "checkout");
        mkdirSync(source);
        git(dir, "init", "--bare", "--initial-branch=master", origin);
        git(source, "init", "-b", "master");
        git(source, "remote", "add", "origin", origin);
        mkdirSync(join(source, "scripts"));
        for (const file of [
          "update.cmd",
          "update.mjs",
          "maintenance.mjs",
          "backup-before-update.mjs",
        ])
          cpSync(join(root, "scripts", file), join(source, "scripts", file));
        writeFileSync(
          join(source, ".gitignore"),
          "node_modules/\ndata/\n.env\ndist/\n",
        );
        writeFileSync(
          join(source, "package.json"),
          JSON.stringify({
            name: "thordy-native-lock-regression",
            version: "1.0.0",
            private: true,
            scripts: {
              build: "node check-install.mjs",
              init: "node check-data.mjs",
            },
          }),
        );
        writeFileSync(
          join(source, "package-lock.json"),
          JSON.stringify({
            name: "thordy-native-lock-regression",
            version: "1.0.0",
            lockfileVersion: 3,
            requires: true,
            packages: {
              "": { name: "thordy-native-lock-regression", version: "1.0.0" },
            },
          }),
        );
        writeFileSync(
          join(source, "check-install.mjs"),
          "import {existsSync,mkdirSync,writeFileSync} from 'node:fs';if(existsSync('node_modules/better-sqlite3/build/Release/better_sqlite3.node'))throw Error('npm ci no retiró el addon anterior');mkdirSync('dist',{recursive:true});writeFileSync('dist/built','ok');",
        );
        writeFileSync(
          join(source, "check-data.mjs"),
          "import {existsSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';if(!existsSync('dist/built'))throw Error('Se intentó migrar antes de compilar');const db=new DatabaseSync(process.env.DB_PATH,{readOnly:true});try{if(db.prepare('SELECT total FROM orders').get().total!==18000)throw Error('Datos alterados');}finally{db.close();}",
        );
        git(source, "add", ".");
        git(source, "commit", "-m", "initial");
        git(source, "push", "-u", "origin", "master");
        git(dir, "clone", origin, checkout);
        const database = join(checkout, "data", "pedidos existentes.sqlite");
        mkdirSync(join(checkout, "data"));
        seed(database);
        const port = await freePort();
        const dotenv = `DB_PATH="data/pedidos existentes.sqlite"\r\nHOST=127.0.0.1\r\nPORT=${port}\r\nLOCAL_SETTING="conservar # literalmente"\r\n`;
        writeFileSync(join(checkout, ".env"), dotenv);
        const addon = copyAddon(checkout);
        assert.ok(existsSync(addon));
        if (incomplete) {
          rmSync(join(checkout, "node_modules/dotenv"), {
            recursive: true,
            force: true,
          });
          rmSync(join(checkout, "node_modules/better-sqlite3/lib"), {
            recursive: true,
            force: true,
          });
        }
        writeFileSync(join(source, "release.txt"), "new code");
        git(source, "add", ".");
        git(source, "commit", "-m", "update");
        git(source, "push");
        const env = {
          ...process.env,
          npm_config_cache: join(dir, "npm-cache"),
        };
        delete env.DB_PATH;
        delete env.PORT;
        delete env.HOST;
        const result =
          process.platform === "win32"
            ? spawnSync(
                process.env.ComSpec || "cmd.exe",
                ["/d", "/s", "/c", "scripts\\update.cmd --no-pause"],
                { cwd: checkout, env, encoding: "utf8", timeout: 100000 },
              )
            : spawnSync(process.execPath, ["scripts/update.mjs"], {
                cwd: checkout,
                env,
                encoding: "utf8",
                timeout: 100000,
              });
        assert.equal(
          result.status,
          0,
          result.error?.message || result.stderr + "\n" + result.stdout,
        );
        assert.match(result.stdout, /Respaldo previo verificado/);
        assert.match(result.stdout, /Actualización completada/);
        assert.equal(existsSync(addon), false);
        assert.equal(existsSync(database + ".server-lock"), false);
        assert.equal(readFileSync(join(checkout, ".env"), "utf8"), dotenv);
        verify(database);
        const backups = readdirSync(
          join(checkout, "data/update-backups"),
        ).filter((name) => name.endsWith(".sqlite"));
        assert.equal(backups.length, 1);
        verify(join(checkout, "data/update-backups", backups[0]));
        assert.equal(
          git(checkout, "rev-parse", "HEAD"),
          git(source, "rev-parse", "HEAD"),
        );
        assert.ok(existsSync(join(checkout, "dist/built")));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

test(
  "Windows: cerrar Database no descarga el addon; salir del proceso sí libera el archivo",
  { skip: process.platform !== "win32" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "thordy-dll-proof-"));
    try {
      const addon = copyAddon(dir);
      const script =
        "const Database=require('better-sqlite3');const db=new Database(':memory:');db.close();try{require('node:fs').unlinkSync(process.argv[1]);console.log('unexpected-unlink');process.exitCode=1;}catch(e){if(e.code!=='EPERM'&&e.code!=='EBUSY')throw e;console.log('native-library-still-loaded');}";
      const result = spawnSync(process.execPath, ["-e", script, addon], {
        cwd: dir,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /native-library-still-loaded/);
      unlinkSync(addon);
      assert.equal(existsSync(addon), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("coordinador y bloqueo se importan sin cargar addons ni paquetes npm", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(new URL("../scripts/maintenance.mjs", import.meta.url).href)});const shared=process.report.getReport().sharedObjects||[];if(shared.some(p=>/better_sqlite3\\.node$/i.test(p)))throw Error('Addon cargado en el coordinador');console.log('coordinator-addon-free');`,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /coordinator-addon-free/);
});
