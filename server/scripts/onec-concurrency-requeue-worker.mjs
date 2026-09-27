/**
 * Child-process half of verify-onec-multiprocess-concurrency.mjs.
 * It deliberately imports the real SQLite/requeue modules in another Node
 * process and waits for an IPC barrier before trying the expired-claim update.
 */
const { releaseExpiredOneCClaims } = await import("../src/onecClaimRequeue.js");
const { db } = await import("../src/db.js");

if (typeof process.send !== "function") {
  throw new Error("This worker requires an IPC channel.");
}

process.send({ type: "ready" });

process.once("message", (message) => {
  if (message?.type !== "go") return;

  try {
    const released = releaseExpiredOneCClaims(Number(message.nowMs) || Date.now());
    process.send?.({ type: "result", released });
  } catch (error) {
    process.send?.({
      type: "error",
      message: String(error?.stack || error?.message || error),
    });
  } finally {
    try {
      db.close();
    } catch {
      // The parent asserts the behavioural result; cleanup is best-effort.
    }
  }
});
