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

function tableColumns(tableName) {
  return new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name)
  );
}

function ensureColumn(tableName, columnName, definition) {
  if (!tableColumns(tableName).has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('client', 'manager', 'admin')),
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

  CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup
  ON auth_tokens(type, token_hash, expires_at);

  CREATE TABLE IF NOT EXISTS reconciliation_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    period_type TEXT NOT NULL,
    year INTEGER,
    date_from TEXT NOT NULL DEFAULT '',
    date_to TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    client_comment TEXT NOT NULL DEFAULT '',
    manager_comment TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_reconciliation_user
  ON reconciliation_requests(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT NOT NULL,
    order_events INTEGER NOT NULL DEFAULT 1,
    promotions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

  CREATE TABLE IF NOT EXISTS manager_notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    read_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_manager_notifications_created
  ON manager_notifications(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_manager_notifications_unread
  ON manager_notifications(read_at, created_at DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_manager_notifications_source
  ON manager_notifications(type, source_id)
  WHERE source_id <> '';

  CREATE TABLE IF NOT EXISTS passkey_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports_json TEXT NOT NULL DEFAULT '[]',
    device_type TEXT NOT NULL DEFAULT '',
    backed_up INTEGER NOT NULL DEFAULT 0,
    webauthn_user_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_passkey_user
  ON passkey_credentials(user_id);

  CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    challenge TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;
`);

ensureColumn("users", "email_verified", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("users", "approval_status", "TEXT NOT NULL DEFAULT 'approved'");
ensureColumn("users", "password_changed_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "last_login_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "disabled_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "permissions_json", "TEXT NOT NULL DEFAULT '{}'");

/** Discoverable Face ID: challenge может быть без user_id (пустая строка) — FK мешает. */
function relaxWebAuthnChallengeUserFk() {
  const fks = db.prepare(`PRAGMA foreign_key_list(webauthn_challenges)`).all();
  if (!fks.length) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE webauthn_challenges__nofk (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        challenge TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO webauthn_challenges__nofk (id, user_id, type, challenge, expires_at, created_at)
      SELECT id, user_id, type, challenge, expires_at, created_at FROM webauthn_challenges;
      DROP TABLE webauthn_challenges;
      ALTER TABLE webauthn_challenges__nofk RENAME TO webauthn_challenges;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

relaxWebAuthnChallengeUserFk();

/**
 * Миграция admin-role переименовывала users → users_old_admin_mig.
 * SQLite при RENAME обновляет FK дочерних таблиц на старое имя;
 * после DROP users_old_admin_mig DELETE/INSERT в orders падает:
 * "no such table: main.users_old_admin_mig".
 * Пересоздаём затронутые таблицы с FK на users.
 */
function repairStaleUsersForeignKeys() {
  const stale = db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table'
         AND sql LIKE '%users_old_admin_mig%'`
    )
    .all();
  if (!stale.length) return;

  const definitions = {
    client_state: `CREATE TABLE client_state (
      user_id TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL DEFAULT '{}',
      addresses_json TEXT NOT NULL DEFAULT '[]',
      favorites_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT`,
    orders: `CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT`,
    auth_tokens: `CREATE TABLE auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT`,
    reconciliation_requests: `CREATE TABLE reconciliation_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      period_type TEXT NOT NULL,
      year INTEGER,
      date_from TEXT NOT NULL DEFAULT '',
      date_to TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      client_comment TEXT NOT NULL DEFAULT '',
      manager_comment TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT`,
    push_subscriptions: `CREATE TABLE push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT NOT NULL,
      order_events INTEGER NOT NULL DEFAULT 1,
      promotions INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT`,
    passkey_credentials: `CREATE TABLE passkey_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports_json TEXT NOT NULL DEFAULT '[]',
      device_type TEXT NOT NULL DEFAULT '',
      backed_up INTEGER NOT NULL DEFAULT 0,
      webauthn_user_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) STRICT`,
    webauthn_challenges: `CREATE TABLE webauthn_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      challenge TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT`,
  };

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(type, token_hash, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_reconciliation_user ON reconciliation_requests(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey_credentials(user_id)",
  ];

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of stale) {
      const tableName = String(row.name || "");
      const createSql = definitions[tableName];
      if (!createSql) {
        throw new Error(
          `Неизвестная таблица со stale FK users_old_admin_mig: ${tableName}`
        );
      }
      const tempName = `${tableName}__fk_fix`;
      db.exec(createSql.replace(`CREATE TABLE ${tableName}`, `CREATE TABLE ${tempName}`));
      const cols = db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all()
        .map((c) => c.name);
      const colList = cols.join(", ");
      db.exec(
        `INSERT INTO ${tempName} (${colList}) SELECT ${colList} FROM ${tableName}`
      );
      db.exec(`DROP TABLE ${tableName}`);
      db.exec(`ALTER TABLE ${tempName} RENAME TO ${tableName}`);
    }
    for (const indexSql of indexes) {
      db.exec(indexSql);
    }
    db.exec("COMMIT");
    console.log(
      `Clover DB: восстановлены FK на users (${stale.map((r) => r.name).join(", ")})`
    );
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

repairStaleUsersForeignKeys();

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

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("clientManagerNotes")) {
    setGlobalState("clientManagerNotes", {});
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCProducts")) {
    setGlobalState("oneCProducts", []);
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCProductsMeta")) {
    setGlobalState("oneCProductsMeta", {});
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCProductCandidates")) {
    setGlobalState("oneCProductCandidates", {});
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCClients")) {
    setGlobalState("oneCClients", []);
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCClientsMeta")) {
    setGlobalState("oneCClientsMeta", {});
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCClientCandidates")) {
    setGlobalState("oneCClientCandidates", {});
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCPriceTypes")) {
    setGlobalState("oneCPriceTypes", []);
  }

  if (!db.prepare("SELECT 1 FROM app_state WHERE key = ?").get("oneCPriceTypesMeta")) {
    setGlobalState("oneCPriceTypesMeta", {});
  }
}

export function findUserByEmail(email) {
  return db
    .prepare(`
      SELECT id, email, password_hash, role, created_at, email_verified, approval_status,
             password_changed_at, last_login_at, disabled_at, permissions_json
      FROM users
      WHERE email = ?
    `)
    .get(email.toLowerCase());
}

export function findUserById(id) {
  return db
    .prepare(`
      SELECT id, email, role, created_at, email_verified, approval_status,
             password_changed_at, last_login_at, disabled_at, permissions_json
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
  emailVerified = false,
  approvalStatus = role === "manager" || role === "admin" ? "approved" : "pending",
}) {
  const id = randomUUID();
  const createdAt = now();

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare(`
      INSERT INTO users(
        id, email, password_hash, role, created_at,
        email_verified, approval_status, password_changed_at, last_login_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, '', '')
    `).run(
      id,
      email.toLowerCase(),
      passwordHash,
      role,
      createdAt,
      emailVerified ? 1 : 0,
      approvalStatus
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
    email_verified: emailVerified ? 1 : 0,
    approval_status: approvalStatus,
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

export function removeProductIdFromAllFavorites(productId) {
  const id = String(productId ?? "").trim();
  if (!id) return 0;
  const rows = db.prepare(`SELECT user_id, favorites_json FROM client_state`).all();
  let changed = 0;
  for (const row of rows) {
    const favs = parseJson(row.favorites_json, []);
    if (!Array.isArray(favs) || !favs.length) continue;
    const next = favs.filter((item) => String(item) !== id);
    if (next.length === favs.length) continue;
    setClientStateField(row.user_id, "favorites", next);
    changed += 1;
  }
  return changed;
}

export function listOrders(userId = null, options = {}) {
  const includeDeleted = options?.includeDeleted === true;
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

  const orders = rows.map((row) => parseJson(row.payload_json, {}));
  if (includeDeleted) return orders;
  return orders.filter((order) => !String(order?.deletedAt || "").trim());
}

export function listTrashedOrders(userId = null) {
  return listOrders(userId, { includeDeleted: true }).filter((order) =>
    Boolean(String(order?.deletedAt || "").trim())
  );
}

export function deleteOrderById(orderId) {
  const id = String(orderId || "").trim();
  if (!id) return { changed: 0 };
  const result = db.prepare(`DELETE FROM orders WHERE id = ?`).run(id);
  return { changed: Number(result.changes || 0) };
}

export function getOrderById(orderId) {
  const row = db.prepare(`
    SELECT id, user_id, payload_json, created_at, updated_at
    FROM orders
    WHERE id = ?
  `).get(String(orderId));

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateOrderPayload(orderId, payload) {
  const stored = getOrderById(orderId);

  if (!stored) {
    throw new Error("Заказ не найден.");
  }

  const updatedAt = payload?.updatedAt || now();
  const normalized = {
    ...stored.payload,
    ...(payload || {}),
    id: stored.id,
    clientId: stored.userId,
    updatedAt,
  };

  db.prepare(`
    UPDATE orders
    SET payload_json = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(normalized), updatedAt, stored.id);

  return normalized;
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

/** Добавить один заказ (витрина / внешние источники) без очистки остальных. */
export function insertOrder(order, userId = null) {
  if (!order?.id) {
    throw new Error("insertOrder: нужен order.id");
  }
  const ownerId = resolveOrderUserId(order, userId);
  if (!ownerId) {
    throw new Error("insertOrder: не удалось определить user_id");
  }
  const payload = {
    ...order,
    clientId: ownerId,
  };
  db.prepare(`
    INSERT INTO orders(
      id,
      user_id,
      payload_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(payload.id),
    ownerId,
    JSON.stringify(payload),
    payload.createdAt || now(),
    payload.updatedAt || payload.createdAt || now()
  );
  return payload;
}

export function listClients() {
  const managerNotes = getGlobalState("clientManagerNotes", {});
  const rows = db.prepare(`
    SELECT
      users.id,
      users.email,
      users.created_at,
      users.email_verified,
      users.approval_status,
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
    const rawContacts = Array.isArray(profile.contacts) ? profile.contacts : [];
    let contacts = rawContacts
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const name = String(item.name || "").trim();
        const phone = String(item.phone || "").trim();
        const label = String(item.label || "").trim();
        if (!name && !phone && !label) return null;
        return {
          id: String(item.id || `contact-${index + 1}`),
          name,
          label,
          phone,
          isPrimary: Boolean(item.isPrimary),
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    if (!contacts.length && (profile.contactName || profile.phone)) {
      contacts = [
        {
          id: "contact-primary",
          name: String(profile.contactName || "").trim(),
          label: "Основной",
          phone: String(profile.phone || "").trim(),
          isPrimary: true,
        },
      ];
    }

    let primaryIndex = contacts.findIndex((item) => item.isPrimary);
    if (primaryIndex < 0 && contacts.length) primaryIndex = 0;
    contacts = contacts.map((item, index) => {
      const isPrimary = contacts.length ? index === primaryIndex : false;
      const trimmed = String(item.label || "").trim();
      const label =
        !trimmed || trimmed === "Основной" || trimmed === "Дополнительный"
          ? isPrimary
            ? "Основной"
            : "Дополнительный"
          : trimmed;
      return { ...item, isPrimary, label };
    });

    const primary = contacts[primaryIndex] || null;

    return {
      id: row.id,
      email: profile.email || row.email,
      companyName: profile.companyName || "",
      contactName: primary?.name || profile.contactName || "",
      phone: primary?.phone || profile.phone || "",
      contacts,
      managerNote: String(managerNotes[row.id] || ""),
      addresses,
      createdAt: row.created_at,
      emailVerified: Boolean(row.email_verified),
      approvalStatus: row.approval_status || "approved",
    };
  });
}

export function updateClientByManager({
  clientId,
  profile = {},
  addresses = [],
  managerNote = "",
}) {
  const user = db.prepare(`
    SELECT id, email, role
    FROM users
    WHERE id = ?
  `).get(String(clientId));

  if (!user || user.role !== "client") {
    throw new Error("Клиент не найден.");
  }

  const currentState = getClientState(user.id);
  const email = String(profile.email || user.email)
    .trim()
    .toLowerCase();
  const nextProfile = {
    ...currentState.profile,
    ...profile,
    email,
  };
  const currentManagerNotes = getGlobalState("clientManagerNotes", {});
  const nextManagerNotes = {
    ...currentManagerNotes,
    [user.id]: String(managerNote || "").trim(),
  };
  const updatedAt = now();

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare(`
      UPDATE users
      SET email = ?
      WHERE id = ?
    `).run(email, user.id);

    ensureClientState(user.id);

    db.prepare(`
      UPDATE client_state
      SET profile_json = ?, addresses_json = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      JSON.stringify(nextProfile),
      JSON.stringify(addresses),
      updatedAt,
      user.id
    );

    setGlobalState("clientManagerNotes", nextManagerNotes);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return listClients().find(
    (client) => String(client.id) === String(user.id)
  ) || null;
}

export function markUserLogin(userId) {
  db.prepare(`
    UPDATE users SET last_login_at = ? WHERE id = ?
  `).run(now(), String(userId));
}

export function setUserEmailVerified(userId, verified = true) {
  db.prepare(`
    UPDATE users SET email_verified = ? WHERE id = ?
  `).run(verified ? 1 : 0, String(userId));
  return findUserById(String(userId));
}

export function setUserApprovalStatus(userId, status) {
  const normalized = ["pending", "approved", "rejected"].includes(status)
    ? status
    : "pending";
  db.prepare(`
    UPDATE users SET approval_status = ? WHERE id = ? AND role = 'client'
  `).run(normalized, String(userId));
  return findUserById(String(userId));
}

export function updateUserPassword(userId, passwordHash) {
  const changedAt = randomUUID();
  db.prepare(`
    UPDATE users
    SET password_hash = ?, password_changed_at = ?
    WHERE id = ?
  `).run(String(passwordHash), changedAt, String(userId));
  return findUserById(String(userId));
}

export function updateUserRole(userId, role) {
  const nextRole = String(role || "").trim().toLowerCase();
  if (!["client", "manager", "admin"].includes(nextRole)) {
    throw new Error("Недопустимая роль.");
  }
  db.prepare(`
    UPDATE users
    SET role = ?
    WHERE id = ?
  `).run(nextRole, String(userId));
  return findUserById(String(userId));
}

export function listStaffUsers() {
  return db
    .prepare(`
      SELECT id, email, role, email_verified, approval_status, created_at, last_login_at,
             disabled_at, permissions_json
      FROM users
      WHERE role IN ('manager', 'admin')
      ORDER BY role DESC, email ASC
    `)
    .all()
    .map((row) => mapStaffUser(row));
}

function parsePermissionsJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mapStaffUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: Boolean(row.email_verified),
    approvalStatus: row.approval_status || "approved",
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || "",
    disabledAt: row.disabled_at || "",
    disabled: Boolean(row.disabled_at),
    permissions: parsePermissionsJson(row.permissions_json),
  };
}

export function setStaffDisabled(userId, disabled) {
  const value = disabled ? now() : "";
  if (disabled) {
    db.prepare(`
      UPDATE users
      SET disabled_at = ?, password_changed_at = ?
      WHERE id = ? AND role IN ('manager', 'admin')
    `).run(value, randomUUID(), String(userId));
  } else {
    db.prepare(`
      UPDATE users
      SET disabled_at = ?
      WHERE id = ? AND role IN ('manager', 'admin')
    `).run(value, String(userId));
  }
  return findUserById(String(userId));
}

export function setStaffPermissions(userId, permissions) {
  const payload =
    permissions && typeof permissions === "object" ? permissions : {};
  db.prepare(`
    UPDATE users
    SET permissions_json = ?
    WHERE id = ? AND role IN ('manager', 'admin')
  `).run(JSON.stringify(payload), String(userId));
  return findUserById(String(userId));
}

export function deleteStaffUser(userId) {
  const result = db
    .prepare(`DELETE FROM users WHERE id = ? AND role IN ('manager', 'admin')`)
    .run(String(userId));
  return Number(result.changes) > 0;
}

/** Удаляет клиента Clover. Связанные строки с ON DELETE CASCADE уходят вместе с users. */
export function deleteClientUser(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const user = findUserById(id);
  if (!user || user.role !== "client") return null;
  const result = db
    .prepare(`DELETE FROM users WHERE id = ? AND role = 'client'`)
    .run(id);
  if (Number(result.changes) <= 0) return null;
  return user;
}

/** Удаляет уведомления менеджера по source_id (точное и с суффиксом `:`). */
export function deleteManagerNotificationsBySource(sourceId) {
  const id = String(sourceId || "").trim();
  if (!id) return 0;
  const likeNeedle = `${id.replace(/([%_\\])/g, "\\$1")}:%`;
  const result = db
    .prepare(`
      DELETE FROM manager_notifications
      WHERE source_id = ?
         OR source_id LIKE ? ESCAPE '\\'
    `)
    .run(id, likeNeedle);
  return Number(result.changes) || 0;
}

export function countUsersByRole(role) {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = ?`)
    .get(String(role));
  return Number(row?.count) || 0;
}

export function revokeOtherSessions(userId) {
  const changedAt = randomUUID();
  db.prepare(`
    UPDATE users SET password_changed_at = ? WHERE id = ?
  `).run(changedAt, String(userId));
  return findUserById(String(userId));
}

export function createAuthToken({ userId, type, tokenHash, expiresAt }) {
  const createdAt = now();
  db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND type = ?`).run(
    String(userId), String(type)
  );
  const id = randomUUID();
  db.prepare(`
    INSERT INTO auth_tokens(id, user_id, type, token_hash, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, '', ?)
  `).run(id, String(userId), String(type), String(tokenHash), String(expiresAt), createdAt);
  return { id, userId: String(userId), type: String(type), expiresAt, createdAt };
}

export function consumeAuthToken({ type, tokenHash }) {
  const row = db.prepare(`
    SELECT id, user_id, type, token_hash, expires_at, used_at, created_at
    FROM auth_tokens
    WHERE type = ? AND token_hash = ?
  `).get(String(type), String(tokenHash));
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;
  db.prepare(`UPDATE auth_tokens SET used_at = ? WHERE id = ?`).run(now(), row.id);
  return { id: row.id, userId: row.user_id, type: row.type, expiresAt: row.expires_at };
}

export function createReconciliationRequest({
  userId,
  periodType,
  year = null,
  dateFrom = "",
  dateTo = "",
  clientComment = "",
}) {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO reconciliation_requests(
      id, user_id, period_type, year, date_from, date_to, status,
      client_comment, manager_comment, file_name, file_path, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, '', '', '', ?, ?)
  `).run(
    id, String(userId), String(periodType), year == null ? null : Number(year),
    String(dateFrom || ''), String(dateTo || ''), String(clientComment || ''),
    createdAt, createdAt
  );
  return getReconciliationRequest(id);
}

function reconciliationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    periodType: row.period_type,
    year: row.year,
    dateFrom: row.date_from || "",
    dateTo: row.date_to || "",
    status: row.status,
    clientComment: row.client_comment || "",
    managerComment: row.manager_comment || "",
    fileName: row.file_name || "",
    hasFile: Boolean(row.file_path),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getReconciliationRequest(id) {
  return reconciliationRow(db.prepare(`
    SELECT * FROM reconciliation_requests WHERE id = ?
  `).get(String(id)));
}

export function getReconciliationRequestInternal(id) {
  return db.prepare(`SELECT * FROM reconciliation_requests WHERE id = ?`).get(String(id)) || null;
}

export function listReconciliationRequests(userId = null) {
  const rows = userId
    ? db.prepare(`SELECT * FROM reconciliation_requests WHERE user_id = ? ORDER BY created_at DESC`).all(String(userId))
    : db.prepare(`SELECT * FROM reconciliation_requests ORDER BY created_at DESC`).all();
  const clients = new Map(listClients().map((client) => [String(client.id), client]));
  return rows.map((row) => ({
    ...reconciliationRow(row),
    client: clients.get(String(row.user_id)) || null,
  }));
}

export function updateReconciliationRequest(id, patch = {}) {
  const current = getReconciliationRequestInternal(id);
  if (!current) return null;
  const status = ["new", "processing", "ready", "rejected"].includes(patch.status)
    ? patch.status
    : current.status;
  const managerComment = patch.managerComment === undefined
    ? current.manager_comment
    : String(patch.managerComment || "");
  const fileName = patch.fileName === undefined ? current.file_name : String(patch.fileName || "");
  const filePath = patch.filePath === undefined ? current.file_path : String(patch.filePath || "");
  db.prepare(`
    UPDATE reconciliation_requests
    SET status = ?, manager_comment = ?, file_name = ?, file_path = ?, updated_at = ?
    WHERE id = ?
  `).run(status, managerComment, fileName, filePath, now(), String(id));
  return getReconciliationRequest(id);
}

export function upsertPushSubscription({ userId, subscription, preferences = {} }) {
  const endpoint = String(subscription?.endpoint || "");
  if (!endpoint) throw new Error("В push-подписке отсутствует endpoint.");
  const updatedAt = now();
  const existing = db.prepare(`SELECT id, created_at FROM push_subscriptions WHERE endpoint = ?`).get(endpoint);
  const id = existing?.id || randomUUID();
  const createdAt = existing?.created_at || updatedAt;
  db.prepare(`
    INSERT INTO push_subscriptions(
      id, user_id, endpoint, subscription_json, order_events, promotions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      subscription_json = excluded.subscription_json,
      order_events = excluded.order_events,
      promotions = excluded.promotions,
      updated_at = excluded.updated_at
  `).run(
    id, String(userId), endpoint, JSON.stringify(subscription),
    1,
    preferences.promotions ? 1 : 0,
    createdAt, updatedAt
  );
  return { id, endpoint, orderEvents: true, promotions: Boolean(preferences.promotions) };
}

export function listPushSubscriptions(userId = null, kind = "all") {
  let rows;
  if (userId) {
    rows = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id = ?`).all(String(userId));
  } else if (kind === "promotions") {
    rows = db.prepare(`SELECT * FROM push_subscriptions WHERE promotions = 1`).all();
  } else if (kind === "orders") {
    rows = db.prepare(`SELECT * FROM push_subscriptions WHERE order_events = 1`).all();
  } else {
    rows = db.prepare(`SELECT * FROM push_subscriptions`).all();
  }
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    subscription: parseJson(row.subscription_json, {}),
    orderEvents: Boolean(row.order_events),
    promotions: Boolean(row.promotions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function deletePushSubscription(userId, endpoint) {
  db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`).run(
    String(userId), String(endpoint)
  );
}

function managerNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || "",
    url: row.url || "",
    sourceId: row.source_id || "",
    readAt: row.read_at || "",
    createdAt: row.created_at,
  };
}

