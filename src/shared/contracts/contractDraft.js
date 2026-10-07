// Pure preparation rules. No storage, network, legal text or inferred requisites.

export function validatePayment(payment = {}, approvedMaxDays) {
  const { type, days } = payment && typeof payment === "object" ? payment : {};
  if (type === "prepayment") {
    return days === undefined || days === null || days === ""
      ? [] : [{ field: "days", code: "UNEXPECTED_DAYS" }];
  }
  if (type !== "postpayment") return [{ field: "type", code: "PAYMENT_REQUIRED" }];
  const raw = typeof days === "number" ? String(days) : days;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    return [{ field: "days", code: "POSITIVE_INTEGER_REQUIRED" }];
  }
  if (!Number.isSafeInteger(approvedMaxDays) || approvedMaxDays < 1) {
    return [{ field: "days", code: "DAY_LIMIT_NOT_APPROVED" }];
  }
  return Number(raw) <= approvedMaxDays ? [] : [{ field: "days", code: "DAY_LIMIT_EXCEEDED" }];
}

// requiredFields must come from the approved template, never from OCR.
// Every required value must be explicitly checked, including a corrected value.
export function validateReviewedFields(requiredFields, fields) {
  if (!Array.isArray(requiredFields) || requiredFields.length === 0 ||
      requiredFields.some((key) => typeof key !== "string" || !key.trim())) {
    return [{ field: "template", code: "REQUIRED_FIELDS_NOT_APPROVED" }];
  }
  return [...new Set(requiredFields)].flatMap((key) => {
    const field = fields && Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (typeof field?.value !== "string" || !field.value.trim()) {
      return [{ field: key, code: "MISSING_VALUE" }];
    }
    if (field.ambiguous !== false) return [{ field: key, code: "AMBIGUITY_NOT_RESOLVED" }];
    if (field.confirmed !== true) return [{ field: key, code: "REVIEW_REQUIRED" }];
    return [];
  });
}

// A successful draft check is not permission to generate/download a document.
// Future API must independently authorize and load approved configuration.
export function validateContractDraft(draft = {}, approved = {}) {
  draft = draft && typeof draft === "object" ? draft : {};
  approved = approved && typeof approved === "object" ? approved : {};
  const issues = [];
  if (typeof draft.entityId !== "string" || !draft.entityId.trim() || approved.entityId !== draft.entityId) {
    issues.push({ field: "entityId", code: "ENTITY_REQUIRED" });
  }
  const template = approved.template;
  const templateReady = template?.approved === true &&
    typeof template.id === "string" && template.id.trim() &&
    typeof template.version === "string" && template.version.trim() &&
    template.entityId === draft.entityId && template.paymentType === draft.payment?.type;
  if (!templateReady) issues.push({ field: "template", code: "APPROVED_TEMPLATE_REQUIRED" });
  if (approved.entityRequisitesApproved !== true) {
    issues.push({ field: "entityId", code: "APPROVED_REQUISITES_REQUIRED" });
  }
  issues.push(...validatePayment(draft.payment, approved.maxPostpaymentDays));
  issues.push(...validateReviewedFields(templateReady ? template.requiredFields : undefined, draft.fields));
  return { valid: issues.length === 0, issues };
}
