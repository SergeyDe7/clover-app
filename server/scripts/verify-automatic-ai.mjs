import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticAiKey, blocksAutomaticAiSession, runAutomaticCardEnhancement, skippedAiMessage } from '../../src/shared/contracts/automaticAi.js';

const settings = (overrides = {}) => ({ mode: true, consent: true, available: true, aiNeed: { needed: true }, importId: 'card-1', attemptedKeys: new Set(), ...overrides });

test('skip notice never claims incomplete card is complete', () => {
  assert.match(skippedAiMessage({ reason: 'LOCAL_FACTS_COMPLETE' }), /распознаны локально/);
  assert.match(skippedAiMessage({ reason: 'NO_RECOVERABLE_SOURCE_FACTS' }), /уточнить по документам/);
  assert.match(skippedAiMessage(undefined), /уточнить по документам/);
});

test('economy mode: locally complete cards and missing decisions never call AI', async () => {
  let calls = 0;
  for (const aiNeed of [undefined, null, {}, { needed: false }, { needed: 'true' }]) {
    assert.equal(await runAutomaticCardEnhancement(settings({ onlyWhenNeeded: true, aiNeed }), () => { calls += 1; }), false);
  }
  assert.equal(calls, 0);
  assert.equal(await runAutomaticCardEnhancement(settings(), () => { calls += 1; }), true);
  assert.equal(calls, 1);
});

test('economy disabled by default: complete cards and unknown decisions still call AI', async () => {
  let calls = 0;
  for (const overrides of [{}, { onlyWhenNeeded: false }, { onlyWhenNeeded: 'true' }]) {
    for (const aiNeed of [undefined, { needed: false }]) {
      assert.equal(await runAutomaticCardEnhancement(settings({ ...overrides, aiNeed }), () => { calls += 1; }), true);
    }
  }
  assert.equal(calls, 6);
});

test('no external callback without mode, consent, provider or a selected card', async () => {
  let calls = 0;
  for (const overrides of [{ mode: false }, { consent: false }, { available: false }, { importId: '' }, { selectionRequired: true }]) {
    assert.equal(await runAutomaticCardEnhancement(settings(overrides), () => { calls += 1; }), false);
  }
  assert.equal(calls, 0);
});

test('manual edits are protected, and switching to a fresh local card allows enhancement', async () => {
  let calls = 0;
  assert.equal(await runAutomaticCardEnhancement(settings({ manualChanges: { bankName: true } }), () => { calls += 1; }), false);
  assert.equal(await runAutomaticCardEnhancement(settings({ manualChanges: {} }), () => { calls += 1; }), true);
  assert.equal(calls, 1);
});

test('each import and sheet runs automatically only once, including concurrent requests', async () => {
  const attemptedKeys = new Set();
  let calls = 0;
  const firstSheet = settings({ attemptedKeys, sheetId: 'sheet-1' });
  await Promise.all([runAutomaticCardEnhancement(firstSheet, async () => { calls += 1; }), runAutomaticCardEnhancement(firstSheet, async () => { calls += 1; })]);
  await runAutomaticCardEnhancement(settings({ attemptedKeys, sheetId: 'sheet-2' }), async () => { calls += 1; });
  await runAutomaticCardEnhancement(settings({ attemptedKeys, importId: 'card-2', sheetId: 'sheet-1' }), async () => { calls += 1; });
  assert.equal(calls, 3);
  assert.ok(attemptedKeys.has(automaticAiKey('card-1', 'sheet-1')));
});

test('credit and authorization failures block further automatic cards without disabling local processing', async () => {
  for (const code of ['AI_CREDITS_EXHAUSTED', 'AI_QUOTA_EXCEEDED', 'AI_AUTH_FAILED', 'AI_PROJECT_BUDGET_EXCEEDED']) {
    let calls = 0;
    const localFields = { fullName: 'ИП Иванов Иван Иванович', bankName: 'Банк из карточки' };
    assert.equal(await runAutomaticCardEnhancement(settings({ blocked: blocksAutomaticAiSession(code) }), () => { calls += 1; }), false);
    assert.equal(calls, 0);
    assert.equal(localFields.bankName, 'Банк из карточки');
  }
  assert.equal(blocksAutomaticAiSession('AI_TIMEOUT'), false);
});

test('a failed automatic callback remains attempted and is not repeated automatically', async () => {
  const current = settings();
  await assert.rejects(runAutomaticCardEnhancement(current, async () => { throw new Error('Timeout'); }), /Timeout/);
  let repeated = false;
  assert.equal(await runAutomaticCardEnhancement(current, () => { repeated = true; }), false);
  assert.equal(repeated, false);
});