export function createManagerNotification({
  type,
  title,
  body = "",
  url = "",
  sourceId = "",
}) {
  const normalizedType = String(type || "general").trim().slice(0, 80) || "general";
  const normalizedSourceId = String(sourceId || "").trim().slice(0, 240);
  if (normalizedSourceId) {
    const existing = db.prepare(`
      SELECT * FROM manager_notifications
      WHERE type = ? AND source_id = ?
    `).get(normalizedType, normalizedSourceId);
    if (existing) {
      return { notification: managerNotificationRow(existing), created: false };
    }
  }

  const id = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO manager_notifications(
      id, type, title, body, url, source_id, read_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, '', ?)
  `).run(
    id,
    normalizedType,
    String(title || "Новое событие Clover").trim().slice(0, 180),
    String(body || "").trim().slice(0, 2000),
    String(url || "").trim().slice(0, 500),
    normalizedSourceId,
    createdAt
  );

  return {
    notification: managerNotificationRow(db.prepare(`SELECT * FROM manager_notifications WHERE id = ?`).get(id)),
    created: true,
  };
}

export function listManagerNotifications({ unreadOnly = false, limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const rows = unreadOnly
    ? db.prepare(`
        SELECT * FROM manager_notifications
        WHERE read_at = ''
        ORDER BY created_at DESC
        LIMIT ?
      `).all(safeLimit)
    : db.prepare(`
        SELECT * FROM manager_notifications
        ORDER BY created_at DESC
        LIMIT ?
      `).all(safeLimit);
  return rows.map(managerNotificationRow);
}

export function markManagerNotificationRead(id) {
  const readAt = now();
  db.prepare(`
    UPDATE manager_notifications
    SET read_at = CASE WHEN read_at = '' THEN ? ELSE read_at END
    WHERE id = ?
  `).run(readAt, String(id));
  return managerNotificationRow(
    db.prepare(`SELECT * FROM manager_notifications WHERE id = ?`).get(String(id))
  );
}

/** Пометить прочитанными уведомления по типу и source_id (например, после одобрения клиента). */
export function markManagerNotificationsReadBySource(type, sourceId) {
  const normalizedType = String(type || "").trim();
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedType || !normalizedSourceId) {
    return { changed: 0, readAt: "" };
  }
  const readAt = now();
  const result = db.prepare(`
    UPDATE manager_notifications
    SET read_at = ?
    WHERE type = ? AND source_id = ? AND read_at = ''
  `).run(readAt, normalizedType, normalizedSourceId);
  return { changed: Number(result.changes || 0), readAt };
}

/**
 * Пометить прочитанными все непрочитанные уведомления менеджера по заказу:
 * new_order (source_id = orderId) и связанные (source_id = orderId:…).
 * Вызывается после «Передать в 1С», чтобы очередь в колокольчике исчезла.
 */
export function markManagerNotificationsReadForOrder(orderId) {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    return { changed: 0, readAt: "" };
  }
  const readAt = now();
  // source_id вида "uuid" или "uuid:…" — экранируем % и _ для LIKE.
  const likePrefix = `${normalizedOrderId.replace(/([%_\\])/g, "\\$1")}:%`;
  const result = db.prepare(`
    UPDATE manager_notifications
    SET read_at = ?
    WHERE read_at = ''
      AND (
        source_id = ?
        OR source_id LIKE ? ESCAPE '\\'
      )
  `).run(readAt, normalizedOrderId, likePrefix);
  return { changed: Number(result.changes || 0), readAt };
}

export function markAllManagerNotificationsRead() {
  const readAt = now();
  const result = db.prepare(`
    UPDATE manager_notifications
    SET read_at = ?
    WHERE read_at = ''
  `).run(readAt);
  return { changed: Number(result.changes || 0), readAt };
}

export function listManagerUsers() {
  return db.prepare(`
    SELECT id, email, role, email_verified, approval_status, created_at
    FROM users
    WHERE role = 'manager'
    ORDER BY created_at
  `).all().map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: Boolean(row.email_verified),
    approvalStatus: row.approval_status || "approved",
    createdAt: row.created_at,
  }));
}

export function listPasskeys(userId) {
  return db.prepare(`SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at`).all(String(userId)).map((row) => ({
    id: row.id,
    userId: row.user_id,
    publicKey: new Uint8Array(row.public_key),
    counter: Number(row.counter || 0),
    transports: parseJson(row.transports_json, []),
    deviceType: row.device_type || "",
    backedUp: Boolean(row.backed_up),
    webauthnUserID: row.webauthn_user_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getPasskey(id) {
  const row = db.prepare(`SELECT * FROM passkey_credentials WHERE id = ?`).get(String(id));
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    publicKey: new Uint8Array(row.public_key),
    counter: Number(row.counter || 0),
    transports: parseJson(row.transports_json, []),
    deviceType: row.device_type || "",
    backedUp: Boolean(row.backed_up),
    webauthnUserID: row.webauthn_user_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function savePasskey({ id, userId, publicKey, counter = 0, transports = [], deviceType = "", backedUp = false, webauthnUserID = "" }) {
  const timestamp = now();
  db.prepare(`
    INSERT INTO passkey_credentials(
      id, user_id, public_key, counter, transports_json, device_type,
      backed_up, webauthn_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      public_key = excluded.public_key,
      counter = excluded.counter,
      transports_json = excluded.transports_json,
      device_type = excluded.device_type,
      backed_up = excluded.backed_up,
      updated_at = excluded.updated_at
  `).run(
    String(id), String(userId), Buffer.from(publicKey), Number(counter || 0),
    JSON.stringify(transports || []), String(deviceType || ""), backedUp ? 1 : 0,
    String(webauthnUserID || ""), timestamp, timestamp
  );
  return getPasskey(id);
}

export function updatePasskeyCounter(id, counter) {
  db.prepare(`UPDATE passkey_credentials SET counter = ?, updated_at = ? WHERE id = ?`).run(
    Number(counter || 0), now(), String(id)
  );
}

export function deletePasskey(userId, id) {
  db.prepare(`DELETE FROM passkey_credentials WHERE user_id = ? AND id = ?`).run(String(userId), String(id));
}

export function createWebAuthnChallenge({ id = randomUUID(), userId, type, challenge, expiresAt }) {
  db.prepare(`DELETE FROM webauthn_challenges WHERE expires_at <= ?`).run(now());
  db.prepare(`
    INSERT INTO webauthn_challenges(id, user_id, type, challenge, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(String(id), String(userId), String(type), String(challenge), String(expiresAt), now());
  return { id: String(id), userId: String(userId), type: String(type), challenge: String(challenge), expiresAt };
}

export function consumeWebAuthnChallenge(id, type) {
  const row = db.prepare(`SELECT * FROM webauthn_challenges WHERE id = ? AND type = ?`).get(String(id), String(type));
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) db.prepare(`DELETE FROM webauthn_challenges WHERE id = ?`).run(row.id);
    return null;
  }
  db.prepare(`DELETE FROM webauthn_challenges WHERE id = ?`).run(row.id);
  return { id: row.id, userId: row.user_id, type: row.type, challenge: row.challenge, expiresAt: row.expires_at };
}

