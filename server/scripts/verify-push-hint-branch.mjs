/**
 * Подсказка «Нажмите «Включить уведомления»» в настройках push должна быть
 * достижимой. Она стояла соседней веткой условия, которое уже было проверено
 * выше, поэтому не показывалась никогда: пользователь с подпиской в браузере,
 * но без подписки на сервере, не получал подсказку и оставался без push.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/shared/SharedPanels.jsx"),
  "utf8"
);

const HINT = "Нажмите «Включить уведомления», чтобы восстановить push на этом устройстве.";

const hintAt = source.indexOf(HINT);
assert.notEqual(hintAt, -1, "подсказка о восстановлении push пропала");

const outerAt = source.indexOf('if (result.enabled && Notification.permission === "granted")');
assert.notEqual(outerAt, -1, "внешнее условие проверки push не найдено");

const syncAt = source.indexOf('if (sync.reason === "registered")', outerAt);
assert.notEqual(syncAt, -1, "ветка успешного восстановления подписки не найдена");

assert.ok(
  syncAt < hintAt,
  "подсказка должна быть внутри ветки восстановления подписки, а не соседним условием"
);

const between = source.slice(outerAt, hintAt);
assert.equal(
  between.includes('} else if (\n        result.enabled &&\n        Notification.permission === "granted"'),
  false,
  "условие внешней ветки не должно повторяться в else if"
);

console.log("verify-push-hint-branch: ok");
