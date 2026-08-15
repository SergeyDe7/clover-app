/**
 * Автодополнение карточки товара при добавлении из 1С:
 * описание / состав / характеристики в стиле Clover + фото из открытых источников.
 *
 * Не перезаписывает уже заполненные поля. Сеть опциональна (PRODUCT_ENRICH_ENABLED).
 */
import { mkdirSync, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PRODUCT_PHOTO_SIZE = 800;
const USER_AGENT = (() => {
  const base = String(process.env.APP_PUBLIC_URL || process.env.CLOVER_PUBLIC_URL || "")
    .trim()
    .replace(/\/$/, "");
  const site = base || "https://clover-spb.ru";
  return `CloverProductEnrichment/1.0 (${site}; clover-order@mail.ru)`;
})();
/** Браузерный UA — DDG/магазины чаще отдают картинки. */
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function clean(value) {
  return String(value ?? "").trim();
}

/** Укорачиваем запрос для картинок: без фасовки «(250шт)» и лишних хвостов. */
function imageSearchQuery(name, _code = "") {
  let q = clean(name)
    .replace(/\([^)]*шт[^)]*\)/gi, " ")
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (q.length > 70) q = q.slice(0, 70).trim();
  return q;
}

/** Отсекаем инфографику, коллажи, наборы и кадры с доп. текстом/кол-вом. */
const BAD_IMAGE_HINT =
  /инфограф|infograph|схем[аые]|сертифик|отзыв|обзор|коллаж|collage|прайс|таблиц|чертеж|инструкц|баннер|banner|сравнен|comparison|размерн\s*ряд|упаковк[аи].{0,12}(текст|опис)|скрин|screenshot|мем\b|meme|логотип|иконк|icon\b|vector|clipart|шаблон|template|каталог\s*стр|листовк|реклам|промо|stock\s*photo\s*montage|before\s*after|до\s*и\s*после|набор\s*фото|gallery|мозаик|описан\w*|характеристик\w*|состав\s*продукт|способ\s*примен|как\s*использовать|с\s*текстом|with\s*text|caption|watermark|водяной\s*знак|ценник|руб\.|грн|арт\.|штрих.?код|barcode|этикетк[аи]\s*крупн|callout|плашк|набор\b|комплект|упаковка\s*из|pack\s*of|set\s*of|мультипак|assort|ассорти|несколько\s*товар|group\s*of|bunch\s*of|stack\s*of/i;

function isCleanImageCandidate(item = {}) {
  const blob = `${clean(item.title)} ${clean(item.url)} ${clean(item.thumbnail)}`;
  if (!blob) return false;
  if (BAD_IMAGE_HINT.test(blob)) return false;
  if (/sprite|1x1|pixel\.|favicon|logo[_-]?\d/i.test(blob)) return false;
  return true;
}

function candidatePreference(item = {}) {
  const blob = `${clean(item.title)} ${clean(item.url)}`.toLocaleLowerCase("ru-RU");
  let score = 0;
  if (/белый\s*фон|на\s*белом|white\s*background|isolated|cut\s*out|studio|packshot|предметн/i.test(blob)) {
    score += 45;
  }
  if (/один|single|1\s*шт|единичн|одиночн/i.test(blob)) score += 20;
  if (/фото\s*товар|product\s*photo|каталог/i.test(blob)) score += 12;
  if (/без\s*текст|no\s*text|clean\s*background/i.test(blob)) score += 18;
  if (BAD_IMAGE_HINT.test(blob)) score -= 100;
  if (/\b\d+\s*шт|\b\d+\s*pcs|набор|комплект/i.test(blob)) score -= 40;
  if (item.source === "duckduckgo-images") score += 5;
  return score;
}

function absolutizeUrl(url) {
  const value = clean(url);
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return "";
  return value;
}

