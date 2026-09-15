/**
 * Localized info-page body blocks (AUTO_INITIAL_DRAFT).
 * Canonical source: src/screens/storefront/pages/infoPageContent.js (RU).
 *
 * Legal pages (privacy-policy, personal-data-consent): translations are NOT
 * legally certified — legalReviewVerified=false.
 * Returns terms also require owner review — ownerReviewRequired=true.
 */

import { exactTranslationTargetInternal, toPublicLocaleCode } from "../../../src/shared/i18n/languageRegistry.js";

const CONTACTS = { name: "contacts" };

/** @type {Record<string, Record<string, Array<object>>>} */
const BODY = {
  returns: {
    en: [
      {
        type: "lead",
        text: "We value every customer and are ready to accommodate you. If a product does not suit you for any reason, or you want to exchange it, we are ready to do so.",
      },
      {
        type: "p",
        text: "Goods may be exchanged or returned if the original packaging, box and saleable condition remain intact.",
      },
      { type: "route", route: CONTACTS, label: "Contact us" },
    ],
    uz: [
      {
        type: "lead",
        text: "Biz har bir mijozni qadrlaymiz va yordam berishga tayyormiz. Agar biror sababga ko‘ra tovar sizga mos kelmasa yoki uni almashtirmoqchi bo‘lsangiz, biz buni qilishga tayyormiz.",
      },
      {
        type: "p",
        text: "Agar qadoq, quti va tovarning tashqi ko‘rinishi saqlangan bo‘lsa, tovarni almashtirish yoki qaytarish mumkin.",
      },
      { type: "route", route: CONTACTS, label: "Biz bilan bog‘laning" },
    ],
    ky: [
      {
        type: "lead",
        text: "Биз ар бир кардарды баалайбыз жана жардам берүүгө даярбыз. Эгер кандайдыр бир себептен товар сизге туура келбесе же аны алмаштыргыңыз келсе, биз муну жасоого даярбыз.",
      },
      {
        type: "p",
        text: "Эгер таңгак, куту жана товардын сатууга жарактуу көрүнүшү сакталса, товарды алмаштырууга же кайтарууга болот.",
      },
      { type: "route", route: CONTACTS, label: "Биз менен байланышыңыз" },
    ],
    tg: [
      {
        type: "lead",
        text: "Мо ҳар як муштариро қадр мекунем ва омодаем кӯмак расонем. Агар бо ягон сабаб мол ба шумо мувофиқ наояд ё хоҳед онро иваз кунед, мо омодаем ин корро иҷро кунем.",
      },
      {
        type: "p",
        text: "Агар баста, қуттӣ ва зоҳири мол нигоҳ дошта шуда бошанд, молро иваз кардан ё баргардондан мумкин аст.",
      },
      { type: "route", route: CONTACTS, label: "Бо мо тамос гиред" },
    ],
    "zh-CN": [
      {
        type: "lead",
        text: "我们珍视每位客户，并愿意为您提供帮助。若商品因任何原因不合适，或您希望换货，我们愿意办理。",
      },
      {
        type: "p",
        text: "在原包装、纸箱完整且保持可售外观的前提下，商品可以换货或退货。",
      },
      { type: "route", route: CONTACTS, label: "联系我们" },
    ],
    ar: [
      {
        type: "lead",
        text: "نُقدّر كل عميل ونحن مستعدون لمساعدته. إذا لم يناسبك المنتج لأي سبب، أو رغبت في استبداله، فنحن مستعدون لذلك.",
      },
      {
        type: "p",
        text: "يمكن استبدال البضاعة أو إرجاعها إذا بقيت العبوة والعلبة والمظهر القابل للبيع سليمة.",
      },
      { type: "route", route: CONTACTS, label: "تواصل معنا" },
    ],
  },

  wholesale: {
    en: [
      {
        type: "lead",
        text: "We offer special prices and flexible terms for wholesale customers.",
      },
      {
        type: "p",
        text: "To discuss cooperation terms and receive a price list, contact us using whichever method is most convenient for you.",
      },
      { type: "route", route: CONTACTS, label: "Contact us" },
    ],
    uz: [
      {
        type: "lead",
        text: "Ulgurji mijozlar uchun maxsus narxlar va moslashuvchan shartlarni taklif qilamiz.",
      },
      {
        type: "p",
        text: "Hamkorlik shartlarini muhokama qilish va narxlar ro‘yxatini olish uchun qulay usulda biz bilan bog‘laning.",
      },
      { type: "route", route: CONTACTS, label: "Biz bilan bog‘laning" },
    ],
    ky: [
      {
        type: "lead",
        text: "Биз дүң кардарлар үчүн атайын баалар жана ийкемдүү шарттарды сунуштайбыз.",
      },
      {
        type: "p",
        text: "Кызматташуу шарттарын талкуулап, баа тизмесин алуу үчүн ыңгайлуу жол менен биз менен байланышыңыз.",
      },
      { type: "route", route: CONTACTS, label: "Биз менен байланышыңыз" },
    ],
    tg: [
      {
        type: "lead",
        text: "Мо ба харидорони яклухт нархҳои махсус ва шартҳои мувофиқ пешниҳод мекунем.",
      },
      {
        type: "p",
        text: "Барои муҳокимаи шартҳои ҳамкорӣ ва гирифтани рӯйхати нархҳо бо роҳи қулай бо мо тамос гиред.",
      },
      { type: "route", route: CONTACTS, label: "Бо мо тамос гиред" },
    ],
    "zh-CN": [
      {
        type: "lead",
        text: "我们为批发客户提供特价与灵活合作条件。",
      },
      {
        type: "p",
        text: "如需讨论合作条件并获取价目表，请通过您方便的方式联系我们。",
      },
      { type: "route", route: CONTACTS, label: "联系我们" },
    ],
    ar: [
      {
        type: "lead",
        text: "نقدم أسعاراً خاصة وشروطاً مرنة لعملاء الجملة.",
      },
      {
        type: "p",
        text: "لمناقشة شروط التعاون والحصول على قائمة الأسعار، تواصل معنا بالطريقة المناسبة لك.",
      },
      { type: "route", route: CONTACTS, label: "تواصل معنا" },
    ],
  },

  "privacy-policy": {
    en: [
      {
        type: "p",
        text: "This Policy defines how personal data of users of the clover-spb.ru website of Limited Liability Company “KLEVER” (the Operator) is processed and protected. The Operator takes all measures provided by the legislation of the Russian Federation to keep information provided by users safe and secure.",
      },
      {
        type: "p",
        text: "Personal data is processed to operate the website, improve the quality of services, personalize the user experience, inform users about news, promotions and offers of the Operator, and to fulfill duties imposed on the Operator by law.",
      },
      {
        type: "p",
        text: "Data is collected when forms on the site are filled in, upon registration, newsletter subscription, or interaction with site services. Processed personal data may include: last name, first name, patronymic, email address, phone number, delivery address, preference information, and other information voluntarily provided by the user.",
      },
      {
        type: "p",
        text: "The Operator stores personal data for the period needed to achieve the stated processing purposes, or for periods set by law. Transfer of personal data to third parties is possible only with the user’s consent, except where provided by law.",
      },
      {
        type: "p",
        text: "The user may at any time request clarification, blocking or deletion of their data by sending a corresponding request to the Operator. Use of the website means the user’s agreement with the terms of this Policy.",
      },
      { type: "route", route: CONTACTS, label: "Operator contacts" },
    ],
    uz: [
      {
        type: "p",
        text: "Ushbu Siyosat «KLEVER» mas’uliyati cheklangan jamiyatining clover-spb.ru internet-sayti foydalanuvchilarining shaxsiy ma’lumotlarini qayta ishlash va himoya qilish tartibini belgilaydi (keyingi o‘rinlarda — Operator). Operator foydalanuvchilar taqdim etgan ma’lumotlarning saqlanishi va xavfsizligini ta’minlash uchun Rossiya Federatsiyasi qonunchiligida nazarda tutilgan barcha choralarni ko‘radi.",
      },
      {
        type: "p",
        text: "Shaxsiy ma’lumotlar sayt ishlashini ta’minlash, ko‘rsatiladigan xizmatlar sifatini yaxshilash, foydalanuvchi tajribasini shaxsiylashtirish, Operatorning yangiliklari, aksiyalari va takliflari haqida xabardor qilish, shuningdek Operator zimmasiga qonun bilan yuklatilgan majburiyatlarni bajarish maqsadlarida qayta ishlanadi.",
      },
      {
        type: "p",
        text: "Ma’lumotlar saytdagi shakllarni to‘ldirish, ro‘yxatdan o‘tish, tarqatmalarga obuna bo‘lish yoki sayt xizmatlari bilan o‘zaro aloqa qilishda yig‘iladi. Qayta ishlanadigan shaxsiy ma’lumotlarga quyidagilar kirishi mumkin: familiya, ism, otasining ismi, elektron pochta manzili, telefon raqami, yetkazib berish manzili, afzalliklar haqidagi ma’lumotlar va foydalanuvchi ixtiyoriy taqdim etgan boshqa ma’lumotlar.",
      },
      {
        type: "p",
        text: "Operator shaxsiy ma’lumotlarni e’lon qilingan qayta ishlash maqsadlariga erishish uchun zarur muddat yoki qonunda belgilangan muddatlar davomida saqlaydi. Shaxsiy ma’lumotlarni uchinchi shaxslarga uzatish faqat foydalanuvchi roziligi bilan mumkin, qonunda nazarda tutilgan holatlar bundan mustasno.",
      },
      {
        type: "p",
        text: "Foydalanuvchi istalgan vaqtda Operator manziliga tegishli murojaat yuborib, o‘z ma’lumotlarini aniqlashtirish, bloklash yoki o‘chirishni so‘rashi mumkin. Saytdan foydalanish foydalanuvchining ushbu Siyosat shartlariga roziligini anglatadi.",
      },
      { type: "route", route: CONTACTS, label: "Operator kontaktlari" },
    ],
    ky: [
      {
        type: "p",
        text: "Ушул Саясат «КЛЕВЕР» жоопкерчилиги чектелген коомунун clover-spb.ru интернет-сайтынын колдонуучуларынын жеке маалыматтарын иштетүү жана коргоо тартибин аныктайт (мындан ары — Оператор). Оператор колдонуучулар берген маалыматтын сакталышын жана коопсуздугун камсыз кылуу үчүн Россия Федерациясынын мыйзамдарында каралган бардык чараларды көрөт.",
      },
      {
        type: "p",
        text: "Жеке маалыматтар сайттын иштешин камсыз кылуу, көрсөтүлүүчү кызматтардын сапатын жакшыртуу, колдонуучу тажрыйбасын жекелештирүү, Оператордун жаңылыктары, акциялары жана сунуштары жөнүндө кабарлоо, ошондой эле Операторго мыйзам менен жүктөлгөн милдеттерди аткаруу максаттарында иштетилет.",
      },
      {
        type: "p",
        text: "Маалыматтар сайттагы формаларды толтурууда, катталууда, таркатууларга жазылууда же сайт кызматтары менен өз ара аракеттенүүдө чогултулат. Иштетилүүчү жеке маалыматтарга төмөнкүлөр кириши мүмкүн: фамилия, аты, атасынын аты, электрондук почта дареги, телефон номери, жеткирүү дареги, артыкчылыктар жөнүндө маалымат жана колдонуучу ыктыярдуу берген башка маалымат.",
      },
      {
        type: "p",
        text: "Оператор жеке маалыматтарды жарыяланган иштетүү максаттарына жетүү үчүн керек болгон мөөнөткө же мыйзамда белгиленген мөөнөттөргө сактайт. Жеке маалыматтарды үчүнчү жактарга өткөрүү колдонуучунун макулдугу болгондо гана мүмкүн, мыйзамда каралган учурлардан тышкары.",
      },
      {
        type: "p",
        text: "Колдонуучу каалаган убакта Оператордун дарегине тиешелүү кайрылуу жөнөтүп, өз маалыматтарын тактоону, бөгөттөөнү же өчүрүүнү сурана алат. Сайтты колдонуу колдонуучунун ушул Саясаттын шарттарына макулдугун билдирет.",
      },
      { type: "route", route: CONTACTS, label: "Оператордын байланыштары" },
    ],
    tg: [
      {
        type: "p",
        text: "Сиёсати мазкур тартиби коркард ва ҳифзи маълумоти шахсии истифодабарандагони сомонаи clover-spb.ru-и ҷамъияти масъулияташ маҳдуди «КЛЕВЕР»-ро муайян мекунад (минбаъд — Оператор). Оператор ҳамаи чораҳои пешбининамудаи қонунгузории Федератсияи Русияро барои таъмини нигоҳдорӣ ва амнияти маълумоти пешниҳодкардаи истифодабарандагон меандешад.",
      },
      {
        type: "p",
        text: "Маълумоти шахсӣ бо мақсади таъмини фаъолияти сомона, беҳтар кардани сифати хизматрасониҳо, шахсигардонии таҷрибаи истифодабаранда, огоҳонидан дар бораи хабарҳо, аксияҳо ва пешниҳодҳои Оператор, инчунин иҷрои уҳдадориҳои қонунӣ коркард мешавад.",
      },
      {
        type: "p",
        text: "Ҷамъоварии маълумот ҳангоми пур кардани шаклҳо дар сомона, бақайдгирӣ, обуна ба паёмномаҳо ё ҳамкорӣ бо хизматҳои сомона сурат мегирад. Ба маълумоти шахсии коркардшаванда метавонанд дохил шаванд: насаб, ном, номи падар, нишонии почтаи электронӣ, рақами телефон, нишонии расондан, маълумот дар бораи афзалиятҳо ва дигар маълумоти ихтиёрӣ пешниҳодкардаи истифодабаранда.",
      },
      {
        type: "p",
        text: "Оператор маълумоти шахсиро дар давоми муҳлати барои расидан ба мақсадҳои эълоншудаи коркард зарур ё дар муҳлатҳои қонунӣ муқарраршуда нигоҳ медорад. Интиқоли маълумоти шахсӣ ба шахсони сеюм танҳо бо розигии истифодабаранда имконпазир аст, ба истиснои ҳолатҳои қонунӣ.",
      },
      {
        type: "p",
        text: "Истифодабаранда ҳуқуқ дорад дар ҳар вақт мушаххаскунӣ, бастани дастрасӣ ё нест кардани маълумоти худро дархост кунад, бо фиристодани муроҷиати дахлдор ба Оператор. Истифодаи сомона маънои онро дорад, ки истифодабаранда бо шартҳои Сиёсати мазкур розӣ аст.",
      },
      { type: "route", route: CONTACTS, label: "Тамосҳои Оператор" },
    ],
    "zh-CN": [
      {
        type: "p",
        text: "本政策规定有限责任公司「КЛЕВЕР」（下称处理方）网站 clover-spb.ru 用户个人数据的处理与保护方式。处理方采取俄罗斯联邦法律规定的一切措施，确保用户提供信息的保存与安全。",
      },
      {
        type: "p",
        text: "处理个人数据旨在保障网站运行、提升服务质量、个性化用户体验、告知处理方的新闻、促销与优惠，以及履行法律赋予处理方的义务。",
      },
      {
        type: "p",
        text: "数据在填写网站表单、注册、订阅通讯或与网站服务互动时收集。可处理的个人数据包括：姓、名、父称、电子邮箱、电话号码、配送地址、偏好信息以及用户自愿提供的其他信息。",
      },
      {
        type: "p",
        text: "处理方在实现所述处理目的所需期限内，或在法律规定期限内保存个人数据。向第三方传输个人数据仅在用户同意时可进行，法律另有规定的情形除外。",
      },
      {
        type: "p",
        text: "用户可随时向处理方提出相应申请，要求更正、冻结或删除其数据。使用本网站即表示用户同意本政策条款。",
      },
      { type: "route", route: CONTACTS, label: "处理方联系方式" },
    ],
    ar: [
      {
        type: "p",
        text: "تحدد هذه السياسة إجراءات معالجة وحماية البيانات الشخصية لمستخدمي موقع clover-spb.ru التابع لشركة ذات مسؤولية محدودة «كليفّر» (المشار إليها لاحقاً بالجهة المشغّلة). تتخذ الجهة المشغّلة جميع التدابير المنصوص عليها في تشريعات الاتحاد الروسي لضمان حفظ وأمن المعلومات التي يقدمها المستخدمون.",
      },
      {
        type: "p",
        text: "تُعالَج البيانات الشخصية لضمان تشغيل الموقع، وتحسين جودة الخدمات المقدَّمة، وتخصيص تجربة المستخدم، وإبلاغ المستخدمين بأخبار وعروض وترويجات الجهة المشغّلة، وكذلك للوفاء بالواجبات التي يفرضها القانون على الجهة المشغّلة.",
      },
      {
        type: "p",
        text: "تُجمع البيانات عند ملء النماذج على الموقع، أو عند التسجيل، أو الاشتراك في النشرات، أو التفاعل مع خدمات الموقع. قد تشمل البيانات الشخصية المعالجة: اللقب والاسم واسم الأب، وعنوان البريد الإلكتروني، ورقم الهاتف، وعنوان التسليم، ومعلومات عن التفضيلات، وغيرها من المعلومات التي يقدمها المستخدم طوعاً.",
      },
      {
        type: "p",
        text: "تخزّن الجهة المشغّلة البيانات الشخصية للمدة اللازمة لتحقيق أغراض المعالجة المعلنة، أو للمدد التي يحددها القانون. ولا يجوز نقل البيانات الشخصية إلى أطراف ثالثة إلا بموافقة المستخدم، باستثناء الحالات التي ينص عليها القانون.",
      },
      {
        type: "p",
        text: "يحق للمستخدم في أي وقت طلب توضيح بياناته أو حظرها أو حذفها بإرسال الطلب المناسب إلى الجهة المشغّلة. ويعني استخدام الموقع موافقة المستخدم على شروط هذه السياسة.",
      },
      { type: "route", route: CONTACTS, label: "جهات اتصال الجهة المشغّلة" },
    ],
  },

  "personal-data-consent": {
    en: [
      {
        type: "p",
        text: "Hereby I, acting of my own free will and in my own interest, when placing (entering) my personal data on the clover-spb.ru website of Limited Liability Company “KLEVER” (the Operator), confirm my consent to the Operator processing the personal data I provide for the purposes of offering me services and new services offered by the Operator, for surveys, questionnaires, advertising and marketing research regarding services provided by the Operator, including by making direct contacts with me via the communication means I indicated on this website.",
      },
      {
        type: "p",
        text: "This right (consent) is granted for any actions regarding my personal data that are necessary and desirable to achieve the above purposes, including, without limitation, collection, systematization, accumulation, storage, clarification (updating, changing), use, transfer, depersonalization, blocking and destruction of personal data, meaning all data I indicated on this website.",
      },
      {
        type: "p",
        text: "I hereby confirm that I have been notified that personal data is processed by the Operator by any means, including with automation tools (including software) and without automation tools (using various tangible media, including paper).",
      },
      {
        type: "p",
        text: "Consent may be withdrawn, or the procedure for processing personal data clarified, by contacting the Operator using the contacts indicated on the website.",
      },
      { type: "route", route: CONTACTS, label: "Operator contacts" },
    ],
    uz: [
      {
        type: "p",
        text: "Shu bilan men, o‘z irodam va manfaatim bilan harakat qilib, «KLEVER» mas’uliyati cheklangan jamiyatining clover-spb.ru internet-saytida shaxsiy ma’lumotlarimni joylashtirish (kiritish) chog‘ida (keyingi o‘rinlarda — Operator) Operator menga xizmatlar, Operator taklif qiladigan yangi xizmatlarni taklif etish, Operator ko‘rsatadigan xizmatlarga oid so‘rovnomalar, anketalashtirish, reklama va marketing tadqiqotlarini o‘tkazish maqsadlarida, shu jumladan ushbu saytda ko‘rsatgan aloqa vositalari orqali men bilan bevosita bog‘lanish yo‘li bilan, ko‘rsatgan shaxsiy ma’lumotlarimni qayta ishlashga roziligimni tasdiqlayman.",
      },
      {
        type: "p",
        text: "Ushbu huquq (rozilik) yuqoridagi maqsadlarga erishish uchun zarur va maqsadga muvofiq bo‘lgan, shaxsiy ma’lumotlarimga nisbatan har qanday harakatlarni amalga oshirishga beriladi, jumladan, cheklovlarsiz: yig‘ish, tizimlashtirish, to‘plash, saqlash, aniqlashtirish (yangilash, o‘zgartirish), foydalanish, uzatish, shaxssizlashtirish, bloklash va yo‘q qilish; bunda shaxsiy ma’lumotlar deganda ushbu saytda ko‘rsatgan barcha ma’lumotlarim tushuniladi.",
      },
      {
        type: "p",
        text: "Shu bilan tasdiqlayman: shaxsiy ma’lumotlarni Operator istalgan usulda, jumladan avtomatlashtirish vositalari (shu jumladan dasturiy ta’minot) bilan ham, avtomatlashtirishsiz (turli moddiy tashuvchilar, jumladan qog‘oz tashuvchilar yordamida) ham qayta ishlashi haqida xabardor qilinganman.",
      },
      {
        type: "p",
        text: "Rozilikni chaqirib olish yoki shaxsiy ma’lumotlarni qayta ishlash tartibini aniqlashtirish uchun saytda ko‘rsatilgan kontaktlar orqali Operatorga murojaat qilish mumkin.",
      },
      { type: "route", route: CONTACTS, label: "Operator kontaktlari" },
    ],
    ky: [
      {
        type: "p",
        text: "Ушуну менен мен, өз эрким жана кызыкчылыгым менен аракеттенип, «КЛЕВЕР» жоопкерчилиги чектелген коомунун clover-spb.ru интернет-сайтында жеке маалыматтарымды жайгаштырууда (киргизүүдө) (мындан ары — Оператор) мага кызматтарды, Оператор сунуштаган жаңы кызматтарды сунуштоо, Оператор көрсөткөн кызматтарга карата сурамжылоо, анкеталоо, жарнамалык жана маркетингдик изилдөөлөрдү жүргүзүү максаттарында, анын ичинде ушул сайтта көрсөткөн байланыш каражаттары аркылуу мен менен түз байланышуу жолу менен, көрсөткөн жеке маалыматтарымды Оператордун иштетүүсүнө макулдугумду ырастайм.",
      },
      {
        type: "p",
        text: "Ушул укук (макулдук) жогорудагы максаттарга жетүү үчүн зарыл жана каалануучу, жеке маалыматтарыма карата ар кандай аракеттерди жүзөгө ашырууга берилет, анын ичинде чектөөсүз: чогултуу, системалаштыруу, топтоо, сактоо, тактоо (жаңыртуу, өзгөртүү), колдонуу, өткөрүп берүү, жекесиздендирүү, бөгөттөө жана жок кылуу; мында жеке маалыматтар деп ушул сайтта көрсөткөн бардык маалыматтарым түшүнүлөт.",
      },
      {
        type: "p",
        text: "Ушуну менен ырастайм: жеке маалыматтарды Оператор каалаган ыкма менен, анын ичинде автоматташтыруу каражаттары (анын ичинде программалык камсыздоо) менен да, автоматташтыруусуз да (ар кандай материалдык алып жүрүүчүлөр, анын ичинде кагаз алып жүрүүчүлөр менен) иштетери жөнүндө кабардар кылынганымды.",
      },
      {
        type: "p",
        text: "Макулдукту кайра чакырып алуу же жеке маалыматтарды иштетүү тартибин тактоо үчүн сайтта көрсөтүлгөн байланыштар аркылуу Операторго кайрылууга болот.",
      },
      { type: "route", route: CONTACTS, label: "Оператордын байланыштары" },
    ],
    tg: [
      {
        type: "p",
        text: "Бо ҳамин ман, бо иродаи худ ва ба манфиати худ амал карда, ҳангоми ҷойгир кардан (ворид кардан)-и маълумоти шахсии худ дар сомонаи clover-spb.ru-и ҷамъияти масъулияташ маҳдуди «КЛЕВЕР» (минбаъд — Оператор) розигии худро ба коркарди маълумоти шахсии зикркардаам аз ҷониби Оператор барои пешниҳоди хизматҳо ва хизматҳои нави Оператор, гузаронидани пурсишҳо, анкетакунӣ, тадқиқоти рекламавӣ ва маркетингӣ нисбат ба хизматҳои Оператор, аз ҷумла тавассути тамосҳои мустақим бо ман бо воситаҳои алоқаи дар ин сомона зикркардаам, тасдиқ мекунам.",
      },
      {
        type: "p",
        text: "Ин ҳуқуқ (розигӣ) барои анҷом додани ҳама гуна амалҳо нисбат ба маълумоти шахсии ман, ки барои расидан ба мақсадҳои болозакр зарур ва матлуб аст, дода мешавад, аз ҷумла бе маҳдудият: ҷамъоварӣ, банизомдарорӣ, ҷамъкунӣ, нигоҳдорӣ, мушаххаскунӣ (навсозӣ, тағйир), истифода, интиқол, бешахскунӣ, бастани дастрасӣ ва нест кардани маълумоти шахсӣ, ки дар зери он ҳамаи маълумоти дар ин сомона зикркардаам фаҳмида мешавад.",
      },
      {
        type: "p",
        text: "Бо ҳамин тасдиқ мекунам, ки огоҳ шудаам: коркарди маълумоти шахсӣ аз ҷониби Оператор бо ҳар усул, аз ҷумла бо истифодаи воситаҳои автоматӣ (аз ҷумла нармафзор) ва бе истифодаи онҳо (бо истифодаи носителҳои моддӣ, аз ҷумла коғазӣ) сурат мегирад.",
      },
      {
        type: "p",
        text: "Бозхондани розигӣ ё мушаххас кардани тартиби коркарди маълумоти шахсиро бо муроҷиат ба Оператор тавассути тамосҳои дар сомона зикршуда анҷом додан мумкин аст.",
      },
      { type: "route", route: CONTACTS, label: "Тамосҳои Оператор" },
    ],
    "zh-CN": [
      {
        type: "p",
        text: "本人在此声明：出于本人自愿并为本人利益，在有限责任公司「КЛЕВЕР」（下称处理方）网站 clover-spb.ru 上填写（录入）本人个人数据时，确认同意处理方为实现向本人提供服务及处理方所提供的新服务、就处理方所提供服务开展调查、问卷、广告与市场研究之目的（包括通过本人在本网站注明的联系方式与本人直接联系）处理本人所提供的个人数据。",
      },
      {
        type: "p",
        text: "本权利（同意）授予为实现上述目的所必要且适宜的、针对本人个人数据的任何行为，包括但不限于收集、系统化、积累、存储、更正（更新、变更）、使用、传输、去标识化、冻结与销毁个人数据；此处个人数据指本人在本网站注明的全部数据。",
      },
      {
        type: "p",
        text: "本人确认已获知：处理方可以任何方式处理个人数据，包括使用自动化手段（含软件）以及不使用自动化手段（使用包括纸质在内的各种有形载体）。",
      },
      {
        type: "p",
        text: "可通过网站所示联系方式联系处理方，撤回同意或了解个人数据处理程序。",
      },
      { type: "route", route: CONTACTS, label: "处理方联系方式" },
    ],
    ar: [
      {
        type: "p",
        text: "أُقرّ بموجب هذا، متصرفاً بإرادتي ولمصلحتي، عند وضع (إدخال) بياناتي الشخصية على موقع clover-spb.ru التابع لشركة ذات مسؤولية محدودة «كليفّر» (المشار إليها لاحقاً بالجهة المشغّلة)، بموافقتي على معالجة الجهة المشغّلة للبيانات الشخصية التي أقدّمها بغرض عرض الخدمات والخدمات الجديدة التي تقدّمها الجهة المشغّلة، ولإجراء الاستبيانات والاستطلاعات والأبحاث الإعلانية والتسويقية المتعلقة بالخدمات التي تقدّمها الجهة المشغّلة، بما في ذلك عبر التواصل المباشر معي بوسائل الاتصال التي ذكرتُها على هذا الموقع.",
      },
      {
        type: "p",
        text: "يُمنح هذا الحق (الموافقة) للقيام بأي إجراءات تتعلق ببياناتي الشخصية تكون لازمة ومرغوبة لتحقيق الأغراض المذكورة أعلاه، بما في ذلك دون حصر: الجمع والتنظيم والتراكم والتخزين والتوضيح (التحديث والتغيير) والاستخدام والنقل وإزالة الهوية والحظر والإتلاف للبيانات الشخصية، ويقصد بها جميع البيانات التي ذكرتُها على هذا الموقع.",
      },
      {
        type: "p",
        text: "أُقرّ بموجب هذا بأنني أُبلغت بأن معالجة البيانات الشخصية تتم من قبل الجهة المشغّلة بأي وسيلة، بما في ذلك باستخدام أدوات الأتمتة (بما في ذلك البرمجيات) ودون استخدامها (باستخدام وسائط مادية مختلفة، بما في ذلك الورق).",
      },
      {
        type: "p",
        text: "يمكن سحب الموافقة أو الاستفسار عن إجراءات معالجة البيانات الشخصية بالتواصل مع الجهة المشغّلة عبر جهات الاتصال المذكورة على الموقع.",
      },
      { type: "route", route: CONTACTS, label: "جهات اتصال الجهة المشغّلة" },
    ],
  },
};

/** Pages whose body translations need owner / legal review. */
export const INFO_BODY_REVIEW_FLAGS = Object.freeze({
  returns: {
    legalReviewVerified: false,
    ownerReviewRequired: true,
    note: "Return/exchange terms — owner must verify before treating as binding.",
  },
  "privacy-policy": {
    legalReviewVerified: false,
    ownerReviewRequired: true,
    note: "AUTO draft; not a certified legal translation.",
  },
  "personal-data-consent": {
    legalReviewVerified: false,
    ownerReviewRequired: true,
    note: "AUTO draft; not a certified legal translation.",
  },
});

export function getInfoPageBodyBlocks(slug, language) {
  const key = String(slug || "").trim();
  const row = BODY[key];
  if (!row) return null;
  const internal = exactTranslationTargetInternal(language);
  if (!internal) return null;
  const blocks = row[internal];
  return Array.isArray(blocks) && blocks.length ? blocks : null;
}

export function listInfoPageBodySlugs() {
  return Object.keys(BODY).sort();
}

export function infoBodyPublicLocale(language) {
  return toPublicLocaleCode(language) || "";
}
