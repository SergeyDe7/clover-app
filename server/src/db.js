import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import {
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
} from "./defaults.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const serverDirectory = path.resolve(currentDirectory, "..");
const dataDirectory = path.resolve(serverDirectory, "data");

mkdirSync(dataDirectory, { recursive: true });

const databasePath =
  process.env.DB_PATH ||
  path.resolve(dataDirectory, "clover.sqlite");

export const db = new DatabaseSync(databasePath, {
  enableForeignKeyConstraints: true,
});

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('client', 'manager')),
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS client_state (
    user_id TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL DEFAULT '{}',
    addresses_json TEXT NOT NULL DEFAULT '[]',
    favorites_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON orders(user_id);

  CREATE INDEX IF NOT EXISTS idx_users_role
  ON users(role);

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_email TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON audit_log(created_at DESC);
`);

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function now() {
  return new Date().toISOString();
}

export function getGlobalState(key, fallback) {
  const row = db
    .prepare("SELECT value_json FROM app_state WHERE key = ?")
    .get(key);

  return row ? parseJson(row.value_json, fallback) : fallback;
}

export function setGlobalState(key, value) {
  db.prepare(`
    INSERT INTO app_state(key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now());
}

export function ensureGlobalState() {
  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("products")) {
    setGlobalState("products", DEFAULT_PRODUCTS);
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("settings")) {
    setGlobalState("settings", DEFAULT_SETTINGS);
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("clientLinks")) {
    setGlobalState("clientLinks", {});
  }
}

export function findUserByEmail(email) {
  return db
    .prepare(`
      SELECT id, email, password_hash, role, created_at
      FROM users
      WHERE email = ?
    `)
    .get(email.toLowerCase());
}

export function findUserById(id) {
  return db
    .prepare(`
      SELECT id, email, role, created_at
      FROM users
      WHERE id = ?
    `)
    .get(id);
}

export function createUser({
  email,
  passwordHash,
  role = "client",
  profile = {},
}) {
  const id = randomUUID();
  const createdAt = now();

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare(`
      INSERT INTO users(id, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      email.toLowerCase(),
      passwordHash,
      role,
      createdAt
    );

    if (role === "client") {
      db.prepare(`
        INSERT INTO client_state(
          user_id,
          profile_json,
          addresses_json,
          favorites_json,
          updated_at
        )
        VALUES (?, ?, '[]', '[]', ?)
      `).run(id, JSON.stringify(profile), createdAt);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    id,
    email: email.toLowerCase(),
    role,
    createdAt,
  };
}

export function ensureClientState(userId) {
  const exists = db
    .prepare("SELECT 1 FROM client_state WHERE user_id = ?")
    .get(userId);

  if (!exists) {
    db.prepare(`
      INSERT INTO client_state(
        user_id,
        profile_json,
        addresses_json,
        favorites_json,
        updated_at
      )
      VALUES (?, '{}', '[]', '[]', ?)
    `).run(userId, now());
  }
}

export function getClientState(userId) {
  ensureClientState(userId);

  const row = db.prepare(`
    SELECT profile_json, addresses_json, favorites_json
    FROM client_state
    WHERE user_id = ?
  `).get(userId);

  return {
    profile: parseJson(row?.profile_json, {}),
    addresses: parseJson(row?.addresses_json, []),
    favorites: parseJson(row?.favorites_json, []),
  };
}

export function setClientStateField(userId, field, value) {
  const allowedColumns = {
    profile: "profile_json",
    addresses: "addresses_json",
    favorites: "favorites_json",
  };

  const column = allowedColumns[field];

  if (!column) {
    throw new Error("Неизвестное поле клиента.");
  }

  ensureClientState(userId);

  db.prepare(`
    UPDATE client_state
    SET ${column} = ?, updated_at = ?
    WHERE user_id = ?
  `).run(JSON.stringify(value), now(), userId);
}

export function listOrders(userId = null) {
  const rows = userId
    ? db.prepare(`
        SELECT payload_json
        FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(userId)
    : db.prepare(`
        SELECT payload_json
        FROM orders
        ORDER BY created_at DESC
      `).all();

  return rows.map((row) => parseJson(row.payload_json, {}));
}

function resolveOrderUserId(order, fallbackUserId) {
  if (fallbackUserId) {
    return fallbackUserId;
  }

  if (order.clientId && findUserById(order.clientId)) {
    return order.clientId;
  }

  if (order.customerEmail) {
    const user = findUserByEmail(order.customerEmail);
    if (user?.role === "client") {
      return user.id;
    }
  }

  return null;
}

export function replaceOrders({
  orders,
  userId = null,
  managerMode = false,
}) {
  const normalizedOrders = Array.isArray(orders) ? orders : [];

  db.exec("BEGIN IMMEDIATE");

  try {
    if (managerMode) {
      db.exec("DELETE FROM orders");
    } else {
      db.prepare("DELETE FROM orders WHERE user_id = ?").run(userId);
    }

    const insert = db.prepare(`
      INSERT INTO orders(
        id,
        user_id,
        payload_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const order of normalizedOrders) {
      const ownerId = resolveOrderUserId(
        order,
        managerMode ? null : userId
      );

      if (!ownerId || !order?.id) {
        continue;
      }

      const payload = {
        ...order,
        clientId: ownerId,
      };

      insert.run(
        String(payload.id),
        ownerId,
        JSON.stringify(payload),
        payload.createdAt || now(),
        payload.updatedAt || payload.createdAt || now()
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listClients() {
  const rows = db.prepare(`
    SELECT
      users.id,
      users.email,
      users.created_at,
      client_state.profile_json,
      client_state.addresses_json
    FROM users
    LEFT JOIN client_state
      ON client_state.user_id = users.id
    WHERE users.role = 'client'
    ORDER BY users.created_at DESC
  `).all();

  return rows.map((row) => {
    const profile = parseJson(row.profile_json, {});
    const addresses = parseJson(row.addresses_json, []);

    return {
      id: row.id,
      email: profile.email || row.email,
      companyName: profile.companyName || "",
      contactName: profile.contactName || "",
      phone: profile.phone || "",
      addresses,
      createdAt: row.created_at,
    };
  });
}

export function seedManager() {
  const email = (
    process.env.MANAGER_EMAIL || "manager@clover.local"
  ).toLowerCase();

  const existing = findUserByEmail(email);

  if (existing) {
    return;
  }

  const password =
    process.env.MANAGER_PASSWORD || "Clover123!";

  const passwordHash = bcrypt.hashSync(password, 12);

  createUser({
    email,
    passwordHash,
    role: "manager",
  });

  console.log(
    `Создан тестовый менеджер: ${email} / ${password}`
  );
}

export function resetServerData() {
  db.exec("BEGIN IMMEDIATE");

  try {
    db.exec("DELETE FROM orders");
    db.exec(`
      DELETE FROM client_state
      WHERE user_id IN (
        SELECT id FROM users WHERE role = 'client'
      )
    `);
    db.exec("DELETE FROM users WHERE role = 'client'");
    db.exec("DELETE FROM app_state");

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  ensureGlobalState();
}


export function writeAudit({
  userId = null,
  userEmail = "",
  userRole = "",
  action,
  details = {},
}) {
  db.prepare(`
    INSERT INTO audit_log(
      id,
      user_id,
      user_email,
      user_role,
      action,
      details_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId,
    userEmail,
    userRole,
    String(action || "unknown"),
    JSON.stringify(details || {}),
    now()
  );
}

export function listAudit(limit = 200) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  const rows = db.prepare(`
    SELECT id, user_id, user_email, user_role, action, details_json, created_at
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT ?
  `).all(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email || "",
    userRole: row.user_role || "",
    action: row.action,
    details: parseJson(row.details_json, {}),
    createdAt: row.created_at,
  }));
}

