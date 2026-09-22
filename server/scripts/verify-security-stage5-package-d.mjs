import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const nft = read("ops/security-stage5/package-d/nftables/clover-perimeter.nft");
const operator = read("ops/security-stage5/scripts/promote-package-d.sh");
const artifact = read("server/scripts/securityStage5Artifact.mjs");

assert.match(nft, /^#!\/usr\/sbin\/nft -f/m);
assert.doesNotMatch(nft, /flush ruleset/);
assert.match(nft, /table inet clover_stage5/);
assert.match(nft, /type filter hook input priority filter; policy accept;/);
assert.match(nft, /iifname "lo" accept/);
assert.match(nft, /ip saddr 192\.168\.155\.0\/24 tcp dport 4100 accept/);
assert.match(nft, /tcp dport 4100 drop/);
assert.match(nft, /tcp dport \{ 4117, 4118, 5293 \} drop/);
assert.doesNotMatch(nft, /policy drop/);
assert.doesNotMatch(nft, /dport\s+(?:22|80|443)\b/);
const loopbackRule = nft.indexOf('iifname "lo" accept');
const lanRule = nft.indexOf("ip saddr 192.168.155.0/24 tcp dport 4100 accept");
const apiDropRule = nft.indexOf("tcp dport 4100 drop");
const orphanDropRule = nft.indexOf("tcp dport { 4117, 4118, 5293 } drop");
assert.ok(loopbackRule >= 0 && loopbackRule < lanRule);
assert.ok(lanRule < apiDropRule && apiDropRule < orphanDropRule);

for (const token of [
  "set -Eeuo pipefail",
  "require_trusted_recovery",
  "require_trusted_self",
  "--no-replace-objects",
  "hash-object --no-filters",
  "flock -n",
  "nft -c -f",
  "systemctl enable nftables.service",
  "PRECONFIG_SHA256",
  "trap on_error ERR",
  "on_signal 129",
  "on_signal 130",
  "on_signal 143",
  "ROLLBACK: INCOMPLETE",
  "exit 40",
  "exit 41",
]) {
  assert.ok(operator.includes(token), `missing operator gate: ${token}`);
}

const changeIndex = operator.indexOf("CHANGED=1");
assert.ok(changeIndex > operator.indexOf("nft -c -f"));
assert.ok(changeIndex > operator.indexOf("nftables.conf.sha256"));
assert.ok(operator.indexOf("install -o root -g root -m 0755", changeIndex) > changeIndex);
assert.ok(operator.indexOf("/usr/sbin/nft -f", changeIndex) > changeIndex);
assert.ok(operator.indexOf("systemctl enable nftables.service", changeIndex) > changeIndex);

assert.match(operator, /cp --preserve=all -- "\$RECOVERY\/nftables\.conf" "\$DESTINATION"/);
assert.match(operator, /nft delete table inet clover_stage5/);
assert.doesNotMatch(operator, /nft flush ruleset/);
assert.match(operator, /systemctl disable nftables\.service/);
assert.match(operator, /before_stop="\$\(read_ruleset\)"/);
assert.match(operator, /systemctl stop nftables\.service/);
assert.match(operator, /health_gate \|\| failed=1/);
assert.match(operator, /trap '' HUP INT TERM/);
assert.match(operator, /set \+e/);
assert.match(operator, /read_ruleset/);
assert.match(operator, /live nftables ruleset changed during preflight/);
assert.match(operator, /CURRENT_RULESET="\$\(read_ruleset\)"/);
assert.doesNotMatch(operator, /\[ -z "\$\(read_ruleset\)" \]/);
assert.match(operator, /Package D manifest is not PREPARED/);
assert.match(operator, /MainPID/);
assert.doesNotMatch(operator, /rm\s+-rf|pkill|kill\s+-9|sudo\s+-S|askpass|eval\s/);
assert.doesNotMatch(operator, /api\/one-c|ONEC_API_KEY|sqlite|uploads/);

assert.match(artifact, /"ops\/security-stage5\/scripts\/promote-package-d\.sh"/);
assert.match(artifact, /"ops\/security-stage5\/package-d\/nftables\/clover-perimeter\.nft"/);
assert.match(artifact, /status: "PREPARED",\s*\n\s*scope: "nftables-targeted-perimeter"/);

const inputDecision = ({ loopback = false, family = 4, source = "", port }) => {
  if (loopback) return "accept";
  if (port === 4100 && family === 4 && source.startsWith("192.168.155.")) return "accept";
  if (port === 4100) return "drop";
  if ([4117, 4118, 5293].includes(port)) return "drop";
  return "accept";
};

assert.equal(inputDecision({ loopback: true, port: 4100 }), "accept");
assert.equal(inputDecision({ family: 4, source: "192.168.155.42", port: 4100 }), "accept");
assert.equal(inputDecision({ family: 4, source: "185.233.93.10", port: 4100 }), "drop");
assert.equal(inputDecision({ family: 6, source: "2001:db8::1", port: 4100 }), "drop");
for (const port of [4117, 4118, 5293]) {
  assert.equal(inputDecision({ family: 4, source: "192.168.155.42", port }), "drop");
}
for (const port of [22, 80, 443]) {
  assert.equal(inputDecision({ family: 4, source: "203.0.113.5", port }), "accept");
}

console.log("SECURITY_STAGE5_PACKAGE_D:PASS");
