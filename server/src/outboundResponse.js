function responseError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = 502;
  return error;
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return String(headers.get(name) || "");
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) {
      return Array.isArray(value) ? String(value[0] || "") : String(value || "");
    }
  }
  return "";
}

function declaredContentLength(headers) {
  const raw = headerValue(headers, "content-length").trim();
  if (!/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function stopBody(body, reader) {
  try {
    if (reader && typeof reader.cancel === "function") {
      await reader.cancel();
      return;
    }
    if (typeof body?.destroy === "function") {
      body.destroy();
      return;
    }
    if (typeof body?.cancel === "function") {
      await body.cancel();
    }
  } catch {
    // Best effort after a policy rejection.
  }
}

function assertNotAborted(signal) {
  if (signal?.aborted) {
    throw responseError(
      "UPSTREAM_RESPONSE_ABORTED",
      "Исходящий запрос был прерван."
    );
  }
}

export async function readBoundedResponse(
  response,
  {
    maxBytes,
    signal,
    enforceContentLength = true,
  } = {}
) {
  const limit = Number(maxBytes);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }

  const body = response?.body;
  const declared = declaredContentLength(response?.headers);
  if (declared !== null && declared > limit) {
    await stopBody(body);
    throw responseError(
      "UPSTREAM_RESPONSE_TOO_LARGE",
      "Ответ внешнего сервиса превышает допустимый размер."
    );
  }
  if (!body) {
    if (enforceContentLength && declared !== null && declared !== 0) {
      throw responseError(
        "UPSTREAM_RESPONSE_TRUNCATED",
        "Ответ внешнего сервиса был получен не полностью."
      );
    }
    return Buffer.alloc(0);
  }

  const chunks = [];
  let total = 0;
  let reader = null;
  try {
    assertNotAborted(signal);
    if (typeof body.getReader === "function") {
      reader = body.getReader();
      while (true) {
        assertNotAborted(signal);
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        if (total + chunk.length > limit) {
          await stopBody(body, reader);
          throw responseError(
            "UPSTREAM_RESPONSE_TOO_LARGE",
            "Ответ внешнего сервиса превышает допустимый размер."
          );
        }
        chunks.push(chunk);
        total += chunk.length;
      }
    } else {
      for await (const value of body) {
        assertNotAborted(signal);
        const chunk = Buffer.from(value);
        if (total + chunk.length > limit) {
          await stopBody(body);
          throw responseError(
            "UPSTREAM_RESPONSE_TOO_LARGE",
            "Ответ внешнего сервиса превышает допустимый размер."
          );
        }
        chunks.push(chunk);
        total += chunk.length;
      }
    }
  } catch (error) {
    if (error?.code?.startsWith("UPSTREAM_RESPONSE_")) throw error;
    if (signal?.aborted || error?.name === "AbortError") {
      await stopBody(body, reader);
      throw responseError(
        "UPSTREAM_RESPONSE_ABORTED",
        "Исходящий запрос был прерван.",
        error
      );
    }
    throw error;
  } finally {
    try {
      reader?.releaseLock?.();
    } catch {
      // Ignore release after cancel.
    }
  }

  if (
    enforceContentLength &&
    declared !== null &&
    declared !== total
  ) {
    throw responseError(
      "UPSTREAM_RESPONSE_TRUNCATED",
      "Ответ внешнего сервиса был получен не полностью."
    );
  }
  return Buffer.concat(chunks, total);
}

export function boundedResponseLimit(
  value,
  {
    fallback,
    minimum,
    maximum,
  }
) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return fallback;
  }
  return parsed;
}

export {
  declaredContentLength,
  headerValue,
  responseError,
};
