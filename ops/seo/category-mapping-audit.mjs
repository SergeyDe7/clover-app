/** Общая логика аудита 187 category mappings. */
export function auditCategoryMapping(item) {
  const slug = item.oldSlug;
  const target = (item.categoryPath || item.target.replace("https://clover-spb.ru", "")).toLowerCase();
  const notes = [];

  const expect = (cond, paths) => {
    if (!cond) return;
    if (!paths.some((p) => target.includes(p))) {
      notes.push(`ожидали path с ${paths.join("|")}, получили ${target}`);
    }
  };

  expect(/folga|pergament|strejch|plenka-pish|pishchevaya-plenka/i.test(slug), [
    "folga-plenka",
    "plenka-pod-zapaj",
    "prochee",
  ]);
  expect(/gubk|mochalk/i.test(slug), ["gubki-dlya-posudy"]);
  expect(/meshok-dlya-musora|musor.*paket|paket-dlya-musora/i.test(slug), ["meshki-dlya-musora"]);
  expect(/tryapka|mop|netkol/i.test(slug) && !/polotenc/i.test(slug), ["tryapki-mopy"]);
  expect(/polotenc|polotence/i.test(slug), ["bumazhnye-polotenca"]);
  expect(/tualetn|tualet-bum/i.test(slug), ["tualetnaya-bumaga"]);
  expect(/salfetk|salvetk|vlazhn/i.test(slug), ["salfetki"]);
  expect(/paket-maj|majka/i.test(slug), ["pakety-majki", "prochee"]);
  expect(/fasovochn|fasovochnyj|zip-lock|zamkom/i.test(slug), ["pakety-fasovochnye", "prochee"]);
  expect(/vakuumn/i.test(slug), ["pakety-vakuumnye"]);
  expect(/kraft.*ruch|paket-s-kr-ruch/i.test(slug), ["bumazhnye-pakety-s-ruchkoj", "bumazhnye-pakety-bez"]);
  expect(/zhiroudal|udaleniya-zhira|antizhir|shumanit|unicum-gold|grill|adriel.*plit/i.test(slug), [
    "zhiroudaliteli",
  ]);
  expect(
    /dlya-posud|mytya-posud|akvalon|fairy|raduga-dlya-posud/i.test(slug) && !/gubk|mochalk/i.test(slug),
    ["dlya-mytya-posudy", "prochee"]
  );
  expect(/dlya-okon|stekol|zerkal/i.test(slug), ["dlya-okon", "universalnye"]);
  expect(/dlya-pol|mytya-pol/i.test(slug), ["dlya-polov"]);
  expect(/santehnik|sanoks|domestos|adrilan/i.test(slug), ["dlya-santehniki", "prochee"]);
  expect(/dezinf|antisept|septo/i.test(slug), ["dlya-dezinfekcii"]);
  expect(/mylo|mylо/i.test(slug), ["mylo"]);
  expect(/poroshok|pemolyuks|stiraln/i.test(slug), ["poroshki", "prochee"]);
  expect(/osvezhitel|airwick|ballon/i.test(slug), ["prochee"]);
  expect(/bloknot|bumaga-a4|marker|kassovaya-lenta|kancely|etiket|schet-restoran/i.test(slug), [
    "kancelyarskie",
  ]);
  expect(/trubochk|shampur|koktejl|barn/i.test(slug), ["barnye-aksessuary"]);
  expect(/mister-proper|proper-univ|moyushchee-sr/i.test(slug), ["universalnye", "dlya-okon"]);
  expect(/butylk|bulytk|flakon/i.test(slug) && !/stakan|lotok/i.test(slug), ["butylki"]);
  expect(/stakan|rukav-dlya-stakan|kryshka.*stakan/i.test(slug), ["stakany", "butylki"]);
  expect(/lanchboks|lanch-boks/i.test(slug), ["lanch-boksy", "kontejnery-pod-zapaj"]);
  expect(/lotok/i.test(slug), ["lotki", "kontejnery"]);
  expect(/kontejner|rakushk|banochk|spk|kryshka-k-kont/i.test(slug) && !/lanch-boks|lanchboks/.test(slug), [
    "kontejnery",
    "kontejnery-pod-zapaj",
    "sousniki",
  ]);
  expect(/sousnik/i.test(slug), ["sousniki"]);
  expect(/tarel|salatnik|misk/i.test(slug), ["tarelki-miski", "kontejnery"]);
  expect(/vilka|lozhka|nozh|pribor|zubochist/i.test(slug), ["stolovye-pribory"]);
  expect(/perchatk|nitriл|vinilov|lateks/i.test(slug), ["perchatki"]);
  expect(/halat|shapochk|bahil|bakhil|perednik|fartuk|maska-med/i.test(slug), [
    "odnorazovaya-odezhda",
    "perchatki",
  ]);
  expect(/picc|pizza|korobk.*pic/i.test(slug), ["korobki-dlya-piccy", "konditerskih"]);
  expect(/forma-alyum|alyum.*form/i.test(slug), ["formy-alyuminievye"]);
  expect(/vedr/i.test(slug), ["vedra"]);
  expect(
    /konditer|kapkeyk|eco-cake|pirozhn/i.test(slug) && !/kontejner|rakushk/.test(slug),
    ["konditerskih", "bumazhnaya-upakovka"]
  );

  if (/zubochist/i.test(slug) && target.includes("salfetki")) {
    notes.push("зубочистки ≠ салфetki");
  }

  return { status: notes.length ? "error" : "ok", notes };
}

export function parseMapConf(filePath, fs) {
  const text = fs.readFileSync(filePath, "utf8");
  const entries = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s+(\S+)\s+(https:\/\/\S+?);?\s*$/);
    if (m) entries.set(m[1], m[2]);
  }
  return entries;
}
