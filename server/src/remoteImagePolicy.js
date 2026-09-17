import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequestDefault } from "node:https";
import { isIP } from "node:net";

import {
  boundedResponseLimit,
  readBoundedResponse,
} from "./outboundResponse.js";

export const DEFAULT_REMOTE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function imagePolicyError(code, message, status = 422, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = status;
  return error;
}

function normalizedIpHost(value) {
  return String(value || "").replace(/^\[|\]$/gu, "").split("%")[0];
}

function parseIpv4(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map(Number);
  if (
    bytes.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255
    )
  ) {
    return null;
  }
  return bytes;
}

function parseIpv6(value) {
  let input = normalizedIpHost(value).toLowerCase();
  if (!input || input.includes("%")) return null;
  if (input.includes(".")) {
    const splitAt = input.lastIndexOf(":");
    const ipv4 = parseIpv4(input.slice(splitAt + 1));
    if (!ipv4) return null;
    input = `${input.slice(0, splitAt)}:${(
      (ipv4[0] << 8) |
      ipv4[1]
    ).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return null;
  }
  const words = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => "0"),
    ...right,
  ].map((word) => Number.parseInt(word || "0", 16));
  if (
    words.length !== 8 ||
    words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)
  ) {
    return null;
  }
  return words;
}

function isPublicIpv4(value) {
  const bytes = parseIpv4(value);
  if (!bytes) return false;
  const [a, b] = bytes;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && [0, 2, 168].includes(b)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(value) {
  const words = parseIpv6(value);
  if (!words) return false;
  const [first, second, third, fourth, fifth, sixth] = words;
  const ipv4Mapped =
    first === 0 &&
    second === 0 &&
    third === 0 &&
    fourth === 0 &&
    fifth === 0 &&
    sixth === 0xffff;
  if (ipv4Mapped) {
    const high = words[6];
    const low = words[7];
    return isPublicIpv4(
      `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
    );
  }
  // Only global-unicast 2000::/3 is allowed.
  if ((first & 0xe000) !== 0x2000) return false;
  // Documentation, benchmarking, 6to4, Teredo and NAT64 are not application targets.
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2001 && second === 0x0002) return false;
  if (first === 0x2002) return false;
  if (first === 0x2001 && second === 0x0000) return false;
  if (
    first === 0x0064 &&
    second === 0xff9b &&
    third === 0 &&
    fourth === 0 &&
    fifth === 0 &&
    sixth === 0
  ) {
    return false;
  }
  return true;
}

export function isPublicNetworkAddress(value) {
  const address = normalizedIpHost(value);
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export async function resolvePublicImageTarget(
  rawUrl,
  { lookup = dnsLookup } = {}
) {
  const raw = String(rawUrl || "").trim();
  if (!raw || /[\u0000-\u001f\u007f\\]/u.test(raw)) {
    throw imagePolicyError(
      "REMOTE_IMAGE_URL_DENIED",
      "Адрес удалённого изображения отклонён политикой безопасности."
    );
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw imagePolicyError(
      "REMOTE_IMAGE_URL_DENIED",
      "Адрес удалённого изображения отклонён политикой безопасности."
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    url.hostname.endsWith(".")
  ) {
    throw imagePolicyError(
      "REMOTE_IMAGE_URL_DENIED",
      "Адрес удалённого изображения отклонён политикой безопасности."
    );
  }

  const hostname = normalizedIpHost(url.hostname);
  const literalFamily = isIP(hostname);
  let addresses;
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch (cause) {
      throw imagePolicyError(
        "REMOTE_IMAGE_DNS_FAILED",
        "Не удалось безопасно разрешить адрес удалённого изображения.",
        502,
        cause
      );
    }
  }
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some(
      (item) =>
        ![4, 6].includes(Number(item?.family)) ||
        !isPublicNetworkAddress(item?.address)
    )
  ) {
    throw imagePolicyError(
      "REMOTE_IMAGE_ADDRESS_DENIED",
      "Сетевой адрес удалённого изображения отклонён."
    );
  }

  const pinned = {
    address: normalizedIpHost(addresses[0].address),
    family: Number(addresses[0].family),
  };
  return {
    url,
    hostname,
    pinned,
    addresses: addresses.map((item) => ({
      address: normalizedIpHost(item.address),
      family: Number(item.family),
    })),
  };
}

export async function downloadRemoteImage(
  rawUrl,
  {
    lookup = dnsLookup,
    httpsRequest = httpsRequestDefault,
    headers = {},
    maxBytes = DEFAULT_REMOTE_IMAGE_MAX_BYTES,
    timeoutMs = 15000,
    signal,
  } = {}
) {
  const target = await resolvePublicImageTarget(rawUrl, { lookup });
  const limit = boundedResponseLimit(maxBytes, {
    fallback: DEFAULT_REMOTE_IMAGE_MAX_BYTES,
    minimum: 1024,
    maximum: 16 * 1024 * 1024,
  });
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener?.("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await new Promise((resolve, reject) => {
      const options = {
        protocol: "https:",
        hostname: target.hostname,
        port: target.url.port || 443,
        method: "GET",
        path: `${target.url.pathname}${target.url.search}`,
        headers,
        signal: controller.signal,
        servername: isIP(target.hostname) ? undefined : target.hostname,
        lookup(_hostname, _options, callback) {
          callback(null, target.pinned.address, target.pinned.family);
        },
      };
      let request;
      try {
        request = httpsRequest(options, async (response) => {
          try {
            const statusCode = Number(response.statusCode) || 0;
            if (statusCode >= 300 && statusCode < 400) {
              response.destroy?.();
              throw imagePolicyError(
                "REMOTE_IMAGE_REDIRECT_DENIED",
                "Перенаправление удалённого изображения отклонено.",
                502
              );
            }
            if (statusCode < 200 || statusCode >= 300) {
              response.destroy?.();
              throw imagePolicyError(
                "REMOTE_IMAGE_HTTP_ERROR",
                "Удалённый источник изображения вернул ошибку.",
                502
              );
            }
            const buffer = await readBoundedResponse(
              {
                headers: response.headers,
                body: response,
              },
              {
                maxBytes: limit,
                signal: controller.signal,
              }
            );
            resolve({
              buffer,
              contentType: String(
                response.headers?.["content-type"] || ""
              ).toLowerCase(),
            });
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
        return;
      }
      request.once("error", (error) => {
        if (controller.signal.aborted || error?.name === "AbortError") {
          reject(
            imagePolicyError(
              "UPSTREAM_RESPONSE_ABORTED",
              "Исходящий запрос был прерван.",
              502,
              error
            )
          );
          return;
        }
        reject(
          imagePolicyError(
            "REMOTE_IMAGE_REQUEST_FAILED",
            "Не удалось безопасно загрузить удалённое изображение.",
            502,
            error
          )
        );
      });
      request.setTimeout?.(timeoutMs, () => controller.abort());
      request.end();
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

export {
  imagePolicyError,
  isPublicIpv4,
  isPublicIpv6,
};
