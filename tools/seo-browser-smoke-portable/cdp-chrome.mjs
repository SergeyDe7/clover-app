/**
 * Minimal Chrome/Edge DevTools client. No Playwright, no browser download.
 * Talks to an already-installed Chromium binary via --remote-debugging-port.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CDP_CALL_MS = Number(process.env.CLOVER_BROWSER_CDP_MS || 12000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isLoopbackHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

export async function waitHttpJson(url, timeoutMs) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return await res.json();
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = error.message;
    }
    await sleep(150);
  }
  throw new Error(`CDP HTTP ${url} not ready: ${last}`);
}

export class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.console = [];
    this.pageErrors = [];
    this.requestFailed = [];
    this.responses = [];
    this.navigations = [];
    this.redirects = [];
    this.requests = [];
    this.requestIds = new Map();
  }

  resetPageLog() {
    this.console = [];
    this.pageErrors = [];
    this.requestFailed = [];
    this.responses = [];
    this.navigations = [];
    this.redirects = [];
    this.requests = [];
    this.requestIds = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 8000);
      this.ws.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      this.ws.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error(`WebSocket error ${this.wsUrl}`));
        },
        { once: true }
      );
    });
    this.ws.addEventListener("message", (event) => this.onMessage(String(event.data)));
  }

  onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(`${pending.method}: ${msg.error.message}`));
      else pending.resolve(msg.result);
      return;
    }
    this.handleEvent(msg);
  }

  handleEvent(msg) {
    const { method, params } = msg;
    if (method === "Console.consoleAPICalled") {
      const text = (params.args || [])
        .map((arg) => arg.value ?? arg.description ?? arg.type)
        .join(" ");
      this.console.push({ type: params.type || "log", text: String(text).slice(0, 500) });
    } else if (method === "Runtime.exceptionThrown") {
      const detail = params.exceptionDetails || {};
      const text = detail.exception?.description || detail.text || "pageerror";
      this.pageErrors.push(String(text).split("\n")[0]);
    } else if (method === "Network.requestWillBeSent") {
      const url = params.request?.url || "";
      this.requestIds.set(params.requestId, url);
      this.requests.push({ url, method: params.request?.method || "", type: params.type || "" });
      if (params.redirectResponse) {
        this.redirects.push({
          from: params.redirectResponse.url,
          to: url,
          status: params.redirectResponse.status,
          source: "http-redirect",
        });
      }
    } else if (method === "Network.responseReceived") {
      this.responses.push({
        url: params.response?.url || "",
        status: params.response?.status,
        mimeType: params.response?.mimeType || "",
      });
    } else if (method === "Network.loadingFailed") {
      this.requestFailed.push({
        url: this.requestIds.get(params.requestId) || "",
        requestId: params.requestId,
        error: params.errorText || "",
        canceled: Boolean(params.canceled),
      });
    } else if (method === "Page.frameNavigated" && params.frame?.parentId == null) {
      this.navigations.push({ url: params.frame.url, source: "frameNavigated" });
    } else if (method === "Page.navigatedWithinDocument") {
      this.navigations.push({ url: params.url, source: "js-or-history" });
    }
  }

  send(method, params = {}, timeoutMs = CDP_CALL_MS) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async enableDomains() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
    await this.send("Console.enable");
  }

  async evaluate(expression, timeoutMs = CDP_CALL_MS) {
    const result = await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true, userGesture: true },
      timeoutMs
    );
    if (result.exceptionDetails) {
      const text =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "evaluate failed";
      throw new Error(text.split("\n")[0]);
    }
    return result.result?.value;
  }

  async goto(url, timeoutMs) {
    this.resetPageLog();
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Page load timeout ${url}`)), timeoutMs);
      const onMsg = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.method === "Page.loadEventFired" || msg.method === "Page.domContentEventFired") {
            this.ws.removeEventListener("message", onMsg);
            clearTimeout(timer);
            resolve(msg.method);
          }
        } catch {
          /* ignore */
        }
      };
      this.ws.addEventListener("message", onMsg);
    });
    const navResult = await this.send("Page.navigate", { url }, timeoutMs);
    let loadEvent = "";
    try {
      loadEvent = await loaded;
    } catch (error) {
      loadEvent = error.message;
    }
    return { navResult, loadEvent };
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

export async function launchChrome({ executablePath, port, profileDir, log }) {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--disable-background-networking",
    "--disable-sync",
    "--metrics-recording-only",
    "--window-size=1280,720",
    "about:blank",
  ];
  const child = spawn(executablePath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
    log?.(`chrome stdout: ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
    log?.(`chrome stderr: ${chunk}`);
  });
  try {
    await waitHttpJson(`http://127.0.0.1:${port}/json/version`, 10000);
    const pages = await waitHttpJson(`http://127.0.0.1:${port}/json/list`, 10000);
    const page = (pages || []).find((item) => item.type === "page" && item.webSocketDebuggerUrl) || pages?.[0];
    if (!page?.webSocketDebuggerUrl) throw new Error("Chrome started but no page websocket");
    const session = new CdpSession(page.webSocketDebuggerUrl);
    await session.open();
    await session.enableDomains();
    return { child, session, stdout, stderr };
  } catch (error) {
    try {
      if (child.exitCode == null) child.kill();
    } catch {
      // ignore
    }
    error.chromeStdout = stdout.slice(-2000);
    error.chromeStderr = stderr.slice(-2000);
    throw error;
  }
}

export function defaultProfileDir(prefix = "clover-seo-chrome") {
  return path.join(tmpdir(), `${prefix}-${process.pid}`);
}
