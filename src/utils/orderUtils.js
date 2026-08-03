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
    return Math.max(1, Number(product.packSize) || 1);
  }

  if (unit === "bundle") {
    return Math.max(1, Number(product.bundleSize) || 1);
  }

  // Штука: всегда 1 шт на единицу продажи (1,2,3 → в 1С 1,2,3 шт).
  return 1;
}
