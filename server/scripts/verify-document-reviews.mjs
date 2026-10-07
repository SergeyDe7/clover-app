import test from 'node:test';
import assert from 'node:assert/strict';
import { canResumeDraftReview, canSaveDraftReview, draftReviewFingerprint, isFieldReviewConfirmed, recognitionAmbiguityGates, revokeFieldReviews } from '../../src/shared/contracts/reviewAcknowledgements.js';

test('previous confirmation cannot accept a changed or missing field', () => {
  const reviews = { signerFullNameGenitive: 'Ивановой Анны Петровны' };
  assert.equal(isFieldReviewConfirmed({ signerFullNameGenitive: 'Ивановой Анны Петровны' }, reviews, 'signerFullNameGenitive'), true);
  assert.equal(isFieldReviewConfirmed({ signerFullNameGenitive: 'Петровой Анны Петровны' }, reviews, 'signerFullNameGenitive'), false);
  assert.equal(isFieldReviewConfirmed({}, {}, 'signerFullNameGenitive'), false);
  assert.equal(isFieldReviewConfirmed({ phone: '' }, { phone: '' }, 'phone'), false);
});

test('signer and owner changes revoke dependent reviews but preserve unrelated contacts', () => {
  const reviews = { signerFullName: 'Иванов Иван Иванович', signerFullNameGenitive: 'Иванова Ивана Ивановича', signerPositionGenitive: 'директора', phone: '+7 (977) 777-77-77' };
  assert.equal(revokeFieldReviews(reviews, 'signerFullName').signerFullNameGenitive, undefined);
  assert.equal(revokeFieldReviews(reviews, 'fullName').signerFullName, undefined);
  const positionChange = revokeFieldReviews(reviews, 'signerPosition');
  assert.equal(positionChange.signerPositionGenitive, undefined);
  assert.equal(positionChange.signerFullName, undefined);
  assert.equal(positionChange.phone, reviews.phone);
  assert.deepEqual(revokeFieldReviews(reviews, 'type'), {});
  assert.ok(reviews.signerFullNameGenitive, 'original state stays immutable');
});

test('saved draft review cannot bypass missing fields or unacknowledged declension mismatch', () => {
  const review = { id: 'draft-1', counterparty: { signerFullNameGenitive: 'Ивановой Анны Петровны' }, validation: { valid: true, errors: [] }, checks: { needsAttention: [{ field: 'signerFullNameGenitive', status: 'needs_review' }] } };
  assert.equal(canResumeDraftReview(review), false);
  assert.equal(canResumeDraftReview(review, { signerFullNameGenitive: review.counterparty.signerFullNameGenitive }), true);
  assert.equal(canResumeDraftReview({ ...review, checks: { needsAttention: [{ field: 'inn', status: 'needs_input' }] } }, { inn: 'invalid' }), false);
  assert.equal(canResumeDraftReview({ ...review, validation: { valid: false, errors: [{ code: 'TEMPLATE_REQUIRED' }] } }, { signerFullNameGenitive: review.counterparty.signerFullNameGenitive }), false);
  assert.equal(canResumeDraftReview({ counterparty: {}, validation: { valid: true } }), false);
  assert.notEqual(draftReviewFingerprint(review), draftReviewFingerprint({ ...review, counterparty: { signerFullNameGenitive: 'Другое значение' } }));
});

test('ambiguous import fields block dependent automatic inference', () => {
  assert.deepEqual(recognitionAmbiguityGates([]), { ipSigner: true, signerName: true, signerPosition: true });
  assert.equal(recognitionAmbiguityGates([{ code: 'AMBIGUOUS_REQUISITE', field: 'fullName' }]).ipSigner, false);
  const signer = recognitionAmbiguityGates([{ code: 'AMBIGUOUS_REQUISITE', field: 'signerFullName' }]);
  assert.equal(signer.ipSigner, false); assert.equal(signer.signerName, false);
  assert.equal(recognitionAmbiguityGates([{ code: 'AMBIGUOUS_REQUISITE', field: 'signerPosition' }]).signerPosition, false);
  assert.equal(recognitionAmbiguityGates([{ code: 'AMBIGUOUS_REQUISITE', field: 'signerFullNameGenitive' }]).signerName, false);
});

test('saving a draft cannot discard an unconfirmed address source review', () => {
  const fields = { legalAddress: 'г. Пример, ул. Примерная, д. 1', signerFullNameGenitive: '' };
  const checks = { needsAttention: [{ field: 'legalAddress', status: 'needs_review' }, { field: 'signerFullNameGenitive', status: 'needs_input' }] };
  assert.equal(canSaveDraftReview(fields, checks), false);
  assert.equal(canSaveDraftReview(fields, checks, { legalAddress: fields.legalAddress }), true);
  const onlyMissing = { needsAttention: [{ field: 'signerFullNameGenitive', status: 'needs_input' }] };
  assert.equal(canSaveDraftReview(fields, onlyMissing), true);
  assert.equal(canResumeDraftReview({ counterparty: fields, checks: onlyMissing, validation: { valid: true, errors: [] } }), false);
});

test('hidden irrelevant source warnings do not block an otherwise editable draft', () => {
  const warning = field => ({ field, status: 'needs_review' });
  const ip = { type: 'ip', legalAddress: 'г. Пример, д. 1' };
  const hiddenIp = { needsAttention: ['authorityBasis', 'kpp', 'ogrn'].map(warning) };
  assert.equal(canSaveDraftReview(ip, hiddenIp), true);
  assert.equal(canSaveDraftReview({ type: 'ooo' }, { needsAttention: [warning('ogrnip'), warning('authorityBasis')] }), true);
  const visible = { needsAttention: [...hiddenIp.needsAttention, warning('legalAddress')] };
  assert.equal(canSaveDraftReview(ip, visible), false);
  assert.equal(canSaveDraftReview(ip, visible, { legalAddress: ip.legalAddress }), true);
  assert.equal(canResumeDraftReview({ counterparty: ip, checks: hiddenIp, validation: { valid: false, errors: [{ code: 'APPROVED_AUTHORITY_BASIS_REQUIRED' }] } }), false, 'approved template errors remain blocking');
});
