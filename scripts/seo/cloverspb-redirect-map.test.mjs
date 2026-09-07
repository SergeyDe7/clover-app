import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRedirectCsv,
  serializeRedirectCsv,
  validateProductionRows,
  normalizedLegacyKey,
} from "./cloverspb-redirect-map.mjs";
import { buildProductionRows } from "./build-cloverspb-production-map.mjs";

test("parser keeps commas and doubled quotes", () => {
  const rows = parseRedirectCsv(
    `"old_path","reason"\n"/a","текст, с запятой и ""кавычками"""\n`
  );
  assert.equal(rows[0].old_path, "/a");
  assert.equal(rows[0].reason, 'текст, с запятой и "кавычками"');
});

test("round-trip serialize/parse", () => {
  const text = serializeRedirectCsv(
    [{ old_path: "/x", action: "410", reason: 'a,"b"' }],
    ["old_path", "action", "reason"]
  );
  const rows = parseRedirectCsv(text);
  assert.equal(rows[0].old_path, "/x");
  assert.equal(rows[0].reason, 'a,"b"');
});

test("collision key ignores www, trailing slash and host case", () => {
  assert.equal(
    normalizedLegacyKey("https://WWW.cloverspb.ru/O-Nas/"),
    normalizedLegacyKey("https://cloverspb.ru/o-nas")
  );
});

test("query string is not collapsed", () => {
  assert.notEqual(
    normalizedLegacyKey("https://cloverspb.ru/a?x=1"),
    normalizedLegacyKey("https://cloverspb.ru/a")
  );
});

test("rejects private and /lk 301 targets", () => {
  const findings = validateProductionRows([
    {
      old_url: "https://cloverspb.ru/a",
      old_path: "/a",
      action: "301",
      target_url: "http://192.168.155.15:4100/api/one-c",
    },
    {
      old_url: "https://cloverspb.ru/b",
      old_path: "/b",
      action: "301",
      target_url: "https://clover-spb.ru/lk",
    },
  ]);
  assert.ok(findings.some((item) => item.code === "INVALID_TARGET"));
  assert.ok(findings.some((item) => item.code === "FORBIDDEN_TARGET"));
});

test("KEEP_REVIEW cannot enter production", () => {
  const { errors } = buildProductionRows(
    [{ old_path: "/x", action: "410", old_url: "https://cloverspb.ru/x" }],
    [
      {
        old_path: "/x",
        source_action: "410",
        disposition: "KEEP_REVIEW",
        approved_target_url: "",
        evidence: "e",
        reviewer: "r",
        reviewed_at: "2026-09-07",
      },
    ]
  );
  assert.ok(errors.some((item) => item.includes("KEEP_REVIEW")));
});
