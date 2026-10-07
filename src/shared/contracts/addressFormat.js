// Presentation only: preserve each source component, including ambiguous export labels.
export function orderRecognizedAddress(value) {
  if (typeof value !== 'string') return value;
  const parts = value.split(',').map(part => part.trim());
  if (parts.some(part => !part) || parts.length < 5) return value;
  const classify = part => {
    if (/^\d{6}$/u.test(part)) return 'postcode';
    if (/^(?:улица\s|ул\.\s*|проспект\s|пр-т\s|переулок\s|пер\.\s*|шоссе\s|набережная\s|наб\.\s*)\S/iu.test(part)) return 'street';
    if (/^(?:дом\s|д\.\s*)\d[\p{L}\d/ -]*$/iu.test(part)) return 'house';
    if (/^(?:корп\.\/ст\.|корп\.|корпус\s|строение\s|стр\.|кв\.\/оф\.|кв\.|квартира\s|оф\.|офис\s|литера\s|лит\.|помещение\s|пом\.)\s*[\p{L}\d][\p{L}\d/ -]*$/iu.test(part)) return 'detail';
    if (/^(?:г\.\s*|город\s)\S/iu.test(part)) return 'city';
    if (/^(?:р-н\s|район\s)\S/iu.test(part) || /^.+\sрайон$/iu.test(part)) return 'district';
    if (/^.+\s(?:область|обл\.|край|республика)$/iu.test(part) || /^Республика\s\S/iu.test(part)) return 'region';
    return null;
  };
  const classified = parts.map(part => ({part, kind: classify(part)}));
  if (classified.some(item => !item.kind)) return value;
  for (const kind of ['street', 'house', 'city', 'district', 'region']) {
    if (classified.filter(item => item.kind === kind).length !== 1) return value;
  }
  if (classified.filter(item => item.kind === 'postcode').length > 1) return value;
  const first = classified.find(item => item.kind !== 'postcode');
  if (first?.kind !== 'street') return value;
  const ranks = {postcode: 0, region: 1, district: 2, city: 3, street: 4, house: 5, detail: 6};
  return [...classified].sort((a, b) => ranks[a.kind] - ranks[b.kind]).map(item => item.part).join(', ');
}

export function formatRecognizedAddresses(result) {
  let next = result;
  for (const field of ['legalAddress', 'postalAddress']) {
    if ((result.warnings || []).some(item => item.code === 'AMBIGUOUS_REQUISITE' && [field, 'type'].includes(item.field))) continue;
    const originalValue = result.fields?.[field];
    const value = orderRecognizedAddress(originalValue);
    if (value === originalValue) continue;
    next = {...next, fields: {...next.fields, [field]: value}, provenance: {...next.provenance,
      [field]: {...next.provenance?.[field], originalValue, addressFormatting: 'component_order_only'},
    }};
  }
  return next;
}
