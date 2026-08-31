/**
 * Скрипт перезапуска раньше искал процессы по образцу командной строки
 * (`pkill -f 'node src/server.js'`) и на общем хосте мог погасить чужой
 * процесс. Проверяем, что выбираются только процессы из каталога проекта.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/linux/restart-api-ui.sh"
);

const LISTENER = `
  const net = require("node:net");
  const server = net.createServer(() => {});
  server.listen(Number(process.env.LISTEN_PORT), "127.0.0.1", () => process.send?.("ready"));
`;

function startListener(cwd, port) {
  const child = spawn(process.execPath, ["-e", LISTENER], {
    cwd,
    env: { ...process.env, LISTEN_PORT: String(port) },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  return new Promise((resolve, reject) => {
    child.once("message", () => resolve(child));
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`listener exited: ${code}`)));
  });
}

function listTargets(root, apiPort, uiPort) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [scriptPath, "--list-targets"], {
      env: {
        ...process.env,
        CLOVER_ROOT: root,
        CLOVER_API_PORT: String(apiPort),
        CLOVER_UI_PORT: String(uiPort),
      },
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", reject);
    child.on("exit", () =>
      resolve(
        out
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map(Number)
      )
    );
  });
}

test("останавливаются только процессы из каталога проекта", async (t) => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "clover-project-"));
  const otherRoot = mkdtempSync(path.join(tmpdir(), "clover-other-"));
  const apiPort = 45123;
  const uiPort = 45124;

  const ours = await startListener(projectRoot, apiPort);
  const theirs = await startListener(otherRoot, uiPort);

  t.after(() => {
    ours.kill("SIGKILL");
    theirs.kill("SIGKILL");
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  });

  const targets = await listTargets(projectRoot, apiPort, uiPort);

  assert.equal(targets.includes(ours.pid), true, "процесс проекта должен попасть в список");
  assert.equal(
    targets.includes(theirs.pid),
    false,
    "процесс из чужого каталога останавливать нельзя"
  );
});

test("в скрипте не осталось широкого поиска процессов", async () => {
  const source = await readFile(scriptPath, "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  assert.equal(/pkill\s+-f/.test(code), false, "pkill -f по образцу больше не используется");
  assert.equal(/pgrep\s+-f/.test(code), false, "pgrep -f по образцу больше не используется");
  assert.equal(/kill\s+-9/.test(code), false, "мгновенный kill -9 без ожидания недопустим");

  // Сборка обязана предшествовать перезапуску, иначе неудачная сборка
  // погасит работающий сервис.
  const buildAt = code.indexOf("npm run build");
  const restartAt = code.lastIndexOf("restart_services");
  assert.equal(buildAt > 0 && restartAt > buildAt, true, "сборка идёт до перезапуска");

  assert.equal(source.includes("kill -TERM"), true, "остановка начинается с TERM");
  assert.equal(source.includes("wait_for_health"), true, "после перезапуска есть проверка");
});
