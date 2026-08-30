/** Short diagnostic build id from Vite-stamped meta (e.g. ui-20260830-DlCKyJtC → DlCKyJtC). */
export function getCloverUiBuildFull() {
  if (typeof document === "undefined") return "ui-dev";
  return (
    document.querySelector('meta[name="clover-ui-build"]')?.getAttribute("content")?.trim() ||
    "ui-dev"
  );
}

export function getCloverUiBuildShort() {
  const full = getCloverUiBuildFull();
  const parts = full.split("-").filter(Boolean);
  return parts[parts.length - 1] || full;
}
