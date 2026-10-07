import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import XLSX from 'xlsx';
import { docxText, extractCard, recognizeFields, rtfText, spreadsheetText } from '../src/documents/extraction.js';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { numberGenitive, paymentDaysUnitGenitive, confirmedNameForm } from '../src/documents/russian.js';
import { validInn, validRegistrationNumber, validateCounterparty, validateTemplateText } from '../src/documents/validation.js';
import { DisabledAIProvider, ManualVerificationProvider } from '../src/documents/providers.js';

test('DOCX extraction preserves split runs and handles Cyrillic and XML entities', async () => {
  const zip = new AdmZip();
  zip.addFile('word/document.xml',Buffer.from('<w:document><w:p><w:r><w:t>ИН</w:t></w:r><w:r><w:t>Н: 7707083893</w:t></w:r></w:p><w:p><w:t>Наименование: ООО &quot;Пример&quot;</w:t></w:p></w:document>'));
  const result = await extractCard(zip.toBuffer(),{extension:'docx'});
  assert.equal(result.fields.inn,'7707083893');
  assert.equal(result.fields.fullName,'ООО "Пример"');
  assert.equal(result.provenance.inn.requiresReview,true);
  assert.equal(result.fields.authorityBasis,undefined);
});

test('DOCX soft breaks, decomposed Cyrillic and contact roles survive extraction', async () => {
  const zip = new AdmZip();
  zip.addFile('word/document.xml',Buffer.from('<w:document><w:p><w:r><w:t>БИК: 044525225</w:t><w:br/><w:t>Номер счёта: 40702810900000012345</w:t><w:cr/><w:t>Корреспондентский счёт: 30101810400000000225</w:t></w:r></w:p><w:p><w:t>Генеральный директор Иванов В.В. director@example.test</w:t></w:p><w:p><w:t>Директор по качеству Петров П.П. quality@example.test</w:t></w:p></w:document>'));
  const result = await extractCard(zip.toBuffer(),{extension:'docx'});
  assert.equal(result.fields.bik,'044525225');
  assert.equal(result.fields.settlementAccount,'40702810900000012345');
  assert.equal(result.fields.correspondentAccount,'30101810400000000225');
  assert.equal(result.fields.signerFullName,'Иванов В.В.');
  assert.equal(result.fields.signerPosition,'Генеральный директор');
  assert.equal(result.fields.email,'Генеральный директор Иванов В.В. director@example.test\nДиректор по качеству Петров П.П. quality@example.test');
  assert.equal(result.provenance.email.requiresReview,true);
  assert.equal(result.fields.phone,undefined);
  assert.equal(result.fields.signerFullNameGenitive,undefined);
});

test('contact collection preserves order while account and signer ambiguity remains guarded', () => {
  assert.equal(recognizeFields('single@example.test').fields.email,'single@example.test');
  const result = recognizeFields('Генеральный директор Иванов И.И. first@example.test\nГенеральный директор Петров П.П. second@example.test\nНомер счёта: 40702810900000012345\nНомер счета: 40702810900000012346');
  assert.equal(result.fields.signerFullName,undefined);
  assert.equal(result.fields.settlementAccount,undefined);
  assert.equal(result.fields.email,'Генеральный директор Иванов И.И. first@example.test\nГенеральный директор Петров П.П. second@example.test');
  assert(!result.warnings.some(w => w.field === 'email' && w.code === 'AMBIGUOUS_REQUISITE'));
  assert.equal(recognizeFields('Номер счёта: 407028109000000123456').fields.settlementAccount,undefined);
  assert.equal(recognizeFields('Директор по качеству Петров П.П. quality@example.test').fields.signerFullName,undefined);
});

