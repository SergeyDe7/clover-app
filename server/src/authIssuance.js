import {
  allowDevelopmentAuthLinks as defaultAllowDevelopmentAuthLinks,
  publicCabinetUrl as defaultPublicCabinetUrl,
} from "./authUrlPolicy.js";
import { logSafe } from "./safeLog.js";

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
  const publicMailStatus = required(deps, "publicMailStatus");

  if (findUserByEmail(input.email)) {
    return {
      status: 409,
      body: { error: "Аккаунт с такой почтой уже существует." },
    };
  }

  const passwordHash = await hashPassword(input.password);
  const user = createUser({
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
  let mail;
  try {
    mail = await sendCloverMail({ to: input.email, ...message });
  } catch (_mailError) {
    logSafe("error", {
      event: "auth.mail.verification",
      code: "MAIL_SEND_FAILED",
      component: "authIssuance",
    });
    mail = { sent: false, reason: "send_failed" };
  }
  mail = mail || { sent: false, reason: "unknown" };

  writeAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: "auth.register",
    details: { companyName: input.companyName, mailSent: Boolean(mail.sent) },
  });

  queueManagerNotification({
    type: "client_registration",
    title: "Новая регистрация клиента",
    body: String(input.companyName || "Новая регистрация"),
    url: `/?managerTab=clients&client=${encodeURIComponent(user.id)}`,
    sourceId: user.id,
  });

  return {
    status: 201,
    body: {
      ok: true,
      requiresEmailVerification: true,
      message: mail.sent
        ? "Регистрация создана. Подтвердите электронную почту по ссылке из письма."
        : "Регистрация создана. Отправка писем пока не настроена — используйте тестовую ссылку на этом компьютере.",
      mail: { sent: Boolean(mail.sent), status: publicMailStatus() },
      developmentLink: developmentLinkAllowed(input.req, env, deps)
        ? verifyUrl
        : undefined,
    },
  };
}

export async function executeResendVerification(input, deps = {}) {
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
    try {
      await sendCloverMail({ to: input.email, ...message });
    } catch (_error) {
      logSafe("error", {
        event: "auth.mail.resend",
        code: "MAIL_SEND_FAILED",
        component: "authIssuance",
      });
    }
    if (developmentLinkAllowed(input.req, env, deps)) developmentLink = verifyUrl;
  }

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
    try {
      await sendCloverMail({ to: input.email, ...message });
    } catch (_error) {
      logSafe("error", {
        event: "auth.mail.reset",
        code: "MAIL_SEND_FAILED",
        component: "authIssuance",
      });
    }
    if (developmentLinkAllowed(input.req, env, deps)) developmentLink = resetUrl;
    writeAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "auth.password.reset.request",
      details: {},
    });
  }

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
