/**
 * Карта старых папок Megagroup /magazin/folder/{slug}
 * → новые URL clover-spb.ru (латинские ЧПУ).
 *
 * Не ведёт «всё на главную»: неизвестные folder оставляем без записи
 * (в nginx — fallback на /catalog, не на /).
 */
export const MAGAZIN_FOLDER_TO_PATH = {
  "bumazhnaya-produkciya": "/catalog/bumazhnaya-produkciya",
  salfetki: "/catalog/bumazhnaya-produkciya/salfetki",
  "tualetnaya-bumaga": "/catalog/bumazhnaya-produkciya/tualetnaya-bumaga",
  "bumazhnyj-polotenca": "/catalog/bumazhnaya-produkciya/bumazhnye-polotenca",
  "vlazhnye-salfetki": "/catalog/bumazhnaya-produkciya/salfetki",

  "odnorazovaya-posuda": "/catalog/odnorazovaya-posuda",
  "eko-posuda": "/catalog/odnorazovaya-posuda",
  kontejnery: "/catalog/odnorazovaya-posuda/kontejnery",
  "kontejnery-rakushki": "/catalog/odnorazovaya-posuda/kontejnery",
  "lanch-boksy": "/catalog/odnorazovaya-posuda/lanch-boksy",
  "korobki-dlya-piccy": "/catalog/odnorazovaya-posuda/korobki-dlya-piccy",
  sousniki: "/catalog/odnorazovaya-posuda/sousniki",
  "tarelki-miski": "/catalog/odnorazovaya-posuda/tarelki-miski",
  stakany: "/catalog/odnorazovaya-posuda/stakany",
  "stolovye-pribory": "/catalog/odnorazovaya-posuda/stolovye-pribory",
  "bulytki-pet": "/catalog/odnorazovaya-posuda/butylki",
  "upakovka-dlya-konditerskih-izdelij":
    "/catalog/odnorazovaya-posuda/dlya-konditerskih-izdelij",
  upakovka: "/catalog/odnorazovaya-posuda/bumazhnaya-upakovka",

  hoztovary: "/catalog/hozyajstvennye-tovary",
  "folga-plenka": "/catalog/hozyajstvennye-tovary/folga-plenka-pergament",
  "meshki-dlya-musora": "/catalog/hozyajstvennye-tovary/meshki-dlya-musora",
  "gubki-mochalki": "/catalog/hozyajstvennye-tovary/gubki-dlya-posudy",
  "vafelnoe-polotno": "/catalog/hozyajstvennye-tovary/tryapki-mopy-polotenca",
  "odnorazovye-perchatki": "/catalog/hozyajstvennye-tovary/perchatki",
  "mnogorazovye-perchatki": "/catalog/hozyajstvennye-tovary/perchatki",
  "fartuki-halaty-shapochki-pilotki-bahily":
    "/catalog/hozyajstvennye-tovary/odnorazovaya-odezhda",
  "sredstva-zashchity": "/catalog/hozyajstvennye-tovary/odnorazovaya-odezhda",

  "bytovaya-himiya": "/catalog/himiya-chistyashchie-sredstva",
  zhiroudaliteli: "/catalog/himiya-chistyashchie-sredstva/zhiroudaliteli",
  "sredstva-dlya-mytya-posudy":
    "/catalog/himiya-chistyashchie-sredstva/dlya-mytya-posudy",
  "sredstva-dlya-mytya-okon": "/catalog/himiya-chistyashchie-sredstva/dlya-okon",
  "sredstva-dlya-mytya-polov-i-sten":
    "/catalog/himiya-chistyashchie-sredstva/dlya-polov",
  "sredstva-dlya-santehniki":
    "/catalog/himiya-chistyashchie-sredstva/dlya-santehniki",
  "dezinfekciya-i-antiseptik":
    "/catalog/himiya-chistyashchie-sredstva/dlya-dezinfekcii",
  mylo: "/catalog/himiya-chistyashchie-sredstva/mylo",
  "stiralnye-poroshki": "/catalog/himiya-chistyashchie-sredstva/poroshki",
  "dlya-posudomoechnyh-mashin":
    "/catalog/himiya-chistyashchie-sredstva/dlya-posudomoechnyh-mashin",
  "dlya-mebeli": "/catalog/himiya-chistyashchie-sredstva/universalnye",
  "osvezhiteli-vozduha":
    "/catalog/himiya-chistyashchie-sredstva/osvezhiteli-vozduha",
  "sredstva-ot-zasorov": "/catalog/himiya-chistyashchie-sredstva/prochee",

  "pakety-majka": "/catalog/pakety-upakovochnye-materialy/pakety-majki",
  "fasofochnye-pakety":
    "/catalog/pakety-upakovochnye-materialy/pakety-fasovochnye",
  "vakuumnye-pakety":
    "/catalog/pakety-upakovochnye-materialy/pakety-vakuumnye",
  "bumazhnye-pakety":
    "/catalog/pakety-upakovochnye-materialy/bumazhnye-pakety-bez-ruchki",
  "shpagat-vereki-lenty": "/catalog/pakety-upakovochnye-materialy/prochee",

  "barnye-tovary": "/catalog/barnye-aksessuary",
  "palochki-shampury-zubochistki-trubochki": "/catalog/barnye-aksessuary",

  kancelyariya: "/catalog/kancelyarskie-tovary",

  raznoe: "/catalog/prochee",
  "35338102": "/catalog/prochee",
};

/** Прочие частые пути старого сайта → релевантные страницы (не главная). */
export const MAGAZIN_OTHER_TO_PATH = {
  "/kontakty": "/contacts",
  "/dostavka": "/contacts",
  "/o-kompanii": "/contacts",
  "/magazin": "/catalog",
  "/magazin/": "/catalog",
};
