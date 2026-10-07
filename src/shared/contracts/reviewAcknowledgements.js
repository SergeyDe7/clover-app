// A confirmation belongs to the exact value and its dependent source fields.
export function revokeFieldReviews(reviews, changedField) {
  if (changedField === 'type') return {};
  const next = { ...reviews };
  const dependent = {
    fullName: ['signerFullName'],
    signerFullName: ['signerFullNameGenitive'],
    signerPosition: ['signerPositionGenitive', 'signerFullName'],
  };
  for (const field of [changedField, ...(dependent[changedField] || [])]) delete next[field];
  return next;
}

export function isFieldReviewConfirmed(fields, reviews, field) {
  return typeof fields[field] === 'string' && Boolean(fields[field].trim()) && reviews[field] === fields[field];
}

export function isRelevantRequisiteField(type, field) {
  return field !== 'authorityBasis' && !(type === 'ip' && ['kpp', 'ogrn'].includes(field)) && !(type === 'ooo' && field === 'ogrnip');
}

export function relevantRequisiteAttention(fields, checks) {
  return (checks?.needsAttention || []).filter(item => isRelevantRequisiteField(fields.type, item.field));
}

export function recognitionAmbiguityGates(warnings = []) {
  const ambiguous = new Set(warnings.filter(item => item.code === 'AMBIGUOUS_REQUISITE').map(item => item.field));
  return {
    ipSigner: !['type', 'fullName', 'signerFullName', 'signerPosition'].some(field => ambiguous.has(field)),
    signerName: !['signerFullName', 'signerFullNameGenitive'].some(field => ambiguous.has(field)),
    signerPosition: !['signerPosition', 'signerPositionGenitive'].some(field => ambiguous.has(field)),
  };
}

export function draftReviewFingerprint(review) {
  return JSON.stringify([review.id, review.clientId, review.entityId, review.date, review.payment, review.counterparty, review.checks]);
}

export function canResumeDraftReview(review, acknowledgements = {}) {
  if (!review?.counterparty || !Array.isArray(review.checks?.needsAttention) || review.validation?.valid !== true || review.validation?.errors?.length) return false;
  return relevantRequisiteAttention(review.counterparty, review.checks).every(item => item.status === 'needs_review' && isFieldReviewConfirmed(review.counterparty, acknowledgements, item.field));
}

// Drafts may keep missing fields, but must not erase unresolved source reviews.
export function canSaveDraftReview(fields, checks, acknowledgements = {}) {
  if (!Array.isArray(checks?.needsAttention)) return false;
  return relevantRequisiteAttention(fields, checks).filter(item => item.status === 'needs_review')
    .every(item => isFieldReviewConfirmed(fields, acknowledgements, item.field));
}
