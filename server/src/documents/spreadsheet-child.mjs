// Private subprocess entry point; never import into the HTTP server.
import { readFile } from 'node:fs/promises';
import XLSX from 'xlsx';

try {
  const buffer = await readFile(process.argv[2]);
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('INPUT_LIMIT');
  const book = XLSX.read(buffer,{ type:'buffer', cellFormula:false, cellHTML:false, sheetRows:10000 });
  if (book.SheetNames.length > 100) throw new Error('SHEET_LIMIT');
  let size = 0;
  const sheets = [];
  for (const name of book.SheetNames) {
    // CSV quotes multiline cells and merges sheet identities. Preserve displayed
    // cell strings and row boundaries without adding CSV escape characters.
    const rows=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,raw:false,defval:'',blankrows:false});
    const text=rows.map(row=>row.map(value=>String(value).replace(/\r\n?/g,'\n')).join('\t')).join('\n');
    size += Buffer.byteLength(text,'utf8') + 1;
    if (size > 2 * 1024 * 1024) throw new Error('TEXT_LIMIT');
    sheets.push({name:name.slice(0,200),text});
  }
  process.stdout.write(process.argv[3]==='--json'?JSON.stringify(sheets):sheets.map(sheet=>sheet.text).join('\n'));
} catch {
  // Never return parser diagnostics containing customer data.
  process.exitCode = 1;
}
