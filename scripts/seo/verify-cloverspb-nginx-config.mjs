#!/usr/bin/env node
/**
 * Структурная проверка redirect-only конфигурации старого домена.
 *
 * Ловит то, что nginx -t пропустит: proxy_pass в Clover, blanket-редирект на
 * новый домен, чужой сертификат, потерянный ACME-путь и отсутствие default 404.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

export function stripComments(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, ""))
    .join("\n");
}

export function verifyLegacyVhost(source) {
  const config = stripComments(source);
  const problems = [];

  const required = [
    [/listen\s+80\s*;/, "нет HTTP-блока listen 80"],
    [/listen\s+443\s+ssl\s*;/, "нет HTTPS-блока listen 443 ssl"],
    [/map\s+\$uri\s+\$cloverspb_redirect\s*\{/, "нет map редиректов"],
    [/map\s+\$uri\s+\$cloverspb_gone\s*\{/, "нет map 410"],
    [
      /include\s+\/etc\/nginx\/legacy-domain\/cloverspb-path-redirects\.map\s*;/,
      "не подключена карта редиректов",
    ],
    [
      /include\s+\/etc\/nginx\/legacy-domain\/cloverspb-path-gone\.map\s*;/,
      "не подключена карта 410",
    ],
    [/location\s+\^~\s+\/\.well-known\/acme-challenge\//, "нет исключения для ACME"],
    [
      /ssl_certificate\s+\/dehydrated\/certs\/cloverspb\.ru\/fullchain\.pem\s*;/,
      "нет сертификата старого домена",
    ],
    [
      /ssl_certificate_key\s+\/dehydrated\/certs\/cloverspb\.ru\/privkey\.pem\s*;/,
      "нет ключа сертификата старого домена",
    ],
  ];
  for (const [pattern, message] of required) {
    if (!pattern.test(config)) problems.push(message);
  }

  const forbidden = [
    [/proxy_pass/, "redirect-only vhost не должен проксировать"],
    [/:(4100|5273)\b/, "ссылка на runtime-порты Clover"],
    [
      /return\s+301\s+https:\/\/clover-spb\.ru\$request_uri/,
      "blanket-редирект переносит несуществующие пути",
    ],
    [/\/dehydrated\/certs\/clover-spb\.ru\//, "используется сертификат нового домена"],
    [/return\s+301\s+https:\/\/clover-spb\.ru\/\s*;/, "безусловный редирект на главную"],
    [/\$host/, "редирект зависит от Host вместо фиксированной цели"],
  ];
  for (const [pattern, message] of forbidden) {
    if (pattern.test(config)) problems.push(message);
  }

  const serverBlocks = config.split(/\bserver\s*\{/).slice(1);
  if (serverBlocks.length !== 2) {
    problems.push(`ожидалось 2 server-блока, найдено ${serverBlocks.length}`);
  }
  serverBlocks.forEach((block, index) => {
    if (!/server_name\s+cloverspb\.ru\s+www\.cloverspb\.ru\s*;/.test(block)) {
      problems.push(`server-блок ${index + 1}: неверный server_name`);
    }
    if (!/return\s+404\s*;/.test(block)) {
      problems.push(`server-блок ${index + 1}: нет default 404 для неизвестных путей`);
    }
    if (!/return\s+410\s*;/.test(block)) {
      problems.push(`server-блок ${index + 1}: нет обработки 410`);
    }
    const gone = block.indexOf("$cloverspb_gone");
    const redirect = block.indexOf("$cloverspb_redirect");
    if (gone === -1 || redirect === -1 || gone > redirect) {
      problems.push(`server-блок ${index + 1}: 410 должен проверяться до 301`);
    }
    if (!/return\s+301\s+\$cloverspb_redirect\$is_args\$args\s*;/.test(block)) {
      problems.push(`server-блок ${index + 1}: 301 не использует карту целей`);
    }
  });

  return problems;
}

function main() {
  const configPath =
    process.argv[2] ||
    path.join(repoRoot, "ops/nginx/legacy-domain/cloverspb.ru.redirect.conf");
  const problems = verifyLegacyVhost(readFileSync(configPath, "utf8"));
  if (problems.length) {
    console.error("verify-cloverspb-nginx-config: FAIL");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("verify-cloverspb-nginx-config: PASS");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