test('table contact tabs become display spaces, preserving source snippets and strict email validation', () => {
  const source = 'Бухгалтерия\tbuh@example.test\nГенеральный директор\tИванов И.И.\tiv@example.test';
  const result = recognizeFields(source);
  assert.equal(result.fields.email,'Бухгалтерия buh@example.test\nГенеральный директор Иванов И.И. iv@example.test');
  assert.deepEqual(result.provenance.email.snippets,source.split('\n'));
  assert(!validateCounterparty({email:result.fields.email}).errors.some(e => e.field === 'email'));
  assert(validateCounterparty({email:'Бухгалтерия\u0000 buh@example.test'}).errors.some(e => e.field === 'email'));
});

test('DOCX table cells keep contact roles with emails in the same row', async () => {
  const zip = new AdmZip();
  const cell = value => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p>\n</w:tc>`;
  const row = values => `<w:tr>${values.map(cell).join('')}</w:tr>`;
  zip.addFile('word/document.xml',Buffer.from(`<w:document><w:tbl>${row(['Генеральный директор Иванов И.И.','director@example.test'])}${row(['Бухгалтерия','buh@example.test'])}${row(['ИНН:','7707083893'])}${row(['Директор по качеству Петров П.П.',''])}${row(['independent@example.test',''])}</w:tbl></w:document>`));
  const result = await extractCard(zip.toBuffer(),{extension:'docx'});
  assert.equal(result.fields.email,'Генеральный директор Иванов И.И. director@example.test\nБухгалтерия buh@example.test\nindependent@example.test');
  assert.equal(result.fields.signerFullName,'Иванов И.И.');
  assert.equal(result.fields.inn,'7707083893');
  assert.deepEqual(result.provenance.email.snippets,['Генеральный директор Иванов И.И.\tdirector@example.test','Бухгалтерия\tbuh@example.test','independent@example.test']);
});

test('DOCX cell endings remove only the last paragraph break, preserving internal breaks', () => {
  const zip = new AdmZip();
  zip.addFile('word/document.xml',Buffer.from('<w:document><w:tbl><w:tr><w:tc><w:p><w:t>Первая строка</w:t><w:br/><w:t>Вторая строка</w:t></w:p><w:p><w:t>Третья строка</w:t><w:cr/></w:p></w:tc><w:tc><w:p><w:t>contact@example.test</w:t></w:p></w:tc></w:tr></w:tbl><w:p><w:t>Отдельный абзац</w:t></w:p></w:document>'));
  assert.equal(docxText(zip.toBuffer()),'Первая строка\nВторая строка\nТретья строка\n\tcontact@example.test\t\nОтдельный абзац\n');
});

test('DOCX non-contact and mixed requisite rows keep address and banking boundaries', async () => {
  const cell = value => `<w:tc><w:p><w:t>${value}</w:t></w:p></w:tc>`;
  for (const values of [['Юридический адрес','Москва','БИК','044525225'],['Юридический адрес','Москва','office@example.test']]) {
    const zip = new AdmZip();
    zip.addFile('word/document.xml',Buffer.from(`<w:document><w:tbl><w:tr>${values.map(cell).join('')}</w:tr></w:tbl></w:document>`));
    assert.equal(docxText(zip.toBuffer()),values.map(value => `${value}\n\t`).join('') + '\n');
    const result = await extractCard(zip.toBuffer(),{extension:'docx'});
    assert(!result.fields.legalAddress?.includes('БИК'));
    assert(!result.fields.legalAddress?.includes('@'));
    if (values.includes('БИК')) assert.equal(result.fields.bik,'044525225');
    else assert.equal(result.fields.email,'office@example.test');
  }
});

test('EDO copies explicit operator and identifier blocks without mixing EDI GLN', () => {
  const source = 'ЭДО\nСБИС ID 2BE-SYNTHETIC-001\nEDI GLN 4600000000000\nБИК 044525225';
  const result = recognizeFields(source);
  assert.equal(result.fields.edo,'СБИС ID 2BE-SYNTHETIC-001');
  assert.equal(result.provenance.edo.requiresReview,true);
  assert.equal(result.fields.bik,'044525225');
  const multiple = recognizeFields('ЭДО: Диадок ID 2BM-SYNTHETIC-002\nЭДО\nСБИС\nID: 2BE-SYNTHETIC-003');
  assert.equal(multiple.fields.edo,'Диадок ID 2BM-SYNTHETIC-002\nСБИС\nID: 2BE-SYNTHETIC-003');
  assert(!multiple.warnings.some(w => w.field === 'edo' && w.code === 'AMBIGUOUS_REQUISITE'));
  assert.equal(recognizeFields('EDI GLN 4600000000000\nСБИС ID 2BE-SYNTHETIC-001').fields.edo,undefined);
  assert.equal(recognizeFields('ЭДО\nЮридический адрес: Москва\nID: 2BE-SYNTHETIC-001').fields.edo,undefined);
  assert.equal(recognizeFields('ЭДО: СБИС ID 2BE-SYNTHETIC-001 EDI GLN 4600000000000').fields.edo,'СБИС ID 2BE-SYNTHETIC-001');
});
test('macro archive is rejected before extraction', async () => {
  const zip = new AdmZip(); zip.addFile('word/document.xml',Buffer.from('<w:t>test</w:t>')); zip.addFile('word/vbaProject.bin',Buffer.from('macro'));
  await assert.rejects(extractCard(zip.toBuffer(),{extension:'docx'}),{code:'DOCUMENT_MACROS_UNSUPPORTED'});
});
test('forged ZIP output size cannot bypass decompression bound', async () => {
  const zip = new AdmZip(); zip.addFile('word/document.xml',Buffer.from('<w:t>' + 'a'.repeat(10000) + '</w:t>'));
  const buffer = zip.toBuffer(); const central = buffer.indexOf(Buffer.from('504b0102','hex'));
  buffer.writeUInt32LE(1,central + 24);
  await assert.rejects(extractCard(buffer,{extension:'docx'}), error => ['DOCUMENT_INVALID','DOCUMENT_ARCHIVE_LIMIT'].includes(error.code));
});
test('ambiguous INN is not silently selected', () => {
  const result = recognizeFields('ИНН: 7707083893\nИНН: 500100732259');
  assert.equal(result.fields.inn,undefined);
  assert.equal(result.warnings.find(w => w.field === 'inn').code,'AMBIGUOUS_REQUISITE');
  const both = recognizeFields('ОГРНИП: 304500116000157\nОГРН: 1027700132195');
  assert.equal(both.fields.type,undefined);
  assert(both.warnings.some(w => w.field === 'type' && w.code === 'AMBIGUOUS_REQUISITE'));
});

test('unlabelled company heading, spaced accounts and wrapped address are extracted without invented data', () => {
  const card = `Общество с ограниченной ответственностью «Синтетический пример»
ООО «Синтетический пример»
ИНН 7707083893
КПП 770701001
ОГРН 1027700132195
Юр. адрес: 123456, г. Москва, ул. Тестовая, д. 1
Почтовый адрес: 123456, г. Москва,
пр-т Примерный, д. 2, офис 3
р/с 4070 2810 9000 0001 2345
к/с 3010 1810 4000 0000 0225
в филиале «Тестовый» АО «Примербанк», г. Москва
БИК 044525225
Генеральный директор
Иванов Иван Иванович`;
  const { fields, provenance } = recognizeFields(card);
  assert.equal(fields.fullName,'Общество с ограниченной ответственностью «Синтетический пример»');
  assert.equal(fields.settlementAccount,'40702810900000012345');
  assert.equal(fields.correspondentAccount,'30101810400000000225');
  assert.equal(fields.bankName,'в филиале «Тестовый» АО «Примербанк», г. Москва');
  assert.equal(fields.postalAddress,'123456, г. Москва, пр-т Примерный, д. 2, офис 3');
  assert.equal(fields.signerPosition,'Генеральный директор');
  assert.equal(fields.signerFullName,'Иванов Иван Иванович');
  for (const key of ['authorityBasis','phone','email','signerFullNameGenitive','signerPositionGenitive']) assert.equal(fields[key],undefined);
  assert.equal(provenance.settlementAccount.requiresReview,true);
});

test('multiple entities, banks and spaced accounts remain ambiguous; partial numeric values are not accepted', () => {
  const result = recognizeFields('ООО «Первый»\nООО «Второй»\nр/с 4070 2810 9000 0001 2345\nр/с 4070 2810 9000 0001 2346\nБанк: АО «Первый банк»\nБанк: АО «Второй банк»');
  for (const field of ['fullName','settlementAccount','bankName']) {
    assert.equal(result.fields[field],undefined);
    assert(result.warnings.some(w => w.field === field && w.code === 'AMBIGUOUS_REQUISITE'));
  }
  const malformed = recognizeFields('ИНН: 77070838930\nКПП: 7707010011\nБИК: 0445252250\nр/с: 407028109000000123456\nк/с: 3010 1810 4000 0000 022\nБИК: 044525225');
  for (const field of ['inn','kpp','settlementAccount','correspondentAccount']) assert.equal(malformed.fields[field],undefined);
  assert.equal(malformed.fields.bik,'044525225');
});

test('address continuations stop at next requisite; bank organization is not buyer; absent signer is not guessed', () => {
  const result = recognizeFields('Юридический адрес\t123456, Москва\nул. Примерная, д. 1\nБанк\tАО «Примербанк»\nр/с\t40702810900000012345\nГенеральный директор\nПОДПИСЬ');
  assert.equal(result.fields.legalAddress,'123456, Москва ул. Примерная, д. 1');
  assert.equal(result.fields.bankName,'АО «Примербанк»');
  assert.equal(result.fields.fullName,undefined);
  assert.equal(result.fields.signerFullName,undefined);
});

test('explicit name and bank labels accept the next line but never consume another requisite', () => {
  const result = recognizeFields('Наименование:\nАО «Синтетическая компания»\nБанк:\nАО «Тестовый банк»\nИНН: 7707083893');
  assert.equal(result.fields.fullName,'АО «Синтетическая компания»');
  assert.equal(result.fields.bankName,'АО «Тестовый банк»');
  assert.equal(result.provenance.fullName.requiresReview,true);
  const bankOnly = recognizeFields('Банк:\nООО «Синтетический банк»');
  assert.equal(bankOnly.fields.bankName,'ООО «Синтетический банк»');
  assert.equal(bankOnly.fields.fullName,undefined);
  for (const text of ['Наименование:\nБанк: АО «Тестовый банк»','Банк:\nИНН: 7707083893','Банк:\nНаименование: АО «Компания»']) {
    const guarded = recognizeFields(text);
    if (text.startsWith('Наименование')) assert.equal(guarded.fields.fullName,undefined);
    else assert.equal(guarded.fields.bankName,undefined);
  }
});
test('RTF Unicode fallback and ignored groups do not pollute extraction', () => {
  const rtf = "{\\rtf1\\ansi\\uc1{\\fonttbl fake INN}\\u1048?\\u1053?\\u1053?: 7707083893\\par \\'c1\\'c8\\'ca: 044525225}";
  assert.equal(rtfText(Buffer.from(rtf,'latin1')), 'ИНН: 7707083893\nБИК: 044525225');
});
test('Excel local extraction keeps requisites as strings', async () => {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ИНН:', '7707083893'],['БИК:', '044525225']]),'Card');
  const result = await extractCard(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{extension:'xlsx'});
  assert.equal(result.fields.bik,'044525225'); assert.equal(result.fields.inn,'7707083893');
});
test('binary XLS BIFF8 signature and Cyrillic requisites are accepted', async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ИНН:', '7707083893'],['БИК:', '044525225']]),'Card');
  const buffer = XLSX.write(book,{type:'buffer',bookType:'biff8'});
  assert.equal(buffer.subarray(0,8).toString('hex'),'d0cf11e0a1b11ae1');
  const result = await extractCard(buffer,{extension:'xls'});
  assert.equal(result.fields.inn,'7707083893');
  assert.equal(result.fields.bik,'044525225');
});
test('hung spreadsheet child times out while parent event loop remains responsive and temp is cleaned', async () => {
  const root = await mkdtemp(path.join(tmpdir(),'clover-processing-test-'));
  const helper = path.join(root,'hung-parser.mjs');
  await writeFile(helper,"process.stderr.write('private source diagnostics'); while(true) {}",'utf8');
  let ticks = 0;
  const interval = setInterval(() => ticks++,10);
  try {
    await assert.rejects(spreadsheetText(Buffer.from('test'),'xls',{timeoutMs:150,helperPath:helper,temporaryRoot:root}), error => error.code === 'LOCAL_EXTRACTION_FAILED' && !error.message.includes('private'));
    assert(ticks >= 2,'HTTP parent event loop must continue during child parsing');
    assert.deepEqual(await readdir(root),['hung-parser.mjs'],'per-job temporary input must be removed after timeout');
  } finally {
    clearInterval(interval);
    await rm(root,{recursive:true,force:true});
  }
});
test('XLS macro marker and malformed workbook are rejected before parsing', async () => {
  const buffer = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1','hex'),Buffer.from('_VBA_PROJECT','utf16le')]);
  await assert.rejects(extractCard(buffer,{extension:'xls'}),{code:'DOCUMENT_MACROS_UNSUPPORTED'});
  const zip = new AdmZip(); zip.addFile('not-workbook.txt',Buffer.from('private contents'));
  await assert.rejects(extractCard(zip.toBuffer(),{extension:'xlsx'}),{code:'DOCUMENT_INVALID'});
});
test('missing adapters, bad format and empty upload fail with safe codes', async () => {
  await assert.rejects(extractCard(Buffer.from('%PDF-1.4'),{extension:'pdf'}),{code:'LOCAL_EXTRACTION_UNAVAILABLE'});
  await assert.rejects(extractCard(Buffer.from('secret'),{extension:'exe'}),{code:'DOCUMENT_FORMAT_UNSUPPORTED'});
  await assert.rejects(extractCard(Buffer.alloc(0),{extension:'docx'}),{code:'DOCUMENT_SIZE_INVALID'});
  await assert.rejects(extractCard(Buffer.from('not a zip'),{extension:'docx'}),{code:'DOCUMENT_INVALID'});
});
test('configured adapters run locally and hide failing process output', async () => {
  const result = await extractCard(Buffer.from('%PDF-1.4'), { extension:'pdf', adapters: { pdf: { command:process.execPath,args:['-e',"process.stdout.write('ИНН: 7707083893')"] } } });
  assert.equal(result.fields.inn,'7707083893');
  await assert.rejects(extractCard(Buffer.from('%PDF-1.4'), { extension:'pdf', adapters: { pdf: { command:process.execPath,args:['-e',"process.stderr.write('private diagnostics'); process.exit(1)"] } } }), error => error.code === 'LOCAL_EXTRACTION_FAILED' && !error.message.includes('private'));
});
test('identification checksums and type mismatch reject invalid requisites', () => {
  assert.equal(validInn('7707083893'),true); assert.equal(validInn('500100732259'),true);
  assert.equal(validInn('7707083894'),false); assert.equal(validInn('0000000000'),false);
  assert.equal(validRegistrationNumber('1027700132195','ooo'),true);
  assert.equal(validRegistrationNumber('304500116000157','ip'),true);
  assert.equal(validRegistrationNumber('1027700132196','ooo'),false);
  assert(validateCounterparty({type:'ip',inn:'7707083893'}).errors.some(e => e.code === 'INN_INVALID'));
  assert(validateCounterparty({type:'ooo'}).errors.some(e => e.field === 'signerPosition'));
  assert(validateCounterparty(null).errors.length > 0);
  assert(validateCounterparty({ fullName: false }).errors.some(e => e.field === 'fullName'));
});
test('Russian genitive payment days have explicit limits and no guessed declension', () => {
  assert.equal(numberGenitive(7),'семи'); assert.equal(numberGenitive(21),'двадцати одного');
  assert.equal(numberGenitive(1001),'одной тысячи одного'); assert.equal(numberGenitive(9999),'девяти тысяч девятисот девяноста девяти');
  for (const value of [0,-1,1.5,10000,'7']) assert.throws(() => numberGenitive(value),RangeError);
  assert.equal(confirmedNameForm('Когай А.И.').requiresReview,true);
});
test('calendar-day unit agrees with genitive postpayment duration within the same limits', () => {
  for (const n of [1,21,101,121]) assert.equal(paymentDaysUnitGenitive(n),'календарного дня');
  for (const n of [2,5,11,111,9999]) assert.equal(paymentDaysUnitGenitive(n),'календарных дней');
  for (const n of [0,-1,1.5,10000,'7',null,NaN,Infinity]) assert.throws(() => paymentDaysUnitGenitive(n),RangeError);
});
test('unresolved placeholders, previous client and contradictory payment block generation', () => {
  const result = validateTemplateText('Поставка с даты получения предоплаты. {{inn}} Старый покупатель',{paymentType:'postpayment',previousClientTokens:['Старый покупатель']});
  assert.deepEqual(result.errors.map(e => e.code),['TEMPLATE_PLACEHOLDER_UNRESOLVED','PAYMENT_CLAUSE_CONFLICT','PAYMENT_START_REQUIRED','PREVIOUS_COUNTERPARTY_DATA']);
});
test('external providers truthfully report no AI or verification', async () => {
  assert.equal((await new DisabledAIProvider().extract()).available,false);
  assert.equal((await new ManualVerificationProvider().verify()).verified,false);
});



test('IP PDF text with split heading, generic address, bank and identifier-first EDO is retained', () => {
  const text = `ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ
ОБРАЗЦОВ ПЕТР ПЕТРОВИЧ
ИНН 500100732259
ОГРНИП 304500116000157
Адрес: г. Пример, ул. Тестовая, д. 1

Банковские реквизиты:
Расчётный счёт 40802 810 0 0000 0000001
ПАО Сбербанк
БИК 044525225
Корсчёт 30101 810 5 0000 0000001

Идентификатор ЭДО для обмена документами:
2AE00000000-0000-0000-0000-000000000001
АО «Калуга Астрал»`;
  const result=recognizeFields(text);
  assert.equal(result.fields.fullName,'Индивидуальный предприниматель ОБРАЗЦОВ ПЕТР ПЕТРОВИЧ');
  assert.equal(result.fields.legalAddress,'г. Пример, ул. Тестовая, д. 1');
  assert.equal(result.fields.bankName,'ПАО Сбербанк');
  assert.equal(result.fields.settlementAccount,'40802810000000000001');
  assert.equal(result.fields.correspondentAccount,'30101810500000000001');
  assert.equal(result.fields.edo,'АО «Калуга Астрал»\nID: 2AE00000000-0000-0000-0000-000000000001');
  assert(result.warnings.some(issue=>issue.code==='ADDRESS_KIND_UNSPECIFIED'));
  assert.equal(result.fields.signerFullName,undefined);
  assert.equal(result.fields.phone,undefined);
  const unrelated=recognizeFields('Банк:\nИП Иванов Иван Иванович\nПАО Сбербанк');
  assert.equal(unrelated.fields.fullName,undefined);
  const mixed=recognizeFields('ИП Иванов Иван Иванович\nИП Петров Петр Петрович');
  assert.equal(mixed.fields.fullName,undefined);
  assert(mixed.warnings.some(issue=>issue.field==='fullName' && issue.code==='AMBIGUOUS_REQUISITE'));
  const bankOnly=recognizeFields('Банковские реквизиты:\nООО «Примербанк»\nБИК 044525225');
  assert.equal(bankOnly.fields.fullName,undefined);
  assert.equal(bankOnly.fields.bankName,'ООО «Примербанк»');
  const invalid=recognizeFields('Идентификатор ЭДО для обмена документами:\nGLN 1234567890123\nАО «Калуга Астрал»');
  assert.equal(invalid.fields.edo,undefined);
});
