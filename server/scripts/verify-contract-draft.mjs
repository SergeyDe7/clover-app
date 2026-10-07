import test from "node:test";
import assert from "node:assert/strict";
import { validatePayment, validateReviewedFields, validateContractDraft } from "../../src/shared/contracts/contractDraft.js";

test("malformed draft input returns issues instead of throwing", () => {
  for (const value of [null, false, 12, "invalid", []]) {
    assert.ok(validatePayment(value).length > 0);
    assert.equal(validateContractDraft(value).valid, false);
    assert.equal(validateContractDraft({}, value).valid, false);
  }
  assert.equal(validateContractDraft({ payment: null }).valid, false);
});

test("postpayment rejects invalid days and unapproved limit", () => {
  for (const days of [undefined, "", 0, -1, 1.5, "1e2", " 10 ", "01", true, Infinity, "9007199254740992"]) {
    assert.equal(validatePayment({ type: "postpayment", days }, 30)[0].code, "POSITIVE_INTEGER_REQUIRED");
  }
  assert.equal(validatePayment({ type: "postpayment", days: 10 })[0].code, "DAY_LIMIT_NOT_APPROVED");
  assert.equal(validatePayment({ type: "postpayment", days: 31 }, 30)[0].code, "DAY_LIMIT_EXCEEDED");
  assert.deepEqual(validatePayment({ type: "postpayment", days: "30" }, 30), []);
  assert.deepEqual(validatePayment({ type: "prepayment" }), []);
  assert.equal(validatePayment({ type: "prepayment", days: 10 })[0].code, "UNEXPECTED_DAYS");
});

test("missing, ambiguous and unchecked fields block preparation", () => {
  assert.equal(validateReviewedFields([], {})[0].code, "REQUIRED_FIELDS_NOT_APPROVED");
  assert.equal(validateReviewedFields(["name"], { name: { value: " " } })[0].code, "MISSING_VALUE");
  assert.equal(validateReviewedFields(["name"], { name: { value: "Клиент", ambiguous: true, confirmed: true } })[0].code, "AMBIGUITY_NOT_RESOLVED");
  assert.equal(validateReviewedFields(["name"], { name: { value: "Клиент", ambiguous: false } })[0].code, "REVIEW_REQUIRED");
  assert.equal(validateReviewedFields(["name"], Object.create({ name: { value: "Клиент", ambiguous: false, confirmed: true } }))[0].code, "MISSING_VALUE");
});

test("only matching approved template and reviewed requisites pass", () => {
  const draft = { entityId: "ip-ten", payment: { type: "prepayment" }, fields: { name: { value: "Тестовый клиент", ambiguous: false, confirmed: true } } };
  const approved = { entityId: "ip-ten", entityRequisitesApproved: true, template: { id: "fixture", version: "1", approved: true, entityId: "ip-ten", paymentType: "prepayment", requiredFields: ["name"] } };
  assert.equal(validateContractDraft().valid, false);
  assert.equal(validateContractDraft(draft, approved).valid, true);
  for (const patch of [{ approved: false }, { entityId: "ooo-clover" }, { paymentType: "postpayment" }, { version: "" }, { requiredFields: [] }]) {
    assert.equal(validateContractDraft(draft, { ...approved, template: { ...approved.template, ...patch } }).valid, false);
  }
  assert.equal(validateContractDraft(draft, { ...approved, entityRequisitesApproved: false }).valid, false);
  assert.equal(validateContractDraft({ ...draft, entityId: "third-entity" }, { ...approved, entityId: "third-entity", template: { ...approved.template, entityId: "third-entity" } }).valid, true);
});
