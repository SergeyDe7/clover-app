import test from 'node:test';
import assert from 'node:assert/strict';
import { documentTrashActions } from '../../src/shared/contracts/documentTrash.js';

test('delete and restore controls require both admin capabilities and explicit server item rights', () => {
  const record = { canDelete: true, canRestore: true };
  assert.deepEqual(documentTrashActions(record), { trash: false, restore: false });
  assert.deepEqual(documentTrashActions(record, { delete: false, restore: false }), { trash: false, restore: false });
  assert.deepEqual(documentTrashActions({}, { delete: true, restore: true }), { trash: false, restore: false });
  assert.deepEqual(documentTrashActions(record, { delete: true, restore: true }), { trash: true, restore: false });
  assert.deepEqual(documentTrashActions(record, { delete: true, restore: true }, true), { trash: false, restore: true });
  assert.deepEqual(documentTrashActions(record, { delete: 'true', restore: 'true' }, true), { trash: false, restore: false });
});
