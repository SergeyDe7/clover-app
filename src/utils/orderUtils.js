export function formatOrderDate(dateString) {
  if (!dateString) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU").format(
    new Date(`${dateString}T12:00:00`)
  );
}

export function getUnitMultiplier(product, unit) {
  if (unit === "pack") {
    return product.packSize || 1;
  }

  if (unit === "bundle") {
    return product.bundleSize || 1;
  }

  return product.pieceSize || 1;
}
