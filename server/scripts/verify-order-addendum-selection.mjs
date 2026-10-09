import assert from 'node:assert/strict';
import { findAddendumOrders } from '../../src/shared/orderAddendum.js';
const base = { status: 'Новый', exchange: { status: 'not_sent' } };
const orders = [
  { ...base, id: 'a', address: 'Объект А', createdAt: '2026-10-01' },
  { ...base, id: 'b', address: 'Адрес Б', createdAt: '2026-10-02' },
  { ...base, id: 'c', address: 'Объект В', createdAt: '2026-10-03' },
  { ...base, id: 'accepted', status: 'Принят' },
  ...['ready', 'sending', 'sent', 'draft'].map(status => ({ ...base, id: status, exchange: { status } })),
];
assert.deepEqual(findAddendumOrders(orders).map(o => [o.id, o.address]), [
  ['c', 'Объект В'], ['b', 'Адрес Б'], ['a', 'Объект А'],
]);
assert.deepEqual(findAddendumOrders(orders, { allowClientEdit: false }), []);
assert.deepEqual(findAddendumOrders(null), []);
assert.deepEqual(findAddendumOrders([orders[0]]), [orders[0]]);
assert.equal(orders[0].id, 'a', 'source array stays unchanged');
console.log('verify-order-addendum-selection: ok');

// Execute the actual App saveOrder handler with an in-memory API boundary.
// This checks target routing and address retention without touching any database.
const { readFileSync } = await import('node:fs');
const { runInNewContext } = await import('node:vm');
const { canOrderAcceptAddendum, mergeOrderCatalogItems, mergeOrderCustomItems } = await import('../../src/shared/orderAddendum.js');
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const handler = app.slice(app.indexOf('  const saveOrder ='), app.indexOf('  const deleteClientOrder ='));
assert.match(handler, /api\s*\.saveOrders/);
function contextFor(list, settings = {}) {
  const calls = [];
  const context = {
    orders: list, settings, hydrated: true, authUser: {}, catalogSession: { mode: 'new' }, profile: {},
    canOrderAcceptAddendum, mergeOrderCatalogItems, mergeOrderCustomItems,
    appendOrderHistory: () => [], makeOrderHistoryEvent: () => ({}),
    setOrders: value => { context.saved = value; },
    api: { saveOrders: async value => { calls.push(value); return { orders: value }; } },
    skipNextOrdersSyncRef: { current: false }, setSyncError: () => {},
    setCatalogSession: () => {}, createFreshNewOrderSession: () => ({ mode: 'new' }),
    appAlert: async () => {}, t: key => key,
  };
  context.save = runInNewContext(handler + '\nsaveOrder;', context);
  return { context, calls };
}
for (const target of orders.slice(0, 3)) {
  const { context, calls } = contextFor(orders);
  await context.save({ addendumToOrderId: target.id, address: 'Wrong cart address', customItems: [{ id: 'add', quantity: 1 }], items: [] });
  assert.equal(calls.length, 1);
  assert.equal(context.saved.length, orders.length, 'no new order created');
  const selected = context.saved.find(o => o.id === target.id);
  assert.equal(selected.address, target.address);
  assert.equal(selected.customItems.length, 1);
  for (const other of orders.filter(o => o.id !== target.id)) {
    assert.equal(context.saved.find(o => o.id === other.id), other, 'other orders unchanged');
  }
}
for (const target of orders.slice(3).concat({ id: 'missing' })) {
  const { context, calls } = contextFor(orders);
  await assert.rejects(context.save({ addendumToOrderId: target.id }), /addendum_unavailable/);
  assert.equal(calls.length, 0);
}
const disabled = contextFor(orders, { allowClientEdit: false });
await assert.rejects(disabled.context.save({ addendumToOrderId: 'a' }), /addendum_unavailable/);
assert.equal(disabled.calls.length, 0);
console.log('Actual App saveOrder: selected ID/address, no new orders, status guards: PASS');

