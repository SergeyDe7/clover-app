/**
 * Localized legal-page bodies (AUTO drafts).
 * Canonical RU: src/screens/storefront/pages/infoPageContent.js
 * Not a certified legal translation — legalReviewVerified stays false.
 */

const CONTACTS = { name: "contacts" };

export const LEGAL_INFO_PAGE_BODIES = {
  "privacy-policy": {
    en: [
      {
        type: "p",
        text: "Personal-data operator: Limited Liability Company “Klever” (LLC “Klever”), INN 7813285010, OGRN 1177847262669 (the Operator). Legal address: 197110, St. Petersburg, Krasnogo Kursanta St., 25, letter Zh, room 3N. Website: https://clover-spb.ru. Personal-data requests: 9112368277@mail.ru. The phone and address on the Contacts page are for communication and may differ from the legal address.",
      },
      {
        type: "p",
        text: "This Policy describes what data is processed on the storefront and at checkout, why it is needed, on what grounds it is processed, how it is stored, who may receive it, how cookies and localStorage are used, how optional analytics works, and how to contact the Operator. Viewing the site by itself is not consent to processing and does not enable optional analytics.",
      },
      { type: "h2", text: "Purposes and categories of data" },
      {
        type: "p",
        text: "To accept and fulfil an order, reply to an enquiry, and meet duties set by law, the Operator processes data that a visitor enters in storefront forms or when registering in the client cabinet.",
      },
      {
        type: "list",
        items: [
          "Name of the contact person, organisation name.",
          "Phone, email, delivery or pickup address, order comment.",
          "Order contents and service status of the request.",
          "Technical data needed for the site to work: interface language, cart contents, the analytics-consent choice.",
        ],
      },
      {
        type: "p",
        text: "Advertising and analytics are not a condition of placing an order. Separate consent to advertising mail is not requested in this edition and is not required to check out.",
      },
      { type: "h2", text: "Legal bases" },
      {
        type: "list",
        items: [
          "Entering into and performing a contract — when a visitor places an order or asks to be contacted about an order.",
          "Duties imposed on the Operator by law.",
          "Separate voluntary consent — only for optional Yandex Metrica analytics, and only if the tag is enabled on the site.",
        ],
      },
      { type: "h2", text: "How long data is stored" },
      {
        type: "p",
        text: "The Operator keeps data no longer than needed for the stated purpose or required by law (Federal Law No. 152-FZ of 27 July 2006, art. 5). When the purpose is fulfilled and no legal basis remains, processing for that purpose stops. Minimum document-keeping periods do not mean every record must be deleted exactly after five years: special statutory periods and other legal bases may apply.",
      },
      {
        type: "list",
        items: [
          "Data and documents needed for mandatory accounting and tax records: at least five years after the reporting year (Federal Law No. 402-FZ of 6 December 2011, art. 29(1)) and at least five years as accounting/tax data and other documents needed to calculate and pay tax (Tax Code of the Russian Federation, art. 23(1)(8)). That is a minimum keeping period for those documents, not a date when they must be deleted.",
          "Other order data that are not such accounting documents (including a free-text comment if it is not needed for accounting), enquiries that are not accounting documents, and cabinet profile details not needed for accounting: kept while needed to accept and fulfil an order, reply to an enquiry, or run the account. When that purpose is fulfilled and no other legal basis remains, processing for that purpose stops. Mandatory accounting periods do not automatically apply to them.",
          "Service action log: while needed to run the site and handle requests. The law does not set a separate numeric period for this log.",
          "Copies of the working database on the same server in Russia follow the same purposes as the matching working records. Replacing technical archives does not set an order-retention period. A separate off-site store is not confirmed.",
          "Browser records (cart, language, analytics choice): on your device until you clear site data or change the choice.",
          "Data already sent to Yandex Metrica: turning the tag off or withdrawing consent stops new sends in that browser and does not delete data already sent. Further retention by LLC “YANDEX” follows the service documents.",
        ],
      },
      {
        type: "p",
        text: "The Operator also keeps orders in the “1C:Our Firm” information system. That is software the Operator uses, not a separate legal person and not a standalone recipient.",
      },
      { type: "h2", text: "Who may receive data" },
      {
        type: "list",
        items: [
          "Operator staff who need the data to accept and fulfil the order.",
          "LLC “Filanko Saint Petersburg” (INN 7838492138, KPP 783801001) — VPS for the site and working database.",
          "An email service — if the Operator sends service notices about an order.",
          "The Telegram service — if the Operator enabled manager notices about orders.",
          "LLC “YANDEX” — Yandex Metrica after separate consent and when the tag is enabled; maps on the Contacts page if a map is shown.",
        ],
      },
      {
        type: "p",
        text: "The site and working database are hosted on a server in the Russian Federation. VPS is provided by LLC “Filanko Saint Petersburg”, INN 7838492138, KPP 783801001. The provider and country were confirmed by the supplier’s particulars and the site owner.",
      },
      { type: "h2", text: "Cookies and localStorage" },
      {
        type: "p",
        text: "The site uses the browser’s local storage so the cart, language and analytics-consent choice stay on this device. These records are needed for the storefront and do not by themselves load the analytics tag.",
      },
      {
        type: "p",
        text: "Yandex Metrica cookies and identifiers appear only if the tag is enabled on the site and the visitor pressed “Allow analytics”. Decline, no answer or a disabled tag does not set them. The analytics-consent prompt is not shown and is not collected in advance while the tag is off.",
      },
      { type: "h2", text: "Optional analytics — Yandex Metrica" },
      {
        type: "p",
        text: "If the tag is enabled, the Operator may with your consent use the Yandex Metrica service of Limited Liability Company “YANDEX” to understand how the storefront is used and to assess advertising. The service receives technical data about visits to public pages and selected actions. This data is not fully anonymous.",
      },
      {
        type: "p",
        text: "LLC “YANDEX” acts on the Operator’s instructions in connection with the service. Current terms: https://yandex.ru/legal/metrica_termsofuse , https://yandex.ru/legal/confidential , https://yandex.ru/legal/cookies_policy , https://yandex.ru/support/metrica/ru/general/cookie-usage .",
      },
      {
        type: "list",
        items: [
          "The tag loads only after “Allow analytics”. While the tag is off, the consent prompt is not shown. Decline or no answer does not block the catalog, sign-in or checkout.",
          "Technical visit and device data, viewed public pages, the traffic source and allowed advertising parameters (utm_*, yclid, ymclid, ysclid, gclid) may be sent when they look like campaign tokens, not like contacts or other personal details.",
          "Storefront events: page view; order_submitted — only after a confirmed successful public order; contact_phone_click and contact_message_click — a public phone or email click on the contacts page.",
          "Webvisor is off. Screen sessions are not recorded.",
          "Customer names, contacts, addresses, comments, passwords and form contents are not included in analytics events.",
          "The client cabinet and sensitive pages (sign-in, password reset, admin and operational areas) are excluded. Orders placed in the cabinet are not sent to Metrica.",
          "If the tag is enabled, you can change or withdraw consent in “Analytics settings” in the site footer. Withdrawal stops new sends in that browser, but does not cancel requests already started and does not delete previously sent data automatically.",
        ],
      },
      { type: "h2", text: "Rights and requests" },
      {
        type: "p",
        text: "You may request information about processing of your data, correction, restriction or deletion, and withdraw consent where it is required, by writing to 9112368277@mail.ru. Withdrawing analytics consent does not cancel processing of an already accepted order if that processing is needed to fulfil it or to comply with law.",
      },
      { type: "route", route: CONTACTS, label: "Operator contacts" },
    ],
    uz: [
      {
        type: "p",
        text: "Shaxsiy ma’lumotlar operatori: «Klever» MChJ, INN 7813285010, OGRN 1177847262669 (Operator). Yuridik manzil: 197110, Sankt-Peterburg, Krasnogo Kursanta ko‘chasi, 25, lit. J, xona 3N. Sayt: https://clover-spb.ru. Shaxsiy ma’lumotlar: 9112368277@mail.ru. «Kontaktlar»dagi telefon va manzil aloqa uchun, yuridik manzildan farq qilishi mumkin.",
      },
      {
        type: "p",
        text: "Ushbu Siyosat vitrina va buyurtmada qanday ma’lumotlar qayta ishlanishi, nima uchun kerakligi, qaysi asosda qayta ishlanishi, qanday saqlanishi, kimga uzatilishi, cookie va localStorage qanday ishlatilishi, ixtiyoriy analitika qanday ishlashi va Operatorga qanday murojaat qilishni tushuntiradi. Saytni ko‘rishning o‘zi qayta ishlashga rozilik emas va ixtiyoriy analitikani yoqmaydi.",
      },
      { type: "h2", text: "Maqsadlar va ma’lumot toifalari" },
      {
        type: "p",
        text: "Buyurtmani qabul qilish va bajarish, murojaatga javob berish va qonun yuklagan majburiyatlarni bajarish uchun Operator tashrif buyuruvchi vitrina shakllarida yoki kabinetda ro‘yxatdan o‘tishda kiritgan ma’lumotlarni qayta ishlaydi.",
      },
      {
        type: "list",
        items: [
          "Kontakt shaxsning ismi, tashkilot nomi.",
          "Telefon, elektron pochta, yetkazib berish yoki olib ketish manzili, buyurtma izohi.",
          "Buyurtma tarkibi va murojaat holati.",
          "Sayt ishlashi uchun texnik ma’lumotlar: interfeys tili, savat, analitika roziligi.",
        ],
      },
      {
        type: "p",
        text: "Reklama va analitika buyurtma sharti emas. Reklama yuborishga alohida rozilik so‘ralmaydi va buyurtma uchun shart emas.",
      },
      { type: "h2", text: "Qayta ishlash asoslari" },
      {
        type: "list",
        items: [
          "Shartnoma tuzish va bajarish — tashrif buyuruvchi buyurtma bersa yoki buyurtma haqida bog‘lanishni so‘rasa.",
          "Qonun Operator zimmasiga yuklagan majburiyatlar.",
          "Alohida ixtiyoriy rozilik — faqat Yandex Metrica uchun va faqat hisoblagich yoqilgan bo‘lsa.",
        ],
      },
      { type: "h2", text: "Ma’lumotlar qancha saqlanadi" },
      {
        type: "p",
        text: "Operator ma’lumotni maqsad yoki qonun talab qilganidan uzoqroq saqlamaydi (152-FZ, 5-modda). Maqsad tugagach va asos qolmasa, shu maqsad uchun qayta ishlash to‘xtaydi. Hisob hujjatlarining minimal muddati barcha ma’lumotlar besh yildan so‘ng o‘chiriladi degani emas: maxsus muddatlar va boshqa asoslar bo‘lishi mumkin.",
      },
      {
        type: "list",
        items: [
          "Majburiy buxgalteriya va soliq hisobi uchun kerak ma’lumot va hujjatlar: hisobot yilidan keyin kamida besh yil (402-FZ, 29-modda) va soliq hisoblash uchun kamida besh yil (NK RF 23-modda 8-band). Bu saqlashning minimal muddati, o‘chirish sanasi emas.",
          "Bunday hisob hujjatlariga kirmaydigan boshqa buyurtma ma’lumotlari (hisob uchun kerak bo‘lmasa, ixtiyoriy izoh), hisob hujjati bo‘lmagan murojaatlar va hisob uchun kerak bo‘lmagan kabinet profili: buyurtma, murojaat yoki hisob yuritish uchun kerak bo‘lgancha. Majburiy hisob muddatlari ularga avtomatik tatbiq etilmaydi.",
          "Harakatlar jurnali: sayt ishlashi va murojaatlar uchun kerak bo‘lgancha. Qonunda alohida raqam yo‘q.",
          "Rossiyadagi xuddi shu serverdagi nusxalar mos ishchi yozuvlar bilan bir maqsadga bo‘ysunadi. Tashqi ombor tasdiqlanmagan.",
          "Brauzer yozuvlari: qurilmangizda, tozalaguncha yoki tanlovni o‘zgartirguncha.",
          "Yandex Metricaga allaqachon yuborilgan ma’lumot: hisoblagichni o‘chirish yoki rozilikni qaytarib olish yangi yuborishni to‘xtatadi va yuborilganini o‘chirmaydi. Keyingi saqlash — «YANDEX» MChJ hujjatlarida.",
        ],
      },
      {
        type: "p",
        text: "Buyurtmalar «1C:UNF» axborot tizimida ham yuritiladi. Bu Operator ishlatadigan dastur, alohida yuridik shaxs va mustaqil qabul qiluvchi emas.",
      },
      { type: "h2", text: "Kim ma’lumot olishi mumkin" },
      {
        type: "list",
        items: [
          "Buyurtmani qabul qilish va bajarish uchun kerak Operator xodimlari.",
          "«Filanko Sankt-Peterburg» MChJ (INN 7838492138, KPP 783801001) — sayt va ishchi baza VPS.",
          "Elektron pochta xizmati — buyurtma haqida xizmat xabari yuborilsa.",
          "Telegram — menejer ogohlantirishlari yoqilgan bo‘lsa.",
          "«YANDEX» MChJ — rozilikdan keyin Metrica; xarita ko‘rsatilsa «Kontaktlar»dagi xarita.",
        ],
      },
      {
        type: "p",
        text: "Sayt va ishchi baza Rossiya Federatsiyasidagi serverda. VPS: «Filanko Sankt-Peterburg» MChJ, INN 7838492138, KPP 783801001. Pudratchi va mamlakat yetkazib beruvchi rekvizitlari va egasi tomonidan tasdiqlangan.",
      },
      { type: "h2", text: "Cookie va localStorage" },
      {
        type: "p",
        text: "Sayt savat, til va analitika roziligini shu qurilmada saqlash uchun brauzer omboridan foydalanadi. Bu yozuvlar vitrina uchun kerak va o‘z-o‘zidan analitika hisoblagichini yuklamaydi.",
      },
      {
        type: "p",
        text: "Yandex Metrica cookie va identifikatorlari faqat hisoblagich yoqilgan va «Analitikaga ruxsat» bosilganda paydo bo‘ladi. Rad, javob yo‘qligi yoki o‘chiq hisoblagich ularni o‘rnatmaydi. Hisoblagich o‘chiq bo‘lsa, rozilik so‘ralmaydi va oldindan yig‘ilmaydi.",
      },
      { type: "h2", text: "Ixtiyoriy analitika — Yandex Metrica" },
      {
        type: "p",
        text: "Roziligingiz bilan Operator vitrinadan qanday foydalanishini tushunish va reklamani baholash uchun «YANDEX» MChJning Yandex Metrica xizmatini ishlatishi mumkin. Xizmat ommaviy sahifalarga tashriflar va ayrim amallar haqidagi texnik ma’lumotlarni oladi. Bu ma’lumotlar to‘liq anonim emas.",
      },
      {
        type: "p",
        text: "«YANDEX» MChJ xizmatni ko‘rsatishda Operator topshirig‘i bo‘yicha ishlaydi. Hujjatlar: https://yandex.ru/legal/metrica_termsofuse , https://yandex.ru/legal/confidential , https://yandex.ru/legal/cookies_policy , https://yandex.ru/support/metrica/ru/general/cookie-usage .",
      },
      {
        type: "list",
        items: [
          "Hisoblagich faqat «Analitikaga ruxsat» dan keyin yuklanadi. Hisoblagich o‘chiq bo‘lsa, rozilik so‘ralmaydi. Rad etish yoki javob yo‘qligi katalog, kirish va buyurtmani to‘xtatmaydi.",
          "Tashrif va qurilma haqidagi texnik ma’lumotlar, ochilgan ommaviy sahifalar, o‘tish manbai va ruxsat etilgan reklama parametrlari (utm_*, yclid, ymclid, ysclid, gclid) kampaniya belgisi bo‘lsa yuborilishi mumkin, kontakt yoki boshqa shaxsiy ma’lumot bo‘lsa — yo‘q.",
          "Vitrina hodisalari: sahifa ko‘rish; order_submitted — faqat tasdiqlangan ommaviy buyurtma muvaffaqiyatidan keyin; contact_phone_click va contact_message_click — kontaktlar sahifasidagi ommaviy telefon yoki xat.",
          "Webvisor o‘chiq. Ekran seansi yozilmaydi.",
          "Xaridor FIO, kontaktlari, manzillar, izohlar, parollar va shakl mazmuni analitika hodisalariga kiritilmaydi.",
          "Shaxsiy kabinet va sezgir sahifalar (kirish, parolni tiklash, ma’muriy bo‘limlar) analitikadan chiqarilgan. Kabinetdagi buyurtmalar Metrikaga yuborilmaydi.",
          "Hisoblagich yoqilgan bo‘lsa, rozilikni sayt pastidagi «Analitika sozlamalari»da o‘zgartirish yoki qaytarib olish mumkin. Qaytarib olish shu brauzerda yangi yuborishlarni to‘xtatadi, lekin boshlangan so‘rovlarni bekor qilmaydi va avval yuborilgan ma’lumotlarni avtomatik o‘chirmaydi.",
        ],
      },
      { type: "h2", text: "Huquqlar va murojaatlar" },
      {
        type: "p",
        text: "Ma’lumotlaringiz qayta ishlanishi, aniqlashtirish, cheklash yoki o‘chirish haqida so‘rash va kerak bo‘lgan joyda rozilikni qaytarib olish uchun 9112368277@mail.ru ga yozing. Analitika roziligini qaytarib olish qabul qilingan buyurtmani bajarish yoki qonunni bajarish uchun kerak bo‘lgan qayta ishlashni bekor qilmaydi.",
      },
      { type: "route", route: CONTACTS, label: "Operator kontaktlari" },
    ],
    ky: [
      {
        type: "p",
        text: "Жеке маалымат оператору: «Клевер» ЖЧК, ИНН 7813285010, ОГРН 1177847262669 (Оператор). Юридикалык дарек: 197110, Санкт-Петербург, Красного Курсанта көчөсү, 25, лит. Ж, бөлмө 3Н. Сайт: https://clover-spb.ru. Жеке маалымат: 9112368277@mail.ru. «Байланыштар»дагы телефон жана дарек байланыш үчүн, юридикалык даректен айырмаланышы мүмкүн.",
      },
      {
        type: "p",
        text: "Бул Саясат витринада жана заказда кандай маалымат иштетилерин, эмне үчүн керектигин, кайсы негизде иштетилерин, cookie жана localStorage кантип колдонуларын, милдеттүү эмес аналитика кандай иштээрин жана Операторго кантип кайрылууну түшүндүрөт. Сайтты көрүү өзү иштетүүгө макулдук эмес жана милдеттүү эмес аналитиканы күйгүзбөйт.",
      },
      { type: "h2", text: "Максаттар жана маалымат категориялары" },
      {
        type: "p",
        text: "Заказды кабыл алуу жана аткаруу, кайрылууга жооп берүү жана мыйзам жүктөгөн милдеттерди аткаруу үчүн Оператор витрина формаларында же кабинетте катталууда киргизилген маалыматты иштетет.",
      },
      {
        type: "list",
        items: [
          "Байланыш адамынын аты, уюмдун аталышы.",
          "Телефон, электрондук почта, жеткирүү же алып кетүү дареги, заказдагы комментарий.",
          "Заказдын курамы жана кайрылуунун абалы.",
          "Сайт иштеши үчүн техникалык маалымат: интерфейс тили, себет, аналитика макулдугу.",
        ],
      },
      {
        type: "p",
        text: "Жарнама жана аналитика заказдын шарты эмес. Жарнамалык жөнөтүүгө өзүнчө макулдук суралбайт жана заказ үчүн талап кылынбайт.",
      },
      { type: "h2", text: "Иштетүү негиздери" },
      {
        type: "list",
        items: [
          "Келишим түзүү жана аткаруу — зыяратчы заказ берсе же заказ боюнча байланышууну сураса.",
          "Мыйзам Операторго жүктөгөн милдеттер.",
          "Өзүнчө ыктыярдуу макулдук — Яндекс Метрика үчүн гана жана эсептегич күйгүзүлгөндө гана.",
        ],
      },
      { type: "h2", text: "Маалымат канча сакталат" },
      {
        type: "p",
        text: "Оператор маалыматты максат же мыйзам талап кылгандан узак сактабайт (152-ФЗ, 5-берене). Максат бүтүп, негиз калбаса, ошол максат үчүн иштетүү токтойт. Эсеп документтеринин минималдуу мөөнөтү бардык маалымат беш жылдан кийин өчүрүлөт деген эмес: атайын мөөнөттөр жана башка негиздер болушу мүмкүн.",
      },
      {
        type: "list",
        items: [
          "Милдеттүү бухгалтердик жана салык эсеби үчүн керек маалымат жана документтер: отчеттук жылдан кийин кеминде беш жыл (402-ФЗ, 29-берене) жана салык эсеби үчүн кеминде беш жыл (НК РФ 23-берене 8-пункт). Бул сактоонун минималдуу мөөнөтү, өчүрүү күнү эмес.",
          "Мындай эсеп документтерине кирбеген башка заказ маалыматы (эсеп үчүн керек болбосо, эркин комментарий), эсеп документи эмес кайрылуулар жана эсеп үчүн керек эмес кабинет профили: заказ, кайрылуу же эсеп үчүн керек болгончо. Милдеттүү эсеп мөөнөттөрү аларга автоматтык жайылтылбайт.",
          "Аракет журналы: сайт жана кайрылуулар үчүн керек болгончо. Мыйзамда өзүнчө сан жок.",
          "Орусиядагы ошол сервердеги көчүрмөлөр тиешелүү иш жазуулары менен бир максатка баш ийет. Тышкы сактоо ырасталган эмес.",
          "Браузер жазуулары: түзмөгүңүздө, тазалаганга же тандоону өзгөрткөнгө чейин.",
          "Яндекс Метрикага мурда жөнөтүлгөн маалымат: эсептегичти өчүрүү же макулдукту кайтаруу жаңы жөнөтүүнү токтотот жана жөнөтүлгөнүн өчүрбөйт. Кийинки сактоо — «ЯНДЕКС» ЖЧК документтеринде.",
        ],
      },
      {
        type: "p",
        text: "Заказдар «1C:UNF» маалымат тутумунда да жүргүзүлөт. Бул Оператор колдонгон программа, өзүнчө юридикалык жак жана өз алдынча алуучу эмес.",
      },
      { type: "h2", text: "Ким маалымат алышы мүмкүн" },
      {
        type: "list",
        items: [
          "Заказды кабыл алуу жана аткаруу үчүн керек Оператор кызматкерлери.",
          "«Филанко Санкт-Петербург» ЖЧК (ИНН 7838492138, КПП 783801001) — сайт жана иш базасынын VPS.",
          "Электрондук почта кызматы — заказ тууралуу кызмат билдирмеси жөнөтүлсө.",
          "Telegram — менеджер билдирмелери күйгүзүлгөн болсо.",
          "«ЯНДЕКС» ЖЧК — макулдуктан кийин Метрика; карта көрсөтүлсө «Байланыштар»дагы карта.",
        ],
      },
      {
        type: "p",
        text: "Сайт жана иш базасы Россия Федерациясындагы серверде. VPS: «Филанко Санкт-Петербург» ЖЧК, ИНН 7838492138, КПП 783801001. Жеткирүүчүнүн реквизиттери жана ээси тастыктаган.",
      },
      { type: "h2", text: "Cookie жана localStorage" },
      {
        type: "p",
        text: "Сайт себетти, тилди жана аналитика макулдугун ушул түзмөктө сактоо үчүн браузер кампасын колдонот. Бул жазуулар витрина үчүн керек жана өзүнөн аналитика эсептегичин жүктөбөйт.",
      },
      {
        type: "p",
        text: "Яндекс Метриканын cookie жана идентификаторлору эсептегич күйгүзүлгөн жана «Аналитикага уруксат» басылганда гана пайда болот. Четке кагуу, жооп жок же өчүк эсептегич аларды койбойт. Эсептегич өчүк болсо, макулдук суралбайт жана алдын ала чогултулбайт.",
      },
      { type: "h2", text: "Милдеттүү эмес аналитика — Яндекс Метрика" },
      {
        type: "p",
        text: "Макулдугуңуз менен Оператор витринаны кантип колдонушарын түшүнүү жана жарнаманы баалоо үчүн «ЯНДЕКС» ЖЧКнын Яндекс Метрика кызматын колдоно алат. Кызмат ачык барактарга зияраттар жана айрым аракеттер жөнүндө техникалык маалымат алат. Бул маалымат толук анонимдүү эмес.",
      },
      {
        type: "p",
        text: "«ЯНДЕКС» ЖЧК кызматты көрсөтүүдө Оператордун тапшырмасы боюнча иштейт. Документтер: https://yandex.ru/legal/metrica_termsofuse , https://yandex.ru/legal/confidential , https://yandex.ru/legal/cookies_policy , https://yandex.ru/support/metrica/ru/general/cookie-usage .",
      },
      {
        type: "list",
        items: [
          "Эсептегич «Аналитикага уруксат» кийин гана жүктөлөт. Эсептегич өчүк болсо, макулдук суралбайт. Четке кагуу же жооп жок каталогду, кирүүнү жана заказды токтотпойт.",
          "Зыярат жана түзмөк жөнүндө техникалык маалымат, ачык барактар, өтүү булагы жана уруксат берилген жарнама параметрлери (utm_*, yclid, ymclid, ysclid, gclid) кампания белгиси болсо жөнөтүлүшү мүмкүн, байланыш же башка жеке маалымат болсо — жок.",
          "Витрина окуялары: баракты көрүү; order_submitted — ырасталган ачык заказ ийгилигинен кийин гана; contact_phone_click жана contact_message_click — байланыштар барагындагы ачык телефон же кат.",
          "Вебвизор өчүк. Экран сеансы жазылбайт.",
          "Сатып алуучунун аты-жөнү, байланыштары, даректери, комментарийлери, сырсөздөрү жана формалардын мазмуну аналитика окуяларына кирбейт.",
          "Жеке кабинет жана сезгич барактар аналитикадан чыгарылган. Кабинеттеги заказдар Метрикага жөнөтүлбөйт.",
          "Эсептегич күйгүзүлгөн болсо, макулдукту сайттын астындагы «Аналитика жөндөөлөрүндө» өзгөртүү же кайтарып алуу мүмкүн. Кайтарып алуу бул браузерде жаңы жөнөтүүлөрдү токтотот, бирок башталган сурамдарды жокко чыгарбайт жана мурда жөнөтүлгөн маалыматты автоматтык өчүрбөйт.",
        ],
      },
      { type: "h2", text: "Укуктар жана кайрылуулар" },
      {
        type: "p",
        text: "Маалыматыңыздын иштетилиши, тактоо, чектөө же өчүрүү жөнүндө сурап, керек жерде макулдукту кайтарып алуу үчүн 9112368277@mail.ru дарегине жазыңыз. Аналитика макулдугун кайтарып алуу кабыл алынган заказды аткаруу же мыйзамды аткаруу үчүн керек иштетүүнү жокко чыгарбайт.",
      },
      { type: "route", route: CONTACTS, label: "Оператордун байланыштары" },
    ],
    tg: [
      {
        type: "p",
        text: "Оператори маълумоти шахсӣ: ҶДММ «Клевер», ИНН 7813285010, ОГРН 1177847262669 (Оператор). Нишонии ҳуқуқӣ: 197110, Санкт-Петербург, кӯчаи Красного Курсанта, 25, лит. Ж, ҳуҷраи 3Н. Сомона: https://clover-spb.ru. Маълумоти шахсӣ: 9112368277@mail.ru. Телефон ва нишонӣ дар «Тамосҳо» барои алоқа аст ва аз нишонии ҳуқуқӣ фарқ карда метавонад.",
      },
      {
        type: "p",
        text: "Сиёсати мазкур тавсиф мекунад, ки дар витрина ва ҳангоми фармоиш кадом маълумот коркард мешавад, барои чӣ лозим аст, дар кадом асос коркард мешавад, cookie ва localStorage чӣ гуна истифода мешаванд, таҳлили ихтиёрӣ чӣ гуна кор мекунад ва ба Оператор чӣ тавр муроҷиат кардан мумкин аст. Дидани сомона худ розигӣ ба коркард нест ва таҳлили ихтиёриро фаъол намекунад.",
      },
      { type: "h2", text: "Мақсадҳо ва категорияҳои маълумот" },
      {
        type: "p",
        text: "Барои қабул ва иҷрои фармоиш, ҷавоб ба муроҷиат ва иҷрои уҳдадориҳои қонунӣ Оператор маълумотеро коркард мекунад, ки меҳмон дар шаклҳои витрина ё ҳангоми бақайдгирӣ дар кабинет ворид мекунад.",
      },
      {
        type: "list",
        items: [
          "Номи шахси тамос, номи ташкилот.",
          "Телефон, почтаи электронӣ, нишонии расондан ё гирифтан, шарҳи фармоиш.",
          "Таркиби фармоиш ва ҳолати муроҷиат.",
          "Маълумоти техникӣ барои кори сомона: забони интерфейс, сабад, интихоби розигӣ ба таҳлил.",
        ],
      },
      {
        type: "p",
        text: "Реклама ва таҳлил шарти фармоиш нестанд. Розигии алоҳида ба паёмҳои рекламавӣ дар ин таҳрир дархост намешавад ва барои фармоиш лозим нест.",
      },
      { type: "h2", text: "Асосҳои коркард" },
      {
        type: "list",
        items: [
          "Бастани шартнома ва иҷрои он — вақте меҳмон фармоиш медиҳад ё дар бораи фармоиш тамос мехоҳад.",
          "Уҳдадориҳое, ки қонун ба зиммаи Оператор гузоштааст.",
          "Розигии алоҳидаи ихтиёрӣ — танҳо барои Яндекс Метрика ва танҳо агар ҳисобкунак фаъол бошад.",
        ],
      },
      { type: "h2", text: "Маълумот чӣ қадар нигоҳ дошта мешавад" },
      {
        type: "p",
        text: "Оператор маълумотро аз мақсад ё қонун зиёд нигоҳ намедорад (152-ФЗ, м. 5). Чун мақсад иҷро шуд ва асос намонд, коркард барои он мақсад қатъ мешавад. Муҳлати ҳадди ақали ҳуҷҷатҳои баҳисобгирӣ маънои нест кардани ҳамаи маълумот пас аз панҷ сол нест: муҳлатҳои махсус ва асосҳои дигар мумкин аст.",
      },
      {
        type: "list",
        items: [
          "Маълумот ва ҳуҷҷатҳои барои баҳисобгирии ҳатмӣ ва андоз лозим: пас аз соли ҳисоботӣ на камтар аз панҷ сол (402-ФЗ, м. 29) ва барои андоз на камтар аз панҷ сол (НК РФ м. 23 банди 8). Ин муҳлати ҳадди ақали нигоҳдорӣ аст, на санаи несткунӣ.",
          "Дигар маълумоти фармоиш, ки ба чунин ҳуҷҷатҳои баҳисобгирӣ дохил нест (аз ҷумла шарҳи озод, агар барои баҳисобгирӣ лозим набошад), муроҷиатҳои ғайриҳисобӣ ва профили кабинет, ки барои баҳисобгирӣ лозим нест: то барои фармоиш, ҷавоб ё ҳисоб лозим аст. Муҳлатҳои ҳатмии баҳисобгирӣ ба онҳо худкор паҳн намешаванд.",
          "Маҷаллаи амалҳо: то барои кори сомона ва муроҷиат лозим аст. Қонун рақами алоҳида надорад.",
          "Нусхаҳо дар ҳамон сервер дар Русия ба мақсадҳои сабтҳои мувофиқ итоат мекунанд. Анбори беруна тасдиқ нашудааст.",
          "Сабтҳои браузер: дар дастгоҳи шумо, то тоза кардан ё иваз кардани интихоб.",
          "Маълумоти аллакай ба Яндекс Метрика фиристода: хомӯш кардани ҳисобкунак ё бозпас гирифтани розигӣ фиристодани навро қатъ мекунад ва фиристодашударо нест намекунад. Нигоҳдории минбаъда — ҳуҷҷатҳои ҶДММ «ЯНДЕКС».",
        ],
      },
      {
        type: "p",
        text: "Фармоишҳо дар системаи иттилоотии «1C:UNF» низ бурда мешаванд. Ин барномаи Оператораст, на шахси ҳуқуқии алоҳида ва на қабулкунандаи мустақил.",
      },
      { type: "h2", text: "Кӣ маълумот гирифта метавонад" },
      {
        type: "list",
        items: [
          "Кормандони Оператор, ки барои қабул ва иҷрои фармоиш лозиманд.",
          "ҶДММ «Филанко Санкт-Петербург» (ИНН 7838492138, КПП 783801001) — VPS барои сомона ва пойгоҳ.",
          "Хизмати почтаи электронӣ — агар огоҳинома дар бораи фармоиш фиристода шавад.",
          "Telegram — агар огоҳиномаҳои менеҷер фаъол бошанд.",
          "ҶДММ «ЯНДЕКС» — Метрика пас аз розигӣ; харита дар «Тамосҳо», агар нишон дода шавад.",
        ],
      },
      {
        type: "p",
        text: "Сомона ва пойгоҳ дар сервер дар Федератсияи Русия ҷойгиранд. VPS: ҶДММ «Филанко Санкт-Петербург», ИНН 7838492138, КПП 783801001. Тасдиқи таъминкунанда ва соҳиб.",
      },
      { type: "h2", text: "Cookie ва localStorage" },
      {
        type: "p",
        text: "Сомона барои нигоҳ доштани сабад, забон ва интихоби розигӣ ба таҳлил захираи браузерро истифода мебарад. Ин сабтҳо барои витрина лозиманд ва худ аз худ ҳисобкунаки таҳлилро бор намекунанд.",
      },
      {
        type: "p",
        text: "Cookie ва идентификаторҳои Яндекс Метрика танҳо агар ҳисобкунак фаъол бошад ва «Иҷозати таҳлил» пахш шавад пайдо мешаванд. Рад, ҷавоб надодан ё ҳисобкунаки хомӯш онҳоро насб намекунад. Ҳисобкунак хомӯш бошад, розигӣ пурсида намешавад ва пешакӣ ҷамъ намешавад.",
      },
      { type: "h2", text: "Таҳлили ихтиёрӣ — Яндекс Метрика" },
      {
        type: "p",
        text: "Бо розигии шумо Оператор метавонад хизмати «Яндекс Метрика»-и ҶДММ «ЯНДЕКС»-ро барои фаҳмидани истифодаи витрина ва баҳодиҳии реклама истифода барад. Хизмат маълумоти техникии ташриф ба саҳифаҳои оммавӣ ва амалҳои алоҳидаро мегирад. Ин маълумот пурра беном нест.",
      },
      {
        type: "p",
        text: "ҶДММ «ЯНДЕКС» дар робита бо хизмат бо супориши Оператор амал мекунад. Ҳуҷҷатҳо: https://yandex.ru/legal/metrica_termsofuse , https://yandex.ru/legal/confidential , https://yandex.ru/legal/cookies_policy , https://yandex.ru/support/metrica/ru/general/cookie-usage .",
      },
      {
        type: "list",
        items: [
          "Ҳисобкунак танҳо пас аз «Иҷозати таҳлил» бор мешавад. То хомӯш будани ҳисобкунак дархости розигӣ нишон дода намешавад. Рад ё набудани ҷавоб каталог, вуруд ва фармоишро намебандад.",
          "Маълумоти техникӣ дар бораи ташриф ва дастгоҳ, саҳифаҳои оммавӣ, манбаи гузаштан ва параметрҳои рекламавии иҷозатшуда (utm_*, yclid, ymclid, ysclid, gclid) метавонанд фиристода шаванд, агар мисли тамғаи маърака бошанд, на тамос.",
          "Рӯйдодҳои витрина: дидани саҳифа; order_submitted — танҳо пас аз муваффақияти тасдиқшудаи фармоиши оммавӣ; contact_phone_click ва contact_message_click — клики телефони оммавӣ ё мактуб дар саҳифаи тамос.",
          "Вебвизор хомӯш аст. Сеанси экран сабт намешавад.",
          "Ному насаб, тамосҳо, нишониҳо, шарҳҳо, рамзҳо ва мундариҷаи шаклҳо ба рӯйдодҳои таҳлил дохил намешаванд.",
          "Кабинети шахсӣ ва саҳифаҳои ҳассос аз таҳлил хориҷанд. Фармоишҳои кабинет ба Метрика фиристода намешаванд.",
          "Розигиро дар «Танзимоти таҳлил» дар поёни сомона тағйир додан ё бозпас гирифтан мумкин аст. Бозпас гирифтан фиристодани нави ҳамин браузерро қатъ мекунад, аммо дархостҳои оғозшударо бекор намекунад ва маълумоти қаблан фиристодаро худкор нест намекунад.",
        ],
      },
      { type: "h2", text: "Ҳуқуқҳо ва муроҷиатҳо" },
      {
        type: "p",
        text: "Шумо метавонед дар бораи коркарди маълумот, мушаххаскунӣ, маҳдудсозӣ ё несткунӣ дархост кунед ва розигиро, ки лозим аст, бозпас гиред, бо навиштан ба 9112368277@mail.ru. Бозпас гирифтани розигӣ ба таҳлил коркарди фармоиши қабулшударо бекор намекунад, агар он барои иҷро ё қонун лозим бошад.",
      },
      { type: "route", route: CONTACTS, label: "Тамосҳои Оператор" },
    ],
    "zh-CN": [
      {
        type: "p",
        text: "个人数据处理方：有限责任公司「Клевер」（LLC “Klever”），税号 INN 7813285010，OGRN 1177847262669。注册地址：197110，圣彼得堡，红学员街 25 号，Ж 幢，3Н 室。网站：https://clover-spb.ru。个人数据问询：9112368277@mail.ru。「联系方式」页的电话与地址用于联络，可能不同于注册地址。",
      },
      {
        type: "p",
        text: "本政策说明橱窗与下单时处理哪些数据、为何处理、依据为何、如何使用 cookie 与 localStorage、可选分析如何运作，以及如何联系处理方。浏览网站本身不等于同意处理，也不会开启可选分析。",
      },
      { type: "h2", text: "目的与数据类别" },
      {
        type: "p",
        text: "为接受并履行订单、回复问询并履行法定义务，处理方处理访客在橱窗表单或注册客户柜时自行填写的数据。",
      },
      {
        type: "list",
        items: [
          "联系人姓名、组织名称。",
          "电话、电子邮箱、配送或自提地址、订单备注。",
          "订单内容及问询状态。",
          "网站运行所需的技术数据：界面语言、购物车、分析同意选择。",
        ],
      },
      {
        type: "p",
        text: "广告与分析不是下单条件。本版本不单独征求广告邮件同意，下单无需该同意。",
      },
      { type: "h2", text: "处理依据" },
      {
        type: "list",
        items: [
          "订立并履行合同——访客下单或要求就订单联系时。",
          "法律加诸处理方的义务。",
          "单独自愿同意——仅用于可选的 Yandex Metrica，且仅在站点启用计数器时。",
        ],
      },
      { type: "h2", text: "数据保存多久" },
      {
        type: "p",
        text: "处理方保存数据不超过所述目的或法律要求的期限（152-FZ 第 5 条）。目的完成后若无其他合法依据，即停止该目的下的处理。会计文件的最短保存期并不表示所有数据须在满五年时删除：法律可规定特别期限，也可能仍有其他合法依据。",
      },
      {
        type: "list",
        items: [
          "强制会计与计税所需的数据与文件：报告年度后至少五年（402-FZ 第 29 条），以及作为计税所需账税数据与其他文件至少五年（俄联邦税法 第 23 条第 1 款第 8 项）。这是此类文件的最短保存期，不是必须删除的日期。",
          "不属于此类会计文件的其他订单数据（包括若非会计所需的自由备注）、非会计文件的问询，以及非会计所需的客户柜资料：在受理并履行订单、答复问询或维持账户所需期间保存。强制会计期限不自动适用于这些数据。",
          "操作日志：为运行网站和处理问询所需期间。法律未规定单独数字期限。",
          "俄罗斯同一服务器上的副本服从与对应工作记录相同的目的。未确认外部存储。",
          "浏览器记录：在您的设备上，直至清除站点数据或更改选择。",
          "已发送至 Yandex Metrica 的数据：关闭计数器或撤回同意会停止该浏览器的新发送，不会删除已发送的数据。其后由 ООО «ЯНДЕКС» 按其文件保存。",
        ],
      },
      {
        type: "p",
        text: "订单也在处理方使用的「1C:UNF」信息系统中处理。这是处理方使用的软件，不是单独法人，也不是独立接收方。",
      },
      { type: "h2", text: "谁可能接收数据" },
      {
        type: "list",
        items: [
          "为受理并履行订单所需的处理方工作人员。",
          "ООО «Филанко Санкт-Петербург」（INN 7838492138，KPP 783801001）— 网站与工作库的 VPS。",
          "电子邮件服务——若发送订单事务通知。",
          "Telegram——若启用经理订单通知。",
          "ООО «ЯНДЕКС»——单独同意后的 Metrica；若展示地图，则包括「联系方式」页地图。",
        ],
      },
      {
        type: "p",
        text: "网站与工作库托管于俄罗斯联邦境内的服务器。VPS 由 ООО «Филанко Санкт-Петербург» 提供，INN 7838492138，KPP 783801001。提供商与国家由供应商资料和网站所有者确认。",
      },
      { type: "h2", text: "Cookie 与 localStorage" },
      {
        type: "p",
        text: "网站使用浏览器本地存储，以便购物车、语言和分析同意选择保留在本设备。这些记录用于橱窗运行，本身不会加载分析计数器。",
      },
      {
        type: "p",
        text: "Yandex Metrica 的 cookie 与标识仅在站点启用计数器且点击「允许分析」后出现。拒绝、未作答或计数器关闭都不会设置它们。计数器关闭时不显示分析同意请求，也不会预先收集。",
      },
      { type: "h2", text: "可选分析 — Yandex Metrica" },
      {
        type: "p",
        text: "经您同意，处理方可使用有限责任公司「ЯНДЕКС」的 Yandex Metrica 服务，以了解橱窗使用情况并评估广告。该服务会收到关于访问公开页面和部分操作的技术数据。这些数据并非完全匿名。",
      },
      {
        type: "p",
        text: "「ЯНДЕКС」有限责任公司依处理方委托提供该服务。现行文件：https://yandex.ru/legal/metrica_termsofuse 、https://yandex.ru/legal/confidential 、https://yandex.ru/legal/cookies_policy 、https://yandex.ru/support/metrica/ru/general/cookie-usage 。",
      },
      {
        type: "list",
        items: [
          "计数器仅在「允许分析」后加载。拒绝或未作答不阻止目录、登录和下单。",
          "可能发送访问与设备技术信息、已查看的公开页面、来源以及允许的广告参数（utm_*、yclid、ymclid、ysclid、gclid），前提是它们像活动标记而非联系方式或其他个人信息。",
          "橱窗事件：页面浏览；order_submitted — 仅在公开订单确认成功后；contact_phone_click 与 contact_message_click — 联系页上的公开电话或邮件点击。",
          "Webvisor 已关闭。不录制屏幕会话。",
          "分析事件不含姓名、买家联系方式、地址、备注、密码和表单内容。",
          "客户柜及敏感页面（登录、重置、管理与运营区）排除在分析之外。客户柜订单不发送至 Metrica。",
          "若计数器已启用，可在页脚「分析设置」中更改或撤回同意。撤回后，相应浏览器将停止新的发送，但不会取消已开始的请求，也不会自动删除此前已发送的数据。",
        ],
      },
      { type: "h2", text: "权利与问询" },
      {
        type: "p",
        text: "您可写信至 9112368277@mail.ru，查询、更正、限制或删除您的数据，并在需要处撤回同意。撤回分析同意并不取消已接受订单的必要处理（履行订单或守法所需）。",
      },
      { type: "route", route: CONTACTS, label: "处理方联系方式" },
    ],
    ar: [
      {
        type: "p",
        text: "مشغّل البيانات الشخصية: شركة ذات مسؤولية محدودة «كليفّر» (ООО «Клевер»)، INN 7813285010، OGRN 1177847262669. العنوان القانوني: 197110، سانت بطرسبرغ، شارع كراسنوغو كورسانتا، 25، المبنى Ж، الغرفة 3Н. الموقع: https://clover-spb.ru. طلبات البيانات الشخصية: 9112368277@mail.ru. الهاتف والعنوان في «جهات الاتصال» للتواصل وقد يختلفان عن العنوان القانوني.",
      },
      {
        type: "p",
        text: "توضح هذه السياسة البيانات التي تُعالَج في الواجهة وعند الطلب، ولماذا، وعلى أي أساس، وكيف تُستخدم ملفات تعريف الارتباط وlocalStorage، وكيف تعمل التحليلات الاختيارية، وكيف التواصل مع الجهة المشغّلة. مجرد زيارة الموقع ليست موافقة على المعالجة ولا تفعّل التحليلات الاختيارية.",
      },
      { type: "h2", text: "الأغراض وفئات البيانات" },
      {
        type: "p",
        text: "لقبول الطلب وتنفيذه والرد على الاستفسار والوفاء بالواجبات القانونية، تعالج الجهة المشغّلة البيانات التي يدخلها الزائر في نماذج الواجهة أو عند التسجيل في الحساب.",
      },
      {
        type: "list",
        items: [
          "اسم جهة الاتصال واسم المؤسسة.",
          "الهاتف والبريد الإلكتروني وعنوان التسليم أو الاستلام وتعليق الطلب.",
          "محتوى الطلب وحالة الاستفسار.",
          "بيانات تقنية لعمل الموقع: لغة الواجهة، السلة، اختيار موافقة التحليلات.",
        ],
      },
      {
        type: "p",
        text: "الإعلان والتحليلات ليسا شرطاً للطلب. لا يُطلب في هذه الصيغة موافقة منفصلة على الرسائل الإعلانية، وليست لازمة لإتمام الطلب.",
      },
      { type: "h2", text: "أسس المعالجة" },
      {
        type: "list",
        items: [
          "إبرام العقد وتنفيذه — عندما يقدم الزائر طلباً أو يطلب التواصل بشأن الطلب.",
          "الواجبات التي يفرضها القانون على الجهة المشغّلة.",
          "موافقة طوعية منفصلة — فقط لتحليلات ياندكس متريكا، وفقط إذا كان العدّاد مفعّلاً في الموقع.",
        ],
      },
      { type: "h2", text: "كم تُحفظ البيانات" },
      {
        type: "p",
        text: "لا يحتفظ المشغّل بالبيانات أطول مما يقتضيه الغرض المذكور أو القانون (152-ФЗ، المادة 5). بعد تحقق الغرض، إن لم يبقَ أساس قانوني، تتوقف المعالجة لهذا الغرض. الحد الأدنى لحفظ وثائق المحاسبة لا يعني حذف كل البيانات بعد خمس سنوات تماماً: قد ترد مدد خاصة وأسس قانونية أخرى.",
      },
      {
        type: "list",
        items: [
          "البيانات والوثائق اللازمة للمحاسبة والضرائب الإلزامية: خمس سنوات على الأقل بعد سنة التقرير (402-ФЗ، المادة 29) وخمس سنوات على الأقل كبيانات ووثائق لازمة لاحتساب الضرائب ودفعها (НК РФ المادة 23 البند 8). هذه مدة حفظ دنيا لتلك الوثائق وليست موعد حذف إلزامي.",
          "سائر بيانات الطلب التي ليست من تلك الوثائق المحاسبية (بما في ذلك التعليق الحر إن لم يلزم للمحاسبة) والاستفسارات غير المحاسبية وبيانات ملف الحساب غير اللازمة للمحاسبة: تُحفظ ما دامت لازمة لقبول الطلب وتنفيذه أو للرد أو لإدارة الحساب. مدد المحاسبة الإلزامية لا تسري عليها تلقائياً.",
          "سجل الإجراءات: ما دام لازماً لتشغيل الموقع ومعالجة الاستفسارات. لا يحدد القانون مدة رقمية منفصلة.",
          "النسخ على الخادم نفسه في روسيا تتبع أغراض السجلات العاملة الموافقة. لم يُؤكد مخزن خارجي.",
          "سجلات المتصفح: على جهازك حتى تمسح بيانات الموقع أو تغيّر الاختيار.",
          "البيانات التي أُرسلت بالفعل إلى ياندكس متريكا: إيقاف العدّاد أو سحب الموافقة يوقف الإرسال الجديد في هذا المتصفح ولا يحذف ما أُرسل. الحفظ اللاحق وفق وثائق ООО «ЯНДЕКС».",
        ],
      },
      {
        type: "p",
        text: "تُدار الطلبات أيضاً في نظام المعلومات «1C:UNF» الذي يستخدمه المشغّل. هذا برنامج يستخدمه المشغّل، وليس شخصاً اعتبارياً منفصلاً ولا متلقياً مستقلاً.",
      },
      { type: "h2", text: "من قد يتلقى البيانات" },
      {
        type: "list",
        items: [
          "عاملو الجهة المشغّلة الذين يحتاجون البيانات لقبول الطلب وتنفيذه.",
          "ООО «Филанко Санкт-Петербург» (ИНН 7838492138، КПП 783801001) — خادم VPS للموقع وقاعدة العمل.",
          "خدمة البريد الإلكتروني — إذا أُرسل إشعار بمعاملة الطلب.",
          "Telegram — إذا فُعّلت إشعارات المدير.",
          "ООО «ЯНДЕКС» — متريكا بعد موافقة منفصلة؛ وخرائط صفحة «جهات الاتصال» إذا عُرضت خريطة.",
        ],
      },
      {
        type: "p",
        text: "الموقع وقاعدة العمل على خادم في الاتحاد الروسي. مزوّد VPS: ООО «Филанко Санкт-Петербург»، ИНН 7838492138، КПП 783801001. التأكيد من بيانات المورّد ومن مالك الموقع.",
      },
      { type: "h2", text: "ملفات تعريف الارتباط وlocalStorage" },
      {
        type: "p",
        text: "يستخدم الموقع تخزين المتصفح ليبقى السلة واللغة واختيار موافقة التحليلات على هذا الجهاز. هذه السجلات لازمة للواجهة ولا تحمّل عدّاد التحليلات وحدها.",
      },
      {
        type: "p",
        text: "تظهر ملفات تعريف الارتباط ومعرّفات ياندكس متريكا فقط إذا كان العدّاد مفعّلاً وضغط الزائر «السماح بالتحليلات». الرفض أو عدم الإجابة أو العدّاد المعطّل لا يثبتها. عند تعطيل العدّاد لا يُعرض طلب الموافقة ولا تُجمع مسبقاً.",
      },
      { type: "h2", text: "تحليلات اختيارية — ياندكس متريكا" },
      {
        type: "p",
        text: "بموافقتك يجوز للجهة المشغّلة استخدام خدمة «ياندكس متريكا» التابعة لشركة ذات مسؤولية محدودة «ЯНДЕКС» لفهم استخدام الواجهة وتقييم الإعلان. تتلقى الخدمة بيانات تقنية عن زيارات الصفحات العامة وبعض الإجراءات. هذه البيانات ليست مجهولة تماماً.",
      },
      {
        type: "p",
        text: "تعمل شركة «ЯНДЕКС» بتكليف من الجهة المشغّلة لتقديم الخدمة. الوثائق: https://yandex.ru/legal/metrica_termsofuse وhttps://yandex.ru/legal/confidential وhttps://yandex.ru/legal/cookies_policy وhttps://yandex.ru/support/metrica/ru/general/cookie-usage .",
      },
      {
        type: "list",
        items: [
          "يُحمَّل العدّاد فقط بعد «السماح بالتحليلات». الرفض أو عدم الإجابة لا يحجب الكتالوج أو الدخول أو الطلب.",
          "قد تُرسل بيانات تقنية عن الزيارة والجهاز والصفحات العامة ومصدر الانتقال ومعلمات إعلانية مسموحة (utm_* وyclid وymclid وysclid وgclid) إن بدت علامات حملة لا بيانات اتصال.",
          "أحداث الواجهة: عرض الصفحة؛ order_submitted — فقط بعد نجاح طلب عام مؤكد؛ contact_phone_click وcontact_message_click — نقر هاتف أو بريد عام في صفحة الاتصال.",
          "Webvisor متوقف. لا يُسجَّل بث الشاشة.",
          "لا تُدرج في أحداث التحليلات الأسماء وبيانات المشتري والعناوين والتعليقات وكلمات المرور ومحتوى النماذج.",
          "الحساب الشخصي والصفحات الحساسة مستبعدة. طلبات الحساب لا تُرسل إلى متريكا.",
          "إذا كان العدّاد مفعّلاً يمكن تغيير الموافقة أو سحبها في «إعدادات التحليلات» أسفل الموقع. السحب يوقف الإرسال الجديد في ذلك المتصفح، ولا يلغي الطلبات التي بدأت ولا يحذف تلقائياً ما أُرسل سابقاً.",
        ],
      },
      { type: "h2", text: "الحقوق والطلبات" },
      {
        type: "p",
        text: "يمكنك طلب معلومات عن معالجة بياناتك أو تصحيحها أو تقييدها أو حذفها، وسحب الموافقة حيث يلزم، بالكتابة إلى 9112368277@mail.ru. سحب موافقة التحليلات لا يلغي معالجة طلب قُبل بالفعل إن لزم لتنفيذه أو للامتثال للقانون.",
      },
      { type: "route", route: CONTACTS, label: "جهات اتصال الجهة المشغّلة" },
    ],
  },

  "personal-data-consent": {
    en: [
      {
        type: "p",
        text: "This document covers data you enter when placing a storefront order. It explains processing of those data so the order can be accepted and fulfilled. It is not consent to advertising and not consent to analytics.",
      },
      {
        type: "p",
        text: "Operator: LLC “Klever”, INN 7813285010, OGRN 1177847262669. Legal address: 197110, St. Petersburg, Krasnogo Kursanta St., 25, letter Zh, room 3N. Website: https://clover-spb.ru. Personal-data requests: 9112368277@mail.ru.",
      },
      {
        type: "p",
        text: "By sending an order you ask the Operator to accept and fulfil it. For that the Operator processes the name, organisation name, phone, email, delivery or pickup address, comment and order contents you provide. Processing includes collection, recording, storage, updating, use and transfer only when needed to fulfil the order or to comply with law. Data and documents needed for mandatory accounting are kept for at least five years after the reporting year (Federal Law No. 402-FZ of 6 December 2011, art. 29(1)) and at least five years under Tax Code art. 23(1)(8). That is not a deletion date for every order field.",
      },
      {
        type: "p",
        text: "Advertising mail, surveys, marketing research and Yandex Metrica are not part of this consent. Optional analytics, if the tag is enabled, starts only with a separate “Allow analytics” button and is not required to place an order.",
      },
      {
        type: "p",
        text: "You may write to 9112368277@mail.ru about this document or order-data processing. That does not cancel processing already needed to fulfil an accepted order or to comply with law. Details are in the Personal Data Processing Policy.",
      },
      { type: "route", route: CONTACTS, label: "Operator contacts" },
    ],
    uz: [
      {
        type: "p",
        text: "Ushbu hujjat vitrinada buyurtma berishda kiritgan ma’lumotlaringizga tegishli. Bu reklamaga rozilik emas va analitikaga rozilik emas.",
      },
      {
        type: "p",
        text: "Operator: «Klever» MChJ, INN 7813285010, OGRN 1177847262669. Yuridik manzil: 197110, Sankt-Peterburg, Krasnogo Kursanta, 25, lit. J, 3N. Sayt: https://clover-spb.ru. Shaxsiy ma’lumotlar: 9112368277@mail.ru.",
      },
      {
        type: "p",
        text: "Buyurtma yuborib, Operatordan uni qabul qilish va bajarishni so‘raysiz. Buning uchun Operator ko‘rsatgan ism, tashkilot, telefon, pochta, manzil, izoh va buyurtma tarkibini qayta ishlaydi. Qayta ishlash — yig‘ish, yozish, saqlash, aniqlashtirish, foydalanish va uzatish — faqat buyurtmani bajarish yoki qonunni bajarish uchun kerak bo‘lganda. Majburiy hisob uchun kerak ma’lumot va hujjatlar hisobot yilidan keyin kamida besh yil (402-FZ, 29-modda) va NK RF 23-modda 8-band bo‘yicha kamida besh yil saqlanadi. Bu barcha buyurtma maydonlarini o‘chirish sanasi emas.",
      },
      {
        type: "p",
        text: "Reklama, so‘rovnomalar, marketing tadqiqotlari va Yandex Metrica ushbu rozilikka kirmaydi. Ixtiyoriy analitika faqat alohida «Analitikaga ruxsat» tugmasi bilan yoqiladi va buyurtma uchun shart emas.",
      },
      {
        type: "p",
        text: "Rozilikni qaytarib olish yoki buyurtma ma’lumotlari haqida so‘rash uchun 9112368277@mail.ru ga yozing. Qaytarib olish qabul qilingan buyurtmani bajarish yoki qonunni bajarish uchun allaqachon kerak qayta ishlashni bekor qilmaydi. Tafsilotlar — Siyosatda.",
      },
      { type: "route", route: CONTACTS, label: "Operator kontaktlari" },
    ],
    ky: [
      {
        type: "p",
        text: "Бул документ витринада заказ берүүдө киргизген маалыматыңызга тиешелүү. Бул жарнамага макулдук эмес жана аналитикага макулдук эмес.",
      },
      {
        type: "p",
        text: "Оператор: «Клевер» ЖЧК, ИНН 7813285010, ОГРН 1177847262669. Юридикалык дарек: 197110, Санкт-Петербург, Красного Курсанта, 25, лит. Ж, 3Н. Сайт: https://clover-spb.ru. Жеке маалымат: 9112368277@mail.ru.",
      },
      {
        type: "p",
        text: "Заказ жөнөтүп, Оператордон аны кабыл алууну жана аткарууну суранасыз. Ал үчүн Оператор көрсөткөн ат, уюм, телефон, почта, дарек, комментарий жана заказ курамын иштетет. Иштетүү — чогултуу, жазуу, сактоо, тактоо, колдонуу жана өткөрүү — заказды аткаруу же мыйзамды аткаруу керек болгондо гана. Милдеттүү эсеп үчүн керек маалымат жана документтер отчеттук жылдан кийин кеминде беш жыл (402-ФЗ, 29-берене) жана НК РФ 23-берене 8-пункт боюнча кеминде беш жыл сакталат. Бул бардык заказ талааларын өчүрүү күнү эмес.",
      },
      {
        type: "p",
        text: "Жарнама, сурамжылоо, маркетинг изилдөөлөрү жана Яндекс Метрика бул макулдукка кирбейт. Милдеттүү эмес аналитика өзүнчө «Аналитикага уруксат» баскычы менен гана күйөт жана заказ үчүн талап кылынбайт.",
      },
      {
        type: "p",
        text: "Макулдукту кайтарып алуу же заказ маалыматы жөнүндө суроо үчүн 9112368277@mail.ru дарегине жазыңыз. Кайтарып алуу кабыл алынган заказды аткаруу же мыйзамды аткаруу үчүн керек иштетүүнү жокко чыгарбайт. Толук маалымат — Саясатта.",
      },
      { type: "route", route: CONTACTS, label: "Оператордун байланыштары" },
    ],
    tg: [
      {
        type: "p",
        text: "Ин ҳуҷҷат ба маълумоте дахл дорад, ки ҳангоми фармоиш дар витрина ворид мекунед. Ин розигӣ ба реклама ва розигӣ ба таҳлил нест.",
      },
      {
        type: "p",
        text: "Оператор: ҶДММ «Клевер», ИНН 7813285010, ОГРН 1177847262669. Нишонии ҳуқуқӣ: 197110, Санкт-Петербург, Красного Курсанта, 25, лит. Ж, 3Н. Сомона: https://clover-spb.ru. Маълумоти шахсӣ: 9112368277@mail.ru.",
      },
      {
        type: "p",
        text: "Бо фиристодани фармоиш аз Оператор қабул ва иҷрои онро мехоҳед. Барои ин Оператор ном, номи ташкилот, телефон, почта, нишонӣ, шарҳ ва таркиби фармоишро коркард мекунад. Коркард — ҷамъоварӣ, сабт, нигоҳдорӣ, мушаххаскунӣ, истифода ва интиқол — танҳо вақте ки барои иҷрои фармоиш ё қонун лозим аст. Маълумот ва ҳуҷҷатҳои барои баҳисобгирии ҳатмӣ лозим пас аз соли ҳисоботӣ на камтар аз панҷ сол (402-ФЗ, м. 29) ва тибқи НК РФ м. 23 банди 8 на камтар аз панҷ сол нигоҳ дошта мешаванд. Ин санаи нест кардани ҳамаи майдонҳои фармоиш нест.",
      },
      {
        type: "p",
        text: "Паёмҳои рекламавӣ, пурсишҳо, тадқиқоти маркетингӣ ва Яндекс Метрика ба ин розигӣ дохил нестанд. Таҳлили ихтиёрӣ танҳо бо тугмаи алоҳидаи «Иҷозати таҳлил» фаъол мешавад ва барои фармоиш лозим нест.",
      },
      {
        type: "p",
        text: "Ин розигиро бозпас гирифтан ё дар бораи маълумоти фармоиш пурсидан бо навиштан ба 9112368277@mail.ru мумкин аст. Бозпас гирифтан коркардеро, ки барои иҷрои фармоиши қабулшуда ё қонун аллакай лозим аст, бекор намекунад. Тафсил дар Сиёсат.",
      },
      { type: "route", route: CONTACTS, label: "Тамосҳои Оператор" },
    ],
    "zh-CN": [
      {
        type: "p",
        text: "本文件适用于您在橱窗下单时填写的数据。它不是广告同意，也不是分析同意。",
      },
      {
        type: "p",
        text: "处理方：有限责任公司「Клевер」，INN 7813285010，OGRN 1177847262669。注册地址：197110，圣彼得堡，红学员街 25 号，Ж 幢，3Н 室。网站：https://clover-spb.ru。个人数据问询：9112368277@mail.ru。",
      },
      {
        type: "p",
        text: "提交订单即请求处理方接受并履行该订单。为此，处理方处理您提供的姓名、组织名称、电话、电子邮箱、配送或自提地址、备注和订单内容。处理包括收集、记录、存储、更正、使用和传输，且仅在履行订单或守法所必要时进行。强制会计所需数据与文件在报告年度后至少保存五年（402-FZ 第 29 条），并依税法 第 23 条第 1 款第 8 项至少保存五年。这不是删除全部订单字段的日期。",
      },
      {
        type: "p",
        text: "广告邮件、调查、市场研究与 Yandex Metrica 不属于本同意。可选分析仅通过单独的「允许分析」按钮开启，下单无需该同意。",
      },
      {
        type: "p",
        text: "可写信至 9112368277@mail.ru 撤回本同意或询问订单数据处理。撤回并不取消已接受订单为履行或守法所必需的处理。详情见个人数据处理政策。",
      },
      { type: "route", route: CONTACTS, label: "处理方联系方式" },
    ],
    ar: [
      {
        type: "p",
        text: "يغطي هذا المستند البيانات التي تدخلها عند تقديم طلب في الواجهة. وهو ليس موافقة على الإعلان وليس موافقة على التحليلات.",
      },
      {
        type: "p",
        text: "الجهة المشغّلة: ООО «Клевер»، INN 7813285010، OGRN 1177847262669. العنوان القانوني: 197110، سانت بطرسبرغ، شارع كراسنوغو كورسانتا، 25، المبنى Ж، الغرفة 3Н. الموقع: https://clover-spb.ru. طلبات البيانات الشخصية: 9112368277@mail.ru.",
      },
      {
        type: "p",
        text: "بإرسال الطلب تطلب من الجهة المشغّلة قبوله وتنفيذه. لذلك تعالج الاسم واسم المؤسسة والهاتف والبريد والعنوان والتعليق ومحتوى الطلب. تشمل المعالجة الجمع والتسجيل والتخزين والتحديث والاستخدام والنقل فقط عندما يلزم لتنفيذ الطلب أو للامتثال للقانون. البيانات والوثائق اللازمة للمحاسبة الإلزامية تُحفظ خمس سنوات على الأقل بعد سنة التقرير (402-ФЗ، المادة 29) وخمس سنوات على الأقل وفق НК РФ المادة 23 البند 8. هذا ليس موعد حذف كل حقول الطلب.",
      },
      {
        type: "p",
        text: "الرسائل الإعلانية والاستبيانات وأبحاث التسويق وياندكس متريكا ليست جزءاً من هذه الموافقة. تُفعَّل التحليلات الاختيارية فقط بزر منفصل «السماح بالتحليلات» وليست لازمة لتقديم الطلب.",
      },
      {
        type: "p",
        text: "يمكن سحب هذه الموافقة أو الاستفسار عن بيانات الطلب بالكتابة إلى 9112368277@mail.ru. السحب لا يلغي معالجة أصبحت لازمة لتنفيذ طلب مقبول أو للامتثال للقانون. التفاصيل في سياسة معالجة البيانات الشخصية.",
      },
      { type: "route", route: CONTACTS, label: "جهات اتصال الجهة المشغّلة" },
    ],
  },
};
