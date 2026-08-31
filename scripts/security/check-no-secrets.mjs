#!/usr/bin/env node
/**
 * Сканер отслеживаемого git-дерева на предмет реальных секретов.
 *
 * Печатает только путь, номер строки, имя переменной и идентификатор правила.
 * Значение найденного секрета не выводится никогда — ни целиком, ни частично,
 * иначе сам отчёт сканера становится утечкой.
 *
 * Выход: 0 — чисто, 1 — найдено, 2 — ошибка запуска.
 *
 * Подавление ложного срабатывания: комментарий `secret-scan:allow` в той же строке.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** Файлы, где высокая энтропия — норма, а не секрет. */
const SKIPPED_PATHS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)npm-shrinkwrap\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /\.min\.(js|css)$/,
  /(^|\/)docs\/security\/(SECRET_ROTATION_RUNBOOK|AUDIT_BASELINE_[0-9]+)\.md$/,
  /(^|\/)scripts\/security\/check-no-secrets\.mjs$/,
];

/** Бинарные расширения читать бессмысленно. */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp",
  ".pdf", ".zip", ".gz", ".tgz", ".rar", ".7z", ".xlsx", ".xls", ".docx",
  ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".webm", ".mp3",
  ".sqlite", ".db", ".epf", ".cf", ".cfe", ".exe", ".dll",
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Имена переменных, значение которых обязано быть секретом. */
const SECRET_KEY_RE =
  /\b([A-Z][A-Z0-9_]{2,})(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET)\b/;

/**
 * Слова, по которым значение опознаётся как заглушка.
 * Регистронезависимо, покрывает русскоязычные шаблоны из releases/.
 */
const PLACEHOLDER_HINTS = [
  "replace", "change", "changeme", "your", "yours", "fill", "fillme",
  "paste", "generate", "example", "sample", "placeholder", "dummy",
  "todo", "tbd", "xxxx", "insert", "here", "value", "secret_here",
  "заполн", "замен", "встав", "сюда", "образец", "пример", "укажите",
];

/** Значения, которые заведомо не секрет. */
const BENIGN_VALUES = new Set([
  "", "true", "false", "null", "undefined", "0", "1",
  "on", "off", "yes", "no", "none", "auto", "default",
]);

function isPlaceholder(value) {
  const low = value.toLowerCase();
  if (PLACEHOLDER_HINTS.some((hint) => low.includes(hint))) return true;
  // «СЛОВО_СЛОВО_СЛОВО» без цифр и спецсимволов — типовая заглушка, не ключ.
  if (/^[A-Za-z]+(_[A-Za-z]+){2,}$/.test(value)) return true;
  if (/^<.*>$/.test(value) || /^\$\{.*\}$/.test(value)) return true;
  if (/^(x|X|\*|\.){3,}$/.test(value)) return true;
  return false;
}

/** Шеннон в битах на символ. Настоящие ключи дают > 3, слова — меньше. */
function entropy(value) {
  if (!value) return 0;
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * Правила поиска секретов, не привязанных к имени переменной.
 * Каждое правило возвращает имя находки, но не её значение.
 */
const PATTERN_RULES = [
  {
    id: "private-key-block",
    label: "PEM private key",
    test: (line) => /-----BEGIN[A-Z ]*PRIVATE KEY-----/.test(line),
  },
  {
    id: "telegram-bot-token",
    label: "Telegram bot token",
    test: (line) => /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/.test(line),
  },
  {
    id: "jwt",
    label: "JWT",
    test: (line) => /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(line),
  },
  {
    id: "aws-access-key-id",
    label: "AWS access key id",
    test: (line) => /\b(AKIA|ASIA)[0-9A-Z]{16}\b/.test(line),
  },
  {
    id: "github-token",
    label: "GitHub token",
    test: (line) => /\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(line),
  },
  {
    id: "slack-token",
    label: "Slack token",
    test: (line) => /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/.test(line),
  },
  {
    id: "url-embedded-credentials",
    label: "credentials in URL",
    test: (line) => /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i.test(line),
  },
];

function listTrackedFiles() {
  const raw = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw.split("\0").filter(Boolean);
}

function shouldSkip(relativePath) {
  if (SKIPPED_PATHS.some((re) => re.test(relativePath))) return true;
  if (BINARY_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return true;
  return false;
}

/**
 * Секрет — компактный непрерывный токен из base64/hex-алфавита.
 * Всё, что содержит пробелы, кириллицу, скобки или операторы, — проза или код.
 */
function looksLikeSecretMaterial(value) {
  if (value.length < 12) return false;
  if (!/^[A-Za-z0-9+/=_\-.:]+$/.test(value)) return false;
  if (!/[0-9]/.test(value) && !/[+/=_\-.:]/.test(value)) return false;
  return entropy(value) >= 3.0;
}

function scanLine(relativePath, lineNumber, line, findings) {
  if (line.includes("secret-scan:allow")) return;

  // Присваивание секрета ищется только в env-подобном синтаксисе KEY=value
  // с ключом в UPPER_SNAKE_CASE. Присваивания в коде (`const password = ...`)
  // сюда не попадают: там значение почти всегда выражение, а не литерал.
  const assignment = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=\s*(.*)$/);

  if (assignment) {
    const key = assignment[1];
    const rawValue = assignment[2].trim().replace(/\s+#.*$/, "").trim();
    const value = rawValue.replace(/^["'`]|["'`]$/g, "").trim();
    // «KEY=process.env.KEY» и подобное — ссылка, а не значение.
    const isReference = /^(process\.env|import\.meta\.env|os\.environ|\$)/.test(value);
    if (
      SECRET_KEY_RE.test(key) &&
      !isReference &&
      !BENIGN_VALUES.has(value.toLowerCase()) &&
      !isPlaceholder(value) &&
      looksLikeSecretMaterial(value)
    ) {
      findings.push({
        file: relativePath,
        line: lineNumber,
        rule: "assigned-secret-value",
        detail: `переменная ${key}, длина значения ${value.length}`,
      });
    }
  }

  for (const rule of PATTERN_RULES) {
    if (rule.test(line)) {
      findings.push({
        file: relativePath,
        line: lineNumber,
        rule: rule.id,
        detail: rule.label,
      });
    }
  }
}

function main() {
  const findings = [];
  let scanned = 0;

  for (const relativePath of listTrackedFiles()) {
    if (shouldSkip(relativePath)) continue;
    const absolutePath = path.join(repoRoot, relativePath);

    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue; // файл удалён из рабочего дерева, но ещё в индексе
    }
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) continue;

    let content;
    try {
      content = readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    if (content.includes("\0")) continue; // бинарник без известного расширения

    scanned += 1;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      scanLine(relativePath, i + 1, lines[i], findings);
    }
  }

  if (findings.length === 0) {
    console.log(`secret-scan: проверено файлов ${scanned}, находок нет.`);
    return 0;
  }

  console.error(`secret-scan: проверено файлов ${scanned}, найдено ${findings.length}.`);
  console.error("Значения не выводятся намеренно. Проверьте перечисленные строки вручную.\n");
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  [${finding.rule}]  ${finding.detail}`);
  }
  console.error(
    "\nЕсли срабатывание ложное — добавьте в строку комментарий secret-scan:allow " +
      "или расширьте PLACEHOLDER_HINTS в scripts/security/check-no-secrets.mjs."
  );
  return 1;
}

try {
  process.exit(main());
} catch (error) {
  console.error(`secret-scan: ошибка запуска — ${error.message}`);
  process.exit(2);
}
