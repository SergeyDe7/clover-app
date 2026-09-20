import { METRIKA_GOALS } from "./metrikaConfig.js";
import { createMetrikaRuntime } from "./metrikaClient.js";

function browserEnv() {
  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}

export const metrikaRuntime = createMetrikaRuntime({
  getEnv: browserEnv,
});

export function trackStorefrontPageview(locationLike, title) {
  return metrikaRuntime.trackPageview(locationLike, title);
}

export function trackOrderSubmitted(localDedupeKey) {
  return metrikaRuntime.reachGoal(METRIKA_GOALS.ORDER_SUBMITTED, localDedupeKey);
}

export function trackContactPhoneClick() {
  return metrikaRuntime.reachGoal(METRIKA_GOALS.CONTACT_PHONE_CLICK);
}

export function trackContactMessageClick() {
  return metrikaRuntime.reachGoal(METRIKA_GOALS.CONTACT_MESSAGE_CLICK);
}
