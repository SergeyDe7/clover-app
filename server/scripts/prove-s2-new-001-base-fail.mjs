/**
 * Deterministic proof that unprotected replaceOrders({managerMode:false})
 * with a partial body drops accepted orders when the tree lacks S2-NEW-001.
 *
 * Usage: node server/scripts/prove-s2-new-001-base-fail.mjs [repoRoot]
 * Exit 1 = vulnerability present (expected on clean origin/main).
 * Exit 0 = o-acc survived (expected after S2-NEW-001 db preserve).
 * Isolated temp SQLite. No production DB.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const temp = mkdtempSync(path.join(tmpdir(), "clover-s2-001-basefail-"));
const databasePath = path.join(temp, "clover.sqlite");
const jwtSecret = "clover-s2-001-base-fail-secret-32chars!!";

const seedPath = path.join(temp, "seed.mjs");
writeFileSync(
  seedPath,
  `
process.env.DB_PATH = ${JSON.stringify(databasePath)};
process.env.JWT_SECRET = ${JSON.stringify(jwtSecret)};
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
const { createUser, replaceOrders, listOrders } = await import(${JSON.stringify(
    pathToFileURL(path.join(serverDir, "src/db.js")).href
  )});
const { createRequire } = await import("node:module");
const require = createRequire(${JSON.stringify(path.join(serverDir, "package.json"))});
const bcrypt = require("bcryptjs");
const passwordHash = bcrypt.hashSync("BaseFailPass!1", 4);
const client = createUser({
  email: "basefail@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
});
const nowIso = "2026-09-16T12:00:00.000Z";
const orderNew = {
  id: "o-new",
  number: "N-1",
  clientId: client.id,
  status: "Новый",
  exchange: { status: "not_sent" },
  items: [{ id: "l1", productId: "p1", quantity: 1, unit: "piece", unitPrice: 10, lineTotal: 10 }],
  customItems: [],
  createdAt: nowIso,
  updatedAt: nowIso,
};
const orderAcc = {
  id: "o-acc",
  number: "A-1",
  clientId: client.id,
  status: "Принят",
  exchange: { status: "not_sent", documentId: "1C-KEEP" },
  oneCDocumentId: "1C-KEEP",
  items: [{ id: "l2", productId: "p1", quantity: 2, unit: "piece", unitPrice: 10, lineTotal: 20 }],
  customItems: [],
  createdAt: nowIso,
  updatedAt: nowIso,
};
replaceOrders({ orders: [orderNew, orderAcc], userId: client.id, managerMode: false });
replaceOrders({ orders: [orderNew], userId: client.id, managerMode: false });
const after = listOrders(client.id, { includeDeleted: true });
const ids = after.map((o) => o.id).sort();
console.log("AFTER_IDS", JSON.stringify(ids));
console.log("HAS_O_ACC", Boolean(after.find((o) => o.id === "o-acc")));
console.log("CLIENT_ID", client.id);
`
);

const run = spawnSync(process.execPath, [seedPath], {
  cwd: serverDir,
  encoding: "utf8",
  env: {
    ...process.env,
    DB_PATH: databasePath,
    JWT_SECRET: jwtSecret,
    MANAGER_EMAIL: "",
    MANAGER_PASSWORD: "",
  },
});
process.stdout.write(run.stdout || "");
if (run.status !== 0) {
  process.stderr.write(run.stderr || "");
  process.exit(2);
}
const hasAcc = /HAS_O_ACC true/.test(run.stdout || "");
if (!hasAcc) {
  console.log(
    "BASE_VULNERABILITY_CONFIRMED: o-acc deleted by omit via replaceOrders({managerMode:false})"
  );
  process.exit(1);
}
console.log("PROTECTED_PRESERVED: o-acc survived omit via replaceOrders");
process.exit(0);
