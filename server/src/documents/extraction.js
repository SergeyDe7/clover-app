import AdmZip from 'adm-zip';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { normalizeRussianPhone } from '../../../src/shared/contracts/russianPhone.js';
import { fillIpSignerFromCard } from '../../../src/shared/contracts/ipSigner.js';
import { analyzeSignerName, fillSignerNameGenitive } from '../../../src/shared/contracts/nameDeclension.js';
import { fillSignerPositionGenitive } from '../../../src/shared/contracts/signerPosition.js';

// Parser children receive runtime settings only, never server credentials.
export function documentChildEnv(source = process.env) {
  const allowed = ['PATH','Path','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','SystemDrive','COMSPEC','TEMP','TMP','TMPDIR','LANG','LC_ALL','LC_CTYPE','PYTHONIOENCODING','PYTHONUTF8'];
  return { ...Object.fromEntries(allowed.filter(key => typeof source[key] === 'string').map(key => [key,source[key]])), NODE_OPTIONS: '' };
}

const run = promisify(execFile);
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 2 * 1024 * 1024;
const MAX_ARCHIVE = 50 * 1024 * 1024;
function failure(code, message) { const e = new Error(message); e.code = code; return e; }
function zipEntries(buffer) {
  const zip = new AdmZip(buffer); const entries = zip.getEntries();
  if (entries.length > 2000 || entries.reduce((n, e) => n + e.header.size, 0) > MAX_ARCHIVE) throw failure('DOCUMENT_ARCHIVE_LIMIT', 'Слишком большой распакованный документ.');
  if (entries.some(e => /vbaProject\.bin$/i.test(e.entryName))) throw failure('DOCUMENT_MACROS_UNSUPPORTED', 'Документы с макросами не поддерживаются.');
  // Validate actual decompressed lengths, not just attacker-controlled ZIP headers.
  for (const entry of entries) if (!entry.isDirectory) boundedEntryData(entry);
  return entries;
}
function boundedEntryData(entry) {
  if (entry.header.flags & 1) throw failure('DOCUMENT_ENCRYPTED', 'Документ защищён паролем.');
  const compressed = entry.getCompressedData();
  let result;
  if (entry.header.method === 0) result = compressed;
  else if (entry.header.method === 8) result = inflateRawSync(compressed, { maxOutputLength: Math.max(1,Math.min(entry.header.size,MAX_ARCHIVE)) });
  else throw failure('DOCUMENT_INVALID', 'Способ сжатия документа не поддерживается.');
  if (result.length !== entry.header.size || result.length > MAX_ARCHIVE) throw failure('DOCUMENT_ARCHIVE_LIMIT', 'Некорректный размер распакованного документа.');
  return result;
}
function decodeXml(s) {
  return s.replace(/&#(x[\da-f]+|\d+);/gi, (_, value) => String.fromCodePoint(value[0].toLowerCase() === 'x' ? parseInt(value.slice(1),16) : Number(value)))
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
export function docxText(buffer) {
  const entries = zipEntries(buffer);
  const entry = entries.find(e => e.entryName === 'word/document.xml');
  if (!entry) throw failure('DOCUMENT_INVALID', 'В файле отсутствует документ Word.');
  // Only contact rows join sibling cells. Other requisites retain their line
  // boundaries so address continuations cannot swallow adjacent bank fields.
  const xml = boundedEntryData(entry).toString('utf8').replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g,row => {
    const visible = decodeXml(row.replace(/<\/w:tc>/g,'\t').replace(/<[^>]+>/g,''));
    const hasEmail = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.test(visible);
    const hasRequisite = /(?:^|[\s:])(?:ИНН|КПП|ОГРНИП|ОГРН|БИК|банк|наименование\s+банка|(?:юридический|почтовый|фактический)\s+адрес|юр\.?\s*адрес|адрес|р\s*\/\s*с|к\s*\/\s*с|расч[её]тный\s+сч[её]т|номер\s+сч[её]та|(?:корр(?:еспондентский)?\.?\s*сч[её]т|корсч[её]т))(?=[\s:№]|$)/iu.test(visible);
    return hasEmail && !hasRequisite ? row.replace(/<\/w:p>\s*<\/w:tc>/g,'\t') : row;
  });
  return decodeXml(xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<\/w:tr>/g,'\n').replace(/<\/w:tc>/g,'\t').replace(/<[^>]+>/g, ''));
}
export function rtfText(buffer) {
  const source = buffer.toString('latin1');
  if (!/^\{\\rtf/.test(source)) throw failure('DOCUMENT_INVALID', 'Некорректный RTF.');
  const stack = []; let state = { ignore: false, uc: 1 }; let out = ''; let skip = 0;
  const decoder = new TextDecoder('windows-1251');
  for (let i = 0; i < source.length;) {
    const ch = source[i++];
    if (ch === '{') { stack.push({ ...state }); continue; }
    if (ch === '}') { state = stack.pop() || { ignore: false, uc: 1 }; continue; }
    if (ch !== '\\') { if (skip > 0) skip--; else if (!state.ignore && ch !== '\r' && ch !== '\n') out += decoder.decode(Uint8Array.of(ch.charCodeAt(0))); continue; }
    const rest = source.slice(i);
    if (/^['{}\\~*]/.test(rest)) {
      const symbol = source[i++];
      if (symbol === '*') { state.ignore = true; continue; }
      let value = symbol === '~' ? ' ' : symbol;
      if (symbol === "'") { value = decoder.decode(Uint8Array.of(parseInt(source.slice(i,i+2),16))); i += 2; }
      if (skip > 0) skip--; else if (!state.ignore) out += value;
      continue;
    }
    const token = /^([a-z]+)(-?\d+)? ?/i.exec(rest);
    if (!token) continue;
    i += token[0].length; const word = token[1]; const arg = Number(token[2]);
    if (['fonttbl','colortbl','stylesheet','info','pict','object','header','footer','fldinst'].includes(word)) state.ignore = true;
    if (word === 'bin') { if (!Number.isInteger(arg) || arg < 0 || arg > MAX_BYTES) throw failure('DOCUMENT_INVALID','Некорректный RTF.'); i += arg; }
    if (word === 'uc') state.uc = Math.min(Math.max(arg,0),10);
    if (word === 'u') { if (!state.ignore) out += String.fromCharCode(arg < 0 ? arg + 65536 : arg); skip = state.uc; }
    if (!state.ignore && ['par','line','row'].includes(word)) out += '\n';
    if (!state.ignore && ['tab','cell'].includes(word)) out += '\t';
  }
  return out;
}

export function recognizeFields(text) {
  text = text.normalize('NFC');
  // An explicit legal-form suffix is source data, not a guess based on the name.
  const ipPerson = /^[А-ЯЁ][А-Яа-яЁё]+(?:-[А-ЯЁ][А-Яа-яЁё]+)?[ \t]+[А-ЯЁ][А-Яа-яЁё]+[ \t]+[А-ЯЁ][А-Яа-яЁё]+(?:[ \t]+(?:ОГЛЫ|КЫЗЫ))?$/iu;
  const suppliedIpName = value => {
    const suffix = value.match(/^(.+?)[ \t]+\(ИП\)$/iu);
    return suffix && ipPerson.test(suffix[1]) ? `Индивидуальный предприниматель ${suffix[1]}` : value;
  };
  const fields = {}; const warnings = [{ code: 'REVIEW_REQUIRED', message: 'Проверьте распознанные реквизиты перед формированием.' }]; const provenance = {};
  const candidates = {};
  const add = (field, value, snippet = value) => {
    value = value.trim();
    if (field === 'fullName') value = suppliedIpName(value);
    if (field === 'phone') value = normalizeRussianPhone(value) ?? value;
    if (value) (candidates[field] ||= []).push({ value, snippet });
  };
  const definitions = {
    inn: /(?<![\p{L}\d])ИНН(?:[ \t]+организации)?\s*[:№]?\s*(\d{12}|\d{10})(?!\d)/giu, kpp: /(?<![\p{L}\d])КПП\s*[:№]?\s*(\d{9})(?!\d)/giu,
    ogrnip: /(?<![\p{L}\d])ОГРНИП\s*[:№]?\s*(\d{15})(?!\d)/giu, ogrn: /(?<![\p{L}\d])ОГРН(?!ИП)\s*[:№]?\s*(\d{13})(?!\d)/giu,
    bik: /(?<![\p{L}\d])БИК(?:[ \t]+банка)?\s*[:№]?\s*(\d{9})(?!\d)/giu,
    settlementAccount: /(?<![\p{L}\d])(?:р\s*[/.]\s*с|расч[её]тный\s+сч[её]т|номер\s+(?:расч[её]тного\s+)?сч[её]та)\s*[:№]?\s*(\d(?:[ \t\u00a0]*\d){19})(?![ \t\u00a0]*\d)/giu,
    correspondentAccount: /(?<![\p{L}\d])(?:к\s*[/.]\s*с|(?:корр(?:еспондентский)?\.?\s*сч[её]т|корсч[её]т))\s*[:№]?\s*(\d(?:[ \t\u00a0]*\d){19})(?![ \t\u00a0]*\d)/giu,
    fullName: /(?:^|\n)[ \t]*(?:полное\s+(?:наименование|название)(?:\s+(?:организации|предприятия|компании))?|(?:наименование|название)(?:\s+(?:организации|предприятия|компании))?)[ \t]*[:\t][ \t]*([^\n\t]+)/giu,
    bankName: /(?:наименование\s+банка|банк)[ \t]*[:\t][ \t]*([^\n\t]+)/giu,
    phone: /(?:телефон(?:\s*\/\s*факс)?|тел\.)\s*:?\s*([+\d][\d \t\u00a0()\-\u2010-\u2014]{8,}(?:[ \t]*(?:доб(?:авочный)?\.?|доп\.?|ext(?:ension)?\.?|#)[ \t]*:?[ \t]*\d+)?(?:[ \t]*[;,][ \t]*[+\d][\d \t\u00a0()\-\u2010-\u2014]{8,}(?:[ \t]*(?:доб(?:авочный)?\.?|доп\.?|ext(?:ension)?\.?|#)[ \t]*:?[ \t]*\d+)?)*)/giu,
    signerFullName: /(?:фио\s+подписанта|подписант)\s*:\s*([^\n\t]+)/giu,
    signerPosition: /(?:должность\s+подписанта)\s*:\s*([^\n\t]+)/giu,
    authorityBasis: /(?:основание\s+полномочий)\s*:\s*([^\n\t]+)/giu,
  };
  for (const [field, pattern] of Object.entries(definitions)) {
    for (const match of text.matchAll(pattern)) {
      const values = field === 'phone' ? match[1].split(/[;,]/u) : [match[1]];
      for (const value of values) add(field, /Account$/.test(field) ? value.replace(/\s/g,'') : value, match[0]);
    }
  }
  const lines = text.replace(/\r/g,'').split('\n').map(line => line.trim());
  const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu;
  const contactLines = [...new Set(lines.filter(line => emailPattern.test(line)))];
  if (contactLines.length) {
    // Contact roles are part of the supplied requisites, not competing email candidates.
    fields.email = contactLines.map(line => line.replace(/\t+/g,' ')).join('\n');
    provenance.email = { source:'local_text', snippets:contactLines.slice(0,5), requiresReview:true };
  }
  const edoLines = []; const edoSnippets = [];
  // Explicit identifier-first EDO cards: copy only ID and known operator, never GLN.
  for (let i = 0; i < lines.length; i++) {
    if (!/^Идентификатор\s+ЭДО(?:\s+для\s+обмена\s+документами)?[ \t]*:[ \t]*$/iu.test(lines[i])) continue;
    const following = lines.slice(i + 1, i + 6).filter(Boolean);
    if (!/^[A-Za-z\d][A-Za-z\d-]{9,199}$/u.test(following[0] || '')) continue;
    const operator = following[1] || '';
    if (!/^(?:АО[ \t]+[«"]Калуга[ -]Астрал[»"]|Калуга[ -]Астрал|СБИС|Saby|(?:Контур[. \t]+)?Диадок|Такском)$/iu.test(operator)) continue;
    edoLines.push(operator, `ID: ${following[0]}`);
    edoSnippets.push([lines[i], following[0], operator].join('\n'));
  }

  const edoHeading = /^(?:оператор\s+)?ЭДО[ \t]*:?[ \t]*(.*)$/iu;
  const edoOperator = /^(?:СБИС|Saby|(?:Контур[. \t]+)?Диадок|Такском|Калуга[ -]Астрал|оператор[ \t]*:)(?=[\s:]|$)/iu;
  const edoIdentifier = /^(?:ID|идентификатор(?:\s+(?:участника|ЭДО))?)[ \t]*:?[ \t]+[A-Za-zА-Яа-яЁё\d-]+/iu;
  const withoutEdi = line => line.split(/[ \t]+(?:EDI(?:[ \t]+GLN)?|GLN)(?=[ \t:]|$)/iu)[0].trim();
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(edoHeading);
    if (!heading) continue;
    const block = []; const source = [lines[i]];
    if (heading[1] && edoOperator.test(heading[1])) block.push(withoutEdi(heading[1]));
    else if (heading[1]) continue;
    for (let j = i + 1; j < Math.min(lines.length,i + 9); j++) {
      if (!lines[j] || /^(?:EDI|GLN)(?=[\s:]|$)/iu.test(lines[j])) break;
      if (!edoOperator.test(lines[j]) && !(block.length && edoIdentifier.test(lines[j]))) break;
      block.push(withoutEdi(lines[j])); source.push(lines[j]);
    }
    if (block.length) { edoLines.push(...block); edoSnippets.push(source.join('\n')); }
  }
  if (edoLines.length) {
    fields.edo = edoLines.map(line => line.replace(/\t+/g,' ')).join('\n');
    provenance.edo = { source:'local_text', snippets:edoSnippets.slice(0,5), requiresReview:true };
  }
  // Only recognize standalone supplier/customer headings, not names inside bank/address lines.
  const ipHeading = /^(?:Индивидуальный предприниматель|ИП)(?:[ \t]+(.*))?$/iu;
  const companyHeading = /^(?:Общество с ограниченной ответственностью|ООО)[ \t]+.+$/iu;
  const title = /^(Генеральный директор|Директор|Управляющий)(?:[ \t]*:[ \t]*|[ \t]+)?(.*)$/iu;
  const person = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?[ \t]+(?:[А-ЯЁ][а-яё]+[ \t]+[А-ЯЁ][а-яё]+|[А-ЯЁ]\.[ \t]*[А-ЯЁ]\.)$/u;
  const addressLabels = /^(юридический\s+адрес|юр\.?\s*адрес|почтовый\s+адрес|фактический\s+адрес|адрес\s+(?:юридический|почтовый|фактический|местонахождения|регистрации|места\s+жительства)|зарегистрирован(?:а|о|\(а\))?\s+по\s+адресу|место\s+жительства|адрес)[ \t]*:?[ \t]*(.*)$/iu;
  const registrationAddressLabel = /^(?:зарегистрирован(?:а|о|\(а\))?\s+по\s+адресу|адрес\s+(?:регистрации|места\s+жительства)|место\s+жительства)$/iu;
  const registrationAddresses = [];
  const requisiteStart = /^(?:ИНН|КПП|ОГРН|ОГРНИП|БИК|р\s*\/\s*с|к\s*\/\s*с|расч[её]тный\s+сч[её]т|номер\s+сч[её]та|(?:корр(?:еспондентский)?\.?\s*сч[её]т|корсч[её]т)|банк|наименование|полное\s+наименование|юридический\s+адрес|юр\.?\s*адрес|почтовый\s+адрес|фактический\s+адрес|телефон|тел\.|email|e-mail|электронная\s+почта|фио|подписант|должность|основание|в\s+(?:банке|филиале)|генеральный\s+директор|директор|управляющий|Общество\s+с\s+ограниченной\s+ответственностью|ООО|ИП)(?=[\s:№/]|$)/iu;
  const bankLabelOnly = /^(?:наименование\s+банка|банк)[ \t]*:?[ \t]*$/iu;
  const nameLabelOnly = /^(?:полное\s+(?:наименование|название)(?:\s+(?:организации|предприятия|компании))?|(?:наименование|название)(?:\s+(?:организации|предприятия|компании))?)[ \t]*:?[ \t]*$/iu;
  let bankingBlock=false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || '';
    if(/^Банковские\s+реквизиты(?=[ \t:]|$)/iu.test(line) || bankLabelOnly.test(line))bankingBlock=true;
    else if(nameLabelOnly.test(line) || (!/^наименование\s+банка/iu.test(line) && /^(?:адрес|юридический\s+адрес|юр\.?\s*адрес|почтовый\s+адрес|фактический\s+адрес|наименование(?:\s+организации)?|полное\s+(?:наименование|название)|покупатель|поставщик|реквизиты\s+(?:покупателя|поставщика)|генеральный\s+директор|директор|подписант|фио|телефон|тел\.|email|e-mail|электронная\s+почта)(?=[\s:№]|$)/iu.test(line)))bankingBlock=false;
    const ipName = line.match(ipHeading);
    if (ipName && ipPerson.test(ipName[1] || next) && !bankingBlock && !bankLabelOnly.test(lines[i - 1] || '')) {
      add('fullName', `Индивидуальный предприниматель ${ipName[1] || next}`, ipName[1] ? line : `${line}\n${next}`);
    }
    // An unlabelled bank name is accepted only inside an explicit banking block.
    const bankRow = /^(?:ПАО|АО|ОАО|ООО)[ \t]+.+банк(?:[»"])?$/iu.test(line) &&
        lines.slice(Math.max(0,i - 4),i).some(value => /^Банковские\s+реквизиты[ \t]*:/iu.test(value));
    if (bankRow) add('bankName',line);

    if ((nameLabelOnly.test(line) || bankLabelOnly.test(line)) && next && (!requisiteStart.test(next) || companyHeading.test(next))) {
      add(bankLabelOnly.test(line) ? 'bankName' : 'fullName',next,`${line}\n${next}`);
    }
    if (!bankingBlock && !bankRow && companyHeading.test(line) && !bankLabelOnly.test(lines[i - 1] || '')) add('fullName',line);
    if(/^(?:Общество с ограниченной ответственностью|ООО)[ \t]*$/iu.test(line) && /^[«"“].+[»"”]$/u.test(next)) {
      add(bankingBlock?'bankName':'fullName',`${line} ${next}`,`${line}\n${next}`);
    }
    if (/^в\s+(?:филиале|банке)\s+.+банк/iu.test(line)) add('bankName',line);
    const address = line.match(addressLabels);
    if (address) {
      const parts = [address[2]];
      if (/^адрес$/iu.test(address[1])) warnings.push({field:'legalAddress',code:'ADDRESS_KIND_UNSPECIFIED',message:'В карточке указан «Адрес» без уточнения типа. Проверьте, что это юридический адрес.'});
      // Wrapped street/office lines are copied verbatim, up to a bounded next requisite.
      for (let j = i + 1; j < Math.min(lines.length,i + 9); j++) {
        if (!lines[j]) { if (!parts.some(Boolean)) continue; break; }
        if (requisiteStart.test(lines[j]) || addressLabels.test(lines[j]) || lines[j].includes('\t')) break;
        if (!/^(?:ВН\.ТЕР\.Г\.|\d{6}(?:\s|,)|(?:ул\.?|улица|дом|д\.|офис|оф\.|кв\.|корп\.|корпус|строение|стр\.|лит\.?|литера|пом\.?|помещение|проспект|просп\.|пр-т|пр\.?|набережная|наб\.?|пер\.?|переулок|г\.|город|область|район|р-н|пос\.?|поселок|деревня|село)(?=\s|\d))/iu.test(lines[j])) break;
        parts.push(lines[j]);
      }
      const value = parts.filter(Boolean).join(' ');
      const snippet = [line,...parts.slice(1)].join('\n');
      if (registrationAddressLabel.test(address[1])) registrationAddresses.push({value,snippet});
      else add(/^(?:юридический|юр|адрес$|адрес\s+(?:юридический|местонахождения))/iu.test(address[1]) ? 'legalAddress' : 'postalAddress',value,snippet);
    }
    const signer = line.match(title);
    if (signer) {
      const suppliedName = signer[2] || lines[i + 1] || '';
      const name = suppliedName.split(emailPattern)[0].trim();
      if (person.test(name)) { add('signerPosition',signer[1]); add('signerFullName',name,line); }
    }
  }
  // Full and short headings for the same ООО describe one entity; distinct names stay ambiguous.
  if (candidates.fullName) {
    const identity = value => value.replace(/^(?:Общество с ограниченной ответственностью|ООО)\s+/iu,'ООО ').replace(/^(?:Индивидуальный предприниматель|ИП)\s+/iu,'ИП ').replace(/[«»“”"]/g,'').replace(/\s+/g,' ').toLowerCase();
    const groups = new Map();
    for (const candidate of candidates.fullName) {
      const key = identity(candidate.value); const previous = groups.get(key);
      if (!previous || /^Общество с ограниченной ответственностью/iu.test(candidate.value)) groups.set(key,candidate);
    }
    candidates.fullName = [...groups.values()];
  }
  if(candidates.fullName?.length && candidates.fullName.every(item=>/^(?:ИП|Индивидуальный предприниматель)\s+/iu.test(item.value)) && !candidates.inn?.some(item=>item.value.length===10)) {
    for(const match of text.matchAll(/(?<![\p{L}\d])ОГРН(?!ИП)\s*[:№]?\s*(\d{15})(?!\d)/giu)) {
      add('ogrnip',match[1],match[0]);warnings.push({field:'ogrnip',code:'REGISTRATION_LABEL_MISMATCH',message:'В карточке ИП 15-значный номер подписан «ОГРН». Номер перенесён в ОГРНИП; проверьте обозначение в источнике.'});
    }
  }
  // A person's registration address belongs to an IP card, not to an ООО's
  // director. Preserve the supplied label/lines and the shared-address review.
  const ipCard = (candidates.fullName?.length && candidates.fullName.every(item => /^(?:ИП|Индивидуальный предприниматель)\s+/iu.test(item.value)) || candidates.inn?.some(item => item.value.length === 12)) && !candidates.inn?.some(item => item.value.length === 10) && !candidates.fullName?.some(item => companyHeading.test(item.value));
  if (ipCard) for (const address of registrationAddresses) {
    if (!address.value) continue;
    add('legalAddress',address.value,address.snippet);
    warnings.push({field:'legalAddress',code:'ADDRESS_KIND_UNSPECIFIED',message:'В карточке указан адрес регистрации ИП. Проверьте применение этого адреса как юридического и почтового.'});
  }
  for (const [field, matches] of Object.entries(candidates)) {
    const values = [...new Set(matches.map(m => m.value))];
    if (values.length === 1) { fields[field] = values[0]; provenance[field] = { source: 'local_text', snippets: matches.map(m => m.snippet).slice(0,5), requiresReview: true }; }
    if (values.length > 1) { warnings.push({ field, code: 'AMBIGUOUS_REQUISITE', message: 'Найдено несколько значений. Выберите вручную.', candidates: values.slice(0,10) }); provenance[field] = { source: 'local_text', requiresReview: true }; }
  }
  const ip = Boolean(fields.ogrnip || fields.inn?.length === 12);
  const ooo = Boolean(fields.ogrn || fields.inn?.length === 10);
  if (ip && ooo) warnings.push({ field: 'type', code: 'AMBIGUOUS_REQUISITE', message: 'В документе найдены признаки ИП и организации. Выберите контрагента вручную.', candidates: ['ip','ooo'] });
  else if (ip) fields.type = 'ip';
  else if (ooo) fields.type = 'ooo';
  if (!fields.fullName) warnings.push({ field: 'fullName', code: 'REQUISITE_NOT_RECOGNIZED', message: 'Введите полное наименование вручную.' });
  return { fields, warnings, provenance };
}

async function adapterText(buffer, extension, adapter) {
  if (!adapter?.command || !Array.isArray(adapter.args)) throw failure('LOCAL_EXTRACTION_UNAVAILABLE', 'Локальный обработчик этого формата не настроен. Доступен ручной ввод.');
  const directory = await mkdtemp(path.join(tmpdir(), 'clover-card-'));
  const input = path.join(directory, `card.${extension}`);
  try {
    await writeFile(input, buffer);
    const args = adapter.args.map(arg => String(arg).replaceAll('{input}',input));
    const { stdout } = await run(adapter.command,args,{ shell: false, timeout: 30000, maxBuffer: MAX_TEXT, windowsHide: true, encoding: 'utf8', env: documentChildEnv() });
    return stdout;
  } catch { throw failure('LOCAL_EXTRACTION_FAILED','Локальное распознавание завершилось ошибкой. Доступен ручной ввод.'); }
  finally { await rm(directory,{ recursive: true, force: true }); }
}
export async function spreadsheetText(buffer, extension, { timeoutMs = 10000, helperPath, temporaryRoot = tmpdir(),structured=false } = {}) {
  // Bound synchronous parser bugs outside the HTTP process by timeout and heap.
  const directory = await mkdtemp(path.join(temporaryRoot, 'clover-sheet-'));
  const input = path.join(directory, `card.${extension}`);
  try {
    await writeFile(input,buffer);
    const helper = helperPath || fileURLToPath(new URL('./spreadsheet-child.mjs',import.meta.url));
    const { stdout } = await run(process.execPath,['--max-old-space-size=128',helper,input,...(structured?['--json']:[])], {
      shell:false, timeout:Math.min(Math.max(timeoutMs,1),10000), maxBuffer:MAX_TEXT, windowsHide:true, encoding:'utf8',
      env:documentChildEnv(),
    });
    if(!structured)return stdout;
    const sheets=JSON.parse(stdout);
    if(!Array.isArray(sheets)||sheets.length>100||sheets.some(sheet=>typeof sheet.name!=='string'||typeof sheet.text!=='string'))throw new Error('INVALID_SHEETS');
    return sheets;
  } catch { throw failure('LOCAL_EXTRACTION_FAILED','Локальное распознавание таблицы завершилось ошибкой или превысило лимиты. Доступен ручной ввод.'); }
  finally { await rm(directory,{ recursive:true, force:true }); }
}
async function readCardSourcesInternal(buffer, { extension, adapters = {} } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_BYTES) throw failure('DOCUMENT_SIZE_INVALID','Размер файла должен быть от 1 байта до 20 МБ.');
  const ext = String(extension || '').toLowerCase().replace(/^\./,''); let text;let sheets;
  if (ext === 'docx') text = docxText(buffer);
  else if (ext === 'rtf') text = rtfText(buffer);
  else if (['xlsx','xls'].includes(ext)) {
    if (ext === 'xlsx') {
      const entries = zipEntries(buffer);
      if (!entries.some(e => e.entryName === 'xl/workbook.xml') || !entries.some(e => e.entryName === '[Content_Types].xml')) throw failure('DOCUMENT_INVALID','В архиве отсутствует книга Excel.');
    }
    if (ext === 'xls' && !buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'))) throw failure('DOCUMENT_INVALID','Некорректный Excel.');
    if (ext === 'xls' && ['VBA','Macros','_VBA_PROJECT','_VBA_PROJECT_CUR'].some(name => buffer.includes(Buffer.from(name,'utf16le')))) throw failure('DOCUMENT_MACROS_UNSUPPORTED','Документы с макросами не поддерживаются.');
    sheets=await spreadsheetText(buffer,ext,{structured:true});text=sheets.map(sheet=>sheet.text).join('\n');
  } else if (['pdf','doc','png','jpg','jpeg','tiff','tif','webp'].includes(ext)) text = await adapterText(buffer,ext,adapters[ext] || adapters[ext === 'pdf' ? 'pdf' : ext === 'doc' ? 'doc' : 'ocr']);
  else throw failure('DOCUMENT_FORMAT_UNSUPPORTED','Формат файла не поддерживается.');
  if (Buffer.byteLength(text,'utf8') > MAX_TEXT) throw failure('DOCUMENT_TEXT_LIMIT','В документе слишком много текста.');
  if (!text.trim()) throw failure('LOCAL_EXTRACTION_EMPTY','Текст не распознан. Требуется локальный OCR или ручной ввод.');
  return {text,...(sheets?{sheets}:{})};
}
async function extractCardInternal(buffer,options={}) {
  const {text,sheets}=await readCardSources(buffer,options);
  const result=completeRecognizedFields(recognizeFields(text));
  if(sheets?.length>1)result.alternatives=sheets.filter(sheet=>sheet.text.trim()).map((sheet,index)=>({id:`sheet-${index}`,label:sheet.name,...completeRecognizedFields(recognizeFields(sheet.text))}));
  return result;
}
export function completeRecognizedFields(result) {
  const ambiguous=new Set(result.warnings.filter(item=>item.code==='AMBIGUOUS_REQUISITE').map(item=>item.field));
  let next={...result.fields};
  if(!['type','fullName','signerFullName','signerPosition'].some(field=>ambiguous.has(field))) next=fillIpSignerFromCard(next);
  if(!ambiguous.has('signerFullName') && !ambiguous.has('signerFullNameGenitive'))next=fillSignerNameGenitive(next).fields;
  if(!ambiguous.has('signerPosition') && !ambiguous.has('signerPositionGenitive'))next=fillSignerPositionGenitive(next).fields;
  for(const field of ambiguous) {if(Object.hasOwn(result.fields,field))next[field]=result.fields[field];else delete next[field];}
  for(const field of ['signerFullName','signerPosition','signerFullNameGenitive','signerPositionGenitive']) {
    if(!next[field] && !Object.hasOwn(result.fields,field))delete next[field];
    if(next[field] && !result.fields[field]) {
      const derivedFrom=field==='signerFullNameGenitive'?'signerFullName':field==='signerPositionGenitive'?'signerPosition':'fullName';
      const analysis=field==='signerFullNameGenitive'?analyzeSignerName(next.signerFullName):null;
      result.provenance[field]={source:analysis?.source || 'local_rule',derivedFrom,requiresReview:false,...(analysis?{suggestion:{status:analysis.status,value:analysis.value,gender:analysis.gender}}:{})};
    }
  }
  return {...result,fields:next};
}
export async function extractCard(buffer, options = {}) {
  try { return await extractCardInternal(buffer, options); }
  catch (error) {
    if (error.code?.startsWith('DOCUMENT_') || error.code?.startsWith('LOCAL_EXTRACTION_')) throw error;
    throw failure('DOCUMENT_INVALID', 'Не удалось прочитать файл. Проверьте формат или введите реквизиты вручную.');
  }
}
export async function readCardSources(buffer,options={}) {
  try{return await readCardSourcesInternal(buffer,options);}catch(error){
    if(error.code?.startsWith('DOCUMENT_') || error.code?.startsWith('LOCAL_EXTRACTION_'))throw error;
    throw failure('DOCUMENT_INVALID','Не удалось прочитать файл. Проверьте формат или введите реквизиты вручную.');
  }
}
