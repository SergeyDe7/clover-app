import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { createDocumentsBackup } from "../src/documents/backup.js";
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
if (!["--db", "--storage", "--out", "--temp"].every((flag) => args.includes(flag) && value(flag) && !value(flag).startsWith("--"))) {
  throw new Error("Required: --db <explicit sqlite> --storage <private dir> --out <new zip> --temp <private temp dir>");
}
const db = new DatabaseSync(path.resolve(value("--db")), { readOnly: true });
try {
  const outputPath = path.resolve(value("--out"));
  const result = await createDocumentsBackup({ db, storageRoot: path.resolve(value("--storage")), outputPath, tempRoot: path.resolve(value("--temp")) });
  await writeFile(`${outputPath}.sha256`, result.sha256, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(result));
} finally { db.close(); }
