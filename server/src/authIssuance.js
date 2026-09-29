import {
  allowDevelopmentAuthLinks as defaultAllowDevelopmentAuthLinks,
  publicCabinetUrl as defaultPublicCabinetUrl,
} from "./authUrlPolicy.js";
import { logSafe } from "./safeLog.js";

const AUTH_RESPONSE_MIN_MS = 300;
const NEUTRAL_REGISTRATION_MESSAGE =
  "Если регистрация может быть создана, инструкции будут отправлены на указанную почту.";

async function waitForNeutralAuthTiming(startedAt, deps) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const wait = typeof deps.wait === "function"
    ? deps.wait
    : (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const remainingMs = AUTH_RESPONSE_MIN_MS - (now() - startedAt);
  if (remainingMs > 0) await wait(remainingMs);
}

function queueAuthMail(sendCloverMail, payload, event) {
  void Promise.resolve()
    .then(() => sendCloverMail(payload))
    .catch(() => {
      logSafe("error", {
        event,
        code: "MAIL_SEND_FAILED",
        component: "authIssuance",
      });
    });
}

function required(deps, name) {
  const fn = deps?.[name];
  if (typeof fn !== "function") {
    throw new TypeError(`authIssuance missing dependency: ${name}`);
  }
  return fn;
}

function resolveCabinetUrl(req, env, deps) {
  const publicCabinetUrl = deps.publicCabinetUrl || defaultPublicCabinetUrl;
  return publicCabinetUrl(req, env);
}

function developmentLinkAllowed(req, env, deps) {
  const allowDevelopmentAuthLinks =
    deps.allowDevelopmentAuthLinks || defaultAllowDevelopmentAuthLinks;
  return allowDevelopmentAuthLinks(req, env);
}

export async function executeClientRegistration(input, deps = {}) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const startedAt = now();
  const env = deps.env || process.env;
  const cabinetUrl = resolveCabinetUrl(input.req, env, deps);
  const findUserByEmail = required(deps, "findUserByEmail");
  const hashPassword = required(deps, "hashPassword");
  const createUser = required(deps, "createUser");
  const createPlainToken = required(deps, "createPlainToken");
  const tokenHash = required(deps, "tokenHash");
  const createAuthToken = required(deps, "createAuthToken");
  const verificationEmail = required(deps, "verificationEmail");
  const sendCloverMail = required(deps, "sendCloverMail");
  const writeAudit = required(deps, "writeAudit");
  const queueManagerNotification = required(deps, "queueManagerNotification");

  // Hash on both paths so an existing account cannot be identified by bcrypt timing.
  const passwordHash = await hashPassword(input.password);
  if (findUserByEmail(input.email)) {
    await waitForNeutralAuthTiming(startedAt, deps);
    return {
      status: 202,
      body: {
        ok: true,
        message: NEUTRAL_REGISTRATION_MESSAGE,
      },
    };
  }

  let user;
  try {
    user = createUser({
      email: input.email,
      passwordHash,
      role: "client",
      emailVerified: false,
      approvalStatus: "pending",
      profile: {
        companyName: input.companyName,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email,
      },
    });
  } catch (error) {
    // A concurrent registration can win the UNIQUE(email) race. Keep the same
    // public contract as the ordinary duplicate-account path.
    if (findUserByEmail(input.email)) {
      await waitForNeutralAuthTiming(startedAt, deps);
      return {
        status: 202,
        body: { ok: true, message: NEUTRAL_REGISTRATION_MESSAGE },
      };
    }
    throw error;
  }

  const plainToken = createPlainToken();
  createAuthToken({
    userId: user.id,
    type: "verify_email",
    tokenHash: tokenHash(plainToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  const verifyUrl = `${cabinetUrl}/?verify=${encodeURIComponent(plainToken)}`;
  const message = verificationEmail({
    companyName: input.companyName,
    verifyUrl,
  });
  queueAuthMail(sendCloverMail, { to: input.email, ...message }, "auth.mail.verification");

  writeAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: "auth.register",
    details: { companyName: input.companyName, mailQueued: true },
  });

  queueManagerNotification({
    type: "client_registration",
    title: "Новая регистрация клиента",
    body: String(input.companyName || "Новая регистрация"),
    url: `/?managerTab=clients&client=${encodeURIComponent(user.id)}`,
    sourceId: user.id,
  });

  await waitForNeutralAuthTiming(startedAt, deps);
  return {
    status: 202,
    body: {
      ok: true,
      message: NEUTRAL_REGISTRATION_MESSAGE,
    },
  };
}