function enabled() {
  const raw = String(process.env.PRODUCT_ENRICH_ENABLED || "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function emptyDetails(product = {}) {
  const details =
    product.storefrontDetails && typeof product.storefrontDetails === "object"
      ? product.storefrontDetails
      : {};
  return {
    description: clean(details.description),
    composition: clean(details.composition),
    characteristics: clean(details.characteristics),
  };
}

export function productNeedsWebEnrichment(product = {}) {
  const details = emptyDetails(product);
  return !details.description || !details.composition || !details.characteristics;
}

/** Разбор фактов из названия (номенклатура 1С). */
export function parseNameFacts(name) {
  const text = clean(name);
  const facts = [];

  const sizePair = text.match(
    /(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)\s*(мм|см|м)?/i
  );
  if (sizePair) {
    const unit = sizePair[3] || "мм";
    facts.push({
      key: "Размер",
      value: `${sizePair[1].replace(",", ".")}×${sizePair[2].replace(",", ".")} ${unit}`,
    });
  } else {
    const sizeOne = text.match(/(\d+(?:[.,]\d+)?)\s*(мм|см|мкм)\b/i);
    if (sizeOne) {
      facts.push({
        key: "Размер",
        value: `${sizeOne[1].replace(",", ".")} ${sizeOne[2]}`,
      });
    }
  }

  const packParen = text.match(/\((\d+)\s*(?:шт|штук)?\)/i);
  const packSlash = text.match(/\((\d+)\s*\/\s*(\d+)\)/);
  const packWord = text.match(/\b(\d+)\s*шт\b/i);
  if (packSlash) {
    facts.push({
      key: "Фасовка",
      value: `${packSlash[1]} шт. в упаковке / ${packSlash[2]} в коробе`,
    });
  } else if (packParen) {
    facts.push({ key: "Фасовка", value: `${packParen[1]} шт.` });
  } else if (packWord) {
    facts.push({ key: "Фасовка", value: `${packWord[1]} шт.` });
  }

  const weight =
    text.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(гр|г|кг)(?=$|[^\p{L}\p{N}])/iu) ||
    text.match(/(\d+(?:[.,]\d+)?)\s*(гр|г|кг)(?=$|[^\p{L}\p{N}])/iu);
  if (weight) {
    const value = weight[3]
      ? `${weight[1].replace(",", ".")}–${weight[2].replace(",", ".")} ${weight[3]}`
      : `${weight[1].replace(",", ".")} ${weight[2]}`;
    facts.push({ key: "Вес", value });
  }

  const volume = text.match(
    /(\d+(?:[.,]\d+)?)\s*(мл|л)(?=$|[^\p{L}\p{N}])/iu
  );
  if (volume && !facts.some((f) => f.key === "Объём")) {
    facts.push({
      key: "Объём",
      value: `${volume[1].replace(",", ".")} ${volume[2]}`,
    });
  }

  const color = text.match(
    /(красно-бел\p{L}*|черн(?:ый|ая|ые|ое)|бел(?:ый|ая|ые|ое)|красн(?:ый|ая|ые|ое)|син(?:ий|яя|ие|ее)|зел[её]н(?:ый|ая|ые|ое)|ж[её]лт(?:ый|ая|ые|ое)|сер(?:ый|ая|ые|ое)|прозр\p{L}*|биколор)/iu
  );
  if (color) {
    facts.push({ key: "Цвет", value: color[1] });
  }

  const sizeLetter = text.match(
    /(?:^|[\s(,])([XSML]{1,3}|XL|XXL|М|С|L)(?=[\s),]|$)/iu
  );
  if (sizeLetter && !facts.some((f) => f.key === "Размер")) {
    facts.push({ key: "Размер", value: sizeLetter[1] });
  }

  return facts;
}

function detectProductProfile(name, category) {
  const text = `${name} ${category}`.toLocaleLowerCase("ru-RU");
  const rules = [
    {
      id: "gloves",
      test: /перчатк/,
      audience: "кухни, клининга и производства",
      benefit:
        "Защищают руки при мойке, уборке и работе с химией: плотная посадка, уверенный хват, ресурс на интенсивную смену.",
      use: "для посуды, инвентаря и ежедневного клининга",
    },
    {
      id: "straws",
      test: /трубочк/,
      audience: "баров, кафе и ресторанов",
      benefit:
        "Держат форму в густых коктейлях и аккуратно смотрятся в бокале — удобный расходник для быстрого сервиса.",
      use: "для напитков, шейков и подачи на барной стойке",
    },
    {
      id: "broom",
      test: /веник|метл/,
      audience: "клининга, склада и хозяйственных зон",
      benefit:
        "Хорошо подметает пыль и мусор, удобен для ежедневной сухой уборки без лишней пыли в воздухе.",
      use: "для сухой уборки пола и прилегающих зон",
    },
    {
      id: "bottle",
      test: /бутылк/,
      audience: "HoReCa, кейтеринга и розлива",
      benefit:
        "Удобны для хранения и подачи напитков: прозрачный корпус и пробка помогают держать продукт аккуратно и гигиенично.",
      use: "для воды, соков, лимонадов и заготовок",
    },
    {
      id: "film",
      test: /стрейч|плёнк|пленк|фольг/,
      audience: "кухни и фасовки",
      benefit:
        "Сохраняют свежесть продуктов и ускоряют упаковку на смене — меньше потерь и аккуратнее хранение.",
      use: "для хранения, транспортировки и выкладки",
    },
    {
      id: "napkin",
      test: /салфетк|полотенц|вафельн|микрофибр|губка|тряпк|полотн/,
      audience: "кухни, сервиса и клининга",
      benefit:
        "Быстро убирают влагу и загрязнения, экономят время смены и поддерживают чистый вид рабочих зон.",
      use: "для сервировки, мойки и протирки поверхностей",
    },
    {
      id: "chem",
      test: /средство|шампун|мыло|гель|чист|пемолюкс|порошок|отбел/,
      audience: "клининга и санитарных зон",
      benefit:
        "Дают предсказуемый результат на регулярных уборках — удобная позиция для стандартных процедур объекта.",
      use: "для поверхностей, посуды и хозяйственных работ",
    },
    {
      id: "pack",
      test: /упаковк|контейнер|лоток|крышк|пакет|мешок/,
      audience: "кухни, доставки и склада",
      benefit:
        "Упрощают фасовку, хранение и выдачу заказов — меньше хаоса на смене и аккуратнее логистика.",
      use: "для упаковки готовых блюд, полуфабрикатов и запасов",
    },
    {
      id: "disposables",
      test: /однораз|стакан|тарелк|прибор|вилк|ложк|нож/,
      audience: "кафе, фуд-кортов и мероприятий",
      benefit:
        "Ускоряют сервис и снижают нагрузку на мойку — особенно удобны в пиковые часы и на вынос.",
      use: "для выдачи еды и напитков на вынос и на месте",
    },
  ];
  for (const rule of rules) {
    if (rule.test.test(text)) return rule;
  }
  return {
    id: "general",
    audience: "кафе, ресторанов, клининга и торговли",
    benefit:
      "Удобная позиция для регулярных закупок: помогает держать объект в рабочем ритме без срывов по расходникам.",
    use: "для ежедневных задач на объекте",
  };
}

