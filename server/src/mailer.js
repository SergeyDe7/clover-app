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

function escapeMailHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMailMoney(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString("ru-RU", {
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatMailDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ru-RU");
}

function formatMailDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ru-RU");
}

function orderMailLines(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const customItems = Array.isArray(order?.customItems) ? order.customItems : [];
  const rows = [];

  items.forEach((item, index) => {
    rows.push({
      index: index + 1,
      name: String(item.name || "Товар"),
      code: String(item.code || item.category || item.oneCId || ""),
      unit: String(item.unit || "шт."),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      lineTotal: Number(item.lineTotal) || (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
      note: "",
    });
  });

  customItems.forEach((item, index) => {
    rows.push({
      index: items.length + index + 1,
      name: String(item.name || "Товар вне матрицы"),
      code: "вне матрицы",
      unit: String(item.unit || "шт."),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      lineTotal: (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
      note: String(item.details || "").trim(),
    });
  });

  return rows;
}

function orderMailTotal(order) {
  return orderMailLines(order).reduce((sum, row) => sum + (Number(row.lineTotal) || 0), 0);
}

/**
 * Письмо о новом заказе: полный состав в удобном виде для ручного ввода в 1С.
 */
export function newOrderManualEmail({ order, customerName = "", link = "" } = {}) {
  const number = String(order?.number || order?.id || "—");
  const client = String(customerName || order?.customerName || "Клиент").trim() || "Клиент";
  const contact = String(order?.customerContact || "").trim();
  const phone = String(order?.customerPhone || "").trim();
  const email = String(order?.customerEmail || "").trim();
  const address = String(order?.address || "").trim();
  const delivery = formatMailDate(order?.firstDeliveryDate);
  const createdAt = formatMailDateTime(order?.createdAt);
  const clientComment = String(order?.clientComment || "").trim();
  const managerComment = String(order?.managerComment || "").trim();
  const rows = orderMailLines(order);
  const total = orderMailTotal(order);
  const externalId = String(order?.externalId || order?.id || "").trim();

  const textLines = [
    `НОВЫЙ ЗАКАЗ CLOVER № ${number}`,
    "Формат для ручного ввода в 1С",
    "",
    `Клиент: ${client}`,
    contact ? `Контакт: ${contact}` : "",
    phone ? `Телефон: ${phone}` : "",
    email ? `Email: ${email}` : "",
    address ? `Адрес: ${address}` : "",
    `Доставка: ${delivery}`,
    `Дата заказа: ${createdAt}`,
    externalId ? `Внешний ID: ${externalId}` : "",
    "",
    "СОСТАВ ЗАКАЗА",
    "№ | Товар | Код | Ед. | Кол-во | Цена | Сумма",
    "-".repeat(72),
    ...rows.map((row) => {
      const base = `${row.index}. ${row.name} | ${row.code || "—"} | ${row.unit} | ${row.quantity} | ${formatMailMoney(row.unitPrice)} | ${formatMailMoney(row.lineTotal)}`;
      return row.note ? `${base}\n   (${row.note})` : base;
    }),
    "-".repeat(72),
    `ИТОГО: ${formatMailMoney(total)}`,
    clientComment ? `\nКомментарий клиента:\n${clientComment}` : "",
    managerComment ? `\nКомментарий менеджера:\n${managerComment}` : "",
    link ? `\nОткрыть в Clover: ${link}` : "",
  ].filter((line, index, all) => !(line === "" && all[index - 1] === ""));

  const htmlRows = rows.map((row) => `
    <tr>
      <td style="padding:8px;border:1px solid #dce6d9;vertical-align:top;">${row.index}</td>
      <td style="padding:8px;border:1px solid #dce6d9;vertical-align:top;">
        <strong>${escapeMailHtml(row.name)}</strong>
        ${row.note ? `<br><small style="color:#6a7167;">${escapeMailHtml(row.note)}</small>` : ""}
      </td>
      <td style="padding:8px;border:1px solid #dce6d9;vertical-align:top;">${escapeMailHtml(row.code || "—")}</td>
      <td style="padding:8px;border:1px solid #dce6d9;vertical-align:top;">${escapeMailHtml(row.unit)}</td>
      <td style="padding:8px;border:1px solid #dce6d9;vertical-align:top;text-align:right;">${escapeMailHtml(String(row.quantity))}</td>
      <td style="padding:8px;border:1px solid #dce6d9;vertical-align:top;text-align:right;">${escapeMailHtml(formatMailMoney(row.unitPrice))}</td>
      <td style="padding:8px;border:1px solid #dce6d9;vertical-align:top;text-align:right;">${escapeMailHtml(formatMailMoney(row.lineTotal))}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#263226;line-height:1.45;">
      <h2 style="margin:0 0 6px;color:#3f7c3d;">Новый заказ Clover № ${escapeMailHtml(number)}</h2>
      <p style="margin:0 0 16px;color:#6a7167;">Формат для ручного ввода в 1С</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
        <tr><td style="padding:6px 0;width:140px;color:#6a7167;">Клиент</td><td style="padding:6px 0;"><strong>${escapeMailHtml(client)}</strong></td></tr>
        ${contact ? `<tr><td style="padding:6px 0;color:#6a7167;">Контакт</td><td style="padding:6px 0;">${escapeMailHtml(contact)}</td></tr>` : ""}
        ${phone ? `<tr><td style="padding:6px 0;color:#6a7167;">Телефон</td><td style="padding:6px 0;">${escapeMailHtml(phone)}</td></tr>` : ""}
        ${email ? `<tr><td style="padding:6px 0;color:#6a7167;">Email</td><td style="padding:6px 0;">${escapeMailHtml(email)}</td></tr>` : ""}
        ${address ? `<tr><td style="padding:6px 0;color:#6a7167;">Адрес</td><td style="padding:6px 0;">${escapeMailHtml(address)}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#6a7167;">Доставка</td><td style="padding:6px 0;">${escapeMailHtml(delivery)}</td></tr>
        <tr><td style="padding:6px 0;color:#6a7167;">Дата заказа</td><td style="padding:6px 0;">${escapeMailHtml(createdAt)}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#eef5eb;">
            <th style="padding:8px;border:1px solid #dce6d9;text-align:left;">№</th>
            <th style="padding:8px;border:1px solid #dce6d9;text-align:left;">Товар</th>
            <th style="padding:8px;border:1px solid #dce6d9;text-align:left;">Код</th>
            <th style="padding:8px;border:1px solid #dce6d9;text-align:left;">Ед.</th>
            <th style="padding:8px;border:1px solid #dce6d9;text-align:right;">Кол-во</th>
            <th style="padding:8px;border:1px solid #dce6d9;text-align:right;">Цена</th>
            <th style="padding:8px;border:1px solid #dce6d9;text-align:right;">Сумма</th>
          </tr>
        </thead>
        <tbody>${htmlRows || `<tr><td colspan="7" style="padding:12px;border:1px solid #dce6d9;">Позиции отсутствуют</td></tr>`}</tbody>
      </table>
      <p style="margin:16px 0 0;font-size:18px;font-weight:700;text-align:right;">Итого: ${escapeMailHtml(formatMailMoney(total))}</p>
      ${clientComment ? `<div style="margin-top:16px;padding:12px;background:#fff8e8;border-radius:10px;"><strong>Комментарий клиента</strong><br>${escapeMailHtml(clientComment)}</div>` : ""}
      ${managerComment ? `<div style="margin-top:12px;padding:12px;background:#f3f7f1;border-radius:10px;"><strong>Комментарий менеджера</strong><br>${escapeMailHtml(managerComment)}</div>` : ""}
      ${link ? `<p style="margin-top:18px;"><a href="${escapeMailHtml(link)}">Открыть заказ в Clover</a></p>` : ""}
    </div>
  `;

  return {
    subject: `Clover: новый заказ № ${number} · ${client}`,
    text: textLines.join("\n"),
    html,
  };
}
