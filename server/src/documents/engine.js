import AdmZip from "adm-zip";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { documentError, DOCUMENT_MAX_BYTES } from "./storage.js";

const execute = promisify(execFile);
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const decodeXml = (value) => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, number) => String.fromCodePoint(number[0].toLowerCase() === "x" ? parseInt(number.slice(1), 16) : Number(number)))
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");

// Replace across text runs without rebuilding tables, styles or paragraph properties.
function replaceParagraph(xml, values) {
  const nodes = [...xml.matchAll(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g)];
  const texts = nodes.map((node) => decodeXml(node[2]));
  const combined = texts.join("");
  const matches = [...combined.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)];
  // Remove only a pure buyer contact label, never surrounding contractual text.
  const optionalLabels = [
    ['BUYER_PHONE', /^(?:Тел(?:ефон)?\.?)[ \t]*:[ \t]*(?=\{\{BUYER_PHONE\}\}[ \t]*$)/iu],
    ['BUYER_EMAIL', /^(?:e-mail|email|электронная почта)[ \t]*:[ \t]*(?=\{\{BUYER_EMAIL\}\}(?:\{\{BUYER_EDO\}\})?[ \t]*$)/iu],
  ];
  for (const [field, pattern] of optionalLabels) {
    if (values[field] === '') {
      const prefix=combined.match(pattern);
      if (prefix) matches.push({0:prefix[0],index:0,emptyContactLabel:true});
    }
  }
  for (const match of matches.sort((a,b)=>b.index-a.index)) {
    if (!match.emptyContactLabel && (!Object.hasOwn(values, match[1]) || typeof values[match[1]] !== "string")) {
      throw documentError("DOCUMENT_PLACEHOLDER", `Не заполнена переменная ${match[1]}.`);
    }
    const start = match.index;
    const end = start + match[0].length;
    let offset = 0;
    for (let i = 0; i < texts.length; i++) {
      const nodeStart = offset;
      const nodeEnd = offset + texts[i].length;
      offset = nodeEnd;
      if (nodeEnd <= start || nodeStart >= end) continue;
      texts[i] = texts[i].slice(0, Math.max(0, start - nodeStart)) +
        (nodeStart <= start ? (match.emptyContactLabel ? "" : values[match[1]]) : "") + texts[i].slice(Math.min(texts[i].length, end - nodeStart));
    }
  }
  let index = 0;
  return xml.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (_match, attrs) => {
    const preserved = attrs.includes("xml:space=") ? attrs : `${attrs} xml:space="preserve"`;
    return texts[index++].replace(/\r\n?/g, "\n").split("\n")
      .map(text => `<w:t${preserved}>${escapeXml(text)}</w:t>`).join("<w:br/>");
  });
}

const legalFormText = paragraph => [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(?:br|tab)\b[^>]*\/?\s*>/g)]
  .map(node => node[1] === undefined ? ' ' : decodeXml(node[1])).join('').normalize('NFC').replace(/\s+/gu,' ').trim();