function compositionHint(name, category) {
  const text = `${name} ${category}`.toLocaleLowerCase("ru-RU");
  if (/нитрил|nitrile/i.test(text)) {
    return "Нитрил — прочный синтетический материал, устойчивый к маслам и бытовой химии.";
  }
  if (/латекс|latex|резинов/i.test(text)) {
    return "Натуральный латекс / резина — эластичные, плотно облегают руку.";
  }
  if (/винил|vinyl|pvc|пвх/i.test(text)) {
    return "ПВХ (винил) — гигиеничный материал для контакта с продуктами и поверхностями.";
  }
  if (/стрейч|stretch|пвд|пнд|полиэтилен|пленк|плёнк/i.test(text)) {
    return "Полиэтилен пищевого назначения — гибкий, влагостойкий.";
  }
  if (/бумаг|картон|целлюл/i.test(text)) {
    return "Бумага / целлюлоза — для гигиеничного сервиса и уборки.";
  }
  if (/фольг/i.test(text)) {
    return "Алюминиевая фольга / ламинат — сохраняет температуру и свежесть.";
  }
  if (/стекл/i.test(text)) {
    return "Стекло — прозрачное, пригодно для хранения и подачи.";
  }
  if (/сорго/i.test(text)) {
    return "Натуральное сорго — плотный растительный ворс для сухой уборки.";
  }
  if (/микрофибр/i.test(text)) {
    return "Микрофибра — хорошо собирает пыль и влагу без разводов.";
  }
  if (/вафельн|текстил|ткан/i.test(text)) {
    return "Текстиль (хлопок / смешанное волокно) — для влажной и сухой уборки.";
  }
  if (/трубочк/i.test(text)) {
    return "Пищевой пластик — для холодных и прохладительных напитков.";
  }
  if (/хим|средство|шампун|мыло|гель|чист|пемолюкс/i.test(text)) {
    return "По составу производителя — ориентируйтесь на этикетку и рекомендации по применению.";
  }
  if (/бутылк/i.test(text)) {
    return "Прозрачный пищевой пластик / ПЭТ — лёгкий и удобный для розлива.";
  }
  return "Материалы соответствуют назначению позиции; точный состав — по запросу менеджеру Clover.";
}

function cleanBuyerSnippet(raw) {
  let text = clean(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length < 40) return "";
  // Мусор маркетплейсов / чужие языки / цены
  if (
    /грн|₴|купити|цін|эпицентр|ozon|wildberries|цена:|руб\.|доставка|артикул\s*продавца|скидк|акци[яи]/i.test(
      text
    )
  ) {
    return "";
  }
  if (/[іїєґ]/i.test(text) && !/[ыэёъ]/i.test(text)) return "";
  text = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 40 || text.length > 220) {
    return text.length > 220 ? `${text.slice(0, 217).trim()}…` : "";
  }
  return text;
}

