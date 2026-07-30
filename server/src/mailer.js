function smtpConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASSWORD || "");
  const from = String(process.env.MAIL_FROM || user || "").trim();

  return {
    configured: Boolean(host && port && user && pass && from),
    host,
    port,
    secure: String(process.env.SMTP_SECURE || (port === 465 ? "true" : "false")) === "true",
    user,
    pass,
    from,
  };
}

export function publicMailStatus() {
  const config = smtpConfig();
  return {
    configured: config.configured,
    from: config.configured ? config.from : "",
  };
}

export async function sendCloverMail({ to, subject, text, html, attachments = [] }) {
  const config = smtpConfig();
  if (!config.configured) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  const info = await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html,
    attachments,
  });

  return {
    sent: true,
    messageId: info.messageId || "",
  };
}

export function verificationEmail({ companyName, verifyUrl }) {
  const safeCompany = String(companyName || "клиент");
  return {
    subject: "Подтверждение регистрации в Clover",
    text: `Здравствуйте! Подтвердите регистрацию компании «${safeCompany}» в Clover: ${verifyUrl}\n\nСсылка действует 24 часа.`,
    html: `<p>Здравствуйте!</p><p>Подтвердите регистрацию компании <strong>«${safeCompany}»</strong> в Clover.</p><p><a href="${verifyUrl}">Подтвердить электронную почту</a></p><p>Ссылка действует 24 часа.</p>`,
  };
}

export function resetPasswordEmail({ resetUrl }) {
  return {
    subject: "Восстановление пароля Clover",
    text: `Для установки нового пароля Clover откройте ссылку: ${resetUrl}\n\nСсылка действует 30 минут. Если вы не запрашивали восстановление, просто проигнорируйте письмо.`,
    html: `<p>Для установки нового пароля Clover нажмите:</p><p><a href="${resetUrl}">Установить новый пароль</a></p><p>Ссылка действует 30 минут. Если вы не запрашивали восстановление, проигнорируйте письмо.</p>`,
  };
}

export function reconciliationReadyEmail({ companyName = "", period = "" } = {}) {
  const company = String(companyName || "").trim();
  const periodText = String(period || "").trim();
  const greeting = company ? ` для компании «${company}»` : "";
  const suffix = periodText ? ` (${periodText})` : "";
  return {
    subject: `Акт сверки Clover${suffix}`,
    text: `Акт сверки${greeting}${suffix} готов. PDF-файл прикреплён к письму и доступен в личном кабинете Clover.`,
    html: `<p>Акт сверки${greeting}${suffix} готов.</p><p>PDF-файл прикреплён к письму и также доступен в личном кабинете Clover.</p>`,
  };
}

export function approvalEmail({ approved = true } = {}) {
  return approved
    ? {
        subject: "Доступ в Clover подтверждён",
        text: "Менеджер подтвердил регистрацию. Теперь можно войти в личный кабинет Clover.",
        html: "<p>Менеджер подтвердил регистрацию.</p><p>Теперь можно войти в личный кабинет Clover.</p>",
      }
    : {
        subject: "Регистрация Clover отклонена",
        text: "Регистрация отклонена. Для уточнения свяжитесь с менеджером.",
        html: "<p>Регистрация отклонена.</p><p>Для уточнения свяжитесь с менеджером.</p>",
      };
}
