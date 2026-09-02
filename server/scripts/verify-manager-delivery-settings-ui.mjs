import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vite = await createServer({
  root,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

function flattenElements(node, result = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => flattenElements(child, result));
    return result;
  }
  if (!node || typeof node !== "object") return result;
  result.push(node);
  flattenElements(node.props?.children, result);
  return result;
}

function visibleText(node, result = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => visibleText(child, result));
    return result;
  }
  if (typeof node === "string" || typeof node === "number") {
    result.push(String(node));
    return result;
  }
  if (node && typeof node === "object") visibleText(node.props?.children, result);
  return result;
}

try {
  const module = await vite.ssrLoadModule("/src/screens/manager/ManagerSettings.jsx");
  assert.equal(
    typeof module.DeliveryOneCSettings,
    "function",
    "ManagerSettings должен экспортировать блок настройки номенклатуры доставки",
  );

  const changes = [];
  const settings = {
    deliveryOneCName: "Доставка по Санкт-Петербургу",
    deliveryOneCCode: "DELIVERY-SPB",
    deliveryOneCId: "00000000-0000-0000-0000-000000000001",
  };
  const tree = module.DeliveryOneCSettings({
    settings,
    set: (key, value) => changes.push([key, value]),
  });
  const elements = flattenElements(tree);

  for (const [key, nextValue] of [
    ["deliveryOneCName", "Доставка"],
    ["deliveryOneCCode", "DELIVERY"],
    ["deliveryOneCId", "00000000-0000-0000-0000-000000000002"],
  ]) {
    const input = elements.find((element) => element.type === "input" && element.props?.name === key);
    assert.ok(input, `Нет поля ${key}`);
    assert.equal(input.props.value, settings[key], `${key}: не показано сохранённое значение`);
    assert.equal(typeof input.props.onChange, "function", `${key}: поле не редактируется`);

    const label = elements.find(
      (element) => element.type === "label" && element.props?.htmlFor === input.props.id,
    );
    assert.ok(label, `${key}: нет связанной подписи`);
    input.props.onChange({ target: { value: nextValue } });
  }

  assert.deepEqual(changes, [
    ["deliveryOneCName", "Доставка"],
    ["deliveryOneCCode", "DELIVERY"],
    ["deliveryOneCId", "00000000-0000-0000-0000-000000000002"],
  ]);

  const text = visibleText(tree).join(" ").replace(/\s+/g, " ");
  assert.match(text, /Номенклатура доставки в 1С/);
  assert.match(text, /менее 5 000 ₽/);
  assert.match(text, /500 ₽/);
  assert.match(text, /от 5 000 ₽ — бесплатно/);

  let updatedSettings = null;
  const managerTree = module.ManagerSettings({
    settings,
    authUser: { role: "manager" },
    setSettings: (updater) => {
      assert.equal(typeof updater, "function", "ManagerSettings должен обновлять settings функционально");
      updatedSettings = updater({ untouched: "keep", deliveryOneCCode: "OLD" });
    },
  });
  const deliveryBlocks = flattenElements(managerTree).filter(
    (element) => element.type === module.DeliveryOneCSettings,
  );
  assert.equal(deliveryBlocks.length, 1, "ManagerSettings должен показывать один блок доставки");
  assert.equal(deliveryBlocks[0].props.settings, settings, "Блок доставки получил другие settings");

  deliveryBlocks[0].props.set("deliveryOneCCode", "DELIVERY-NEW");
  assert.deepEqual(updatedSettings, {
    untouched: "keep",
    deliveryOneCCode: "DELIVERY-NEW",
  });

  console.log("verify-manager-delivery-settings-ui: ok");
} finally {
  await vite.close();
}
