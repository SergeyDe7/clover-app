/**
 * Concurrent client/staff vault RMW — two writers, both entries must survive.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const require = createRequire(path.join(serverDir, "package.json"));
const { DatabaseSync } = require("node:sqlite");

const ENV_BASE = {
  JWT_SECRET: "clover-s2-vault-concurrency-secret-32!",
  MANAGER_EMAIL: "",
  MANAGER_PASSWORD: "",
  CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS: "",
  CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS: "",
};

function writeWorker(temp, kind, id, login) {
  const script = path.join(temp, `worker-${kind}-${id}.mjs`);
  writeFileSync(
    script,
    kind === "client"
      ? `import { upsertClientAccessEntry } from ${JSON.stringify(
          path.join(serverDir, "src/clientAccessVault.js")
        )};
function retry(fn, attempts = 12) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try { return fn(); } catch (error) {
      last = error;
      const msg = String(error?.message || error);
      if (!/locked|BUSY/i.test(msg)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 + i * 25);
    }
  }
  throw last;
}
retry(() => upsertClientAccessEntry(${JSON.stringify(id)}, {
  login: ${JSON.stringify(login)},
  companyName: ${JSON.stringify(`Co-${id}`)},
}, { email: "actor@test.local" }));
console.log("OK");
`
      : `import { upsertStaffAccessEntry } from ${JSON.stringify(
          path.join(serverDir, "src/staffAccessVault.js")
        )};
function retry(fn, attempts = 12) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try { return fn(); } catch (error) {
      last = error;
      const msg = String(error?.message || error);
      if (!/locked|BUSY/i.test(msg)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 + i * 25);
    }
  }
  throw last;
}
retry(() => upsertStaffAccessEntry(${JSON.stringify(id)}, {
  login: ${JSON.stringify(login)},
  role: "manager",
}, { email: "actor@test.local" }));
console.log("OK");
`
  );
  return script;
}

function runParallel(scripts, databasePath) {
  return Promise.all(
    scripts.map(
      (script) =>
        new Promise((resolve) => {
          const child = spawn(process.execPath, [script], {
            cwd: serverDir,
            env: { ...process.env, ...ENV_BASE, DB_PATH: databasePath },
          });
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (d) => {
            stdout += d;
          });
          child.stderr.on("data", (d) => {
            stderr += d;
          });
          child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr, script }));
        })
    )
  );
}

async function main() {
  const temp = mkdtempSync(path.join(OPT_TMP, "s2-vault-concurrency-"));
  const databasePath = path.join(temp, "clover.sqlite");

  const init = path.join(temp, "init.mjs");
  writeFileSync(
    init,
    `import ${JSON.stringify(path.join(serverDir, "src/db.js"))};
console.log("INIT");
`
  );
  const initRun = spawnSync(process.execPath, [init], {
    cwd: serverDir,
    encoding: "utf8",
    env: { ...process.env, ...ENV_BASE, DB_PATH: databasePath },
  });
  assert.equal(initRun.status, 0, initRun.stderr || initRun.stdout);

  const clientScripts = [
    writeWorker(temp, "client", "client-a", "a@test.local"),
    writeWorker(temp, "client", "client-b", "b@test.local"),
  ];
  // Sequential warm-up so schema/import settles before parallel RMW
  for (const script of clientScripts) {
    const warm = spawnSync(process.execPath, [script], {
      cwd: serverDir,
      encoding: "utf8",
      env: { ...process.env, ...ENV_BASE, DB_PATH: databasePath },
    });
    assert.equal(warm.status, 0, warm.stderr || warm.stdout);
  }
  for (let round = 0; round < 8; round += 1) {
    const results = await runParallel(clientScripts, databasePath);
    for (const r of results) {
      assert.equal(r.code, 0, `${r.script}: ${r.stderr || r.stdout}`);
    }
  }

  const staffScripts = [
    writeWorker(temp, "staff", "staff-a", "sa@test.local"),
    writeWorker(temp, "staff", "staff-b", "sb@test.local"),
  ];
  for (const script of staffScripts) {
    const warm = spawnSync(process.execPath, [script], {
      cwd: serverDir,
      encoding: "utf8",
      env: { ...process.env, ...ENV_BASE, DB_PATH: databasePath },
    });
    assert.equal(warm.status, 0, warm.stderr || warm.stdout);
  }
  for (let round = 0; round < 8; round += 1) {
    const results = await runParallel(staffScripts, databasePath);
    for (const r of results) {
      assert.equal(r.code, 0, `${r.script}: ${r.stderr || r.stdout}`);
    }
  }

  const db = new DatabaseSync(databasePath);
  const clientVault = JSON.parse(
    db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("clientAccessVault")
      ?.value_json || "{}"
  );
  const staffVault = JSON.parse(
    db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("staffAccessVault")
      ?.value_json || "{}"
  );
  assert.equal(clientVault["client-a"]?.login, "a@test.local");
  assert.equal(clientVault["client-b"]?.login, "b@test.local");
  assert.equal(staffVault["staff-a"]?.login, "sa@test.local");
  assert.equal(staffVault["staff-b"]?.login, "sb@test.local");
  assert.equal(Boolean(clientVault["client-a"]?.password), false);
  assert.equal(Boolean(staffVault["staff-a"]?.password), false);
  db.close();

  const boom = path.join(temp, "boom.mjs");
  writeFileSync(
    boom,
    `import { mutateClientAccessVault } from ${JSON.stringify(
      path.join(serverDir, "src/clientAccessVault.js")
    )};
try {
  mutateClientAccessVault((vault) => {
    vault["boom-id"] = { login: "boom@test.local", companyName: "Boom" };
    throw new Error("inject-fail");
  });
  console.log("NO_CATCH");
  process.exit(2);
} catch {
  console.log("CAUGHT");
}
`
  );
  const boomRun = spawnSync(process.execPath, [boom], {
    cwd: serverDir,
    encoding: "utf8",
    env: { ...process.env, ...ENV_BASE, DB_PATH: databasePath },
  });
  assert.equal(boomRun.status, 0, boomRun.stderr || boomRun.stdout);
  assert.match(boomRun.stdout, /CAUGHT/);

  const db2 = new DatabaseSync(databasePath);
  const afterBoom = JSON.parse(
    db2.prepare("SELECT value_json FROM app_state WHERE key = ?").get("clientAccessVault")
      ?.value_json || "{}"
  );
  assert.equal(afterBoom["boom-id"], undefined, "rollback must drop boom-id");
  assert.equal(afterBoom["client-a"]?.login, "a@test.local");
  assert.equal(afterBoom["client-b"]?.login, "b@test.local");
  db2.close();

  // Runtime RMW must NOT coerce corrupt vault JSON to {}
  for (const [kind, key, workerName] of [
    ["client", "clientAccessVault", "corrupt-client-rmw.mjs"],
    ["staff", "staffAccessVault", "corrupt-staff-rmw.mjs"],
  ]) {
    const rawCorrupt = `{not-valid-json-KEEP-${kind}`;
    const db3 = new DatabaseSync(databasePath);
    db3
      .prepare(
        `INSERT INTO app_state (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(key, rawCorrupt, new Date().toISOString());
    db3.close();

    const script = path.join(temp, workerName);
    writeFileSync(
      script,
      kind === "client"
        ? `import { upsertClientAccessEntry } from ${JSON.stringify(
            path.join(serverDir, "src/clientAccessVault.js")
          )};
try {
  upsertClientAccessEntry("u-new", { login: "new@test.local", companyName: "N" }, { email: "a@t.l" });
  console.log(JSON.stringify({ threw: false }));
} catch (error) {
  console.log(JSON.stringify({ threw: true, code: error?.code || "" }));
}
`
        : `import { upsertStaffAccessEntry } from ${JSON.stringify(
            path.join(serverDir, "src/staffAccessVault.js")
          )};
try {
  upsertStaffAccessEntry("u-new", { login: "new@test.local", role: "manager" }, { email: "a@t.l" });
  console.log(JSON.stringify({ threw: false }));
} catch (error) {
  console.log(JSON.stringify({ threw: true, code: error?.code || "" }));
}
`
    );
    const run = spawnSync(process.execPath, [script], {
      cwd: serverDir,
      encoding: "utf8",
      env: { ...process.env, ...ENV_BASE, DB_PATH: databasePath },
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const payload = JSON.parse(String(run.stdout).trim().split("\n").pop());
    assert.equal(payload.threw, true, `${kind} corrupt rmw must throw`);
    assert.equal(payload.code, "VAULT_JSON_INVALID");
    const db4 = new DatabaseSync(databasePath);
    const preserved = db4.prepare("SELECT value_json FROM app_state WHERE key = ?").get(key)
      ?.value_json;
    assert.equal(preserved, rawCorrupt, `${kind} corrupt raw preserved after failed rmw`);
    db4.close();
    console.log(`PASS vault.corrupt-rmw.${kind}`, JSON.stringify(payload));
  }

  console.log(
    "PASS vault.concurrency",
    JSON.stringify({
      clientKeys: Object.keys(clientVault).sort(),
      staffKeys: Object.keys(staffVault).sort(),
      rollbackOk: true,
    })
  );
  rmSync(temp, { recursive: true, force: true });
  console.log("verify-s2-new-002-vault-concurrency: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
