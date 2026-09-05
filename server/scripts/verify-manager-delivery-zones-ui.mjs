/**
 * Phase 3: ManagerSettings delivery zones UI + ManagerClients address zone select.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
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
    typeof module.DeliveryZonesSettings,
    "function",
    "ManagerSettings must export DeliveryZonesSettings"
  );

  const changes = [];
  const settings = {
    deliveryZones: [
      {
        id: "murino",
        name: "Мурино",
        enabled: true,
        freeFrom: 7000,
        fee: 700,
      },
      {
        id: "partial",
        name: "Partial",
        enabled: true,
        freeFrom: null,
        fee: null,
      },
    ],
  };

  const tree = module.DeliveryZonesSettings({
    settings,
    set: (key, value) => changes.push([key, value]),
  });
  const elements = flattenElements(tree);
  const text = visibleText(tree).join(" ").replace(/\s+/g, " ");

  assert.match(text, /Зоны доставки/i);
  assert.match(text, /По умолчанию:\s*5000/);
  assert.match(text, /По умолчанию:\s*500/);
  assert.match(text, /Добавить зону/);

  const murinoName = elements.find(
    (el) => el.type === "input" && el.props?.name === "deliveryZoneName-murino"
  );
  assert.ok(murinoName, "murino name input missing");
  assert.equal(murinoName.props.value, "Мурино");

  const addBtn = elements.find(
    (el) =>
      el.type === "button" &&
      visibleText(el).join(" ").includes("Добавить зону")
  );
  assert.ok(addBtn, "Add zone button missing");
  assert.equal(typeof addBtn.props.onClick, "function");
  addBtn.props.onClick();
  assert.equal(changes.length, 1);
  assert.equal(changes[0][0], "deliveryZones");
  assert.equal(changes[0][1].length, 3);
  assert.ok(changes[0][1][2].id, "new zone needs stable id");
  assert.equal(changes[0][1][2].freeFrom, null);
  assert.equal(changes[0][1][2].fee, null);
  assert.equal(changes[0][1][2].enabled, true);

  // Edit existing zone name without regenerating id
  changes.length = 0;
  const nameInput = elements.find(
    (el) => el.type === "input" && el.props?.name === "deliveryZoneName-murino"
  );
  assert.ok(nameInput, "zone name input missing");
  nameInput.props.onChange({ target: { value: "Мурино UPD" } });
  assert.equal(changes[0][0], "deliveryZones");
  assert.equal(changes[0][1][0].id, "murino");
  assert.equal(changes[0][1][0].name, "Мурино UPD");

  // Disable zone
  changes.length = 0;
  const disableBtn = elements.find(
    (el) =>
      el.type === "button" &&
      el.props?.["data-zone-id"] === "murino" &&
      /Отключить|Включить/.test(visibleText(el).join(" "))
  );
  assert.ok(disableBtn, "disable/enable zone control missing");
  disableBtn.props.onClick();
  assert.equal(changes[0][1][0].enabled, false);
  assert.equal(changes[0][1][0].id, "murino");

  // Null fields stay null in UI value (empty string display ok)
  const freePartial = elements.find(
    (el) => el.type === "input" && el.props?.name === "deliveryZoneFreeFrom-partial"
  );
  const feePartial = elements.find(
    (el) => el.type === "input" && el.props?.name === "deliveryZoneFee-partial"
  );
  assert.ok(freePartial && feePartial, "partial null tariff inputs missing");
  assert.equal(freePartial.props.value, "");
  assert.equal(feePartial.props.value, "");

  // ManagerSettings mounts DeliveryZonesSettings
  let updatedSettings = null;
  const managerTree = module.ManagerSettings({
    settings,
    authUser: { role: "manager" },
    setSettings: (updater) => {
      updatedSettings = updater({ untouched: "keep", deliveryZones: [] });
    },
  });
  const zoneBlocks = flattenElements(managerTree).filter(
    (el) => el.type === module.DeliveryZonesSettings
  );
  assert.equal(zoneBlocks.length, 1, "ManagerSettings must render DeliveryZonesSettings once");

  // ManagerClients address zone select
  const clientsMod = await vite.ssrLoadModule("/src/screens/manager/ManagerClients.jsx");
  const clientsSrc = readFileSync(
    path.join(root, "src/screens/manager/ManagerClients.jsx"),
    "utf8"
  );
  assert.match(
    clientsSrc,
    /deliveryZoneId/,
    "ManagerClients must persist deliveryZoneId"
  );
  assert.match(
    clientsSrc,
    /Зона доставки/,
    "ManagerClients must show zone selector label"
  );
  assert.match(
    clientsSrc,
    /Не выбрана/,
    "ManagerClients must offer empty zone option"
  );
  assert.equal(
    typeof clientsMod.normalizeManagerClientAddresses,
    "function"
  );
  const normalized = clientsMod.normalizeManagerClientAddresses([
    {
      id: "a1",
      label: "A",
      address: "Street 1",
      isDefault: true,
      deliveryZoneId: "murino",
    },
    {
      id: "a2",
      label: "B",
      address: "Street 2",
      isDefault: false,
      deliveryZoneId: "vsevolozhsk",
    },
  ]);
  assert.equal(normalized[0].deliveryZoneId, "murino");
  assert.equal(normalized[1].deliveryZoneId, "vsevolozhsk");

  console.log("verify-manager-delivery-zones-ui: ok");
} finally {
  await vite.close();
}
