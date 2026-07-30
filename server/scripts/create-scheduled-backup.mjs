import { createServerBackup } from "../src/backups.js";
import { db } from "../src/db.js";

try {
  const result = createServerBackup({
    label: "scheduled",
    reason: "Ежедневная автоматическая резервная копия Clover V18",
  });
  console.log(JSON.stringify({ ok: true, ...result }));
} finally {
  db.close();
}
