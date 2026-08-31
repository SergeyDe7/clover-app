/**
 * Изолированный запуск API для security-тестов.
 *
 * Сервер поднимается отдельным процессом на временной БД (DB_PATH) и случайном
 * порту, с тестовыми секретами и заглушенными внешними интеграциями:
 * SMTP, Telegram и 1С отключаются пустыми значениями переменных окружения.
 * dotenv не перезаписывает уже заданные переменные, поэтому значения отсюда
 * всегда побеждают содержимое server/.env — продовые секреты в тест не попадают.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, "..", "..");

export const TEST_ONEC_KEY = "test-only-onec-key-0123456789abcdef";

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`сервер завершился с кодом ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
      lastError = `health вернул ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`сервер не поднялся за ${timeoutMs} мс: ${lastError}`);
}

export async function startTestServer({ env = {} } = {}) {
  const workDir = mkdtempSync(path.join(tmpdir(), "clover-security-"));
  const dbPath = path.join(workDir, "test.sqlite");
  // Каталоги бэкапов и загрузок тоже уводятся во временную директорию,
  // иначе тест создания бэкапа пишет десятки мегабайт в рабочие backups/.
  const backupDir = path.join(workDir, "backups");
  const uploadsDir = path.join(workDir, "uploads");
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  mkdirSync(uploadsDir, { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DB_PATH: dbPath,
      BACKUP_DIR: backupDir,
      UPLOADS_DIR: uploadsDir,
      PORT: String(port),
      HOST: "127.0.0.1",
      APP_PUBLIC_URL: baseUrl,
      CLOVER_PUBLIC_URL: baseUrl,
      JWT_SECRET: "test-only-jwt-secret-not-used-anywhere-else-0123456789",
      ONEC_API_KEY: TEST_ONEC_KEY,
      ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
      ONEC_BASE_URL: "",
      ONEC_USERNAME: "",
      ONEC_PASSWORD: "",
      ONEC_WRITE_ENABLED: "false",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      MAIL_FROM: "",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_MANAGER_CHAT_ID: "",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      ALLOW_DEV_AUTH_LINKS: "false",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  try {
    await waitForHealth(baseUrl, child);
  } catch (error) {
    child.kill("SIGKILL");
    throw new Error(`${error.message}\n--- вывод сервера ---\n${logs.join("")}`);
  }

  const openDb = () => {
    const db = new DatabaseSync(dbPath);
    // Сервер держит собственное соединение; без ожидания блокировки
    // параллельная запись из теста падает с "database is locked".
    db.exec("PRAGMA busy_timeout = 5000");
    return db;
  };

  /** Создаёт пользователя напрямую в БД, минуя регистрацию и почту. */
  const createUser = ({ email, password, role, permissions = null }) => {
    const db = openDb();
    try {
      const id = `test-${role}-${Math.random().toString(36).slice(2, 10)}`;
      db.prepare(
        `INSERT INTO users(
           id, email, password_hash, role, created_at,
           email_verified, approval_status, password_changed_at, last_login_at
         ) VALUES (?, ?, ?, ?, ?, 1, 'approved', '', '')`
      ).run(id, email.toLowerCase(), bcrypt.hashSync(password, 4), role, new Date().toISOString());

      if (permissions) {
        db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run(
          JSON.stringify(permissions),
          id
        );
      }
      if (role === "client") {
        db.prepare(
          `INSERT INTO client_state(user_id, profile_json, addresses_json, favorites_json, updated_at)
           VALUES (?, '{}', '[]', '[]', ?)`
        ).run(id, new Date().toISOString());
      }
      return { id, email: email.toLowerCase(), password, role };
    } finally {
      db.close();
    }
  };

  /** Кладёт заказ в БД напрямую, минуя матрицу и переоценку. */
  const insertOrder = (userId, order) => {
    const db = openDb();
    try {
      const stamp = order.createdAt || new Date().toISOString();
      // Продакшен всегда пишет clientId в payload (replaceOrders), и менеджерское
      // сохранение по нему определяет владельца. Без него заказ терялся бы.
      const payload = { ...order, clientId: userId };
      db.prepare(
        "INSERT INTO orders(id, user_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(String(order.id), userId, JSON.stringify(payload), stamp, stamp);
      return payload;
    } finally {
      db.close();
    }
  };

  /** Без userId возвращает заказы всех пользователей — как их видит менеджер. */
  const readOrders = (userId) => {
    const db = openDb();
    try {
      const rows = userId
        ? db.prepare("SELECT payload_json FROM orders WHERE user_id = ?").all(userId)
        : db.prepare("SELECT payload_json FROM orders").all();
      return rows.map((row) => JSON.parse(row.payload_json));
    } finally {
      db.close();
    }
  };

  const login = async ({ email, password }) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.token) {
      throw new Error(`login ${email} не удался: ${response.status} ${JSON.stringify(body)}`);
    }
    return body.token;
  };

  const request = (routePath, { token, method = "GET", body, headers = {} } = {}) =>
    fetch(`${baseUrl}${routePath}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });

  const stop = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    rmSync(workDir, { recursive: true, force: true });
  };

  return {
    baseUrl,
    dbPath,
    workDir,
    backupDir,
    uploadsDir,
    child,
    logs,
    openDb,
    createUser,
    insertOrder,
    readOrders,
    login,
    request,
    stop,
  };
}

/** Стандартный набор учётных записей для тестов доступа. */
export async function seedAccessFixtures(server) {
  const admin = server.createUser({
    email: "admin@security.test",
    password: "admin-password-1",
    role: "admin",
  });
  const fullManager = server.createUser({
    email: "manager-full@security.test",
    password: "manager-password-1",
    role: "manager",
  });
  const limitedManager = server.createUser({
    email: "manager-limited@security.test",
    password: "manager-password-2",
    role: "manager",
    permissions: { tabs: ["orders"], manageStaff: false },
  });
  const client = server.createUser({
    email: "client@security.test",
    password: "client-password-1",
    role: "client",
  });

  return {
    admin: { ...admin, token: await server.login(admin) },
    fullManager: { ...fullManager, token: await server.login(fullManager) },
    limitedManager: { ...limitedManager, token: await server.login(limitedManager) },
    client: { ...client, token: await server.login(client) },
  };
}
