/** Уникальные id матрицы без отбрасывания по имени. */
export function uniqueMatrixProductIds(ids) {
  const seen = new Set();
  const unique = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const key = String(raw ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(raw);
  }
  return unique;
}

/** Снимок списка матрицы только растёт: снятая галочка не прячет строку до сохранения. */
export function growMatrixIdList(existing, incoming) {
  return uniqueMatrixProductIds([
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]).map((id) => String(id));
}

/** Галочка в списке матрицы — выбор для удаления, не членство. */
export function toggleMatrixProductId(ids, productId, checked) {
  const current = uniqueMatrixProductIds(ids);
  const key = String(productId ?? "").trim();
  if (!key) return current;
  if (checked) {
    if (current.some((id) => String(id) === key)) return current;
    return [...current, productId];
  }
  return current.filter((id) => String(id) !== key);
}

/** Убрать выбранные id из матрицы: только явные id, без схлопывания по имени. */
export function idsWithout(ids, removeIds) {
  const remove = new Set(
    (Array.isArray(removeIds) ? removeIds : []).map((id) => String(id ?? "").trim()).filter(Boolean)
  );
  return uniqueMatrixProductIds(ids).filter((id) => !remove.has(String(id)));
}
