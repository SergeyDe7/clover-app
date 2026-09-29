export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;
export const PASSWORD_MAX_UTF8_BYTES = 72;

export function isValidNewPassword(password) {
  const value = String(password ?? "");
  const length = Array.from(value).length;
  return (
    length >= PASSWORD_MIN_LENGTH &&
    length <= PASSWORD_MAX_LENGTH &&
    new TextEncoder().encode(value).length <= PASSWORD_MAX_UTF8_BYTES &&
    value.trim().length > 0
  );
}
