#!/usr/bin/env node
/**
 * Seed an anonymized SQLite fixture for portable SEO smoke. Never copies production DB.
 */
import { mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(here, "fixtures/storefront.json"), "utf8")
);
const dbPath =
  process.env.DB_PATH || path.join(here, "work", "fixture.sqlite");
mkdirSync(path.dirname(dbPath), { recursive: true });
if (existsSync(dbPath)) rmSync(dbPath);

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
  CREATE TABLE translation_entries (
    id TEXT PRIMARY KEY, namespace TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL, field_key TEXT NOT NULL, source_ru TEXT NOT NULL,
    source_hash TEXT NOT NULL, critical INTEGER NOT NULL
  );
  CREATE TABLE translation_values (
    entry_id TEXT NOT NULL, language_code TEXT NOT NULL, value TEXT NOT NULL,
    state TEXT NOT NULL, source_hash TEXT NOT NULL
  );
  CREATE TABLE product_translations (
    product_id TEXT NOT NULL, language_code TEXT NOT NULL, field_key TEXT NOT NULL,
    auto_value TEXT NOT NULL, auto_source_hash TEXT NOT NULL,
    manual_value TEXT NOT NULL, manual_source_hash TEXT NOT NULL
  );
`);
const insert = db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)");
insert.run("products", JSON.stringify([fixture.product]));
insert.run(
  "oneCProducts",
  JSON.stringify([{ id: fixture.product.oneCId, name: fixture.product.name }])
);
insert.run(
  "settings",
  JSON.stringify({
    storefrontShowOnlyLinked: true,
    storefrontInfoPages: [],
    storefrontHeroTitle: fixture.site.heroTitle,
    storefrontHeroLead: fixture.site.heroLead,
    storefrontHeroSlides: fixture.site.heroSlides,
  })
);
insert.run(
  "localizationSettings",
  JSON.stringify({
    enabledLanguages: fixture.langs,
    catalogVersion: fixture.catalogVersion,
  })
);
db.close();
console.log(JSON.stringify({ SEO_FIXTURE_DB: "OK", dbPath }));
