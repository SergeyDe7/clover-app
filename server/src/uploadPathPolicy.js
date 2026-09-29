export function inspectUploadRequestPath(rawPath) {
  const raw = String(rawPath || "").split("?")[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { valid: false, privateNamespace: true, normalizedPath: "" };
  }
  if (decoded.includes("\0")) {
    return { valid: false, privateNamespace: true, normalizedPath: "" };
  }
  const parts = decoded
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    return { valid: false, privateNamespace: true, normalizedPath: "" };
  }
  return {
    valid: true,
    privateNamespace: String(parts[0] || "").toLowerCase() === "reconciliation",
    normalizedPath: `/${parts.join("/")}`,
  };
}

export function denyPrivateUploadNamespace(req, res, next) {
  // This middleware is mounted at /uploads. Express keeps originalUrl rooted at
  // /uploads, while req.url is relative to the mount and is therefore the value
  // the following express.static middleware will resolve.
  const inspected = inspectUploadRequestPath(req.url || req.path);
  if (!inspected.valid || inspected.privateNamespace) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).end();
  }
  next();
}
