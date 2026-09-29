export const WRITE_PASSWORD_MIN_LENGTH = 12;
export const WRITE_PASSWORD_MAX_LENGTH = 200;
export const WRITE_PASSWORD_MAX_UTF8_BYTES = 72;
export const WRITE_PASSWORD_MESSAGE =
  "Пароль должен содержать от 12 до 200 символов и занимать не более 72 байт UTF-8.";
export const PASSWORD_PROOF_MESSAGE = "Пароль должен содержать от 1 до 200 символов.";

export function isPasswordProofAllowed(value) {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= WRITE_PASSWORD_MAX_LENGTH;
}

export function isWritePasswordAllowed(value) {
  const length = typeof value === "string" ? Array.from(value).length : 0;
  return (
    typeof value === "string"
    && length >= WRITE_PASSWORD_MIN_LENGTH
    && length <= WRITE_PASSWORD_MAX_LENGTH
    && Buffer.byteLength(value, "utf8") <= WRITE_PASSWORD_MAX_UTF8_BYTES
    && value.trim().length > 0
  );
}