function displayProductName(name) {
  return clean(name)
    .replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/g, "")
    .replace(/\s*\(\d+\s*(?:шт|штук)?\)\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatFactLines(facts) {
  return facts.map((f) =>
    typeof f === "string" ? f : `${f.key}: ${f.value}`
  );
}

/**
 * Описание и характеристики для покупателя (B2B / HoReCa), без мусора из поиска.
 */
export function buildCloverStyleDetails(product = {}, webSnippets = []) {
  const rawName = clean(product.name) || "Товар";
  const name = displayProductName(rawName) || rawName;
  const category = clean(product.category) || "Хозяйственные товары";
  const code = clean(product.code || product.oneCCode);
  const facts = parseNameFacts(rawName);
  const profile = detectProductProfile(rawName, category);
  const composition = compositionHint(rawName, category);

  const usefulSnippet = (Array.isArray(webSnippets) ? webSnippets : [])
    .map((item) => cleanBuyerSnippet(item.snippet || item.title))
    .find(Boolean);

  const factHint = facts
    .slice(0, 3)
    .map((f) => `${f.key.toLocaleLowerCase("ru-RU")} ${String(f.value).replace(/\.$/, "")}`)
    .join(", ");

  const lead = `${name} — практичный выбор для ${profile.audience}.`;
  const body = `${profile.benefit} Подходит ${profile.use}.`;
  const spec = factHint
    ? `Ключевые параметры: ${factHint}.`
    : `Категория в каталоге Clover: ${category}.`;
  const trust =
    "Заказывайте в Clover для стабильных поставок на объект — наличие и условия отгрузки подтвердит менеджер.";
  const extra = usefulSnippet
    ? `По назначению: ${usefulSnippet.replace(/\.\s*$/, "")}.`
    : "";

  const description = [lead, body, spec, extra, trust]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const characteristicLines = [
    ...formatFactLines(facts),
    category ? `Категория: ${category}` : "",
    code ? `Артикул: ${code}` : "",
    `Назначение: ${profile.use}`,
    "Поставка: со склада Clover или под заказ — по согласованию",
  ].filter(Boolean);

  return {
    description,
    composition,
    characteristics: characteristicLines.join("\n"),
  };
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** DuckDuckGo Instant Answer + HTML snippets (без ключа). */
export async function searchWebForProduct(query) {
  const q = clean(query);
  if (!q) return [];
  const hits = [];

  try {
    const ddg = await fetchJson(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`
    );
    const abstract = clean(ddg?.AbstractText || ddg?.Abstract);
    if (abstract) {
      hits.push({
        title: clean(ddg.Heading) || q,
        snippet: abstract,
        url: clean(ddg.AbstractURL),
        image: absolutizeUrl(ddg.Image),
        source: "duckduckgo",
      });
    }
    for (const topic of Array.isArray(ddg?.RelatedTopics) ? ddg.RelatedTopics : []) {
      const nested = Array.isArray(topic?.Topics) ? topic.Topics : [topic];
      for (const entry of nested) {
        const text = clean(entry?.Text || entry?.Name);
        if (!text) continue;
        hits.push({
          title: text.slice(0, 80),
          snippet: text,
          url: clean(entry?.FirstURL),
          source: "duckduckgo",
        });
        if (hits.length >= 8) break;
      }
      if (hits.length >= 8) break;
    }
  } catch {
    // ignore
  }

  try {
    const html = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${q} характеристики`)}`
    );
    const re =
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = re.exec(html)) && hits.length < 10) {
      const raw = clean((match[1] || match[2] || "").replace(/<[^>]+>/g, " "));
      if (raw.length < 20) continue;
      hits.push({
        title: raw.slice(0, 90),
        snippet: raw.slice(0, 320),
        url: "",
        source: "duckduckgo-html",
      });
    }
  } catch {
    // ignore
  }

  try {
    const wiki = await fetchJson(
      `https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        q
      )}&limit=3&namespace=0&format=json`
    );
    const titles = Array.isArray(wiki?.[1]) ? wiki[1] : [];
    const descs = Array.isArray(wiki?.[2]) ? wiki[2] : [];
    const urls = Array.isArray(wiki?.[3]) ? wiki[3] : [];
    for (let i = 0; i < titles.length; i += 1) {
      hits.push({
        title: clean(titles[i]),
        snippet: clean(descs[i]) || clean(titles[i]),
        url: clean(urls[i]),
        source: "wikipedia",
      });
    }
  } catch {
    // ignore
  }

  return hits.slice(0, 10);
}

/** DuckDuckGo Images (i.js) — лучше всего находит фото российских товаров. */
async function searchDuckDuckGoImages(query) {
  const q = clean(query);
  if (!q) return [];
  try {
    const page = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
        signal: AbortSignal.timeout(12000),
      }
    );
    const html = await page.text();
    const vqdMatch =
      html.match(/vqd=["']([^"']+)["']/) ||
      html.match(/vqd=([\d-]+)/) ||
      html.match(/vqd['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
    const vqd = clean(vqdMatch?.[1]);
    if (!vqd) return [];

    const api = `https://duckduckgo.com/i.js?l=ru-ru&o=json&q=${encodeURIComponent(
      q
    )}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`;
    const response = await fetch(api, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
        Referer: "https://duckduckgo.com/",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map((item) => ({
        url: absolutizeUrl(item.image || item.url),
        thumbnail: absolutizeUrl(item.thumbnail),
        title: clean(item.title),
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        source: "duckduckgo-images",
      }))
      .filter((item) => item.url && isCleanImageCandidate(item));
  } catch {
    return [];
  }
}

/** Картинки: студийные запросы (белый фон) → Openverse/Wikimedia как запас. */
export async function searchProductImages(query, webHits = []) {
  const base = clean(query);
  const found = [];
  const seen = new Set();

  const push = (item) => {
    if (!isCleanImageCandidate(item)) return;
    const url = clean(item.url || item.thumbnail);
    if (!url || seen.has(url)) return;
    // Баннерные пропорции из метаданных DDG
    const w = Number(item.width) || 0;
    const h = Number(item.height) || 0;
    if (w > 0 && h > 0) {
      const ar = w / h;
      if (ar > 2.3 || ar < 0.42) return;
    }
    seen.add(url);
    found.push({ ...item, url, preference: candidatePreference(item) });
  };

  for (const hit of Array.isArray(webHits) ? webHits : []) {
    if (clean(hit.image)) {
      push({
        url: clean(hit.image),
        thumbnail: clean(hit.image),
        title: clean(hit.title),
        source: "duckduckgo-abstract",
      });
    }
  }

  if (base) {
    const queries = [
      `${base} белый фон 1 шт packshot`,
      `${base} предметная съёмка один товар`,
      `${base} isolated product white background single`,
      `${base} на белом фоне каталог`,
      base,
    ];
    for (const q of queries) {
      for (const item of await searchDuckDuckGoImages(q)) push(item);
      if (found.length >= 40) break;
    }

    try {
      const data = await fetchJson(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
          `${base} white background`
        )}&page_size=8&mature=false`,
        7000
      );
      const results = Array.isArray(data?.results) ? data.results : [];
      for (const item of results) {
        push({
          url: clean(item.url || item.thumbnail),
          thumbnail: clean(item.thumbnail),
          title: clean(item.title),
          source: "openverse",
        });
      }
    } catch {
      // ignore
    }

    try {
      const commons = await fetchJson(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          `${base} white background`
        )}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`,
        8000
      );
      const pages = commons?.query?.pages || {};
      for (const page of Object.values(pages)) {
        const info = page?.imageinfo?.[0] || {};
        const url = clean(info.thumburl || info.url).split("?")[0];
        if (!url) continue;
        push({
          url,
          thumbnail: url,
          title: clean(page.title),
          source: "wikimedia",
        });
      }
    } catch {
      // ignore
    }
  }

  return found
    .filter((item) => item.url || item.thumbnail)
    .sort((a, b) => (b.preference || 0) - (a.preference || 0));
}

async function downloadBinary(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let referer = "https://duckduckgo.com/";
  try {
    referer = new URL(url).origin + "/";
  } catch {
    // keep default
  }
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: referer,
      },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/") && !type.includes("octet-stream")) {
      throw new Error(`Ответ не является изображением (${type || "unknown"}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1024 || buffer.length > 8 * 1024 * 1024) {
      throw new Error("Неподходящий размер файла изображения.");
    }
    return { buffer, contentType: type.startsWith("image/") ? type : "image/jpeg" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ищем «лишний» текст вне товара: подписи, плашки, «100 шт», описания.
 * Текст на этикетке упаковки в центре обычно ок.
 */
async function detectExtraTextOverlay(buffer) {
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default;
  const size = 160;
  const { data } = await sharp(buffer)
    .rotate()
    .resize(size, size, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rowStats = [];
  for (let y = 0; y < size; y += 1) {
    let runs = 0;
    let inRun = false;
    let ink = 0;
    let bright = 0;
    let spanLeft = size;
    let spanRight = -1;
    for (let x = 0; x < size; x += 1) {
      const v = data[y * size + x];
      if (v > 215) bright += 1;
      if (v < 105) {
        ink += 1;
        if (x < spanLeft) spanLeft = x;
        if (x > spanRight) spanRight = x;
        if (!inRun) {
          runs += 1;
          inRun = true;
        }
      } else {
        inRun = false;
      }
    }
    const span = spanRight >= spanLeft ? spanRight - spanLeft + 1 : 0;
    rowStats.push({
      runs,
      inkRatio: ink / size,
      brightRatio: bright / size,
      spanRatio: span / size,
    });
  }

  const isCaptionRow = (r) =>
    r.brightRatio > 0.5 &&
    r.runs >= 4 &&
    r.runs <= 52 &&
    r.inkRatio >= 0.012 &&
    r.inkRatio <= 0.3 &&
    r.spanRatio >= 0.4;

  let topCaption = 0;
  let bottomCaption = 0;
  let midCaption = 0;
  let fullWidthTextRows = 0;
  for (let y = 0; y < size; y += 1) {
    const r = rowStats[y];
    if (
      r.brightRatio > 0.55 &&
      r.runs >= 8 &&
      r.spanRatio >= 0.7 &&
      r.inkRatio > 0.02 &&
      r.inkRatio < 0.25
    ) {
      fullWidthTextRows += 1;
    }
    if (!isCaptionRow(r)) continue;
    if (y < size * 0.22) topCaption += 1;
    else if (y > size * 0.76) bottomCaption += 1;
    else if (y < size * 0.35 || y > size * 0.65) midCaption += 1;
  }

  let sideInkCols = 0;
  const scanSide = (x0, x1) => {
    for (let x = x0; x < x1; x += 1) {
      let ink = 0;
      let bright = 0;
      let runs = 0;
      let inRun = false;
      for (let y = 0; y < size; y += 1) {
        const v = data[y * size + x];
        if (v > 215) bright += 1;
        if (v < 105) {
          ink += 1;
          if (!inRun) {
            runs += 1;
            inRun = true;
          }
        } else inRun = false;
      }
      if (bright / size > 0.5 && runs >= 7 && ink / size > 0.035 && ink / size < 0.4) {
        sideInkCols += 1;
      }
    }
  };
  scanSide(0, 20);
  scanSide(size - 20, size);

  const captionRows = topCaption + bottomCaption;
  const reject =
    topCaption >= 4 ||
    bottomCaption >= 5 ||
    captionRows >= 7 ||
    fullWidthTextRows >= 8 ||
    (bottomCaption >= 3 && midCaption >= 2) ||
    sideInkCols >= 6;

  return {
    reject,
    topCaption,
    bottomCaption,
    midCaption,
    sideInkCols,
    captionRows,
    fullWidthTextRows,
  };
}

/**
 * Считаем отдельные объекты на белом фоне.
 * Нужен ровно один крупный предмет (как packshot Пемолюкс), не набор из нескольких шт.
 */
async function detectMultipleItems(buffer) {
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default;
  const size = 120;
  const { data } = await sharp(buffer)
    .rotate()
    .resize(size, size, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const isFg = (i) => data[i] < 236;
  const visited = new Uint8Array(size * size);
  const components = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const start = y * size + x;
      if (visited[start] || !isFg(start)) continue;
      const stack = [start];
      visited[start] = 1;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length) {
        const idx = stack.pop();
        area += 1;
        const cx = idx % size;
        const cy = (idx / size) | 0;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const candidates = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of candidates) {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const n = ny * size + nx;
          if (visited[n] || !isFg(n)) continue;
          visited[n] = 1;
          stack.push(n);
        }
      }
      components.push({
        area,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        minX,
        maxX,
        minY,
        maxY,
      });
    }
  }

  const minArea = Math.floor(size * size * 0.018); // ~2% кадра
  const significant = components
    .filter((c) => c.area >= minArea)
    .sort((a, b) => b.area - a.area);

  const main = significant[0] || null;
  const extras = significant.slice(1).filter((c) => {
    if (!main) return true;
    // мелкий «шум» рядом с основным игнорируем; отдельные объекты — нет
    const areaRatio = c.area / main.area;
    if (areaRatio < 0.12) return false;
    const gapX = Math.max(0, Math.max(main.minX - c.maxX, c.minX - main.maxX));
    const gapY = Math.max(0, Math.max(main.minY - c.maxY, c.minY - main.maxY));
    const separated = gapX > 4 || gapY > 4;
    return separated || areaRatio > 0.28;
  });

  const itemCount = main ? 1 + extras.length : 0;
  return {
    reject: itemCount > 1,
    itemCount,
    mainArea: main?.area || 0,
    extras: extras.length,
  };
}

