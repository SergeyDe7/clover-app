import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temp = mkdtempSync(path.join(tmpdir(), "clover-order-trash-"));
process.env.DB_PATH = path.join(temp, "clover.sqlite");
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";

try {
  const {
    canTrashOrder,
    canRestoreOrder,
    canPurgeOrder,
    isOrderTrashed,
    preserveTrashedOrders,
    lockOrderTrashFields,
  } = await import("../../src/shared/orderTrash.js");

  const active = {
    id: "ord-1",
    status: "Новый",
    exchange: { status: "not_sent" },
  };
  assert.equal(canTrashOrder(active, "client").ok, true);
  assert.equal(canTrashOrder(active, "manager").ok, true);

  const accepted = { ...active, status: "Принят" };
  assert.equal(canTrashOrder(accepted, "manager").ok, false);
  assert.equal(canTrashOrder(accepted, "manager").code, "ORDER_ACCEPTED");

  const queued = { ...active, exchange: { status: "ready" } };
  assert.equal(canTrashOrder(queued, "manager").ok, false);
  assert.equal(canTrashOrder(queued, "manager").code, "EXCHANGE_ACTIVE");

  const sent = { ...active, exchange: { status: "sent" } };
  assert.equal(canTrashOrder(sent, "client").ok, false);
  assert.equal(canTrashOrder(sent, "manager").ok, true);

  const clientOld = { ...active, status: "Отменён" };
  assert.equal(canTrashOrder(clientOld, "client").ok, false);
  assert.equal(canTrashOrder(clientOld, "manager").ok, true);

  const trashed = { ...active, deletedAt: "2026-08-01T12:00:00.000Z" };
  assert.equal(isOrderTrashed(trashed), true);
  assert.equal(canTrashOrder(trashed, "manager").ok, false);
  assert.equal(canRestoreOrder(trashed).ok, true);
  assert.equal(canPurgeOrder(trashed).ok, true);
  assert.equal(canRestoreOrder(active).ok, false);
  assert.equal(canPurgeOrder(active).ok, false);

  const preserved = preserveTrashedOrders(
    [active, trashed],
    [{ id: "ord-2", status: "Новый" }]
  );
  assert.equal(preserved.length, 2);
  assert.ok(preserved.some((order) => order.id === "ord-1" && isOrderTrashed(order)));
  assert.ok(preserved.some((order) => order.id === "ord-2"));

  // PUT не должен выставлять deletedAt у активного / ready заказа.
  const ready = {
    id: "ord-ready",
    status: "Новый",
    exchange: { status: "ready" },
    deletedAt: "",
  };
  const bypassTrash = lockOrderTrashFields(
    [
      {
        ...ready,
        deletedAt: "2026-08-01T15:00:00.000Z",
        deletedBy: { userId: "x", role: "client" },
      },
    ],
    new Map([["ord-ready", ready]])
  );
  assert.equal(isOrderTrashed(bypassTrash[0]), false);
  assert.equal(bypassTrash[0].deletedBy, null);

  // PUT не должен self-restore trashed заказа.
  const lockedRestore = lockOrderTrashFields(
    [{ ...trashed, deletedAt: "", deletedBy: null }],
    new Map([["ord-1", trashed]])
  );
  assert.equal(isOrderTrashed(lockedRestore[0]), true);
  assert.equal(lockedRestore[0].deletedAt, trashed.deletedAt);

  // Новый заказ с deletedAt в теле — сброс.
  const forgedNew = lockOrderTrashFields(
    [{ id: "ord-new", status: "Новый", deletedAt: "2026-08-01T15:00:00.000Z" }],
    new Map()
  );
  assert.equal(isOrderTrashed(forgedNew[0]), false);

  const db = await import("../src/db.js");
  const user = db.createUser({
    email: "trash-client@test.local",
    passwordHash: "x",
    role: "client",
    emailVerified: true,
    approvalStatus: "approved",
  });

  db.replaceOrders({
    orders: [
      {
        id: "keep-1",
        status: "Новый",
        number: "CL-1",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
        exchange: { status: "not_sent" },
      },
      {
        id: "trash-1",
        status: "Новый",
        number: "CL-2",
        createdAt: "2026-08-01T10:01:00.000Z",
        updatedAt: "2026-08-01T10:01:00.000Z",
        deletedAt: "2026-08-01T11:00:00.000Z",
        exchange: { status: "not_sent" },
      },
    ],
    userId: user.id,
    managerMode: false,
  });

  assert.equal(db.listOrders(user.id).length, 1);
  assert.equal(db.listOrders(user.id)[0].id, "keep-1");
  assert.equal(db.listTrashedOrders(user.id).length, 1);
  assert.equal(db.listTrashedOrders(user.id)[0].id, "trash-1");
  assert.equal(db.listOrders(user.id, { includeDeleted: true }).length, 2);

  const restored = db.updateOrderPayload("trash-1", {
    ...db.getOrderById("trash-1").payload,
    deletedAt: "",
    deletedBy: null,
  });
  assert.equal(isOrderTrashed(restored), false);
  assert.equal(db.listOrders(user.id).length, 2);
  assert.equal(db.listTrashedOrders(user.id).length, 0);

  db.updateOrderPayload("trash-1", {
    ...db.getOrderById("trash-1").payload,
    deletedAt: "2026-08-01T12:00:00.000Z",
  });
  const purged = db.deleteOrderById("trash-1");
  assert.equal(purged.changed, 1);
  assert.equal(db.getOrderById("trash-1"), null);
  assert.equal(db.listOrders(user.id).length, 1);

  console.log(
    "Order trash verified: rules, preserve, lock PUT fields, list, restore, purge."
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    rmSync(temp, { recursive: true, force: true });
  } catch {
    // SQLite может держать файл на Windows до выхода процесса.
  }
}