export function seedManager() {
  const email = String(process.env.MANAGER_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.MANAGER_PASSWORD || "");

  if (!email || !password) {
    const existingManager = db.prepare("SELECT 1 FROM users WHERE role = 'manager' LIMIT 1").get();
    if (!existingManager) {
      console.warn("Менеджер не создан: задайте MANAGER_EMAIL и MANAGER_PASSWORD в server/.env.");
    }
    return;
  }

  const existing = findUserByEmail(email);
  if (existing) return;

  const passwordHash = bcrypt.hashSync(password, 12);
  createUser({
    email,
    passwordHash,
    role: "manager",
    emailVerified: false,
    approvalStatus: "approved",
  });

  console.log(`Создан менеджер ${email}. Требуется подтверждение email.`);
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

export function listExchangeAudit(limit = 300) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 300));
  const rows = db.prepare(`
    SELECT id, user_id, user_email, user_role, action, details_json, created_at
    FROM audit_log
    WHERE action LIKE 'exchange.%'
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
    version: 4,
    exportedAt: now(),
    users: db.prepare(`
      SELECT id, email, password_hash, role, created_at,
             email_verified, approval_status, password_changed_at, last_login_at
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
    authTokens: db.prepare(`SELECT * FROM auth_tokens ORDER BY created_at`).all(),
    reconciliationRequests: db.prepare(`SELECT * FROM reconciliation_requests ORDER BY created_at`).all(),
    pushSubscriptions: db.prepare(`SELECT * FROM push_subscriptions ORDER BY created_at`).all(),
    managerNotifications: db.prepare(`SELECT * FROM manager_notifications ORDER BY created_at`).all(),
    passkeys: db.prepare(`SELECT * FROM passkey_credentials ORDER BY created_at`).all().map((row) => ({
      ...row,
      public_key: Buffer.from(row.public_key).toString("base64"),
    })),
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
    db.exec("DELETE FROM webauthn_challenges");
    db.exec("DELETE FROM passkey_credentials");
    db.exec("DELETE FROM manager_notifications");
    db.exec("DELETE FROM push_subscriptions");
    db.exec("DELETE FROM reconciliation_requests");
    db.exec("DELETE FROM auth_tokens");
    db.exec("DELETE FROM audit_log");

    const insertUser = db.prepare(`
      INSERT INTO users(
        id, email, password_hash, role, created_at,
        email_verified, approval_status, password_changed_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of snapshot.users) {
      insertUser.run(
        String(row.id),
        String(row.email).toLowerCase(),
        String(row.password_hash),
        String(row.role),
        String(row.created_at),
        row.email_verified === undefined ? 1 : Number(Boolean(row.email_verified)),
        String(row.approval_status || "approved"),
        String(row.password_changed_at || ""),
        String(row.last_login_at || "")
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

    const insertAuthToken = db.prepare(`
      INSERT INTO auth_tokens(id, user_id, type, token_hash, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of Array.isArray(snapshot.authTokens) ? snapshot.authTokens : []) {
      insertAuthToken.run(
        String(row.id || randomUUID()), String(row.user_id), String(row.type),
        String(row.token_hash), String(row.expires_at), String(row.used_at || ""),
        String(row.created_at || now())
      );
    }

    const insertReconciliation = db.prepare(`
      INSERT INTO reconciliation_requests(
        id, user_id, period_type, year, date_from, date_to, status,
        client_comment, manager_comment, file_name, file_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of Array.isArray(snapshot.reconciliationRequests) ? snapshot.reconciliationRequests : []) {
      insertReconciliation.run(
        String(row.id || randomUUID()), String(row.user_id), String(row.period_type || "custom"),
        row.year == null ? null : Number(row.year), String(row.date_from || ""), String(row.date_to || ""),
        String(row.status || "new"), String(row.client_comment || ""), String(row.manager_comment || ""),
        String(row.file_name || ""), String(row.file_path || ""),
        String(row.created_at || now()), String(row.updated_at || row.created_at || now())
      );
    }

    const insertPush = db.prepare(`
      INSERT INTO push_subscriptions(
        id, user_id, endpoint, subscription_json, order_events, promotions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of Array.isArray(snapshot.pushSubscriptions) ? snapshot.pushSubscriptions : []) {
      insertPush.run(
        String(row.id || randomUUID()), String(row.user_id), String(row.endpoint),
        String(row.subscription_json || "{}"), Number(row.order_events ?? 1), Number(row.promotions ?? 0),
        String(row.created_at || now()), String(row.updated_at || row.created_at || now())
      );
    }

    const insertManagerNotification = db.prepare(`
      INSERT INTO manager_notifications(
        id, type, title, body, url, source_id, read_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of Array.isArray(snapshot.managerNotifications) ? snapshot.managerNotifications : []) {
      insertManagerNotification.run(
        String(row.id || randomUUID()), String(row.type || "general"),
        String(row.title || "Новое событие Clover"), String(row.body || ""),
        String(row.url || ""), String(row.source_id || ""), String(row.read_at || ""),
        String(row.created_at || now())
      );
    }

    const insertPasskey = db.prepare(`
      INSERT INTO passkey_credentials(
        id, user_id, public_key, counter, transports_json, device_type, backed_up,
        webauthn_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of Array.isArray(snapshot.passkeys) ? snapshot.passkeys : []) {
      insertPasskey.run(
        String(row.id), String(row.user_id), Buffer.from(String(row.public_key || ""), "base64"),
        Number(row.counter || 0), String(row.transports_json || "[]"), String(row.device_type || ""),
        Number(row.backed_up || 0), String(row.webauthn_user_id || ""),
        String(row.created_at || now()), String(row.updated_at || row.created_at || now())
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
