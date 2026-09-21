#!/usr/bin/env node
/**
 * Pack the current worktree candidate, including uncommitted files.
 * Does not follow node_modules, and does not copy .env / DBs / secrets.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const portableDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(portableDir, "../..");

const EXCLUDE_RE = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.env($|\.|[^/]*$)/,
  /(^|\/)server\.env(\.|$)/,
  /(^|\/)releases(\/|$)/,
  /\.(db|sqlite|sqlite3)$/i,
  /(^|\/)dist(\/|$)/,
  /(^|\/)dist\./,
  /(^|\/)coverage(\/|$)/,
  /(^|\/)\.tmp(\/|$)/,
  /(^|\/)uploads(\/|$)/,
  /(^|\/)backups(\/|$)/,
  /(^|\/)deployments(\/|$)/,
  /\.log$/i,
  /(^|\/)pack-output(\/|$)/,
  /(^|\/)\.cursor(\/|$)/,
  /(^|\/)chrome-profile(\/|$)/,
  /(^|\/)user-data-dir(\/|$)/,
  /\.tar\.gz$/,
];

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function shouldPack(rel) {
  const norm = rel.replaceAll("\\", "/");
  if (norm.startsWith("tools/metrika-browser-smoke-portable/evidence/")) {
    return /\.(html|md|json|diff)$/i.test(norm);
  }
  return !EXCLUDE_RE.some((re) => re.test(norm));
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const expectedHead = String(process.env.CLOVER_METRIKA_EXPECTED_HEAD || "").trim();
const expectedBranch = String(process.env.CLOVER_METRIKA_EXPECTED_BRANCH || "").trim();
const head = git(["rev-parse", "HEAD"]);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (expectedHead && head !== expectedHead) {
  throw new Error(`HEAD mismatch: ${head} != ${expectedHead}`);
}
if (expectedBranch && branch !== expectedBranch) {
  throw new Error(`branch mismatch: ${branch} != ${expectedBranch}`);
}
let originMain = "";
try {
  originMain = git(["rev-parse", "origin/main"]);
} catch {
  originMain = "";
}
const status = git(["status", "--short", "--untracked-files=all"]);
const diffStat = git(["diff", "--stat"]);
const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const extra = git(["ls-files", "-z", "--others", "--exclude-standard"])
  .split("\0")
  .filter(Boolean);
const files = [...new Set([...tracked, ...extra])].filter(shouldPack).sort();

const stamped = new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z");
const outDir = process.env.CLOVER_METRIKA_PACK_DIR
  ? path.resolve(process.env.CLOVER_METRIKA_PACK_DIR)
  : path.join("/tmp", `clover-metrika-candidate-${stamped}`);
mkdirSync(outDir, { recursive: true });

const entries = [];
for (const rel of files) {
  const full = path.join(root, rel);
  if (!existsSync(full)) continue;
  const lst = lstatSync(full);
  if (lst.isSymbolicLink() || !lst.isFile()) continue;
  const st = statSync(full);
  entries.push({
    path: rel.replaceAll("\\", "/"),
    bytes: st.size,
    sha256: sha256(full),
  });
}

const identity = {
  packedAtUtc: new Date().toISOString(),
  sourceRoot: root,
  branch,
  head,
  expectedHead: expectedHead || null,
  expectedBranch: expectedBranch || null,
  originMain,
  dirty: Boolean(status),
  status: status || "",
  statusLines: status ? status.split("\n") : [],
  diffStat: diffStat || "",
  fileCount: entries.length,
  byteTotal: entries.reduce((sum, row) => sum + row.bytes, 0),
  excludes: [
    "node_modules",
    ".git",
    ".env*",
    "databases",
    "backups",
    "dist",
    "uploads",
    "secrets",
    "logs",
    "chrome-profile",
    "user-data-dir",
  ],
  note: "Working tree including uncommitted candidate files. Not HEAD-only. Not a live/production tree.",
};

const manifest = { identity, files: entries };
writeFileSync(path.join(outDir, "IDENTITY.json"), JSON.stringify(identity, null, 2));
writeFileSync(path.join(outDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2));
writeFileSync(
  path.join(outDir, "SHA256SUMS"),
  entries.map((row) => `${row.sha256}  ${row.path}`).join("\n") + "\n"
);

const listFile = path.join(outDir, "FILES.txt");
writeFileSync(listFile, entries.map((row) => row.path).join("\n") + "\n");
const slug = branch.replace(/^agent\//, "").replace(/[^A-Za-z0-9._-]+/g, "-");
const archive = path.join(outDir, `${slug}-candidate.tar.gz`);
execFileSync(
  "tar",
  ["-czf", archive, "-C", root, "--files-from", listFile],
  { stdio: "inherit" }
);
const archiveSha256 = sha256(archive);
const archiveBytes = statSync(archive).size;
writeFileSync(path.join(outDir, "ARCHIVE.sha256"), `${archiveSha256}  ${path.basename(archive)}\n`);
writeFileSync(
  path.join(outDir, "WINDOWS-RUN.md"),
  `# Windows — mock Metrika smoke для ${branch}

Не запускать Chrome на Linux-production. Не слать трафик на \`mc.yandex.ru\`.
Не делать commit/push/merge/deploy/restart.

## Что это

Candidate \`${branch}\` = HEAD \`${head}\` + незакоммиченные изменения.
Источник: \`${root}\`.
Архив: \`${path.basename(archive)}\`.

Сверить \`ARCHIVE.sha256\` и \`IDENTITY.json\` до запуска.

## Перенос

\`\`\`powershell
New-Item -ItemType Directory -Force C:\\clover-metrika-smoke | Out-Null
scp clover:${archive} C:\\clover-metrika-smoke\\
scp clover:${path.join(outDir, "ARCHIVE.sha256")} C:\\clover-metrika-smoke\\
scp clover:${path.join(outDir, "IDENTITY.json")} C:\\clover-metrika-smoke\\
scp clover:${path.join(outDir, "MANIFEST.json")} C:\\clover-metrika-smoke\\
scp clover:${path.join(outDir, "SHA256SUMS")} C:\\clover-metrika-smoke\\
Get-FileHash C:\\clover-metrika-smoke\\${path.basename(archive)} -Algorithm SHA256
tar -xzf C:\\clover-metrika-smoke\\${path.basename(archive)} -C C:\\clover-metrika-smoke\\candidate
\`\`\`

Не копировать \`.env\`, БД, секреты, \`node_modules\`, live \`/opt/clover/clover-app\`.

## Зависимости

- Node.js 22+
- Локальный Chrome или Edge
- \`npm ci\` по lockfile из архива (launcher сделает сам)
- Не задавать \`CLOVER_BROWSER_CHROME\` на Linux chrome-headless-shell

## Запуск mock-проверки

\`\`\`powershell
cd C:\\clover-metrika-smoke\\candidate
powershell -NoProfile -ExecutionPolicy Bypass -File .\\tools\\metrika-browser-smoke-portable\\Run-MetrikaBrowserSmoke.ps1
\`\`\`

Launcher собирает off-live TEST_MODE + production OFF/ON локально, поднимает
\`127.0.0.1\` с mock API заказов и \`/__clover_metrika_mock.js\`.
Любой запрос к \`mc.yandex.ru\` / \`yandex.ru/metrika\` = FAIL.

Для этого candidate дополнительно смотреть:

1. Полоска снизу, без большого заголовка «Необязательная аналитика».
2. Текст: «Используем cookie для статистики — с вашего разрешения.»
3. Ссылка «Подробнее» → политика. Кнопки «Разрешить» / «Отклонить».
4. 390px: кнопки равные, удобные для нажатия, без перекрытия каталога.
5. \`/ar/\` — RTL, кнопки доступны.
6. До согласия mock SDK не грузится. Отказ / отзыв / сохранённый выбор — как раньше.
7. Реальные заказы и \`mc.yandex.ru\` не использовать.

Снимки: \`tools/metrika-browser-smoke-portable/evidence/consent-prompt-{ru|ar}-{390|1280}.png\`.
`
);

console.log(
  JSON.stringify(
    {
      archive,
      archiveSha256,
      archiveBytes,
      outDir,
      fileCount: entries.length,
      head,
      branch,
      dirty: Boolean(status),
    },
    null,
    2
  )
);