export function exportDatabaseSnapshot() {
  return {
    version: 2,
    exportedAt: now(),
    users: db.prepare(`
      SELECT id, email, password_hash, role, created_at
      FROM users
      ORDER BY created_at
    `).all(),
    clientState: db.prepare(`
      SELECT user_id, profile_json, addresses_json, favorites_json, updated_at
      FROM client_state
      ORDER BY user_id
    `).all(),
    appState: db.prepare(`
      SELECT key, value_json, updated_at
      FROM app_state
      ORDER BY key
    `).all(),
    orders: db.prepare(`
      SELECT id, user_id, payload_json, created_at, updated_at
      FROM orders
      ORDER BY created_at
    `).all(),
    auditLog: db.prepare(`
      SELECT id, user_id, user_email, user_role, action, details_json, created_at
      FROM audit_log
      ORDER BY created_at
    `).all(),
  };
}

function assertSnapshotArray(snapshot, key) {
  if (!Array.isArray(snapshot?.[key])) {
    throw new Error(`В резервной копии отсутствует раздел ${key}.`);
  }
}

export function importDatabaseSnapshot(snapshot) {
  for (const key of ["users", "clientState", "appState", "orders"]) {
    assertSnapshotArray(snapshot, key);
  }

  db.exec("BEGIN IMMEDIATE");

  try {
    db.exec("DELETE FROM orders");
    db.exec("DELETE FROM client_state");
    db.exec("DELETE FROM users");
    db.exec("DELETE FROM app_state");
    db.exec("DELETE FROM audit_log");

    const insertUser = db.prepare(`
      INSERT INTO users(id, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of snapshot.users) {
      insertUser.run(
        String(row.id),
        String(row.email).toLowerCase(),
        String(row.password_hash),
        String(row.role),
        String(row.created_at)
      );
    }

    const insertClientState = db.prepare(`
      INSERT INTO client_state(
        user_id,
        profile_json,
        addresses_json,
        favorites_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of snapshot.clientState) {
      insertClientState.run(
        String(row.user_id),
        String(row.profile_json || "{}"),
        String(row.addresses_json || "[]"),
        String(row.favorites_json || "[]"),
        String(row.updated_at || now())
      );
    }

    const insertAppState = db.prepare(`
      INSERT INTO app_state(key, value_json, updated_at)
      VALUES (?, ?, ?)
    `);
    for (const row of snapshot.appState) {
      insertAppState.run(
        String(row.key),
        String(row.value_json || "{}"),
        String(row.updated_at || now())
      );
    }

    const insertOrder = db.prepare(`
      INSERT INTO orders(id, user_id, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of snapshot.orders) {
      insertOrder.run(
        String(row.id),
        String(row.user_id),
        String(row.payload_json || "{}"),
        String(row.created_at || now()),
        String(row.updated_at || row.created_at || now())
      );
    }

    const insertAudit = db.prepare(`
      INSERT INTO audit_log(
        id,
        user_id,
        user_email,
        user_role,
        action,
        details_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of Array.isArray(snapshot.auditLog) ? snapshot.auditLog : []) {
      insertAudit.run(
        String(row.id || randomUUID()),
        row.user_id ? String(row.user_id) : null,
        String(row.user_email || ""),
        String(row.user_role || ""),
        String(row.action || "restored"),
        String(row.details_json || "{}"),
        String(row.created_at || now())
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  ensureGlobalState();
  seedManager();
}

ensureGlobalState();
seedManager();