// Generated output only: a pure redundant buyer form immediately before its name,
// within the same table cell. Existing versioned templates and other text stay intact.
function removeRedundantBuyerForm(xml, values) {
  const name = typeof values.BUYER_FULL_NAME === 'string' ? values.BUYER_FULL_NAME.replace(/\s+/gu,' ').trim() : '';
  const type = /^(?:ООО|Общество с ограниченной ответственностью)(?=\s|[«"'„“])/iu.test(name) ? 'ooo'
    : /^(?:ИП|Индивидуальный предприниматель)(?=\s|[«"'„“])/iu.test(name) ? 'ip' : null;
  if (!type) return xml;
  const forms = type === 'ooo' ? /^(?:ООО|Общество с ограниченной ответственностью)$/iu
    : /^(?:ИП|Индивидуальный предприниматель)$/iu;
  const cells = [];
  const remove = [];
  for (const token of xml.matchAll(/<w:tc\b[^>]*>|<\/w:tc\s*>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
    if (/^<w:tc\b/.test(token[0])) { cells.push({ previous: null }); continue; }
    if (/^<\/w:tc/.test(token[0])) { cells.pop(); continue; }
    const cell = cells.at(-1);
    if (!cell) continue;
    const previous = cell.previous;
    if (previous && legalFormText(token[0]) === '{{BUYER_FULL_NAME}}' &&
        xml.slice(previous.end,token.index).trim() === '' && forms.test(legalFormText(previous.xml)) &&
        !/<w:(?:drawing|object|pict|fldChar|instrText|footnoteReference|endnoteReference)\b/.test(previous.xml)) {
      remove.push(previous);
    }
    cell.previous = { xml: token[0], start: token.index, end: token.index + token[0].length };
  }
  for (const item of remove.reverse()) xml = xml.slice(0,item.start) + xml.slice(item.end);
  return xml;
}

export function renderDocx(templateBuffer, values, { previousClientTokens = [] } = {}) {
  if (!Buffer.isBuffer(templateBuffer) || templateBuffer.length > DOCUMENT_MAX_BYTES) throw documentError("TEMPLATE_INVALID", "Некорректный шаблон.");
  const zip = new AdmZip(templateBuffer);
  const entries = zip.getEntries();
  if (entries.length > 1000 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 30 * 1024 * 1024 ||
      entries.some((entry) => /vbaProject|embeddings\//i.test(entry.entryName))) {
    throw documentError("TEMPLATE_UNSAFE", "Шаблон содержит недопустимые вложения или превышает лимит.");
  }
  if (!zip.getEntry("word/document.xml")) throw documentError("TEMPLATE_INVALID", "Не найден текст DOCX.");
  for (const entry of entries.filter((item) => item.entryName.endsWith(".rels"))) {
    if (/TargetMode\s*=\s*["']External["']/i.test(entry.getData().toString("utf8"))) {
      throw documentError("TEMPLATE_EXTERNAL_LINK", "Шаблон содержит внешние связи. Нужна локальная копия без внешних ресурсов.");
    }
  }
  const visible = [];
  for (const entry of entries.filter((item) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(item.entryName))) {
    const source = entry.getData().toString("utf8");
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw documentError("TEMPLATE_UNSAFE", "Недопустимый XML.");
    const rendered = removeRedundantBuyerForm(source, values).replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => replaceParagraph(paragraph, values));
    const text = [...rendered.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/?\s*>/g)].map((node) => node[1] === undefined ? "\n" : decodeXml(node[1])).join("");
    if (/\{\{|\}\}/.test(text)) throw documentError("DOCUMENT_PLACEHOLDER", "В документе остались переменные шаблона.");
    if (previousClientTokens.some((token) => typeof token === "string" && token.length >= 3 && text.includes(token))) {
      throw documentError("DOCUMENT_PREVIOUS_CLIENT", "В документе остались данные исходного покупателя.");
    }
    visible.push(text);
    zip.updateFile(entry.entryName, Buffer.from(rendered));
  }
  return { buffer: zip.toBuffer(), text: visible.join("\n") };
}

// Explicit local adapter; no shell and no network. Failed conversion never returns a dummy PDF.
export function createDocumentConverter({ executable, tempRoot, timeout = 60000 } = {}) {
  return {
    available: Boolean(executable && path.isAbsolute(executable) && tempRoot),
    async convert(docx) {
      if (!this.available) throw documentError("DOCUMENT_CONVERTER_UNAVAILABLE", "Локальный конвертер DOCX → PDF не настроен.", 503);
      await mkdir(tempRoot, { recursive: true, mode: 0o700 });
      const directory = await mkdtemp(path.join(tempRoot, "convert-"));
      const relative = path.relative(path.resolve(tempRoot), path.resolve(directory));
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("CONVERTER_TEMP_PATH");
      const input = path.join(directory, "document.docx");
      try {
        await writeFile(input, docx, { mode: 0o600, flag: "wx" });
        await execute(executable, [`-env:UserInstallation=${new URL(`file:///${path.join(directory, "profile").replaceAll("\\", "/")}`).href}`, "--headless", "--convert-to", "pdf", "--outdir", directory, input],
          { timeout, maxBuffer: 1024 * 1024, windowsHide: true });
        const pdf = await readFile(path.join(directory, "document.pdf"));
        if (!pdf.length || pdf.length > DOCUMENT_MAX_BYTES || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("invalid output");
        return pdf;
    } catch {
        throw documentError("DOCUMENT_CONVERSION_FAILED", "Не удалось преобразовать DOCX в PDF. Файлы не опубликованы.", 503);
      } finally {
        // Only the unique directory created by this call, verified under its configured root.
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
