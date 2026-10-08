import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentAiSession, getDocumentAiSession } from '../../src/shared/contracts/documentAiSession.js';
import { runAutomaticCardEnhancement } from '../../src/shared/contracts/automaticAi.js';

test('a client remount shares opt-out and quota block, without a repeated external callback', async () => {
  const api = {};
  const firstClient = getDocumentAiSession(api);
  firstClient.initialize(true);
  firstClient.setMode(false); firstClient.setBlocked(true);
  const nextClient = getDocumentAiSession(api);
  assert.equal(nextClient, firstClient);
  nextClient.initialize(true);
  assert.deepEqual(nextClient.read(), { initialized: true, mode: false, blocked: true });
  let calls = 0;
  const session = nextClient.read();
  assert.equal(await runAutomaticCardEnhancement({ ...session, consent: true, available: true, importId: 'another-client-card', attemptedKeys: new Set() }, () => { calls += 1; }), false);
  assert.equal(calls, 0);
});

test('new auth sessions and separate API objects do not inherit opt-out or credit errors', () => {
  const first = createDocumentAiSession(); first.initialize(true); first.setBlocked(true); first.setMode(false);
  const next = createDocumentAiSession();
  assert.notEqual(next.id, first.id);
  assert.deepEqual(next.read(), { initialized: false, mode: false, blocked: false });
  assert.notEqual(getDocumentAiSession({}), getDocumentAiSession({}));
  next.initialize(true);
  const stateCopy = next.read(); stateCopy.mode = false;
  assert.equal(next.read().mode, true, 'render snapshots cannot mutate the session');
});

test('manual successful retry clears only quota block, retaining the user mode preference', () => {
  const session = createDocumentAiSession(); session.initialize(true); session.setMode(false); session.setBlocked(true);
  session.setBlocked(false);
  assert.deepEqual(session.read(), { initialized: true, mode: false, blocked: false });
});
