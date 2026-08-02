import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyOneCAcceptedStatus,
  buildStatusUpdatedOrder,
} from "../src/orderStatus.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSource = readFileSync(path.join(root, "server/src/server.js"), "utf8");
const instruction = readFileSync(
  path.join(
    root,
    "one_c_patches/empty_queue_and_comment/ИНСТРУКЦИЯ_СТАТУС_ПРИНЯТ.txt"
  ),
  "utf8"
);
const patchNotes = readFileSync(
  path.join(root, "one_c_patches/empty_queue_and_comment/PATCH_NOTES.txt"),
  "utf8"
);
const contract = readFileSync(
  path.join(root, "one_c_extension_source/CONTRACT.json"),
  "utf8"
);

assert.ok(
  serverSource.includes('app.post("/api/one-c/orders/accepted"'),
  "Должен быть POST /api/one-c/orders/accepted."
);
assert.ok(
  !/app\.post\(\s*"\/api\/one-c\/orders\/accepted"[\s\S]*?queueManagerNotification\(\s*\{[\s\S]*?Статус заказа/.test(
    serverSource
  ),
  "ACK 1С не должен создавать in-app уведомление менеджеру (иначе баннер снова появляется после передачи)."
);
assert.ok(
  serverSource.includes("applyOneCAcceptedStatus"),
  "Endpoint accepted должен вызывать applyOneCAcceptedStatus."
);
assert.ok(
  serverSource.includes("ORDER_NOT_ACKED") ||
    serverSource.includes('exchange.status !== "sent"'),
  "Accepted без ACK должен отклоняться."
);
assert.ok(
  contract.includes("orderAccepted") &&
    contract.includes("/api/one-c/orders/accepted"),
  "CONTRACT.json должен описывать orderAccepted."
);
assert.ok(
  instruction.includes("Подписка") &&
    instruction.includes("Принят") &&
    instruction.includes("/api/one-c/orders/accepted"),
  "Инструкция по подпискам должна существовать."
);
assert.ok(
  patchNotes.includes("пустое") && patchNotes.includes("orders/accepted"),
  "PATCH_NOTES должны описывать пустое состояние и accepted callback."
);

// Локальный модуль 1С (*.bsl) в Git не хранится — ключ обмена. Проверяем, если файл есть.
const modulePath = path.join(
  root,
  "one_c_patches/empty_queue_and_comment/Clover_module.bsl"
);
try {
  const moduleBsl = readFileSync(modulePath, "utf8");
  assert.ok(
    moduleBsl.includes("ОчиститьСостояниеЗаказа"),
    "Модуль 1С должен очищать состояние при создании."
  );
  assert.ok(
    moduleBsl.includes("CloverSkipAcceptedNotify"),
    "Служебная запись создания должна пропускать notify."
  );
  assert.ok(
    moduleBsl.includes("/api/one-c/orders/accepted"),
    "Модуль 1С должен вызывать /api/one-c/orders/accepted."
  );
  assert.ok(
    moduleBsl.includes("ОбработатьЗаписьЗаказаCloverПередЗаписью") &&
      moduleBsl.includes("ОбработатьЗаписьЗаказаCloverПриЗаписи"),
    "Модуль 1С должен содержать обработчики подписок."
  );
  assert.ok(
    !moduleBsl.includes('НайтиСостояниеПоНаименованию("В обработке")'),
    "Автоприсвоение «В обработке» при создании должно быть убрано."
  );
  assert.ok(
    moduleBsl.includes("ИзвлечьНомерЗаказаCloverИзКомментария") &&
      moduleBsl.includes("abcdefghijklmnopqrstuvwxyz0123456789-"),
    "Парсер номера Clover должен принимать CL-…, не только цифры."
  );
} catch (error) {
  if (error && error.code === "ENOENT") {
    console.log(
      "verify-onec-accepted-status: локальный Clover_module.bsl отсутствует (ожидаемо без ключа в Git)."
    );
  } else {
    throw error;
  }
}

const baseOrder = {
  id: "ord-1",
  number: "CL-1",
  status: "Новый",
  exchange: { status: "sent", receipt: "НФНФ-1" },
  history: [],
};

const accepted = applyOneCAcceptedStatus(baseOrder, {
  historyId: "h1",
  oneCState: "Обработан",
});
assert.equal(accepted.ok, true);
assert.equal(Boolean(accepted.unchanged), false);
assert.equal(accepted.order.status, "Принят");
assert.ok(
  String(accepted.order.history.at(-1)?.label || "").includes("1С: Обработан"),
  "История должна упоминать состояние 1С."
);

const again = applyOneCAcceptedStatus(accepted.order, {
  historyId: "h2",
  oneCState: "Отгружен",
});
assert.equal(again.ok, true);
assert.equal(again.unchanged, true);
assert.equal(again.order.status, "Принят");

const collecting = buildStatusUpdatedOrder(accepted.order, "Собирается", {
  role: "manager",
  historyId: "h3",
});
assert.equal(collecting.ok, true);
const noDowngrade = applyOneCAcceptedStatus(collecting.order, {
  historyId: "h4",
  oneCState: "Обработан",
});
assert.equal(noDowngrade.ok, true);
assert.equal(noDowngrade.unchanged, true);
assert.equal(noDowngrade.order.status, "Собирается");

console.log("verify-onec-accepted-status: OK");
