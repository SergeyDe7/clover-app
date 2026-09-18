const ALLOWED_FIELDS = Object.freeze([
  "event",
  "code",
  "status",
  "httpStatus",
  "upstreamStatus",
  "correlationId",
  "component",
]);

const SENSITIVE_KEY = /(?:password|passwd|secret|token|authorization|cookie|set-cookie|api[_-]?key|email|phone|address|payload|raw|body|html|stack|credential|endpoint|headers?|url|href|host)/iu;

const MAX_STRING = 180;

function normalizeLevel(level) {
  const value = String(level || "").trim().toLowerCase();
  if (value === "warn" || value === "warning") return "warn";
  if (value === "info") return "info";
  return "error";
}

function normalizeEvent(value) {
  const raw = String(value || "").trim();
  if (/^[a-z0-9][a-z0-9._-]{0,79}$/iu.test(raw)) return raw.toLowerCase();
  return "invalid.event";
}

function asSingleLine(value) {
  let text = String(value || "");
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === 0x1b) {
      out += " ";
      continue;
    }
    if (code <= 0x1f || code === 0x7f) {
      out += " ";
      continue;
    }
    out += ch;
  }
  return out.replace(/\s+/gu, " ").trim().slice(0, MAX_STRING);
}

export function redactValue(value, seen = new WeakSet()) {
  try {
    if (value == null) return undefined;
    if (typeof value === "string") return asSingleLine(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return String(value);
    if (typeof value === "symbol") return undefined;
    if (typeof value === "function") return undefined;
    if (value instanceof Error) {
      return {
        name: asSingleLine(value.name || "Error"),
        code: value.code ? asSingleLine(String(value.code)) : undefined,
        status: Number.isInteger(value.status) ? value.status : undefined,
      };
    }
    if (typeof value !== "object") return undefined;
    if (seen.has(value)) return "[cyclic]";
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => redactValue(item, seen));
    }
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        out[asSingleLine(key) || "field"] = "[redacted]";
        continue;
      }
      out[asSingleLine(key) || "field"] = redactValue(nested, seen);
    }
    return out;
  } catch {
    return "[unredactable]";
  }
}

function pickAllowed(fields) {
  const out = {};
  if (!fields || typeof fields !== "object") return out;
  for (const key of ALLOWED_FIELDS) {
    if (fields[key] === undefined) continue;
    out[key] = redactValue(fields[key]);
  }
  return out;
}

let writeLine = (line) => {
  process.stderr.write(`${line}\n`);
};

export function setSafeLogWriter(writer) {
  writeLine = typeof writer === "function"
    ? writer
    : (line) => {
      process.stderr.write(`${line}\n`);
    };
}

export function logSafe(level, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    level: normalizeLevel(level),
    ...pickAllowed(fields),
  };
  record.event = normalizeEvent(fields?.event);
  writeLine(JSON.stringify(record));
  return record;
}

export function logCaughtError(event, error, extra = {}) {
  const status = Number.isInteger(error?.status)
    ? error.status
    : Number.isInteger(error?.statusCode)
      ? error.statusCode
      : extra.status;
  return logSafe("error", {
    event,
    code: extra.code || error?.code,
    status,
    httpStatus: extra.httpStatus,
    correlationId: extra.correlationId || error?.correlationId,
    component: extra.component,
  });
}

export {
  ALLOWED_FIELDS,
  SENSITIVE_KEY,
};
