/**
 * Разбор и проверка карты редиректов cloverspb.ru → clover-spb.ru.
 *
 * Модуль не обращается к сети и не пишет файлы: только парсинг CSV и инварианты.
 */

export const LEGACY_HOSTS = new Set(["cloverspb.ru", "www.cloverspb.ru"]);
export const TARGET_HOST = "clover-spb.ru";
export const ALLOWED_ACTIONS = new Set(["301", "404", "410"]);

export const PRODUCTION_COLUMNS = [
  "old_url",
  "old_path",
  "old_status",
  "old_type",
  "old_title",
  "old_h1",
  "target_url",
  "target_path",
  "target_status",
  "target_type",
  "confidence",
  "reason",
  "action",
];

const FORBIDDEN_TARGET_PREFIX = /^\/(?:lk|api|auth|login|vitrina)(?:\/|$)/i;
const PRIVATE_HOST =
  /^(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i;

/** Состояние-машина вместо split(','): сохраняет запятые и удвоенные кавычки внутри полей. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\n") {
      endRow();
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
    started = true;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

export function parseRedirectCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const row = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? "";
    });
    return row;
  });
}

export function serializeRedirectCsv(rows, columns = PRODUCTION_COLUMNS) {
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) {
    lines.push(columns.map((name) => escape(row[name])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Ключ только для поиска коллизий: регистр схемы/хоста, www, точечные сегменты, один хвостовой слэш. */
export function normalizedLegacyKey(oldUrl) {
  let url;
  try {
    url = new URL(String(oldUrl));
  } catch {
    return String(oldUrl || "").toLowerCase();
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = [];
  for (const part of url.pathname.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      segments.pop();
      continue;
    }
    segments.push(
      part
        .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
        .replace(/%(2D|2E|5F|7E)/gi, (m) =>
          decodeURIComponent(m.toUpperCase())
        )
    );
  }
  let path = `/${segments.join("/")}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return `${host}${path.toLowerCase()}${url.search}`;
}

function finding(code, row, message) {
  return { code, severity: "error", row, message };
}

export function validateProductionRows(rows) {
  const findings = [];
  const seen = new Map();

  rows.forEach((row, index) => {
    const at = { index, old_path: row.old_path, old_url: row.old_url };
    const action = String(row.action || "").trim();

    if (!ALLOWED_ACTIONS.has(action)) {
      findings.push(finding("INVALID_ACTION", at, `action="${action}"`));
    }

    if (!row.old_path || !row.old_path.startsWith("/")) {
      findings.push(finding("INVALID_OLD_PATH", at, `old_path="${row.old_path}"`));
    }
    if (row.old_path && /[?#]/.test(row.old_path)) {
      findings.push(
        finding("QUERY_IN_OLD_PATH", at, "решение по query не согласовано")
      );
    }

    let legacyHost = "";
    try {
      legacyHost = new URL(row.old_url).hostname.toLowerCase();
    } catch {
      findings.push(finding("INVALID_OLD_URL", at, `old_url="${row.old_url}"`));
    }
    if (legacyHost && !LEGACY_HOSTS.has(legacyHost)) {
      findings.push(finding("FOREIGN_OLD_HOST", at, `host="${legacyHost}"`));
    }

    const key = normalizedLegacyKey(row.old_url);
    if (seen.has(key)) {
      findings.push(
        finding("DUPLICATE_LEGACY_KEY", at, `совпадает со строкой ${seen.get(key)}`)
      );
    } else {
      seen.set(key, index);
    }

    if (action === "301") {
      if (!row.target_url) {
        findings.push(finding("MISSING_TARGET", at, "301 без target_url"));
        return;
      }
      let target;
      try {
        target = new URL(row.target_url);
      } catch {
        findings.push(finding("INVALID_TARGET", at, `target_url="${row.target_url}"`));
        return;
      }
      if (target.protocol !== "https:") {
        findings.push(finding("INVALID_TARGET", at, "цель не https"));
      }
      if (target.hostname.toLowerCase() !== TARGET_HOST) {
        findings.push(
          finding("INVALID_TARGET", at, `хост цели "${target.hostname}"`)
        );
      }
      if (PRIVATE_HOST.test(target.hostname)) {
        findings.push(finding("INVALID_TARGET", at, "приватный/внутренний хост"));
      }
      if (FORBIDDEN_TARGET_PREFIX.test(target.pathname)) {
        findings.push(
          finding("FORBIDDEN_TARGET", at, `непубличный путь "${target.pathname}"`)
        );
      }
      if (target.hash) {
        findings.push(finding("INVALID_TARGET", at, "цель содержит фрагмент"));
      }
    } else if (row.target_url) {
      findings.push(
        finding("UNEXPECTED_TARGET", at, `${action} не должен иметь target_url`)
      );
    }
  });

  return findings;
}

export function summarizeRows(rows) {
  const summary = { total: rows.length, "301": 0, "404": 0, "410": 0, other: 0 };
  for (const row of rows) {
    const action = String(row.action || "").trim();
    if (action in summary) summary[action] += 1;
    else summary.other += 1;
  }
  return summary;
}
