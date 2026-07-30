import assert from "node:assert/strict";

const mailer = await import("nodemailer");
assert.equal(typeof mailer.default?.createTransport, "function", "nodemailer createTransport is unavailable");

const webPush = await import("web-push");
assert.equal(typeof webPush.default?.setVapidDetails, "function", "web-push setVapidDetails is unavailable");
assert.equal(typeof webPush.default?.sendNotification, "function", "web-push sendNotification is unavailable");

const passkeys = await import("@simplewebauthn/server");
for (const name of [
  "generateRegistrationOptions",
  "verifyRegistrationResponse",
  "generateAuthenticationOptions",
  "verifyAuthenticationResponse",
]) {
  assert.equal(typeof passkeys[name], "function", `@simplewebauthn/server ${name} is unavailable`);
}

const helpers = await import("@simplewebauthn/server/helpers");
assert.equal(typeof helpers.isoUint8Array?.fromUTF8String, "function", "SimpleWebAuthn helper is unavailable");

console.log("V18 integration modules loaded successfully: email, push and passkeys.");
