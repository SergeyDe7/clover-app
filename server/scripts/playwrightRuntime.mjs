import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function existingPath(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate)) || "";
}

export function resolveChromiumExecutablePath(
  env = process.env,
  platform = process.platform
) {
  if (env.PLAYWRIGHT_CHROMIUM_PATH) return env.PLAYWRIGHT_CHROMIUM_PATH;

  if (platform === "win32") {
    return existingPath([
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
      env.ProgramFiles && path.join(env.ProgramFiles, "Google/Chrome/Application/chrome.exe"),
      env["ProgramFiles(x86)"] &&
        path.join(env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"),
      env.ProgramFiles && path.join(env.ProgramFiles, "Microsoft/Edge/Application/msedge.exe"),
      env["ProgramFiles(x86)"] &&
        path.join(env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe"),
    ]);
  }

  if (platform === "darwin") {
    return existingPath([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]);
  }

  return existingPath([
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]);
}

async function loadPlaywrightChromium(env = process.env) {
  if (env.PLAYWRIGHT_MODULE_ROOT) {
    const moduleUrl = pathToFileURL(
      path.join(env.PLAYWRIGHT_MODULE_ROOT, "index.mjs")
    ).href;
    return (await import(moduleUrl)).chromium;
  }

  try {
    return (await import("playwright-core")).chromium;
  } catch (error) {
    throw new Error(
      "Playwright runtime is unavailable. Run npm ci or set PLAYWRIGHT_MODULE_ROOT.",
      { cause: error }
    );
  }
}

export async function launchTestChromium(options = {}, env = process.env) {
  const chromium = await loadPlaywrightChromium(env);
  const executablePath = resolveChromiumExecutablePath(env);
  const chromeLibs = env.PLAYWRIGHT_CHROME_LIBS || "";
  const browserEnv = { ...process.env, ...(options.env || {}) };
  if (chromeLibs) {
    browserEnv.LD_LIBRARY_PATH = [chromeLibs, browserEnv.LD_LIBRARY_PATH || ""]
      .filter(Boolean)
      .join(path.delimiter);
  }

  const launchOptions = {
    ...options,
    headless: options.headless ?? true,
    env: browserEnv,
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  } else if (!launchOptions.channel) {
    launchOptions.channel = env.PLAYWRIGHT_CHANNEL || "chrome";
  }
  return chromium.launch(launchOptions);
}
