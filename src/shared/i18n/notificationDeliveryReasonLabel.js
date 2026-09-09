const NETWORK_DIAGNOSTIC_RE = /fetch failed|ETIMEDOUT|ENETUNREACH|AbortError/i;

const REASON_KEY_BY_CODE = {
  smtp_not_configured: "manager.smtpIsNotConfiguredInServer",
  recipient_not_configured: "manager.enterTheEmailAbove",
  telegram_not_configured: "manager.noBotTokenInEnvOr",
  telegram_unreachable: "manager.noAccessFromTheDcTo",
  telegram_api_error: "manager.telegramApiReturnedAnError",
  telegram_send_failed: "manager.telegramSendError",
  push_not_configured: "manager.httpsAndVapidAreRequiredOn",
  no_push_subscription: "manager.installThePwaAndAllowNotifications",
  disabled: "manager.turnedOffWithTheSwitch",
};

export function notificationDeliveryReasonLabel(channel, reason, error, t) {
  const code = String(reason || "").trim();
  const rawError = String(error || "").trim();
  const mappedKey = REASON_KEY_BY_CODE[code];
  if (mappedKey) return t(mappedKey);
  if (NETWORK_DIAGNOSTIC_RE.test(code) || NETWORK_DIAGNOSTIC_RE.test(rawError)) {
    return t("manager.noAccessFromTheDcTo");
  }
  if (!code && !rawError) {
    if (channel === "push") return t("manager.notSentPwaSubscriptionIsNot");
    return t("manager.notSent");
  }
  return t("manager.sendError");
}