/**
 * Оценка: студийный packshot — 1 товар, белый фон, без пересвета и лишних надписей.
 */
async function analyzeStudioFitness(buffer) {
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default;
  const meta = await sharp(buffer).rotate().metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < 240 || h < 240) {
    return { score: 0, reject: true, reason: "tiny" };
  }
  const ar = w / h;
  if (ar > 2.0 || ar < 0.5) {
    return { score: 0, reject: true, reason: "banner" };
  }

  const overlay = await detectExtraTextOverlay(buffer);
  if (overlay.reject) {
    return {
      score: 0,
      reject: true,
      reason: "text-overlay",
      ...overlay,
    };
  }

  const multi = await detectMultipleItems(buffer);
  if (multi.reject) {
    return {
      score: 0,
      reject: true,
      reason: "multi-item",
      itemCount: multi.itemCount,
    };
  }

  const size = 96;
  const { data } = await sharp(buffer)
    .rotate()
    .resize(size, size, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const lumAt = (x, y) => {
    const i = (y * size + x) * 3;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  const satAt = (x, y) => {
    const i = (y * size + x) * 3;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };

  const blockStats = (x0, y0, bw, bh) => {
    let white = 0;
    let clipped = 0;
    let n = 0;
    let sum = 0;
    for (let y = y0; y < y0 + bh; y += 1) {
      for (let x = x0; x < x0 + bw; x += 1) {
        const lum = lumAt(x, y);
        const sat = satAt(x, y);
        n += 1;
        sum += lum;
        if (lum > 238 && sat < 0.12) white += 1;
        if (lum >= 252) clipped += 1;
      }
    }
    return {
      whiteRatio: white / n,
      clippedRatio: clipped / n,
      meanLum: sum / n,
    };
  };

  const corners = [
    blockStats(0, 0, 12, 12),
    blockStats(size - 12, 0, 12, 12),
    blockStats(0, size - 12, 12, 12),
    blockStats(size - 12, size - 12, 12, 12),
  ];
  const avgWhite = corners.reduce((sum, c) => sum + c.whiteRatio, 0) / 4;
  const whiteCorners = corners.filter((c) => c.whiteRatio > 0.65).length;
  const center = blockStats(24, 24, 48, 48);
  if (center.whiteRatio > 0.9) {
    return { score: 0, reject: true, reason: "empty" };
  }
  if (center.clippedRatio > 0.2 || (center.meanLum > 228 && center.clippedRatio > 0.08)) {
    return {
      score: 0,
      reject: true,
      reason: "overexposed",
      clippedRatio: center.clippedRatio,
      meanLum: center.meanLum,
    };
  }
  // Как в референсе: углы почти белые.
  if (avgWhite < 0.35 || whiteCorners < 2) {
    return { score: 0, reject: true, reason: "busy-bg", avgWhite, whiteCorners };
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let edges = 0;
  for (let y = 24; y < 72; y += 1) {
    for (let x = 24; x < 72; x += 1) {
      const lum = lumAt(x, y);
      sum += lum;
      sumSq += lum * lum;
      n += 1;
      const d =
        Math.abs(lum - lumAt(x - 1, y)) + Math.abs(lum - lumAt(x, y - 1));
      if (d > 28) edges += 1;
    }
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const std = Math.sqrt(variance);
  const edgeRatio = edges / n;
  if (std < 14) {
    return { score: 0, reject: true, reason: "flat", std };
  }
  if (edgeRatio > 0.4) {
    return { score: 0, reject: true, reason: "busy", edgeRatio };
  }

  let score = 24;
  score += avgWhite * 40;
  score += whiteCorners * 8;
  score += Math.min(std, 55) * 0.55;
  score += Math.min(edgeRatio, 0.26) * 36;
  score += (1 - Math.min(Math.abs(1 - ar), 1)) * 14;
  score += Math.min(w, h) >= 700 ? 12 : Math.min(w, h) >= 450 ? 6 : 0;
  score -= center.clippedRatio * 130;
  score -= Math.max(0, center.meanLum - 200) * 0.4;
  score -= overlay.captionRows * 2.2;
  score -= overlay.sideInkCols * 1.5;
  score -= overlay.fullWidthTextRows * 1.5;
  if (multi.itemCount === 1) score += 12;

  return {
    score,
    reject: score < 36,
    avgWhite,
    whiteCorners,
    edgeRatio,
    clippedRatio: center.clippedRatio,
    meanLum: center.meanLum,
    std,
    ar,
    captionRows: overlay.captionRows,
    itemCount: multi.itemCount,
  };
}

/**
 * Единый стиль Clover: белый фон как у каталожных фото, без выбеливания товара.
 */
async function renderCloverStudioPhoto(buffer) {
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default;

  // Сначала мягко выправляем экспозицию исходника (без выбивания в белое).
  const prepared = await sharp(buffer)
    .rotate()
    .removeAlpha()
    .modulate({ brightness: 0.98, saturation: 1.06 })
    .linear(1.08, -8)
    .toBuffer();

  const rotated = await sharp(prepared)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = rotated;
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const visited = new Uint8Array(width * height);

  // Только почти белый низкоконтрастный фон — не трогаем блики на упаковке.
  const isBgCandidate = (offset) => {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max === 0 ? 0 : (max - min) / max;
    return lum >= 232 && sat <= 0.1;
  };

  const stack = [];
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const offset = idx * channels;
    if (!isBgCandidate(offset)) return;
    visited[idx] = 1;
    stack.push(idx);
  };

  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 40))) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 40))) {
    seed(0, y);
    seed(width - 1, y);
  }

  while (stack.length) {
    const idx = stack.pop();
    const x = idx % width;
    const y = (idx / width) | 0;
    seed(x + 1, y);
    seed(x - 1, y);
    seed(x, y + 1);
    seed(x, y - 1);
  }

  for (let idx = 0; idx < width * height; idx += 1) {
    if (!visited[idx]) continue;
    const offset = idx * channels;
    out[offset] = 255;
    out[offset + 1] = 255;
    out[offset + 2] = 255;
    if (channels === 4) out[offset + 3] = 255;
  }

  const cleaned = await sharp(out, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();

  let productBuf;
  try {
    productBuf = await sharp(cleaned)
      .trim({
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        threshold: 12,
      })
      .toBuffer();
  } catch {
    productBuf = cleaned;
  }

  const pad = 0.1;
  const inner = Math.max(160, Math.round(PRODUCT_PHOTO_SIZE * (1 - 2 * pad)));
  const product = await sharp(productBuf)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: "lanczos3",
    })
    .sharpen({ sigma: 0.7, m1: 0.6, m2: 0.2 })
    .toBuffer();

  return sharp({
    create: {
      width: PRODUCT_PHOTO_SIZE,
      height: PRODUCT_PHOTO_SIZE,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: product, gravity: "centre" }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/**
 * Сохраняет фото в uploads: только подходящие кадры → квадрат 800×800, белый фон Clover.
 * Возвращает путь и score качества (чем выше — тем ближе к студийному референсу).
 */
export async function storeProductImageFromUrl(
  imageUrl,
  productId,
  uploadsDirectory,
  { requireStudio = true, minScore = 28 } = {}
) {
  const { buffer } = await downloadBinary(imageUrl);
  const fitness = await analyzeStudioFitness(buffer);
  if (requireStudio && (fitness.reject || fitness.score < minScore)) {
    throw new Error(
      `unsuitable photo (${fitness.reason || "score"}:${Math.round(fitness.score || 0)})`
    );
  }
  mkdirSync(uploadsDirectory, { recursive: true });
  const base = `product-${productId}-${Date.now()}-${randomUUID()}`;

  let outBuffer;
  try {
    outBuffer = await renderCloverStudioPhoto(buffer);
    // Повторная проверка: после обработки не должно быть пересвета/подписей.
    const after = await analyzeStudioFitness(outBuffer);
    if (
      requireStudio &&
      (after.reason === "overexposed" ||
        after.reason === "text-overlay" ||
        after.reason === "multi-item")
    ) {
      throw new Error(`unsuitable photo (${after.reason}-after)`);
    }
  } catch (error) {
    if (requireStudio) throw error;
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    outBuffer = await sharp(buffer)
      .rotate()
      .modulate({ brightness: 0.97, saturation: 1.05 })
      .linear(1.06, -6)
      .resize(PRODUCT_PHOTO_SIZE, PRODUCT_PHOTO_SIZE, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .sharpen({ sigma: 0.6 })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }

  const filename = `${base}.jpg`;
  const filePath = path.join(uploadsDirectory, filename);
  await fs.writeFile(filePath, outBuffer);
  return {
    path: `/uploads/${filename}`,
    score: fitness.score || 0,
  };
}

/**
 * Синхронно по смыслу async: дополняет пустые поля карточки.
 */
export async function enrichProductCardFromWeb(
  product,
  { uploadsDirectory, forceRefreshPhoto = false, forceRefreshCopy = false } = {}
) {
  if (!enabled() || !product?.id) {
    return { product, changed: false, skipped: true };
  }
  const working = {
    ...product,
    ...(forceRefreshPhoto ? { imageUrl: "", imageUpdatedAt: "" } : {}),
    ...(forceRefreshCopy
      ? {
          storefrontDetails: {
            description: "",
            composition: "",
            characteristics: "",
          },
        }
      : {}),
  };
  if (
    !forceRefreshPhoto &&
    !forceRefreshCopy &&
    !productNeedsWebEnrichment(working)
  ) {
    return { product, changed: false, skipped: true };
  }

  const query = [clean(working.name), clean(working.code)].filter(Boolean).join(" ");
  const photoQuery = imageSearchQuery(working.name, working.code) || query;
  let hits = [];
  // Фото из сети — только по явному forceRefreshPhoto. Тексты пишем копирайтом Clover.
  if (forceRefreshPhoto && !clean(working.imageUrl)) {
    try {
      hits = await searchWebForProduct(query);
    } catch {
      hits = [];
    }
  }

  const current = emptyDetails(working);
  const generated = buildCloverStyleDetails(working, hits);
  const nextDetails = {
    description:
      forceRefreshCopy || !current.description
        ? generated.description
        : current.description,
    composition:
      forceRefreshCopy || !current.composition
        ? generated.composition
        : current.composition,
    characteristics:
      forceRefreshCopy || !current.characteristics
        ? generated.characteristics
        : current.characteristics,
  };

  let imageUrl = clean(working.imageUrl);
  let imageUpdatedAt = working.imageUpdatedAt || "";
  if (!imageUrl && forceRefreshPhoto && uploadsDirectory) {
    try {
      const images = await searchProductImages(photoQuery, hits);
      let best = null;
      let bestScore = -1;
      let fallback = null;
      for (const candidate of images.slice(0, 36)) {
        const src = candidate.url || candidate.thumbnail;
        if (!src) continue;
        try {
          const saved = await storeProductImageFromUrl(
            src,
            working.id,
            uploadsDirectory,
            { requireStudio: true, minScore: 40 }
          );
          const pathValue = typeof saved === "string" ? saved : saved.path;
          const score = typeof saved === "string" ? 30 : saved.score;
          if (score > bestScore) {
            // удалять предыдущие худшие файлы не обязательно — перезапишем ссылку
            best = pathValue;
            bestScore = score;
          }
          // достаточно сильный кадр — берём сразу
          if (score >= 55) break;
        } catch {
          if (!fallback) fallback = src;
        }
      }
      if (best) {
        imageUrl = best;
        imageUpdatedAt = new Date().toISOString();
      } else if (fallback) {
        try {
          const saved = await storeProductImageFromUrl(
            fallback,
            working.id,
            uploadsDirectory,
            { requireStudio: false }
          );
          imageUrl = typeof saved === "string" ? saved : saved.path;
          imageUpdatedAt = new Date().toISOString();
        } catch {
          // без фото
        }
      }
    } catch {
      // без фото
    }
  }

  const next = {
    ...working,
    storefrontDetails: nextDetails,
    ...(imageUrl
      ? { imageUrl, imageUpdatedAt: imageUpdatedAt || new Date().toISOString() }
      : { imageUrl: "", imageUpdatedAt: "" }),
    enrichmentStatus: imageUrl ? "done" : "partial",
    enrichmentUpdatedAt: new Date().toISOString(),
  };

  const changed =
    nextDetails.description !== emptyDetails(product).description ||
    nextDetails.composition !== emptyDetails(product).composition ||
    nextDetails.characteristics !== emptyDetails(product).characteristics ||
    Boolean(imageUrl && imageUrl !== clean(product.imageUrl)) ||
    (forceRefreshPhoto && Boolean(imageUrl)) ||
    forceRefreshCopy;

  return { product: next, changed, skipped: false, hits: hits.length };
}

const enrichQueue = [];
let enrichActive = 0;
const ENRICH_CONCURRENCY = 2;

function pumpEnrichQueue() {
  while (enrichActive < ENRICH_CONCURRENCY && enrichQueue.length) {
    const job = enrichQueue.shift();
    enrichActive += 1;
    Promise.resolve()
      .then(() => job())
      .catch(() => {})
      .finally(() => {
        enrichActive -= 1;
        pumpEnrichQueue();
      });
  }
}

/**
 * Фоновая очередь: после from-catalog не блокируем Excel/ручное добавление.
 */
export function scheduleProductWebEnrichment({
  productId,
  getProducts,
  setProducts,
  uploadsDirectory,
  onDone,
  forceRefreshPhoto = false,
  forceRefreshCopy = false,
}) {
  if (!enabled()) return;
  const id = String(productId || "").trim();
  if (!id) return;

  enrichQueue.push(async () => {
    const products = getProducts();
    const current = (Array.isArray(products) ? products : []).find(
      (item) => String(item.id) === id
    );
    if (!current) return;
    if (
      !forceRefreshPhoto &&
      !forceRefreshCopy &&
      !productNeedsWebEnrichment(current)
    ) {
      return;
    }

    // Не обнуляем фото/тексты в БД до успеха: иначе сбой enrichment оставляет пустую карточку
    // и параллельные правки менеджера не теряются из‑за stale snapshot.
    const pending = {
      ...current,
      enrichmentStatus: "pending",
    };
    setProducts(
      (Array.isArray(products) ? products : []).map((item) =>
        String(item.id) === id ? pending : item
      )
    );

    const result = await enrichProductCardFromWeb(current, {
      uploadsDirectory,
      forceRefreshPhoto,
      forceRefreshCopy,
    });

    const applyEnrichmentFields = (live, enriched) => {
      const liveDetails = emptyDetails(live);
      const got = emptyDetails(enriched);
      const prevImage = clean(live.imageUrl);
      const gotImage = clean(enriched?.imageUrl);
      // Force: берём новое фото только если оно реально нашлось, иначе оставляем прежнее.
      const nextImage = forceRefreshPhoto
        ? gotImage || prevImage
        : prevImage || gotImage;
      const nextDetails = forceRefreshCopy
        ? {
            description: got.description || liveDetails.description,
            composition: got.composition || liveDetails.composition,
            characteristics: got.characteristics || liveDetails.characteristics,
          }
        : {
            description: liveDetails.description || got.description,
            composition: liveDetails.composition || got.composition,
            characteristics: liveDetails.characteristics || got.characteristics,
          };
      const imageChanged = Boolean(nextImage && nextImage !== prevImage);
      return {
        ...live,
        storefrontDetails: nextDetails,
        imageUrl: nextImage,
        imageUpdatedAt: nextImage
          ? imageChanged
            ? enriched.imageUpdatedAt || new Date().toISOString()
            : live.imageUpdatedAt || new Date().toISOString()
          : live.imageUpdatedAt || "",
        enrichmentStatus: nextImage ? "done" : "partial",
        enrichmentUpdatedAt: new Date().toISOString(),
      };
    };

    if (!result.changed) {
      const latest = getProducts();
      let cleared = null;
      const nextList = (Array.isArray(latest) ? latest : []).map((item) => {
        if (String(item.id) !== id) return item;
        const stillNeedsPhoto = !clean(item.imageUrl);
        cleared = {
          ...item,
          enrichmentStatus: stillNeedsPhoto ? "partial" : "done",
          enrichmentUpdatedAt: new Date().toISOString(),
        };
        return cleared;
      });
      setProducts(nextList);
      onDone?.(cleared);
      return;
    }

    const latest = getProducts();
    let updated = null;
    const merged = (Array.isArray(latest) ? latest : []).map((item) => {
      if (String(item.id) !== id) return item;
      updated = applyEnrichmentFields(item, result.product);
      return updated;
    });
    setProducts(merged);
    onDone?.(updated);
  });
  pumpEnrichQueue();
}
