#!/usr/bin/env node
/**
 * Прогоняет полный набор legacy URL через изолированный nginx.
 *
 * Поднимает отдельный процесс nginx на loopback с временным префиксом и копией
 * конфигурации: активный production-nginx, его конфиги и сертификаты не трогаются.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRedirectCsv } from "./cloverspb-redirect-map.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const NGINX = "/usr/sbin/nginx";
const HTTP_PORT = Number(process.env.CLOVERSPB_TEST_HTTP_PORT || 18081);
const HTTPS_PORT = Number(process.env.CLOVERSPB_TEST_HTTPS_PORT || 18443);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function renderIsolatedVhost(source, root) {
  return source
    .replace(/listen\s+80\s*;/, `listen 127.0.0.1:${HTTP_PORT};`)
    .replace(/listen\s+443\s+ssl\s*;/, `listen 127.0.0.1:${HTTPS_PORT} ssl;`)
    .replace(
      /include\s+\/etc\/nginx\/legacy-domain\//g,
      `include ${root}/maps/`
    )
    .replace(/\/var\/log\/nginx\//g, `${root}/logs/`)
    .replace(/\/dehydrated\/certs\/cloverspb\.ru\//g, `${root}/tls/`)
    .replace(/\/var\/www\/dehydrated\//g, `${root}/acme/`);
}

async function request(pathname, { https = false, host = "cloverspb.ru" } = {}) {
  const base = https
    ? `https://127.0.0.1:${HTTPS_PORT}`
    : `http://127.0.0.1:${HTTP_PORT}`;
  const response = await fetch(`${base}${pathname}`, {
    method: "GET",
    redirect: "manual",
    headers: { Host: host },
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, location: response.headers.get("location") };
}

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), "cloverspb-nginx-"));
  const problems = [];
  let started = false;

  try {
    for (const dir of ["conf", "logs", "maps", "temp", "tls", "acme"]) {
      mkdirSync(path.join(root, dir), { recursive: true });
    }

    for (const name of ["cloverspb-path-redirects.map", "cloverspb-path-gone.map"]) {
      writeFileSync(
        path.join(root, "maps", name),
        readFileSync(path.join(repoRoot, "ops/nginx/legacy-domain", name), "utf8")
      );
    }

    const tls = run("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=cloverspb.ru",
      "-keyout", path.join(root, "tls/privkey.pem"),
      "-out", path.join(root, "tls/fullchain.pem"),
    ]);
    if (tls.status !== 0) throw new Error(`openssl: ${tls.stderr.slice(0, 200)}`);

    const vhost = renderIsolatedVhost(
      readFileSync(
        path.join(repoRoot, "ops/nginx/legacy-domain/cloverspb.ru.redirect.conf"),
        "utf8"
      ),
      root
    );
    writeFileSync(path.join(root, "conf/vhost.conf"), vhost);
    writeFileSync(
      path.join(root, "conf/nginx.conf"),
      [
        `pid ${root}/nginx.pid;`,
        `error_log ${root}/logs/main-error.log warn;`,
        "events { worker_connections 256; }",
        "http {",
        `  access_log ${root}/logs/main-access.log;`,
        `  client_body_temp_path ${root}/temp;`,
        `  proxy_temp_path ${root}/temp-proxy;`,
        `  fastcgi_temp_path ${root}/temp-fcgi;`,
        `  uwsgi_temp_path ${root}/temp-uwsgi;`,
        `  scgi_temp_path ${root}/temp-scgi;`,
        `  include ${root}/conf/vhost.conf;`,
        "}",
        "",
      ].join("\n")
    );

    const syntax = run(NGINX, ["-p", root, "-c", "conf/nginx.conf", "-t"]);
    console.log(syntax.stderr.trim());
    if (syntax.status !== 0) throw new Error("nginx -t failed");

    const start = run(NGINX, ["-p", root, "-c", "conf/nginx.conf"]);
    if (start.status !== 0) throw new Error(`nginx start: ${start.stderr.slice(0, 300)}`);
    started = true;
    await new Promise((resolve) => setTimeout(resolve, 400));

    const rows = parseRedirectCsv(
      readFileSync(path.join(repoRoot, "docs/seo-migration/cloverspb-production-map.csv"), "utf8")
    );

    const counts = { 301: 0, 410: 0, 404: 0 };
    for (const row of rows) {
      const result = await request(row.old_path);
      if (row.action === "301") {
        if (result.status !== 301) {
          problems.push(`${row.old_path}: ожидался 301, получен ${result.status}`);
          continue;
        }
        if (result.location !== row.target_url) {
          problems.push(
            `${row.old_path}: Location "${result.location}" вместо "${row.target_url}"`
          );
          continue;
        }
        if (/(^|\/\/)(www\.)?cloverspb\.ru/.test(result.location)) {
          problems.push(`${row.old_path}: цикл на старый домен`);
          continue;
        }
        counts[301] += 1;
      } else if (row.action === "410") {
        if (result.status !== 410) {
          problems.push(`${row.old_path}: ожидался 410, получен ${result.status}`);
          continue;
        }
        counts[410] += 1;
      } else {
        if (result.status !== 404) {
          problems.push(`${row.old_path}: ожидался 404, получен ${result.status}`);
          continue;
        }
        counts[404] += 1;
      }
    }

    const garbage = [
      "/wp-admin",
      "/random-garbage-path",
      "/magazin/product/does-not-exist-42",
      "/magazin",
      "/index.php",
      "/o-nas/extra",
    ];
    for (const item of garbage) {
      const result = await request(item);
      if (result.status !== 404) {
        problems.push(`мусорный URL ${item}: ожидался 404, получен ${result.status}`);
      }
      if (result.location) {
        problems.push(`мусорный URL ${item} редиректит на ${result.location}`);
      }
    }

    // nginx map сопоставляет регистронезависимо; коллизий по регистру в карте нет,
    // поэтому вариант написания ведёт на ту же каноническую цель, а не на главную.
    const upperCase = await request("/AKTSII");
    if (
      upperCase.status !== 301 ||
      upperCase.location !== "https://clover-spb.ru/aktsii"
    ) {
      problems.push(
        `вариант регистра /AKTSII: ${upperCase.status} ${upperCase.location}`
      );
    }

    const withQuery = await request("/o-nas?utm_source=yandex&utm_medium=cpc");
    if (
      withQuery.status !== 301 ||
      withQuery.location !== "https://clover-spb.ru/about?utm_source=yandex&utm_medium=cpc"
    ) {
      problems.push(
        `query не сохранён: ${withQuery.status} ${withQuery.location}`
      );
    }

    const acme = await request("/.well-known/acme-challenge/probe-token");
    if (acme.status === 301) {
      problems.push("ACME-путь попадает в редирект");
    }

    const wwwHost = await request("/dostavka", { host: "www.cloverspb.ru" });
    if (wwwHost.status !== 301 || wwwHost.location !== "https://clover-spb.ru/delivery") {
      problems.push(`www-хост: ${wwwHost.status} ${wwwHost.location}`);
    }

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    for (const sample of ["/", "/dostavka", "/registraciya", "/magazin/product/bumazhnaya-salfetka-100l"]) {
      const expected = rows.find((row) => row.old_path === sample);
      const result = await request(sample, { https: true });
      const wanted = expected.action === "301" ? 301 : Number(expected.action);
      if (result.status !== wanted) {
        problems.push(`https ${sample}: ожидался ${wanted}, получен ${result.status}`);
      }
      if (expected.action === "301" && result.location !== expected.target_url) {
        problems.push(`https ${sample}: Location "${result.location}"`);
      }
    }

    console.log(
      JSON.stringify(
        {
          checkedLegacyUrls: rows.length,
          http301: counts[301],
          http410: counts[410],
          http404: counts[404],
          garbageChecked: garbage.length,
          problems: problems.length,
        },
        null,
        1
      )
    );
  } catch (error) {
    problems.push(error.message);
  } finally {
    if (started) run(NGINX, ["-p", root, "-c", "conf/nginx.conf", "-s", "quit"]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    rmSync(root, { recursive: true, force: true });
  }

  if (problems.length) {
    console.error("verify-cloverspb-nginx-runtime: FAIL");
    for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("verify-cloverspb-nginx-runtime: PASS");
}

main();