export async function executeResendVerification(input, deps = {}) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const startedAt = now();
  const env = deps.env || process.env;
  const cabinetUrl = resolveCabinetUrl(input.req, env, deps);
  const findUserByEmail = required(deps, "findUserByEmail");
  const createPlainToken = required(deps, "createPlainToken");
  const tokenHash = required(deps, "tokenHash");
  const createAuthToken = required(deps, "createAuthToken");
  const getClientState = required(deps, "getClientState");
  const isClientRole = required(deps, "isClientRole");
  const verificationEmail = required(deps, "verificationEmail");
  const sendCloverMail = required(deps, "sendCloverMail");

  const user = findUserByEmail(input.email);
  let developmentLink;
  if (user && !user.email_verified) {
    const plainToken = createPlainToken();
    createAuthToken({
      userId: user.id,
      type: "verify_email",
      tokenHash: tokenHash(plainToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const verifyUrl = `${cabinetUrl}/?verify=${encodeURIComponent(plainToken)}`;
    const companyName = isClientRole(user.role)
      ? getClientState(user.id).profile?.companyName
      : "Менеджер Clover";
    const message = verificationEmail({ companyName, verifyUrl });
    queueAuthMail(sendCloverMail, { to: input.email, ...message }, "auth.mail.resend");
    if (developmentLinkAllowed(input.req, env, deps)) developmentLink = verifyUrl;
  }

  await waitForNeutralAuthTiming(startedAt, deps);
  return {
    status: 200,
    body: {
      ok: true,
      message:
        "Если аккаунт существует и почта ещё не подтверждена, новое письмо отправлено.",
      developmentLink,
    },
  };
}

export async function executeForgotPassword(input, deps = {}) {
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const startedAt = now();
  const env = deps.env || process.env;
  const cabinetUrl = resolveCabinetUrl(input.req, env, deps);
  const findUserByEmail = required(deps, "findUserByEmail");
  const createPlainToken = required(deps, "createPlainToken");
  const tokenHash = required(deps, "tokenHash");
  const createAuthToken = required(deps, "createAuthToken");
  const resetPasswordEmail = required(deps, "resetPasswordEmail");
  const sendCloverMail = required(deps, "sendCloverMail");
  const writeAudit = required(deps, "writeAudit");

  const user = findUserByEmail(input.email);
  let developmentLink;
  if (user) {
    const plainToken = createPlainToken();
    createAuthToken({
      userId: user.id,
      type: "reset_password",
      tokenHash: tokenHash(plainToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    const resetUrl = `${cabinetUrl}/?reset=${encodeURIComponent(plainToken)}`;
    const message = resetPasswordEmail({ resetUrl });
    queueAuthMail(sendCloverMail, { to: input.email, ...message }, "auth.mail.reset");
    if (developmentLinkAllowed(input.req, env, deps)) developmentLink = resetUrl;
    writeAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "auth.password.reset.request",
      details: {},
    });
  }

  await waitForNeutralAuthTiming(startedAt, deps);
  return {
    status: 200,
    body: {
      ok: true,
      message:
        "Если аккаунт существует, на его почту отправлена ссылка для восстановления пароля.",
      developmentLink,
    },
  };
}
