/** Authoritative Stage 3.1 system UI catalog. RU dictionary is derived from this file. */

export const STAGE31_FOUNDATIONAL_KEYS = Object.freeze([
  "shared.modal.confirmTitle",
  "shared.modal.confirm",
  "shared.modal.cancel",
  "shared.modal.alertTitle",
  "shared.modal.ok",
  "shared.modal.details",
  "shared.modal.orderContents",
]);

const RAW_CATALOG = [
  {
    "key": "shared.modal.confirmTitle",
    "sourceRu": "Подтвердите действие",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.modal.confirm",
    "sourceRu": "Подтвердить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.modal.cancel",
    "sourceRu": "Отмена",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.modal.alertTitle",
    "sourceRu": "Внимание",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.modal.ok",
    "sourceRu": "Понятно",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.modal.details",
    "sourceRu": "Подробности",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.modal.orderContents",
    "sourceRu": "Состав заказа",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "auth.login.title",
    "sourceRu": "Личный кабинет",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.submit",
    "sourceRu": "Войти",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.email",
    "sourceRu": "Логин",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.password",
    "sourceRu": "Пароль",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.showPassword",
    "sourceRu": "Показать пароль",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.hidePassword",
    "sourceRu": "Скрыть пароль",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.passkey",
    "sourceRu": "Войти по Face ID / отпечатку",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.passkeyBusy",
    "sourceRu": "Подтверждаем…",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.wait",
    "sourceRu": "Подождите…",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.login.logoAlt",
    "sourceRu": "Логотип Clover",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.title",
    "sourceRu": "Создание аккаунта",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.submit",
    "sourceRu": "Зарегистрироваться",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.company",
    "sourceRu": "Название организации",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.contact",
    "sourceRu": "Контактное лицо",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.phone",
    "sourceRu": "Телефон",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.email",
    "sourceRu": "Электронная почта",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.hint",
    "sourceRu": "Регистрация доступна только клиентам. Роль определится автоматически при входе.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.register.created",
    "sourceRu": "Регистрация создана.",
    "namespace": "ui",
    "surface": "auth",
    "critical": false
  },
  {
    "key": "auth.verify.title",
    "sourceRu": "Подтверждаем почту",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.verify.subtitle",
    "sourceRu": "Проверяем ссылку регистрации…",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.verify.confirmed",
    "sourceRu": "Электронная почта подтверждена.",
    "namespace": "ui",
    "surface": "auth",
    "critical": false
  },
  {
    "key": "auth.verify.resend",
    "sourceRu": "Отправить письмо подтверждения ещё раз",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.forgot.title",
    "sourceRu": "Восстановление пароля",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.forgot.submit",
    "sourceRu": "Отправить ссылку",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.forgot.hint",
    "sourceRu": "Укажите почту — мы отправим ссылку для установки нового пароля.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.reset.title",
    "sourceRu": "Новый пароль",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.reset.confirm",
    "sourceRu": "Повторите новый пароль",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.reset.submit",
    "sourceRu": "Сохранить пароль",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.reset.hint",
    "sourceRu": "Придумайте новый пароль длиной не менее 6 символов.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.reset.mismatch",
    "sourceRu": "Пароли не совпадают.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.backToLogin",
    "sourceRu": "Вернуться ко входу",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.accessHint",
    "sourceRu": "Доступ в личный кабинет Вы можете получить у менеджера",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.devLink",
    "sourceRu": "Тестовая ссылка для локальной настройки:",
    "namespace": "ui",
    "surface": "auth",
    "critical": false
  },
  {
    "key": "auth.devOpen",
    "sourceRu": "открыть",
    "namespace": "ui",
    "surface": "auth",
    "critical": false
  },
  {
    "key": "auth.passkeyUnsupported",
    "sourceRu": "Это устройство или браузер не поддерживает вход по Face ID или ключу доступа.",
    "namespace": "ui",
    "surface": "auth",
    "critical": false
  },
  {
    "key": "auth.passkeyCancelled",
    "sourceRu": "Вход по Face ID отменён.",
    "namespace": "ui",
    "surface": "auth",
    "critical": false
  },
  {
    "key": "auth.documentTitle",
    "sourceRu": "Личный кабинет | КЛЕВЕР",
    "namespace": "ui",
    "surface": "auth",
    "critical": false
  },
  {
    "key": "manager.nav.orders",
    "sourceRu": "Заказы",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.products",
    "sourceRu": "Товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.storefront",
    "sourceRu": "Витрина",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.clients",
    "sourceRu": "Клиенты",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.acts",
    "sourceRu": "Акты сверок",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.exchange",
    "sourceRu": "1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.priceList",
    "sourceRu": "Прайс",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.languages",
    "sourceRu": "Языки и переводы",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "manager.nav.more",
    "sourceRu": "Ещё",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.access",
    "sourceRu": "Доступы",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.settings",
    "sourceRu": "Настройки",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.backup",
    "sourceRu": "Резервные копии",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.nav.audit",
    "sourceRu": "Журнал",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "client.nav.matrix",
    "sourceRu": "Моя матрица",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.nav.catalog",
    "sourceRu": "Добавить товары из каталога",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.nav.orders",
    "sourceRu": "Мои заказы",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.nav.reconciliation",
    "sourceRu": "Акт сверки",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.nav.cabinet",
    "sourceRu": "Настройки",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.nav.addresses",
    "sourceRu": "Адреса",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.nav.profile",
    "sourceRu": "Профиль",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "storefront.nav.catalog",
    "sourceRu": "Каталог",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.cart",
    "sourceRu": "Корзина",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.checkout",
    "sourceRu": "Оформить заказ",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.search.placeholder",
    "sourceRu": "Поиск",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.cart.empty",
    "sourceRu": "Корзина пуста",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.footer.copyright",
    "sourceRu": "© КЛЕВЕР",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.back",
    "sourceRu": "Назад",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.more",
    "sourceRu": "Подробнее",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "checkout.address",
    "sourceRu": "Адрес доставки *",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.confirmNote",
    "sourceRu": "Мы свяжемся с вами для подтверждения.",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "admin.languages.lead",
    "sourceRu": "Публично можно включить только готовый язык. Русский всегда включён.",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.searchPlaceholder",
    "sourceRu": "Русский текст или ключ",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.language",
    "sourceRu": "Язык",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.untranslatedOnly",
    "sourceRu": "только непереведённые",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.empty",
    "sourceRu": "Переводов пока нет. Русский интерфейс продолжает работать.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.status",
    "sourceRu": "Статус",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.editor",
    "sourceRu": "Редактор",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.save",
    "sourceRu": "Сохранить",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.resetAuto",
    "sourceRu": "Вернуть AUTO",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.stale",
    "sourceRu": "устарело",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.state.auto",
    "sourceRu": "AUTO",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.state.manual",
    "sourceRu": "MANUAL",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.state.missing",
    "sourceRu": "MISSING",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.state.stale",
    "sourceRu": "устарело",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.saved",
    "sourceRu": "Перевод сохранён.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.resetDone",
    "sourceRu": "Перевод возвращён к AUTO.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.resetConfirm",
    "sourceRu": "Вернуть текущий автоматический перевод? Ручная правка будет заменена.",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.enableBlockedTitle",
    "sourceRu": "Язык нельзя включить",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.enableBlocked",
    "sourceRu": "Критичные переводы для этого языка ещё не готовы.",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.saveFailed",
    "sourceRu": "Не удалось сохранить языки",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.languages.loadFailed",
    "sourceRu": "Не удалось загрузить переводы.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.sourceLocked",
    "sourceRu": "Источник и запасной язык. Отключить нельзя.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.ready",
    "sourceRu": "Критичные переводы готовы.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.notReady",
    "sourceRu": "Не готов: не хватает критичных переводов.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.views",
    "sourceRu": "Разделы переводов",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.view.interface",
    "sourceRu": "Интерфейс",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.view.categories",
    "sourceRu": "Категории и подкатегории",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.view.seo",
    "sourceRu": "SEO / FAQ / страницы",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.view.glossary",
    "sourceRu": "Словарь номенклатуры",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.view.untranslated",
    "sourceRu": "Непереведённое",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.label.en",
    "sourceRu": "Английский",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.label.uz",
    "sourceRu": "Узбекский",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.label.ky",
    "sourceRu": "Киргизский",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.label.tg",
    "sourceRu": "Таджикский",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.label.zh",
    "sourceRu": "Китайский (упрощённый)",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.label.ar",
    "sourceRu": "Арабский",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.languages.updatedAt",
    "sourceRu": "Обновлено",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "shared.action.add",
    "sourceRu": "Добавить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.delete",
    "sourceRu": "Удалить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.edit",
    "sourceRu": "Изменить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.close",
    "sourceRu": "Закрыть",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.back",
    "sourceRu": "← Назад",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.refresh",
    "sourceRu": "Обновить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.yes",
    "sourceRu": "Да",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.no",
    "sourceRu": "Нет",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.empty.none",
    "sourceRu": "Пока нет данных.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "client.action.newOrder",
    "sourceRu": "+ Новый заказ",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.action.fillProfile",
    "sourceRu": "+ Заполнить профиль",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.action.addAddress",
    "sourceRu": "+ Добавить адрес",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.favorites",
    "sourceRu": "★ Избранное",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.profile.incompleteTitle",
    "sourceRu": "Профиль не заполнен",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.profile.incomplete",
    "sourceRu": "Сначала заполните профиль организации.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.address.missingTitle",
    "sourceRu": "Нет адреса",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.address.missing",
    "sourceRu": "Сначала добавьте адрес доставки.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.address.title",
    "sourceRu": "Адрес доставки",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.address.empty",
    "sourceRu": "Адресов пока нет.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.address.emptyHint",
    "sourceRu": "Адресов пока нет. Добавьте адрес перед созданием заказа.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.order.editBlockedTitle",
    "sourceRu": "Редактирование недоступно",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.editBlocked",
    "sourceRu": "Редактировать можно только новый заказ.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "manager.products.add",
    "sourceRu": "+ Добавить товар",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.notifications.title",
    "sourceRu": "Уведомления",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "checkout.cart.positions",
    "sourceRu": "поз.",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "admin.languages.label.ru",
    "sourceRu": "Русский",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "auth.addendumUnavailable",
    "sourceRu": "Дозаказ недоступен",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.allOrdersWillBeDeletedYou",
    "sourceRu": "Все заказы будут удалены. Это действие нельзя отменить из этого окна.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.aNewVersionIsAvailable",
    "sourceRu": "Доступна новая версия",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.cannotDelete",
    "sourceRu": "Нельзя удалить",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.connectionIssue",
    "sourceRu": "Проблема связи",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.createTheProductInTheCatalog",
    "sourceRu": "Создать товар в каталоге?",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.dataNotLoaded",
    "sourceRu": "Данные не загружены",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.deleteAllOrders",
    "sourceRu": "Удалить все заказы?",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.deletion",
    "sourceRu": "Удаление",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.deletionUnavailable",
    "sourceRu": "Удаление недоступно",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.deletionWasNotCompleted",
    "sourceRu": "Удаление не выполнено",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.itemsCanBeAddedOnlyTo",
    "sourceRu": "Добавить позиции можно только в последний заказ со статусом «Новый», пока менеджер его не принял.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.managerOrderDeletionIsCurrentlyDisabled",
    "sourceRu": "Удаление заказов менеджером сейчас отключено в настройках.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.noLink",
    "sourceRu": "Нет связи",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.notEnoughPermissions",
    "sourceRu": "Недостаточно прав",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.onlyAnAdministratorCanPermanentlyDelete",
    "sourceRu": "Удалить выполненный заказ навсегда может только администратор.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.orderDeletionIsCurrentlyDisabled",
    "sourceRu": "Удаление заказов сейчас отключено.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.orderNotSaved",
    "sourceRu": "Заказ не сохранён",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.productWasNotAddedToThe",
    "sourceRu": "Товар не добавлен в матрицу.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.reloadThePageToGetThe",
    "sourceRu": "Обновите страницу, чтобы получить изменения.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.resetCloverServerDataTheManager",
    "sourceRu": "Сбросить серверные данные Clover? Аккаунт менеджера сохранится.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.resetError",
    "sourceRu": "Ошибка сброса",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.resetServerData",
    "sourceRu": "Сбросить серверные данные?",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.serverDataHasNotLoadedYet",
    "sourceRu": "Данные с сервера ещё не загружены. Обновите страницу и повторите заказ.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.serverDataWasReset",
    "sourceRu": "Серверные данные сброшены.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.statusUpdatedPartially",
    "sourceRu": "Статус обновлён частично",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.theOrderWillDisappearFromClover",
    "sourceRu": "Заказ исчезнет из Clover у клиента и в кабинете. Документ в 1С не меняется и не удаляется. Восстановить будет нельзя без резервной копии.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.theOrderWillReturnToThe",
    "sourceRu": "Заказ снова появится в списке активных и станет виден клиенту.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.thisCannotBeRestoredWithoutA",
    "sourceRu": "Восстановить будет нельзя без резервной копии. Документ в 1С не меняется.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.thisCannotBeRestoredWithoutA2",
    "sourceRu": "Восстановить будет нельзя без резервной копии. Это действие необратимо.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.trashIsDisabled",
    "sourceRu": "Корзина отключена",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.updateError",
    "sourceRu": "Ошибка обновления",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.youCanViewDataThatIs",
    "sourceRu": "Можно смотреть уже загруженные данные.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "checkout.addToOrder",
    "sourceRu": "Добавить в заказ",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "checkout.clearCartConfirm",
    "sourceRu": "Очистить корзину?",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "checkout.delivery",
    "sourceRu": "Доставка",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.deliveryDate",
    "sourceRu": "Дата доставки",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.needAddress",
    "sourceRu": "Укажите адрес доставки",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "checkout.submitOrder",
    "sourceRu": "Отправить заказ",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.thanks",
    "sourceRu": "Благодарим за Ваш заказ!",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "client.accountant",
    "sourceRu": "Бухгалтер",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.addAtLeastOneCatalogProduct",
    "sourceRu": "Добавьте хотя бы один товар из каталога.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.addAtLeastOneProduct",
    "sourceRu": "Добавьте хотя бы один товар.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.addCatalogProductsTheyWillAppear",
    "sourceRu": "Добавьте товары из каталога — они появятся здесь для быстрой правки.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.addendum",
    "sourceRu": "Дозаказ",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.adding",
    "sourceRu": "Добавляем…",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.addProductsToTheCart",
    "sourceRu": "Добавьте товары в корзину.",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.afterProcessingThePhotoIsStill",
    "sourceRu": "После обработки фотография всё ещё слишком большая. Выберите снимок меньшего размера.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.allSelectedItemsWillBeDeleted",
    "sourceRu": "Все выбранные позиции будут удалены.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.allTime",
    "sourceRu": "Весь период",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.aManagerHasNotYetPinned",
    "sourceRu": "Менеджер ещё не закрепил товары в вашей матрице. Когда матрица будет готова, позиции появятся здесь.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.aManagerWillPrepareTheStatement",
    "sourceRu": "Менеджер подготовит акт сверки и пришлёт PDF в этот раздел.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.amountPending",
    "sourceRu": "Сумма уточняется",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.backToTheOrder",
    "sourceRu": "Вернуться к заказу",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.cabinetSections",
    "sourceRu": "Разделы кабинета",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.catalog.categories",
    "sourceRu": "Категории",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.catalogCategories",
    "sourceRu": "Категории каталога",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.catalogView",
    "sourceRu": "Вид каталога",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.chooseAnAddressFromTheList",
    "sourceRu": "Выберите адрес из списка или добавьте новый.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.clientPersonalCabinet",
    "sourceRu": "Личный кабинет клиента",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.closeCart",
    "sourceRu": "Закрыть корзину",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.closeDatePicker",
    "sourceRu": "Закрыть выбор даты",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.cloverManager",
    "sourceRu": "Менеджер Clover",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.contact.manager",
    "sourceRu": "Связаться с менеджером",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.createTheFirstOrderItWill",
    "sourceRu": "Создайте первый заказ — он появится здесь.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.current",
    "sourceRu": "текущий",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.customDates",
    "sourceRu": "Свои даты",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.dateUnavailable",
    "sourceRu": "Дата недоступна",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.deliveryCalendar",
    "sourceRu": "Календарь доставки",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.deliveryInSaintPetersburgIsFree",
    "sourceRu": "Доставка по Санкт-Петербургу — бесплатно.",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.deliveryInSpbIsFree",
    "sourceRu": "Доставка по СПб — бесплатно.",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.director",
    "sourceRu": "Директор",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.extraContact",
    "sourceRu": "Доп. контакт",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.favorites.short",
    "sourceRu": "Избранное",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.fileDownloadError",
    "sourceRu": "Ошибка скачивания файла.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.filter.withPhoto",
    "sourceRu": "С фото",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.forExampleCallBeforeDelivery",
    "sourceRu": "Например: позвонить перед доставкой",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.forExampleDirectorWarehousePurchasing",
    "sourceRu": "Например: директор, склад, закупки",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.forExampleIvanIvanov",
    "sourceRu": "Например: Иван Иванов",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.fr",
    "sourceRu": "Пт",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.freeDeliveryInSpb",
    "sourceRu": "Доставка по СПб бесплатная",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.goodsReceiving",
    "sourceRu": "Приём товара",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.itemsCannotBeAddedToThe",
    "sourceRu": "Нельзя добавить позиции в текущий заказ.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.matrix.add",
    "sourceRu": "В матрицу",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.matrix.short",
    "sourceRu": "Матрица",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.mo",
    "sourceRu": "Пн",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.nextMonth",
    "sourceRu": "Следующий месяц",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.noOrdersFound",
    "sourceRu": "Заказы не найдены",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.noOrdersYet",
    "sourceRu": "Пока нет заказов",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.optional",
    "sourceRu": "Необязательно",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.order.editing",
    "sourceRu": "Редактирование заказа",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.new",
    "sourceRu": "Новый заказ",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.repeat",
    "sourceRu": "Повтор заказа",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.orderCart",
    "sourceRu": "Корзина заказа",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.orPlaceTheOrderWithPaid",
    "sourceRu": "либо оформите заказ с платной доставкой.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.other",
    "sourceRu": "Прочее",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.paidDelivery",
    "sourceRu": "Платная доставка",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.previousMonth",
    "sourceRu": "Предыдущий месяц",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.primary",
    "sourceRu": " — основной",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.primaryContact",
    "sourceRu": "Основной контакт",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.productPhotoJpg",
    "sourceRu": "Фото товара.jpg",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.productsNotFound",
    "sourceRu": "Товары не найдены",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.purchasing",
    "sourceRu": "Закупки",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.q1",
    "sourceRu": "1 кв.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.q2",
    "sourceRu": "2 кв.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.q3",
    "sourceRu": "3 кв.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.q4",
    "sourceRu": "4 кв.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.quantityIsCountedInPieces",
    "sourceRu": "Количество считается поштучно",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.reconciliation",
    "sourceRu": "Сверка",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.removeFromMatrix",
    "sourceRu": "Убрать из матрицы",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.removing",
    "sourceRu": "Убираем…",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.requestAStatement",
    "sourceRu": "Запросить акт сверки",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.requestSent",
    "sourceRu": "Запрос отправлен",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.sa",
    "sourceRu": "Сб",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.searchByNameOrCode",
    "sourceRu": "Поиск по названию или коду",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.selectProductsInTheCatalogThen",
    "sourceRu": "Выберите товары в каталоге, затем откройте корзину для оформления.",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.sending",
    "sourceRu": "Отправляем…",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.settingsSections",
    "sourceRu": "Разделы настроек",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.statementRequestError",
    "sourceRu": "Ошибка запроса акта сверки.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.su",
    "sourceRu": "Вс",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.subcategories",
    "sourceRu": "Подкатегории",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.th",
    "sourceRu": "Чт",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.theAddressWillDisappearFromThe",
    "sourceRu": "Адрес пропадёт из списка. При оформлении заказа его выбрать будет нельзя.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.theBrowserCouldNotPrepareThe",
    "sourceRu": "Браузер не смог подготовить фотографию.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.theCatalogIsEmptyForNow",
    "sourceRu": "Каталог пока пуст. Обратитесь к менеджеру.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.thePhotoIsTooLargeThe",
    "sourceRu": "Фотография слишком большая. Максимальный исходный размер — 12 МБ.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.thereAreNoOrdersForThis",
    "sourceRu": "По этому фильтру заказов нет. Попробуйте другой статус.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.thereAreNoProductsInThis",
    "sourceRu": "В этой категории товаров нет.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.thereIsNoOrderWithStatus",
    "sourceRu": "Нет заказа со статусом «Новый» — дозаказ доступен до принятия менеджером.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.tryAnotherCategorySubcategoryOrQuery",
    "sourceRu": "Попробуйте другую категорию, подкатегорию или другой запрос.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.tu",
    "sourceRu": "Вт",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.view.list",
    "sourceRu": "Список",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.warehouse",
    "sourceRu": "Склад",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.we",
    "sourceRu": "Ср",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.youHaveSeveralAddressesChooseWhere",
    "sourceRu": "У вас несколько адресов. Выберите, куда доставить заказ.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.yourMatrixHasNoProductsYet",
    "sourceRu": "В вашей матрице пока нет товаров. Попросите менеджера добавить позиции.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "manager.accessError",
    "sourceRu": "Ошибка доступа",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.accessType",
    "sourceRu": "Тип доступов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.active",
    "sourceRu": "Активен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.active2",
    "sourceRu": "Активна",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addAnImage",
    "sourceRu": "Добавить картинку",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.added",
    "sourceRu": "Добавлено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.adding",
    "sourceRu": "Добавляем...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addPhoto",
    "sourceRu": "Добавить фото",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addressFromTheOrder",
    "sourceRu": "Адрес из заказа",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.adminCabinet",
    "sourceRu": "Кабинет админа",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.adminSections",
    "sourceRu": "Разделы админа",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.afterHttpsAndVapid",
    "sourceRu": "после HTTPS и VAPID",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allCheckedItemsAreAlreadyIn",
    "sourceRu": "Все отмеченные позиции уже есть в каталоге Clover.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allNotificationsMarkedAsRead",
    "sourceRu": "Все уведомления отмечены прочитанными",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allowAccess",
    "sourceRu": "Разрешить доступ",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allowDraftCreation",
    "sourceRu": "Разрешить создание черновика",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allowed",
    "sourceRu": "разрешена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allowTheClientToRequestMissing",
    "sourceRu": "Разрешить клиенту запрашивать отсутствующие позиции.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allProducts",
    "sourceRu": "Все товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyInCatalog",
    "sourceRu": "Уже в каталоге",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyInMatrix",
    "sourceRu": "Уже в матрице",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyLinked",
    "sourceRu": "Уже связан",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyOnStorefront",
    "sourceRu": "Уже на витрине",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.aManagerCanMoveOrdersTo",
    "sourceRu": "Менеджер может перемещать заказы в корзину до передачи в 1С и восстанавливать их.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.anAdminCanDeleteTheStatement",
    "sourceRu": " Админ может удалить акт — он исчезнет и у клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.anEmailAboutANewOrder",
    "sourceRu": "Письмо о новом заказе с полным составом для ручного ввода в 1С. Нужны SMTP в server/.env и адрес ниже.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.anErrorOccurredTapToSend",
    "sourceRu": "Произошла ошибка — нажмите, чтобы передать снова",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.anInternalNotificationWasCreatedExternal",
    "sourceRu": "Внутреннее уведомление создано. Внешние каналы пока выключены.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.anUnfinishedNewOrderIsSaved",
    "sourceRu": "Незавершённый новый заказ сохраняется в браузере.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.attachTheStatementPdfFirst",
    "sourceRu": "Сначала прикрепите PDF акта сверки.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.available",
    "sourceRu": "доступно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.aYandexMapsLinkIsRequired",
    "sourceRu": "Нужна ссылка Яндекс.Карт: скопируйте адрес из браузера (yandex.ru/maps или n.maps.yandex.ru).",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.backupCreated",
    "sourceRu": "Создана резервная копия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.backupCreatedOnTheServer",
    "sourceRu": "Резервная копия создана на сервере.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.backupRestored",
    "sourceRu": "Восстановлена резервная копия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.block",
    "sourceRu": "Заблокировать",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.blockAccess",
    "sourceRu": "Заблокировать доступ",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.blockAccess2",
    "sourceRu": "Заблокировать доступ?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.blocked",
    "sourceRu": "заблокирована",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.blockOrdersWithoutASavedAddress",
    "sourceRu": "Запретить заказ без сохранённого адреса.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.blockOrdersWithoutOrganizationDetails",
    "sourceRu": "Запретить заказ без данных организации.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.blockThisClientSAccessThey",
    "sourceRu": "Заблокировать доступ этому клиенту? Он не сможет войти в Clover, пока вы снова не разрешите доступ.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.brieflyMatrixNotesOr1cLink",
    "sourceRu": "Кратко: особенности матрицы или связи с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.bulkActions",
    "sourceRu": "Массовые действия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.buttonTextForExampleViewProduct",
    "sourceRu": "Текст кнопки, например «Смотреть товар»",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.byCode",
    "sourceRu": "По коду",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cabinetSettingsUpdated",
    "sourceRu": "Настройки кабинета обновлены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cabinetSignIn",
    "sourceRu": "Вход в кабинет",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cancelThe1cTransfer",
    "sourceRu": "Отменить передачу в 1С?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cancelTransfer",
    "sourceRu": "Отменить передачу",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cancelUnavailable",
    "sourceRu": "Отмена недоступна",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cannotBeAddedAgain",
    "sourceRu": "повторно добавить нельзя",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.captionOptional",
    "sourceRu": "Подпись, необязательно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.card",
    "sourceRu": "Карточка",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cardEnriched",
    "sourceRu": "Карточка дополнена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.catalogChanged",
    "sourceRu": "Изменён каталог",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.catalogOrHttps",
    "sourceRu": "/catalog или https://…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.certificateFileUploadedToTheServer",
    "sourceRu": "Файл сертификата загружен на сервер.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.certificateSaved",
    "sourceRu": "Сертификат сохранён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.change1cProduct",
    "sourceRu": "Изменить товар 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.changeCounterparty",
    "sourceRu": "Изменить контрагента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.changed",
    "sourceRu": "Изменён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.changeTheAdministratorPasswordInMore",
    "sourceRu": "Смену пароля администратора выполняйте в «Ещё → Доступы → Менеджеры» → ваша карточка → «Управление». Здесь можно добавить Face ID, отпечаток или завершить другие сессии.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.channel",
    "sourceRu": "канал",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.checkAndSendAsATest",
    "sourceRu": "Проверить и передать тестово",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.checking",
    "sourceRu": "Проверяем…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.checkTheFields",
    "sourceRu": "Проверьте поля",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.checkToRemoveFromThisClient",
    "sourceRu": "Отметить, чтобы удалить из матрицы этого клиента. Снятие галочки товар из матрицы не убирает.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.chooseA1cCounterparty",
    "sourceRu": "Выбрать контрагента 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.chooseAnExcelFile",
    "sourceRu": "Выбрать файл Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.chooseAnotherFile",
    "sourceRu": "Выбрать другой файл",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.chooseASubcategory",
    "sourceRu": "Выберите подкатегорию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.chooseFromLoaded1cItems",
    "sourceRu": "Выбрать из загруженных 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cleanupError",
    "sourceRu": "Ошибка очистки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cleanupFinished",
    "sourceRu": "Очистка завершена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clearOldCopies",
    "sourceRu": "Очистить старые копии?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.client",
    "sourceRu": "клиент",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.client2",
    "sourceRu": "клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientActions",
    "sourceRu": "Действия с клиентом",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientDeleted",
    "sourceRu": "Клиент удалён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientDetails",
    "sourceRu": "Данные клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientDetailsWereSavedInClover",
    "sourceRu": "Данные клиента сохранены в Clover.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientMatrixBlockError",
    "sourceRu": "Ошибка блока матрицы клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientMatrixChanged",
    "sourceRu": "Изменена матрица клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientRegistered",
    "sourceRu": "Зарегистрирован клиент",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientsSectionError",
    "sourceRu": "Ошибка раздела «Клиенты»",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cloverBasePrice",
    "sourceRu": "Базовая цена Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cloverNews",
    "sourceRu": "Новость Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cloverNotifications",
    "sourceRu": "Уведомления в Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cloverOnlineStore",
    "sourceRu": "Интернет магазин Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cloverWillSendTheNamePhone",
    "sourceRu": "Clover передаст название, телефон и email. Если 1С вернёт ID контрагента, связь сохранится автоматически.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.compositionMaterials",
    "sourceRu": "Состав / материалы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.configured",
    "sourceRu": "настроен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.confirmAgain",
    "sourceRu": "Подтвердите ещё раз",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.connectionError",
    "sourceRu": "Ошибка подключения",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.contactUs",
    "sourceRu": "Связаться с нами",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.copyCreated",
    "sourceRu": "Копия создана",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.counterparties",
    "sourceRu": "Контрагенты",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.counterpartyName",
    "sourceRu": "Название контрагента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.createAFullCopy",
    "sourceRu": "Создать полную копию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.createAndGrantAccess",
    "sourceRu": "Создать и выдать доступ",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.createClientAccess",
    "sourceRu": "Создать доступ для клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.creating",
    "sourceRu": "Создаём...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.dataRestoredTheCabinetWasRefreshed",
    "sourceRu": "Данные восстановлены. Кабинет обновлён.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.dataWasResetAfterASafety",
    "sourceRu": "Данные сброшены после создания страховочной копии",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteAutomaticCopiesOlderThan30",
    "sourceRu": "Удалить автоматические копии старше 30 дней и оставить не больше 50 копий? Ручные свежие копии сохранятся.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteClient",
    "sourceRu": "Удалить клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteError",
    "sourceRu": "Ошибка удаления",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteManyProducts",
    "sourceRu": "Удалить много товаров?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteSelected",
    "sourceRu": "Удалить выбранные",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteSelectedProducts",
    "sourceRu": "Удалить выбранные товары?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteTheCertificate",
    "sourceRu": "Удалить сертификат?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteTheClient",
    "sourceRu": "Удалить клиента?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteTheEntireCloverCatalog",
    "sourceRu": "Удалить весь каталог Clover?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteTheOrderFromCloverForever",
    "sourceRu": "Удалить заказ навсегда из Clover (документ в 1С не меняется)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteThePhoto",
    "sourceRu": "Удалить фото?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteTheProductFromTheCatalog",
    "sourceRu": "Удалить товар из каталога?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteTheStatement",
    "sourceRu": "Удалить акт сверки?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleting",
    "sourceRu": "Удаление…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleting2",
    "sourceRu": "Удаляем...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deletingNewOrders",
    "sourceRu": "Удаление новых заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.descriptionIsEmpty",
    "sourceRu": "описание не заполнено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.disabled",
    "sourceRu": "Отключена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.downloadCsvPack",
    "sourceRu": "Скачать пакет CSV",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.downloadError",
    "sourceRu": "Ошибка скачивания",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.downloading",
    "sourceRu": "Скачиваем…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.downloadJsonPack",
    "sourceRu": "Скачать пакет JSON",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.downloadPdf",
    "sourceRu": "Скачать PDF",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.draftAutosave",
    "sourceRu": "Автосохранение черновика",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.draftIn1c",
    "sourceRu": "Черновик в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.draftInTheSimulator",
    "sourceRu": "Черновик в симуляторе",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.editingNewOrders",
    "sourceRu": "Редактирование новых заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.editingTheProduct",
    "sourceRu": "Редактирование товара",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.emailIsConfirmedYouCanAllow",
    "sourceRu": "Почта подтверждена — можно разрешить вход в Clover.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.emailTurnOnSendToEmail",
    "sourceRu": "email: включите тумблер «Отправлять на email» и обновите страницу",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.emptyFieldsWereFilledFromPublic",
    "sourceRu": "Пустые поля заполнены из открытых источников.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enabledAndReady",
    "sourceRu": "включён и готов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enabledEnterAnAddress",
    "sourceRu": "включён, укажите адрес",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enabledSmtpIsNotConfigured",
    "sourceRu": "включён, SMTP не настроен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enrichFromTheInternet",
    "sourceRu": "Дополнить из интернета",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enrichmentQueueError",
    "sourceRu": "Ошибка очереди enrichment.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enterTheChatId",
    "sourceRu": "укажите Chat ID",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enterTheClientEmail",
    "sourceRu": "Укажите email клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enterTheCompanyNameOrThe",
    "sourceRu": "Укажите название компании или имя клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enterTheEmailAbove",
    "sourceRu": "укажите email выше",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.event",
    "sourceRu": "Событие",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.everyCloverCatalogProductIsAlready",
    "sourceRu": "Все товары каталога Clover уже есть в матрице этого клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.everyPromotionNeedsATitleEmpty",
    "sourceRu": "У каждой акции нужен заголовок. Пустые записи не сохраняются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exactName",
    "sourceRu": "Точное имя",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.excelIntoTheCloverCatalog",
    "sourceRu": "Excel в каталог Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.excelLoadedIntoTheCatalog",
    "sourceRu": "Excel загружен в каталог",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.excelLoadError",
    "sourceRu": "Ошибка загрузки Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.excelMatching",
    "sourceRu": "Сопоставление Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.excelToStorefront",
    "sourceRu": "Excel на витрину",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.excelUpload",
    "sourceRu": "Загрузка Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeError",
    "sourceRu": "Ошибка обмена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.failedToCreateA1cDraft",
    "sourceRu": "Ошибка создания черновика в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.failedToDeleteTheClient",
    "sourceRu": "Ошибка удаления клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.failedToDeleteTheStatement",
    "sourceRu": "Ошибка удаления акта сверки.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.failedToReadThe1cCatalog",
    "sourceRu": "Ошибка чтения справочника 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.failedToSendTheStatement",
    "sourceRu": "Ошибка отправки акта сверки.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.favoriteProducts",
    "sourceRu": "Избранные товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fileError",
    "sourceRu": "Ошибка файла",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fillInAllFieldsThePassword",
    "sourceRu": "Заполните все поля. Пароль — не короче 6 символов.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fillInTheNameAndFull",
    "sourceRu": "Заполните название и полный адрес во всех строках.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fillInThePromotions",
    "sourceRu": "Заполните акции",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExample123456789",
    "sourceRu": "Например: 123456789",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExampleCallBeforeDeliveryAccepts",
    "sourceRu": "Например: звонить перед доставкой, принимает товар до 16:00",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExampleIvanovIvanIvanovich",
    "sourceRu": "Например: Иванов Иван Иванович",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExampleMainStore",
    "sourceRu": "Например: Основной магазин",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExampleMurino",
    "sourceRu": "Например: Мурино",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExampleNf000001",
    "sourceRu": "Например: НФ-000001",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExampleNf00000742",
    "sourceRu": "Например, НФ-00000742",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forExampleWarehouseAccountant",
    "sourceRu": "Например: склад, бухгалтер",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.full1cExportFreeItemsAre",
    "sourceRu": "Полная выгрузка 1С. Свободные позиции сверху. Введите название или код и нажмите «Найти».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fullResetCompleted",
    "sourceRu": "Выполнен полный сброс",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fullTextOnThePromotionsPage",
    "sourceRu": "Подробный текст на странице акций",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.generatingPdf",
    "sourceRu": "Формируем PDF…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.great",
    "sourceRu": "Отлично",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hasPhoto",
    "sourceRu": " · фото есть",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hasVariants",
    "sourceRu": "Есть варианты",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hidden",
    "sourceRu": "Скрыт",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hide1cItems",
    "sourceRu": "Скрыть позиции 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hideActions",
    "sourceRu": "Скрыть действия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hideFilters",
    "sourceRu": "Скрыть фильтры",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hideForm",
    "sourceRu": "Скрыть форму",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.howTheItemIsNamedIn",
    "sourceRu": "Как позиция называется внутри 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.httpsAndVapidAreRequiredOn",
    "sourceRu": "нужны HTTPS и VAPID на сервере",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.httpsMaxRuUOrMax",
    "sourceRu": "https://max.ru/u/... или max.ru/username",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.httpsYandexRuMapsOrN",
    "sourceRu": "https://yandex.ru/maps/… или n.maps.yandex.ru/…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.iConfirmDeletion",
    "sourceRu": "Подтверждаю удаление",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.ifTheGuidFromTheExport",
    "sourceRu": "если известен GUID из выгрузки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.image",
    "sourceRu": "Картинка",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.infoPages",
    "sourceRu": "Информационные страницы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.installThePwaAndAllowNotifications",
    "sourceRu": "установите PWA и разрешите уведомления",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.itemAlreadyLinked",
    "sourceRu": "Позиция уже связана",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.jsonCopyLoaded",
    "sourceRu": "JSON-копия загружена.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.landmarkEntranceIntercom",
    "sourceRu": "Ориентир, подъезд, домофон",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.languagesAndTranslationsSaved",
    "sourceRu": "Сохранены языки и переводы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.lead",
    "sourceRu": "Лид",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.linked",
    "sourceRu": "связан",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.linkedTo1c",
    "sourceRu": "Связан с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.linkedTo1c2",
    "sourceRu": "Связанные с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.linksUpdated",
    "sourceRu": "Связи обновлены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.live1cMode",
    "sourceRu": "Режим реальной 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loadError",
    "sourceRu": "Ошибка загрузки.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loadError2",
    "sourceRu": "Ошибка загрузки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loading",
    "sourceRu": "Загружаем…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.manager",
    "sourceRu": "менеджер",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerCabinet",
    "sourceRu": "Кабинет менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerChangedClientDetails",
    "sourceRu": "Менеджер изменил данные клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerSections",
    "sourceRu": "Разделы менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerTrash",
    "sourceRu": "Корзина менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerWasNotified",
    "sourceRu": "Отправлено уведомление менеджеру",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.manualCopyFromTheManagerCabinet",
    "sourceRu": "Ручная копия из кабинета менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.map",
    "sourceRu": "Карта",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.mapLinkWasNotSaved",
    "sourceRu": "Ссылка на карту не сохранена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.match",
    "sourceRu": "Сопоставить",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.matching",
    "sourceRu": "Сопоставление...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.matchingWith1c",
    "sourceRu": "Сопоставление с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.matrixIsNotReady",
    "sourceRu": "Матрица не готова",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.matrixSaved",
    "sourceRu": "Матрица сохранена.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.monFri9001800",
    "sourceRu": "Пн–Пт 9:00–18:00\nСб 10:00–16:00\nВс выходной",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.more",
    "sourceRu": "Дополнительно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.moveOrderToTrash",
    "sourceRu": "Перенести заказ в корзину",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nameOr1cCode",
    "sourceRu": "Название или код из 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nameSkuCategory",
    "sourceRu": "Название, артикул, категория",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nameSkuOrCode",
    "sourceRu": "Название, артикул или код",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nameTaxIdPhoneEmailOr",
    "sourceRu": "Название, ИНН, телефон, email или код",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newClient",
    "sourceRu": "Новый клиент",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newClientAccountCreated",
    "sourceRu": "Создан новый аккаунт клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newOrders",
    "sourceRu": "Новые заказы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newProduct",
    "sourceRu": "Новый товар",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newProductNeeded",
    "sourceRu": "Нужен новый товар",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newRegistrations",
    "sourceRu": "Новые регистрации",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.no1cPrice",
    "sourceRu": "Нет цены из 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noAccessFromTheDcTo",
    "sourceRu": "нет доступа с DC до api.telegram.org (сеть/firewall)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noBotTokenInEnvOr",
    "sourceRu": "нет токена бота в .env или Chat ID",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noCategory",
    "sourceRu": "Без категории",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noChanges",
    "sourceRu": "Без изменений",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noCode",
    "sourceRu": "Без кода",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noContactGiven",
    "sourceRu": "Контакт не указан",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noDeletedOrders",
    "sourceRu": "Удалённых заказов нет",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noFile",
    "sourceRu": "Нет файла",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noInternalCode",
    "sourceRu": "Без внутреннего кода",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noMatches",
    "sourceRu": "Совпадений нет",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nomenclature",
    "sourceRu": "Номенклатура",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nomenclatureReceivedFrom1c",
    "sourceRu": "Получена номенклатура из 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nomenclatureUuid",
    "sourceRu": "UUID номенклатуры",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNeed",
    "sourceRu": "Не надо",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noneOfTheSelectedItemsAre",
    "sourceRu": "Среди выбранных нет позиций на витрине.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noneOfTheSelectedOrdersAre",
    "sourceRu": "Среди выбранных нет заказов в очереди 1С (до принятия). Уже принятые в 1С отозвать нельзя.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noneOfTheSelectedOrdersCan",
    "sourceRu": "Среди выбранных нет заказов, которые можно убрать в корзину. Принятые и стоящие в очереди 1С не удаляются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewExactMatchesWereFound",
    "sourceRu": "Новых точных совпадений не найдено. Уже созданные связи сохранены.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewItems",
    "sourceRu": "Новых позиций нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewItemsAllCheckedOnes",
    "sourceRu": "Новых позиций нет — все отмеченные уже в каталоге Clover.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewItemsAllCheckedOnes2",
    "sourceRu": "Новых позиций нет — все отмеченные уже в матрице.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewItemsAllCheckedOnes3",
    "sourceRu": "Новых позиций нет — все отмеченные уже на витрине.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewItemsEverythingIsAlready",
    "sourceRu": "Новых позиций нет — всё уже на витрине.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewItemsEverythingWasAlready",
    "sourceRu": "Новых позиций нет — всё уже было в матрице.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewProducts",
    "sourceRu": "Новых товаров нет",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noPhoto",
    "sourceRu": " · без фото",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noPrice",
    "sourceRu": "Нет цены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noSubcategory",
    "sourceRu": "Без подкатегории",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notAllOrdersWereDeleted",
    "sourceRu": "Не все заказы удалены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notAllOrdersWereProcessed",
    "sourceRu": "Не все заказы обработаны",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notAllTransfersWereCancelled",
    "sourceRu": "Не все передачи отменены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notConfigured",
    "sourceRu": "не настроен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingFoundForThisQuery",
    "sourceRu": "Ничего не найдено по запросу.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingInThe1cExportMatches",
    "sourceRu": "В выгрузке 1С по этому запросу ничего нет. Уточните название/код или нажмите «Весь каталог».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingMatchesTheCurrentFiltersReset",
    "sourceRu": "По текущим фильтрам ничего нет. Сбросьте фильтр или выберите другой.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingToCancel",
    "sourceRu": "Нечего отменять",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingToDelete",
    "sourceRu": "Нечего удалять",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingWasFoundForThisQuery",
    "sourceRu": "По запросу ничего не найдено. Уточните название или артикул.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notificationChannelsChecked",
    "sourceRu": "Проверены каналы уведомлений",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notificationMarkedAsRead",
    "sourceRu": "Уведомление отмечено прочитанным",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notifyAboutANewRequestWith",
    "sourceRu": "Сообщать о новом запросе с выбранным периодом.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notifyAboutClientsWaitingForManager",
    "sourceRu": "Сообщать о клиентах, ожидающих подтверждения менеджера.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notifyAboutEveryNewClientOrder",
    "sourceRu": "Сообщать о каждом новом заказе клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notifyAboutOrderSendAndProcessing",
    "sourceRu": "Сообщать о сбоях передачи и обработки заказов.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notifySeparatelyAboutANewItem",
    "sourceRu": "Отдельно сообщать о новой позиции, комментарии и фотографии.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notifyWhenAClientChangesOr",
    "sourceRu": "Сообщать, когда клиент меняет или удаляет новый заказ.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notLinkedTo1c",
    "sourceRu": "Без связи с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notMatched",
    "sourceRu": "Не сопоставлен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notPosted",
    "sourceRu": "не проведён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notReady",
    "sourceRu": "не готово",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notSent",
    "sourceRu": "не отправлено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notSentPwaSubscriptionIsNot",
    "sourceRu": "не отправлено (PWA-подписка не нужна для email)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notSpecified",
    "sourceRu": "не указана",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notYet",
    "sourceRu": "ещё не было",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.off",
    "sourceRu": "выключен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.oldBackupsDeleted",
    "sourceRu": "Удалены старые резервные копии",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.oldJsonCopyWithoutPhotos",
    "sourceRu": "старая JSON-копия без фото",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.onlyAnOrderStillInThe",
    "sourceRu": "Отменить можно только заказ в очереди до принятия в 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.openCertificate",
    "sourceRu": "Открыть сертификат",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.openOrdersWith1cExchangeErrors",
    "sourceRu": "Открыть заказы с ошибкой обмена 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.openOrdersWithStatusNew",
    "sourceRu": "Открыть заказы со статусом «Новый»",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderChanged",
    "sourceRu": "Заказ изменён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderChanges",
    "sourceRu": "Изменения заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderCheckedFor1c",
    "sourceRu": "Проверен заказ для 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderDeleted",
    "sourceRu": "Заказ удалён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderFileDownloadedFor1c",
    "sourceRu": "Скачан файл заказа для 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderPackDownloadedFor1c",
    "sourceRu": "Скачан пакет заказов для 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderPackFilter",
    "sourceRu": "Фильтр пакета заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderQueuedFor1c",
    "sourceRu": "Заказ поставлен в очередь 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.ordersAndActions",
    "sourceRu": "Заказы и действия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderSorting",
    "sourceRu": "Сортировка заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.ordersSaved",
    "sourceRu": "Сохранены заказы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatusFilter",
    "sourceRu": "Фильтр статуса заказа",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.ordersYouDeleteWillAppearHere",
    "sourceRu": "Здесь появятся заказы, которые вы удалите.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.ownPrice",
    "sourceRu": "своя цена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pageLink",
    "sourceRu": "Ссылка на страницу",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.paragraph",
    "sourceRu": "Абзац",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.passwordSaveError",
    "sourceRu": "Ошибка сохранения пароля.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.passwordTooShort",
    "sourceRu": "Короткий пароль",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pdfGenerationError",
    "sourceRu": "Ошибка формирования PDF.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.photoDeleted",
    "sourceRu": "Фотография удалена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.photoUploaded",
    "sourceRu": "Фотография загружена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pleaseWait",
    "sourceRu": "Подождите...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.posted",
    "sourceRu": "проведён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.previewError",
    "sourceRu": "Ошибка предпросмотра",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.priceError",
    "sourceRu": "Ошибка цен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.primaryAddress",
    "sourceRu": "Основной адрес",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productDeletedFromTheCatalog",
    "sourceRu": "Удалён товар из каталога",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.production1c",
    "sourceRu": "рабочая 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.production1c2",
    "sourceRu": "Рабочая 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productPhotoDeleted",
    "sourceRu": "Удалено фото товара",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productPhotoUploaded",
    "sourceRu": "Загружено фото товара",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productRemovedFromTheCatalog",
    "sourceRu": "Товар удалён из каталога",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsAlreadyInTheCatalog",
    "sourceRu": "Товары уже в каталоге",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsAlreadyInTheMatrix",
    "sourceRu": "Товары уже в матрице",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsAlreadyOnTheStorefront",
    "sourceRu": "Товары уже на витрине",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsLoadedFromExcel",
    "sourceRu": "Товары из Excel загружены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsOutsideTheMatrix",
    "sourceRu": "Товары вне матрицы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsWereMatchedWith1cAutomatically",
    "sourceRu": "Автоматически сопоставлены товары с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.promotionTitle",
    "sourceRu": "Название акции",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.publicationAddressIsRequired",
    "sourceRu": "Требуется адрес публикации",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.purchasing",
    "sourceRu": "Закупка",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pushIsNotConfigured",
    "sourceRu": "Push не настроен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pushIsNotConfiguredOnThe",
    "sourceRu": "Push пока не настроен на сервере.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pushToManagerDevices",
    "sourceRu": "Push на устройства менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.queueStarted",
    "sourceRu": "Очередь запущена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.queueTheOrderFor1cExchange",
    "sourceRu": "Поставить заказ в очередь обмена с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.readingExcel",
    "sourceRu": "Читаем Excel…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.readingTheFile",
    "sourceRu": "Читаем файл…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.ready",
    "sourceRu": "готов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.ready2",
    "sourceRu": "Готов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.readyButDisabled",
    "sourceRu": "готов, но выключен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.reconciliationStatementSent",
    "sourceRu": "Акт сверки отправлен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.refine1cSearch",
    "sourceRu": "Уточнить поиск в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.reject",
    "sourceRu": "Отклонить",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.rejectRegistration",
    "sourceRu": "Отклонить регистрацию?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.rejectRegistrationTheClientCannotSign",
    "sourceRu": "Отклонить регистрацию? Клиент не сможет войти, пока доступ не разрешат снова.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.relink",
    "sourceRu": "Перепривязать",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removeFile",
    "sourceRu": "Убрать файл",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removeFromTheAccessLog",
    "sourceRu": "Убрать из журнала доступов?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removeTheOrderFromThe1c",
    "sourceRu": "Вернуть заказ из очереди 1С. После принятия в 1С отменить нельзя.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.replacePhoto",
    "sourceRu": "Заменить фото",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.requestSaved",
    "sourceRu": "Запрос сохранён.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.requiredAddress",
    "sourceRu": "Обязательный адрес",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.requiredProfile",
    "sourceRu": "Обязательный профиль",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.restored",
    "sourceRu": "Восстановлено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.restoreError",
    "sourceRu": "Ошибка восстановления",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.restoreTheData",
    "sourceRu": "Восстановить данные?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.safeSimulator",
    "sourceRu": "Безопасный симулятор",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saintPetersburg",
    "sourceRu": "Санкт-Петербург, …",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveCard",
    "sourceRu": "Сохранить карточку",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveClientDetails",
    "sourceRu": "Сохранить данные клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveError",
    "sourceRu": "Ошибка сохранения.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveError2",
    "sourceRu": "Ошибка сохранения",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveMatrix",
    "sourceRu": "Сохранить матрицу",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveStorefront",
    "sourceRu": "Сохранить витрину",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.savingIsBlockedBySettings",
    "sourceRu": "Запись пока заблокирована настройками",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.savingTheMatrix",
    "sourceRu": "Сохраняем матрицу...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.search.ellipsis",
    "sourceRu": "Поиск...",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.searchBy1cNameOrSku",
    "sourceRu": "Поиск по названию или артикулу 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchByClientOrderTaxId",
    "sourceRu": "Поиск по клиенту, заказу, ИНН, телефону, адресу и email",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchByCompanyLoginOrPhone",
    "sourceRu": "Поиск по компании, логину, телефону",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchClientAccess",
    "sourceRu": "Поиск доступов клиентов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchIn1c",
    "sourceRu": "Поиск в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searching",
    "sourceRu": "Ищем…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchOrder",
    "sourceRu": "Поиск заказа",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchProductOr1cSku",
    "sourceRu": "Поиск товара или артикула 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchProductsInTheMatrix",
    "sourceRu": "Поиск товара в матрице",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchThe1cExportNameCode",
    "sourceRu": "Поиск по выгрузке 1С: название, код или ID",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selected",
    "sourceRu": "Выбрано",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selected1cProduct",
    "sourceRu": "Выбранный товар 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selectedItemsAreAlreadyInThe",
    "sourceRu": "Выбранные позиции уже есть в матрице — дубликаты не добавляются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selectedItemsAreAlreadyOnThe",
    "sourceRu": "Выбранные позиции уже на витрине.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selectedProducts",
    "sourceRu": "Выбранные товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selectedProductsAreAlreadyInThe",
    "sourceRu": "Выбранные товары уже есть в матрице.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendAgain",
    "sourceRu": "Передать повторно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendATestNotification",
    "sourceRu": "Отправить тестовое уведомление",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendError",
    "sourceRu": "Ошибка отправки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sending",
    "sourceRu": "Передача…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendNotificationsToTheInstalledClover",
    "sourceRu": "Отправлять уведомления в установленную PWA Clover.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendTo1c",
    "sourceRu": "Передать в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendToEmail",
    "sourceRu": "Отправлять на email",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendToTelegramBot",
    "sourceRu": "Отправлять в Telegram-бот",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sent",
    "sourceRu": "Отправлено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sentTo1c",
    "sourceRu": "Передано в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.setAPasswordHereOrIn",
    "sourceRu": "Задайте пароль здесь или в карточке клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.settingsChanged",
    "sourceRu": "Изменены настройки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.shortDescriptionForListsAndHome",
    "sourceRu": "Короткое описание для списка и главной",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.shortStorefrontProductBlurb",
    "sourceRu": "Кратко о товаре для витрины",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.show1cItems",
    "sourceRu": "Показать позиции 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.showAButtonForQuicklyRepeating",
    "sourceRu": "Показывать кнопку для быстрого повторения заказа.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.showNewEventsImmediatelyInThe",
    "sourceRu": "Показывать новые события сразу в кабинете менеджера.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.showPrices",
    "sourceRu": "Показывать цены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.similar",
    "sourceRu": "Похожее",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.simulator",
    "sourceRu": "симулятор",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sizesDensityPackagingEtc",
    "sourceRu": "Размеры, плотность, упаковка и т.п.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.skuOrProduct",
    "sourceRu": "Артикул или /product/…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.smtpIsNotConfiguredInServer",
    "sourceRu": "SMTP не настроен в server/.env",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.statementRequests",
    "sourceRu": "Запросы актов сверки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.statusForBulkChange",
    "sourceRu": "Статус для массового изменения",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.statusNotChanged",
    "sourceRu": "Статус не изменён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.storefront.add",
    "sourceRu": "Добавить на витрину",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.on",
    "sourceRu": "На витрине",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.to",
    "sourceRu": "На витрину",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefrontPriceMode",
    "sourceRu": "Режим цен витрины",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.storefrontProductCardUpdated",
    "sourceRu": "Карточка товара на витрине обновлена.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.subtitle",
    "sourceRu": "Подзаголовок",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.successfulSignIn",
    "sourceRu": "Успешный вход",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.summary",
    "sourceRu": "Сводка",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.system",
    "sourceRu": "система",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.telegramApiReturnedAnError",
    "sourceRu": "ответ Telegram API с ошибкой",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.telegramSendError",
    "sourceRu": "ошибка отправки в Telegram",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.test",
    "sourceRu": "Тест",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.test1c",
    "sourceRu": "Тестовая 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.testConnection",
    "sourceRu": "Проверить связь",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.oneC.priceType",
    "sourceRu": "Вид цен 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.connection.checked",
    "sourceRu": "Проверено подключение к 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.catalog.previewed",
    "sourceRu": "Просмотрен справочник 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.status.reset",
    "sourceRu": "Сброшен статус обмена с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.draft.created",
    "sourceRu": "Создан черновик заказа в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.match.linked",
    "sourceRu": "Сопоставление с 1С: клиенты и товары в очереди связаны.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.config.saved",
    "sourceRu": "Сохранены настройки подключения к 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.prodDisabled",
    "sourceRu": "только 1С TEST (prod выключен)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders.oneCStatusFilter",
    "sourceRu": "Фильтр статуса 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.products.oneC.pricePending",
    "sourceRu": "Цена из 1С ещё не получена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.products.oneC.articleUnlinked",
    "sourceRu": "Артикул 1С: не связан",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.oneC.category",
    "sourceRu": "Категория 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients.oneCPriceCategory",
    "sourceRu": "Категория цен 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.connection.saved",
    "sourceRu": "Настройки подключения к 1С сохранены.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.title",
    "sourceRu": "Обмен с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.connection.error",
    "sourceRu": "Ошибка подключения к 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.send.testError",
    "sourceRu": "Ошибка тестовой передачи в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.errorsToggle",
    "sourceRu": "Ошибки обмена с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.the1cExportIsEmptyFirst",
    "sourceRu": "В выгрузке 1С пока пусто — сначала «Отправить товары» из VLAVKA.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.the1cExportIsEmptyFirst2",
    "sourceRu": "Выгрузка 1С пуста. Сначала «Отправить товары» из VLAVKA.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theCatalogWillBecomeEmptyIt",
    "sourceRu": "Каталог станет пустым. Восстановить можно только из резервной копии.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theClientAccountHasBeenDeleted",
    "sourceRu": "Аккаунт клиента удалён.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theClientCanChangeTheOrder",
    "sourceRu": "Клиент может менять заказ до принятия менеджером.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theClientCanMarkFrequentlyUsed",
    "sourceRu": "Клиент может отмечать часто используемые товары.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theClientCanMoveANew",
    "sourceRu": "Клиент может отправить заказ «Новый» в корзину менеджера.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theClientMustConfirmTheEmail",
    "sourceRu": "Сначала клиент должен подтвердить электронную почту.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theClientWillSeePricesFilled",
    "sourceRu": "Клиент увидит цены, заполненные в карточках товаров.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theFileWasSentToThe",
    "sourceRu": "Файл успешно отправлен клиенту. Клиент получит уведомление.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theOrderHasAlreadyBeenAccepted",
    "sourceRu": "Заказ уже принят в 1С. Отозвать передачу нельзя.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theOrderHasAlreadyBeenSent",
    "sourceRu": "Заказ уже передан в 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theOrderIsAlreadyInThe",
    "sourceRu": "Заказ уже в очереди 1С. 1С сама заберёт его при следующем обмене.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theOrderWasProcessedManuallySending",
    "sourceRu": "Заказ обработан вручную. Передача в 1С не требуется или отменена.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theProductWasAddedToThe",
    "sourceRu": "Товар добавлен в матрицу клиента. Нажмите «Сохранить матрицу».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.thereAreNoClientsYetCreate",
    "sourceRu": "Пока нет клиентов. Создайте доступ в разделе «Клиенты».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.thereAreNoOldCopiesTo",
    "sourceRu": "Старых копий для удаления нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theRequestWillBeSavedTogether",
    "sourceRu": "Запрос будет сохранён вместе с новым товаром.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theTokenIsStoredOnlyIn",
    "sourceRu": "Токен хранится только в server/.env, Chat ID указывается ниже.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.tokenIsNotConfigured",
    "sourceRu": "токен не настроен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.turnedOffWithTheSwitch",
    "sourceRu": "выключено тумблером",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.untitled",
    "sourceRu": "Без названия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.untitledClient",
    "sourceRu": "Клиент без названия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.updating",
    "sourceRu": "Обновляем…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.updating2",
    "sourceRu": "Обновление...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.uploadACertificate",
    "sourceRu": "Загрузить сертификат",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.uploadAnImage",
    "sourceRu": "Загрузить картинку",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.uploaded",
    "sourceRu": "Загружено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.usernameOrTMeLink",
    "sourceRu": "@username или ссылка t.me",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.waitingFor1c",
    "sourceRu": "Ожидает ответ 1С…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.waitingFor1cAck",
    "sourceRu": "Ожидает ACK 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.waitingFor1cConfirmation",
    "sourceRu": "Ждём подтверждение от 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.waitUntilProductsFinishLoadingFrom",
    "sourceRu": "Дождитесь загрузки товаров из Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.whenClientsPlaceOrdersTheyWill",
    "sourceRu": "Когда клиенты оформят заказы, они появятся в этом списке.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.willAppearAfterLinkingTo1c",
    "sourceRu": "Появится после связи с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.willBeSetWhenOrdering",
    "sourceRu": "Будет определён при заказе",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.yesDeleteTheEntireCatalog",
    "sourceRu": "Да, удалить весь каталог",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.youHaveUnsavedChangesTapSave",
    "sourceRu": "Есть несохранённые изменения. Нажмите «Сохранить матрицу», иначе после F5 они пропадут.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "shared.accessIsClosed",
    "sourceRu": "Доступ закрыт.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.accessIsOpen",
    "sourceRu": "Доступ открыт.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.accountLoginCannotBeChanged",
    "sourceRu": "Логин аккаунта — изменить нельзя",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.action.choose",
    "sourceRu": "Выбрать",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.clear",
    "sourceRu": "Очистить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.clearSelection",
    "sourceRu": "Снять выбор",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.collapse",
    "sourceRu": "Свернуть",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.action.copied",
    "sourceRu": "Скопировано",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.action.copy",
    "sourceRu": "Копировать",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.create",
    "sourceRu": "Создать",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.deleteForever",
    "sourceRu": "Удалить навсегда",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.disable",
    "sourceRu": "Отключить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.enable",
    "sourceRu": "Включить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.find",
    "sourceRu": "Найти",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.hide",
    "sourceRu": "Скрыть",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.open",
    "sourceRu": "Открыть",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.reloadPage",
    "sourceRu": "Обновить страницу",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.remove",
    "sourceRu": "Убрать",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.replace",
    "sourceRu": "Заменить",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.action.reset",
    "sourceRu": "Сбросить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.restore",
    "sourceRu": "Восстановить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.retry",
    "sourceRu": "Повторить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.saveChanges",
    "sourceRu": "Сохранить изменения",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.saveSettings",
    "sourceRu": "Сохранить настройки",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.selectAll",
    "sourceRu": "Выбрать все",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.send",
    "sourceRu": "Отправить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.action.show",
    "sourceRu": "Показать",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.addAnotherDevice",
    "sourceRu": "Добавить ещё устройство",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.address.extra",
    "sourceRu": "Дополнительный",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.address.primary",
    "sourceRu": "Основной",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.allowedSections",
    "sourceRu": "Разрешённые разделы",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.aManagerChangesThePasswordHere",
    "sourceRu": "Смену пароля выполняет менеджер. Здесь можно добавить Face ID, отпечаток или завершить другие сессии.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.atLeast6Characters",
    "sourceRu": "минимум 6 символов",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.changePassword",
    "sourceRu": "Изменить пароль",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.changePassword2",
    "sourceRu": "Сменить пароль",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.cityStreetBuildingPremises",
    "sourceRu": "Город, улица, дом, помещение",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.closeAccess",
    "sourceRu": "Закрыть доступ",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.closeAccess2",
    "sourceRu": "Закрыть доступ?",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.closePhoto",
    "sourceRu": "Закрыть фотографию",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.cloverPanelError",
    "sourceRu": "Ошибка панели Clover",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.colorSizeManufacturerOrAnotherDetail",
    "sourceRu": "Цвет, размер, производитель или другое уточнение",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.createManager",
    "sourceRu": "Создать менеджера",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.creating",
    "sourceRu": "Создание…",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.deleteTheAddress",
    "sourceRu": "Удалить адрес?",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.deleteTheManager",
    "sourceRu": "Удалить менеджера?",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.deleteThePasskey",
    "sourceRu": "Удалить ключ доступа?",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.deleteThisPasskeyPasswordSignIn",
    "sourceRu": "Удалить этот ключ доступа? Вход по паролю останется доступен.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.deviceSignIn",
    "sourceRu": "Вход по устройству",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.editAddress",
    "sourceRu": "Изменить адрес",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.employeeName",
    "sourceRu": "Имя сотрудника",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.empty.blank",
    "sourceRu": "Пока пусто",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.empty.notFound",
    "sourceRu": "Не найдено",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.empty.short",
    "sourceRu": "Пусто",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.enableDeviceSignIn",
    "sourceRu": "Включить вход по устройству",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.enableNotifications",
    "sourceRu": "Включить уведомления",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.enterTheManagerEmail",
    "sourceRu": "Укажите email менеджера.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.field.address",
    "sourceRu": "Адрес",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.field.emailShort",
    "sourceRu": "Почта",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.field.role",
    "sourceRu": "Роль",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.filter.active",
    "sourceRu": "Активные",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.filter.all",
    "sourceRu": "Все",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.filter.title",
    "sourceRu": "Фильтры",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.forExampleRedNapkins3333",
    "sourceRu": "Например: салфетки красные 33 × 33 см",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.forExampleRomashkaLlc",
    "sourceRu": "Например: ООО Ромашка",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.forExampleShopOnLeninStreet",
    "sourceRu": "Например: Магазин на Ленина",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.management",
    "sourceRu": "Управление",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.managerContactsSaved",
    "sourceRu": "Контакты менеджера сохранены.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.managerDeleted",
    "sourceRu": "Менеджер удалён.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.maximumPhotoSizeIs12Mb",
    "sourceRu": "Максимальный размер фотографии — 12 МБ.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.nav.menu",
    "sourceRu": "Меню",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.newAddress",
    "sourceRu": "Новый адрес",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.noPassword",
    "sourceRu": "Нет пароля",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notCopied",
    "sourceRu": "Не скопировано",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notCreated",
    "sourceRu": "Не создан",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notificationPermissionWasNotGranted",
    "sourceRu": "Разрешение на уведомления не предоставлено.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notificationsAreDisabledOnThisDevice",
    "sourceRu": "Уведомления отключены на этом устройстве.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notificationsAreEnabledOnThisDevice",
    "sourceRu": "Уведомления включены на этом устройстве.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notificationSettingsSaved",
    "sourceRu": "Настройки уведомлений сохранены.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notSaved",
    "sourceRu": "не сохранён",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.openAccess",
    "sourceRu": "Открыть доступ",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.openAccess2",
    "sourceRu": "Открыть доступ?",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.openPhoto",
    "sourceRu": "Открыть фотографию",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.orderCreated",
    "sourceRu": "Заказ создан",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.otherSessionsWereEnded",
    "sourceRu": "Другие сессии завершены.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.passkeyAdded",
    "sourceRu": "Ключ доступа добавлен.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.passkeyDeleted",
    "sourceRu": "Ключ доступа удалён.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.passwordAndDeviceSignIn",
    "sourceRu": "Пароль и вход по устройству",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.passwordChanged",
    "sourceRu": "Пароль изменён.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.passwordMustBeAtLeast6",
    "sourceRu": "Пароль должен быть не короче 6 символов.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.passwordSaved",
    "sourceRu": "Пароль сохранён",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.passwordUpdated",
    "sourceRu": "Пароль обновлён.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.permissionsSaved",
    "sourceRu": "Права сохранены",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.permissionsUpdated",
    "sourceRu": "Права обновлены.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.price.pending",
    "sourceRu": "Цена уточняется",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.price.pendingShort",
    "sourceRu": "уточняется",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.productPhoto",
    "sourceRu": "Фото товара",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.pushWillBeAvailableAfterThe",
    "sourceRu": "Push будет доступен после настройки домена, HTTPS и VAPID-ключей.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.qty.decrease",
    "sourceRu": "Уменьшить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.qty.increase",
    "sourceRu": "Увеличить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.requestPhoto",
    "sourceRu": "Фото запроса",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.requestProductPhoto",
    "sourceRu": "Фото товара из запроса",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.role.admin",
    "sourceRu": "Админ",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.role.client",
    "sourceRu": "Клиент",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.role.manager",
    "sourceRu": "Менеджер",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.role.system",
    "sourceRu": "Система",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.savedOnThisDevice",
    "sourceRu": "Сохранён на этом устройстве",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.section.info",
    "sourceRu": "Информация",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.status.done",
    "sourceRu": "Готово",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.donePeriod",
    "sourceRu": "Готово.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.status.error",
    "sourceRu": "Ошибка",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.loading",
    "sourceRu": "Загрузка",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.loadingDots",
    "sourceRu": "Загрузка...",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.loadingEllipsis",
    "sourceRu": "Загрузка…",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.saved",
    "sourceRu": "Сохранено",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.saving",
    "sourceRu": "Сохраняем…",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.savingDots",
    "sourceRu": "Сохраняем...",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.savingProgress",
    "sourceRu": "Сохранение…",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.status.sending",
    "sourceRu": "Отправка…",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.syncedWithTheDeviceAccount",
    "sourceRu": "Синхронизируется с аккаунтом устройства",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.theNewPasswordsDoNotMatch",
    "sourceRu": "Новые пароли не совпадают.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.theNotificationSubscriptionWasRestoredAfter",
    "sourceRu": "Подписка на уведомления восстановлена после обновления приложения.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.theSessionExpiredSignOutAnd",
    "sourceRu": "Сессия устарела. Выйдите и войдите снова, затем нажмите «Обновить список».",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.thisBrowserDoesNotSupportPush",
    "sourceRu": "Этот браузер не поддерживает push-уведомления.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.thisDeviceOrBrowserDoesNot",
    "sourceRu": "Это устройство или браузер не поддерживает Face ID, отпечаток или ключи доступа.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.toMyOrders",
    "sourceRu": "К моим заказам",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.usernameOrLink",
    "sourceRu": "ник или ссылка",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.weHaveAlreadyStartedProcessingIt",
    "sourceRu": "Мы уже начали его обрабатывать.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.youCanAttachJpgPngOr",
    "sourceRu": "Можно прикрепить JPG, PNG или WEBP.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.youCanSignInWithA",
    "sourceRu": "Можно входить по паролю либо через Face ID, отпечаток или код блокировки телефона.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.yourPassword",
    "sourceRu": "Ваш пароль",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "storefront.addToHomeScreen",
    "sourceRu": "На экран «Домой»",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.appInstallGuide",
    "sourceRu": "Инструкция по установке приложения",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.browserMenu",
    "sourceRu": "Меню браузера",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.chromeOrEdge",
    "sourceRu": "Chrome или Edge",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.clarification",
    "sourceRu": "Уточнение",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.cloverCompany",
    "sourceRu": "Компания КЛЕВЕР",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.cloverHome",
    "sourceRu": "Clover — на главную",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.computer",
    "sourceRu": "Компьютер",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.confirmInstallation",
    "sourceRu": "Подтвердите установку",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.deliveryInSaintPetersburgIsFree",
    "sourceRu": "Доставка по Санкт-Петербургу — бесплатно (заказ от 5000 ₽).",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.deliveryInSpbIsFree",
    "sourceRu": "Доставка по СПб — бесплатно",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.homeSlides",
    "sourceRu": "Слайды на главной",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.howToGetThere",
    "sourceRu": "Как проехать",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.ifYouSeeGooglePlayProtect",
    "sourceRu": "Если появилось «Google Play Защита»",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.installIcon",
    "sourceRu": "Значок установки",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.iphoneAndIpad",
    "sourceRu": "iPhone и iPad",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.mapWithAddress",
    "sourceRu": "Карта с адресом",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.nav.aria",
    "sourceRu": "Навигация",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.backToCatalog",
    "sourceRu": "К каталогу",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.contacts",
    "sourceRu": "Контакты",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.home",
    "sourceRu": "Главная",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.homeLink",
    "sourceRu": "На главную",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.promos",
    "sourceRu": "Акции",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.openChrome",
    "sourceRu": "Откройте Chrome",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.openSafari",
    "sourceRu": "Откройте Safari",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.price.onRequest",
    "sourceRu": "Цена по запросу",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.product",
    "sourceRu": "товар",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.productGroups",
    "sourceRu": "Группы товаров",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.productNotFound",
    "sourceRu": "Товар не найден.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.products",
    "sourceRu": "товара",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.products2",
    "sourceRu": "товаров",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.searchByNameOrSku",
    "sourceRu": "Поиск по названию или артикулу",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.separateWindow",
    "sourceRu": "Отдельное окно",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.slides",
    "sourceRu": "Слайды",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.stayTunedNewPromotionsWillAppear",
    "sourceRu": "Следите за обновлениями — новые акции будут появляться здесь.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.subgroups",
    "sourceRu": "Подгруппы",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.tapShare",
    "sourceRu": "Нажмите «Поделиться»",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.thereAreNoProductsInThe",
    "sourceRu": "В каталоге пока нет товаров.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.thereAreNoProductsInThis",
    "sourceRu": "В этой группе пока нет товаров.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.thereAreNoSpecialOffersRight",
    "sourceRu": "Сейчас специальных предложений нет.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.unitOfMeasure",
    "sourceRu": "Единица измерения",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.workingHours",
    "sourceRu": "Режим работы",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.yandexMaps",
    "sourceRu": "Яндекс.Карты",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.zoomInMap",
    "sourceRu": "Увеличить карту",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.zoomOutMap",
    "sourceRu": "Уменьшить карту",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "admin.accessClosed",
    "sourceRu": "доступ закрыт",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.accessManagers",
    "sourceRu": "Доступы · Менеджеры",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.accountAccess",
    "sourceRu": "Доступ к аккаунту",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.allSections",
    "sourceRu": "Все разделы",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.chooseWhatTheManagerSeesIn",
    "sourceRu": "Выберите, что менеджер видит в кабинете.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.contactsForClients",
    "sourceRu": "Контакты для клиентов",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.createAccountsRevokeAccessChangePasswords",
    "sourceRu": "Создание, закрытие доступа, смена пароля, права по разделам и удаление. Пароли менеджеров сохраняются в этом журнале (как у клиентов). Доступно только администратору.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.fullCabinetAccess",
    "sourceRu": "полный доступ к кабинету",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.fullName",
    "sourceRu": "ФИО",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.managerAdministration",
    "sourceRu": "Управление менеджерами",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.passwordMustBeAtLeast6",
    "sourceRu": "Пароль не короче 6 символов. После создания сохраняется в журнале ниже.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.passwordsFromBeforeThisLogCannot",
    "sourceRu": "Старые пароли до появления журнала восстановить нельзя — задайте новый.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.refreshList",
    "sourceRu": "Обновить список",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.saveContacts",
    "sourceRu": "Сохранить контакты",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.savePermissions",
    "sourceRu": "Сохранить права",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.setOrChangeTheAdministratorPassword",
    "sourceRu": "Задайте или смените пароль администратора здесь. В «Настройках» смена пароля недоступна.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.theAdministratorHasFullAccessTo",
    "sourceRu": "У администратора полный доступ ко всем разделам.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.theseDetailsFillTheContactManager",
    "sourceRu": "Эти данные подставляются в кнопку «Связаться с менеджером», если менеджер назначен клиенту как личный.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.you",
    "sourceRu": "вы",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "admin.youDoNotHaveRightsTo",
    "sourceRu": "Недостаточно прав для управления менеджерами.",
    "namespace": "ui",
    "surface": "admin",
    "critical": false
  },
  {
    "key": "checkout.accepted",
    "sourceRu": "Заказ принят",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.addToCart",
    "sourceRu": "В корзину",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.backToCart",
    "sourceRu": "Назад в корзину",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.backToCatalog",
    "sourceRu": "Вернуться в каталог",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.clearCart",
    "sourceRu": "Очистить корзину",
    "namespace": "checkout",
    "surface": "client",
    "critical": true
  },
  {
    "key": "checkout.comment",
    "sourceRu": "Комментарий",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.company",
    "sourceRu": "Компания",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.contactRequired",
    "sourceRu": "Контактное лицо *",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.phoneRequired",
    "sourceRu": "Телефон *",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.title",
    "sourceRu": "Оформление заказа",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.titleShort",
    "sourceRu": "Оформление",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.total",
    "sourceRu": "Итого",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "client.addItemsToTheMatrixOr",
    "sourceRu": "Добавляйте позиции в матрицу или убирайте лишние. Заказ оформляется во вкладке «Моя матрица».",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.addSeveralLocationsAndPickOne",
    "sourceRu": "Добавьте несколько точек и выбирайте нужную при оформлении заказа.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.allInCategory",
    "sourceRu": "Все в категории",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.calendar",
    "sourceRu": "Календарь",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.checkoutWillBecomeAvailableAfterRequired",
    "sourceRu": "Оформление заказа станет доступно после заполнения обязательных данных.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.chooseADate",
    "sourceRu": "Выберите дату",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.chooseAnAddress",
    "sourceRu": "Выберите адрес",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.chooseAPeriodAndSendA",
    "sourceRu": "Выберите период и отправьте запрос менеджеру.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.cloverCatalog",
    "sourceRu": "Каталог Clover",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.contactFullName",
    "sourceRu": "ФИО контакта",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.dateAddressAndCommentAreIn",
    "sourceRu": "Дата, адрес и комментарий — в корзине перед оформлением.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.dateFrom",
    "sourceRu": "Дата с",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.dateTo",
    "sourceRu": "Дата по",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.deliveryInSpb1Pc",
    "sourceRu": "Доставка по СПб · 1 шт.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.edit",
    "sourceRu": "Редактировать",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.enterTheNameQuantityAndKey",
    "sourceRu": "Укажите название, количество и важные характеристики. При необходимости приложите фотографию.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.extraContact2",
    "sourceRu": "+ Доп. контакт",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.goToCart",
    "sourceRu": "Перейти в корзину",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.inTheMatrix",
    "sourceRu": "В матрице:",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.jpgPngOrWebpCloverWill",
    "sourceRu": "JPG, PNG или WEBP. Clover уменьшит фотографию перед сохранением.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.locationName",
    "sourceRu": "Название точки",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.managerComment",
    "sourceRu": "Комментарий менеджера",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.managerContactsAreNotFilledIn",
    "sourceRu": "Контакты менеджера ещё не заполнены.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.noPinnedProductsInTheMatrix",
    "sourceRu": "В матрице пока нет закреплённых товаров. Добавьте позиции через «Добавить товары из каталога» — они сохранятся автоматически. Заказ оформляется из этой матрицы.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.noProductsFound",
    "sourceRu": "Товары не найдены.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.noReconciliationRequestsYet",
    "sourceRu": "Запросов актов сверки пока нет.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.openMax",
    "sourceRu": "Открыть MAX",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.openSettings",
    "sourceRu": "Открыть настройки",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.openTelegram",
    "sourceRu": "Открыть Telegram",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.orderComment",
    "sourceRu": "Комментарий к заказу",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.personalCatalog",
    "sourceRu": "Персональный каталог",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.phoneIsNotSetYet",
    "sourceRu": "Телефон пока не указан.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.photo",
    "sourceRu": "Фото",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.preparingThePhoto",
    "sourceRu": "Подготавливаем фотографию…",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.productMatrix",
    "sourceRu": "Матрица товаров",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.productPhotoIsNotUploadedYet",
    "sourceRu": "Фото товара пока не загружено",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.productsAssignedToYouByThe",
    "sourceRu": "Товары, закреплённые за вами менеджером. Категории — как при оформлении заказа.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.reorder",
    "sourceRu": "Повторить заказ",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.roleInTheCompany",
    "sourceRu": "Роль в компании",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.setTheDeliveryDate",
    "sourceRu": "Укажите дату доставки",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.settings",
    "sourceRu": "Настройках",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.sundayIsNotAvailableForDelivery",
    "sourceRu": "Воскресенье недоступно для доставки.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.theManagerWillPinRegularProducts",
    "sourceRu": "Менеджер закрепит постоянные товары и цены. Пока список может быть пустым.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.theMatrixIsStillBeingPrepared",
    "sourceRu": "Матрица ещё готовится",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.thisDataIsSavedInNew",
    "sourceRu": "Эти данные сохраняются в новых заказах и видны менеджеру.",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.updated",
    "sourceRu": "Обновлён",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.viewOrderContents",
    "sourceRu": "Посмотреть состав заказа",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.whenToDeliverTheOrder",
    "sourceRu": "Когда привезти заказ",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.year",
    "sourceRu": "Год",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.yourComment",
    "sourceRu": "Ваш комментарий",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "client.yourManager",
    "sourceRu": "Ваш менеджер",
    "namespace": "ui",
    "surface": "client",
    "critical": false
  },
  {
    "key": "manager.action",
    "sourceRu": "Действие",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.active3",
    "sourceRu": "Активных",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.activityLog",
    "sourceRu": "Журнал действий",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.aCustomPriceOverridesPurchaseAnd",
    "sourceRu": "Своя цена перекрывает расчёт «закупочная + %» (и вид цен 1С) только на витрине сайта. В ЛК клиентов не влияет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addFrom1c",
    "sourceRu": "Добавить из 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addFrom1cExcel",
    "sourceRu": "Добавить из 1С / Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addFromCatalog",
    "sourceRu": "Добавить из каталога",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addParagraph",
    "sourceRu": "Добавить абзац",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.addZone",
    "sourceRu": "Добавить зону",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.all1cStatuses",
    "sourceRu": "Все статусы 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allActiveProducts",
    "sourceRu": "Все активные товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allOrders",
    "sourceRu": "Все заказы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allowSignIn",
    "sourceRu": "Разрешить вход",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.allowViewing",
    "sourceRu": "Разрешить просмотр",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyInTheClientMatrixDuplicate",
    "sourceRu": "Уже в матрице клиента — дубликат не добавляется",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyInTheCloverCatalogDuplicate",
    "sourceRu": "Уже в каталоге Clover — дубликат не добавляется",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyInTheCloverCatalogThe",
    "sourceRu": "Уже в каталоге Clover — будет использован существующий товар, без дубля",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyInTheMatrixDuplicateIs",
    "sourceRu": "Уже в матрице — дубликат не добавляется",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.alreadyOnTheStorefrontDuplicateIs",
    "sourceRu": "Уже на витрине — дубликат не добавляется",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.asInStorefrontSettings",
    "sourceRu": "Как в настройках витрины",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.asInStorefrontSettingsPurchaseOr",
    "sourceRu": "Как в настройках витрины (закупка+% или вид цен)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.attachAFile",
    "sourceRu": "Прикрепить файл",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.automaticNomenclatureMatching",
    "sourceRu": "Автоматическое сопоставление номенклатуры",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.baseIsThePurchasePriceFrom",
    "sourceRu": "База — закупочная цена из выгрузки 1С (и вид «Закупочная», если он свежее). Итог: закупка × (1 + % / 100), округление вверх как в ЛК.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.baseUnf16Document",
    "sourceRu": "База: УНФ 1.6 · документ ЗаказПокупателя",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.blockType",
    "sourceRu": "Тип блока",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.buttonText",
    "sourceRu": "Текст кнопки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.byDeliveryDate",
    "sourceRu": "По дате доставки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.byMatrix",
    "sourceRu": "По матрице",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cabinetLoginsAndPasswordsWrittenTo",
    "sourceRu": "Логины и пароли ЛК. Пишутся в журнал при создании клиента и при смене пароля. Старые пароли до появления журнала восстановить нельзя — задайте новый.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cabinetSettings",
    "sourceRu": "Настройки кабинета",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.calculationMethod",
    "sourceRu": "Способ расчёта",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cancelTransferTo1c",
    "sourceRu": "Отменить передачу в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.category",
    "sourceRu": "Категория",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.categoryPurchaseMarkup",
    "sourceRu": "Категория/закупка + наценка %",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.change",
    "sourceRu": "Сменить",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.changesApplyToNewCloverOrders",
    "sourceRu": "Изменения используются в новых заказах Clover. Данные контрагента в 1С автоматически не перезаписываются. При изменении email клиент будет входить по новому адресу.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.changesAreSavedAutomaticallyAndApply",
    "sourceRu": "Изменения сохраняются автоматически и применяются сразу.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.changesAreSavedWithCabinetSettings",
    "sourceRu": "Изменения сохраняются вместе с настройками кабинета. Удаление зон не выполняется — отключите зону, если она больше не нужна.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.changingThisTextAppearsOnThe",
    "sourceRu": "Изменение этого текста сразу отобразится на публичном сайте. Проверьте юридическую формулировку перед сохранением.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.check",
    "sourceRu": "Проверить",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.chooseACategory",
    "sourceRu": "Выберите категорию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.chooseTheMatrixModeAboveThen",
    "sourceRu": "Выберите режим матрицы выше, затем сохраните матрицу.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cleanUpOldOnes",
    "sourceRu": "Очистить старые",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clearSelection",
    "sourceRu": "Очистить выбор",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientComment",
    "sourceRu": "Комментарий клиента:",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientLinks",
    "sourceRu": "Связей с клиентами",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientMarkup",
    "sourceRu": "Наценка для клиента, %",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients",
    "sourceRu": "Клиентов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientsCabinetLoginsManagersLoginsPasswords",
    "sourceRu": "Клиенты — логины ЛК. Менеджеры — логины, пароли и права (только администратор).",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clientSignInEmail",
    "sourceRu": "Email для входа клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cloverAutomaticallyMakesAFullCopy",
    "sourceRu": "Clover автоматически создаёт полную копию при первом запуске каждого дня, перед полным сбросом и перед восстановлением. Перед восстановлением всегда создаётся страховочная копия.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.cloverStoresOnlyExactMatchesAnd",
    "sourceRu": "Clover сохраняет только точные совпадения и несколько наиболее похожих вариантов для несвязанных товаров. Название на сайте может отличаться от 1С: в заказ передаётся ID 1С. Полная номенклатура и база клиентов в Clover не сохраняются. Неоднозначные варианты выбирает менеджер во вкладке «Товары».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.codeIn1c",
    "sourceRu": "Код в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.commentToTheClient",
    "sourceRu": "Комментарий клиенту",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.companyOrStore",
    "sourceRu": "Компания или торговая точка",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.connectionCheck",
    "sourceRu": "Проверка связи",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.connectionMode",
    "sourceRu": "Режим подключения",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.connectionWorks",
    "sourceRu": "Связь работает.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.contact",
    "sourceRu": "Контакт",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.contents",
    "sourceRu": "Состав",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.control",
    "sourceRu": "Контроль",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.convenientToSendToAClient",
    "sourceRu": "Удобно отправить клиенту или распечатать",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.copiesIncludeClientsOrdersMatricesSettings",
    "sourceRu": "Копии включают клиентов, заказы, матрицы, настройки, пароли и фотографии товаров. Они хранятся только на вашем компьютере.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.counterpartyCodeIn1cOptional",
    "sourceRu": "Код контрагента в 1С — необязательно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.created",
    "sourceRu": "Создан",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.createProductInCatalog",
    "sourceRu": "Создать товар в каталоге",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.createPromo",
    "sourceRu": "Создать акцию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.createTheLoginAndPasswordYourself",
    "sourceRu": "Создайте логин и пароль сами — без письма и подтверждения почты. Логин и пароль сразу сохраняются в «Ещё → Доступы». Матрицу настраиваете в карточке; при смене менеджера достаточно сменить пароль у того же клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.customerPhoto",
    "sourceRu": "Фотография клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.customPriceForThisProduct",
    "sourceRu": "Своя цена для этого товара",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.dataPreparation",
    "sourceRu": "Подготовка данных",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.dataProtection",
    "sourceRu": "Защита данных",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.default",
    "sourceRu": "По умолчанию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.defaultMatrixPrice",
    "sourceRu": "Цена по умолчанию для матрицы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteAllOrders",
    "sourceRu": "Удалить все заказы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deleteFromCatalog",
    "sourceRu": "Удалить из каталога",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deliveryAddresses",
    "sourceRu": "Адреса доставки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deliveryFee",
    "sourceRu": "Стоимость доставки, ₽",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deliveryZone",
    "sourceRu": "Зона доставки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.deliveryZones",
    "sourceRu": "Зоны доставки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.descriptionForBuyers",
    "sourceRu": "Описание для покупателей",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.down",
    "sourceRu": "Вниз",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.download",
    "sourceRu": "Скачать",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.downloadExcel",
    "sourceRu": "Скачать Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.downloadJsonCopy",
    "sourceRu": "Скачать JSON-копию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.editingTextsAndSeoForAbout",
    "sourceRu": "Редактирование текстов и SEO данных страниц «О нас», «Доставка», «Оплата» и других информационных разделов сайта.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.editingThePublicSiteCloverSpb",
    "sourceRu": "Редактирование публичного сайта (clover-spb.ru / превью /vitrina). Доступно только администратору.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.editProduct",
    "sourceRu": "Изменить товар",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enabled",
    "sourceRu": "Включена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.end",
    "sourceRu": "Окончание",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.enterTheUuidOrDeliveryItem",
    "sourceRu": "Укажите UUID или код позиции доставки из 1С. Эти значения используются для сопоставления служебной строки доставки при передаче заказа.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.entireCatalog",
    "sourceRu": "Весь каталог",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.errors",
    "sourceRu": "Ошибки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.evenAfterEnablingHereLiveWrites",
    "sourceRu": "Даже после включения здесь рабочая запись останется заблокированной, пока в server/.env не установлено ONEC_WRITE_ENABLED=true.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exact1cNomenclature",
    "sourceRu": "Точная номенклатура 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exactNameIn1c",
    "sourceRu": "Точное название в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exactNameIn1cOptional",
    "sourceRu": "Точное название в 1С — необязательно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.example654756874",
    "sourceRu": "Пример: 65,47 ₽ + 5% → 68,74 ₽. Затем «Сохранить матрицу».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeErrors",
    "sourceRu": "Ошибки обмена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeLog",
    "sourceRu": "Журнал обмена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeQueue",
    "sourceRu": "Очередь обмена",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.extraNumber",
    "sourceRu": "+ Доп. номер",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.extraNumbers",
    "sourceRu": "Доп. номера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.extraPortableJsonCopy",
    "sourceRu": "Дополнительная переносимая JSON-копия",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fallbackMarkupIfThereIsNo",
    "sourceRu": "Запасная наценка, %, если вида цен нет",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fileIsNotUploadedYet",
    "sourceRu": "Файл ещё не загружен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.firstTheSelected1cPriceType",
    "sourceRu": "Сначала берётся выбранный вид цен 1С. Если его нет у товара — цена = закупка / «Закупочная» × (1 + запасная наценка / 100).",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fixedPriceManually",
    "sourceRu": "Фиксированная цена вручную",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forMarkupThePurchasePriceType",
    "sourceRu": "Для наценки обычно выбирают вид «Закупочная цена».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.forMaxPasteTheProfileLink",
    "sourceRu": "Для MAX вставьте ссылку на профиль, скопированную в приложении MAX. Telegram показывается только после заполнения имени пользователя или ссылки.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.freeDeliveryFrom",
    "sourceRu": "Бесплатная доставка от, ₽",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.from1c",
    "sourceRu": "Из 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fullBackups",
    "sourceRu": "Полные резервные копии",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fullCatalogForTheClient",
    "sourceRu": "Полный каталог для клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fullDescription",
    "sourceRu": "Полное описание",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.fullReset",
    "sourceRu": "Полный сброс",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.generate",
    "sourceRu": "Сгенерировать",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.generatePassword",
    "sourceRu": "Сгенерировать пароль",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.guestOrdersWithoutRegistrationGoTo",
    "sourceRu": "Гостевые заказы без регистрации уходят в 1С на одного контрагента. Контакт покупателя остаётся в комментарии заказа. В 1С у этого контрагента должен быть договор «Основной договор».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hidden2",
    "sourceRu": "Скрытые",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.hiddenMatrixOnly",
    "sourceRu": "Скрыт — только матрица",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.homeTextAndSlides",
    "sourceRu": "Текст и слайды на главной",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.howToAddProductsToThe",
    "sourceRu": "Как добавить товары на витрину?",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.howToCalculateTheStorefrontPrice",
    "sourceRu": "Как считать цену на витрине. В ЛК у клиентов — персональные цены матрицы.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.howToGetThereOptional",
    "sourceRu": "Как проехать — необязательно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.httpServiceTechnicalPaths",
    "sourceRu": "Технические пути HTTP-сервиса",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.idIn1c",
    "sourceRu": "ID в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.imagesInTheRightPaneOn",
    "sourceRu": "Картинки в правом окне главной. Можно менять порядок, удалять и загружать свои. Чтобы прорекламировать товар — укажите артикул или ссылку /product/… : по клику на баннер откроется карточка. Пустой список снова покажет три примера.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.individualMarkup",
    "sourceRu": "Индивидуальная наценка, %",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.individualPercent",
    "sourceRu": "Индивидуальный процент",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.infoBlockForTheStorefrontAnd",
    "sourceRu": "Информационный блок для витрины и страницы /aktsii. Не меняет цены, корзину, заказы и доставку. Просроченные акции остаются здесь, но скрыты на сайте.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.inOrders",
    "sourceRu": "В заказах",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.inQueue",
    "sourceRu": "В очереди",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.insidePcs",
    "sourceRu": "Внутри, шт.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.integration",
    "sourceRu": "Интеграция",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.inTheCloverCatalog",
    "sourceRu": "В каталоге Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.inTheMatrix",
    "sourceRu": "В матрице",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.jpgPngOrWebpUpTo",
    "sourceRu": "JPG, PNG или WEBP до 5 МБ. Автоматически: квадрат 800×800, белый фон, JPEG.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients.contactCaption",
    "sourceRu": "Подпись",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.link",
    "sourceRu": "Ссылка",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.linked2",
    "sourceRu": "Связано",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.linkText",
    "sourceRu": "Текст ссылки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.listItemsOnePerLine",
    "sourceRu": "Пункты списка (каждый с новой строки)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loadingAccessRecords",
    "sourceRu": "Загружаем доступы…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loadingPrices",
    "sourceRu": "Загрузка цен…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loadingTheExchangeCenter",
    "sourceRu": "Загружаем центр обмена…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loadingTheLog",
    "sourceRu": "Загружаем журнал...",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.loginEmail",
    "sourceRu": "Логин (email)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerContactsForClients",
    "sourceRu": "Контакты менеджера для клиентов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerFullName",
    "sourceRu": "ФИО менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerNotifications",
    "sourceRu": "Уведомления менеджеру",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerPhone",
    "sourceRu": "Телефон менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managers",
    "sourceRu": "Менеджеры",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managersOnly",
    "sourceRu": "Только для менеджеров",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerTelegramChatId",
    "sourceRu": "Telegram Chat ID менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.managerTelegramOptional",
    "sourceRu": "Telegram менеджера — необязательно",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.manually",
    "sourceRu": "Вручную",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.manuallySearchThe1cExportExcel",
    "sourceRu": "Вручную — поиск в выгрузке 1С. Excel — названия как в матрице, пары с 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.mapImageWithAPin",
    "sourceRu": "Картинка карты с точкой",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.markAllRead",
    "sourceRu": "Всё прочитано",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.markup",
    "sourceRu": "Накрутка, %",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.markup2",
    "sourceRu": "Наценка, %",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.markupPriceTypeOrPurchase1",
    "sourceRu": "«+ наценка %»: цена вида или закупка × (1 + %/100), с копейками.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.matrixIsBeingPrepared",
    "sourceRu": "Матрица подготавливается",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.matrixModePriceTypeAndMarkup",
    "sourceRu": "Режим матрицы, вид цен и наценка. Контрагента 1С выбирают в «Данные клиента». После «Обновить цены» в 1С ЛК клиента подтягивает каталог автоматически.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.matrixNote",
    "sourceRu": "Заметка по матрице",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.maxProfileLink",
    "sourceRu": "Ссылка на профиль MAX",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.multiplePcs",
    "sourceRu": "Кратность, шт.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.name",
    "sourceRu": "Наименование",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nameIn1c",
    "sourceRu": "Наименование в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nameIn1c2",
    "sourceRu": "Название в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newestFirst",
    "sourceRu": "Сначала новые",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newOrderOrderChangeProductOutside",
    "sourceRu": "Новый заказ, изменение заказа, товар вне матрицы, запрос акта сверки, регистрация клиента и ошибки 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newOrdersAppearHereAfterThey",
    "sourceRu": "Новые заказы появляются здесь после создания на вкладке «Заказы».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newRegistration",
    "sourceRu": "Новая регистрация",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.newToCloverNameFrom1c",
    "sourceRu": "Новый для Clover — имя с 1С, можно изменить позже",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noCategoryPrice",
    "sourceRu": "Нет цены категории",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noClientsFound",
    "sourceRu": "Клиенты не найдены.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noCopiesCreatedYet",
    "sourceRu": "Копии пока не созданы.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noExchangeOperationsYet",
    "sourceRu": "Операций обмена пока нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noExtraNumbersYet",
    "sourceRu": "Дополнительных номеров пока нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noItemsFound",
    "sourceRu": "Позиции не найдены.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noMatchingItemsInTheCurrent",
    "sourceRu": "В текущей выгрузке 1С подходящих позиций нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewNotifications",
    "sourceRu": "Новых уведомлений нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noNewReconciliationRequests",
    "sourceRu": "Новых запросов актов сверки нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noOrdersForExchangeYet",
    "sourceRu": "Заказов для обмена пока нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noProductsMatchTheFilter",
    "sourceRu": "Нет товаров по фильтру.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noRecordsYet",
    "sourceRu": "Записей пока нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.noSpecification",
    "sourceRu": "Без уточнения",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notAssignedSharedContact",
    "sourceRu": "Не назначен (общий контакт)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingFound",
    "sourceRu": "Ничего не найдено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.nothingInThe1cExportFor",
    "sourceRu": "В выгрузке 1С по запросу ничего нет.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notif",
    "sourceRu": "Увед.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notificationEmail",
    "sourceRu": "Email для уведомлений",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notInClover",
    "sourceRu": "Не в Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notMatched2",
    "sourceRu": "— не сопоставлено —",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notSelected",
    "sourceRu": "Не выбран",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notSent2",
    "sourceRu": "Не отправлено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notSet",
    "sourceRu": "Не задана",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.number",
    "sourceRu": "Номер",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.oldestFirst",
    "sourceRu": "Сначала старые",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.onlyClientsAndProductsUsedIn",
    "sourceRu": "Показаны только клиенты и товары, которые используются в заказах и ещё не имеют ID из 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.onlyIn1cWillBeCreated",
    "sourceRu": "Только в 1С — будет создан в Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.onlyProductsLinkedTo1c",
    "sourceRu": "Только товары, связанные с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.onTheCardInTheOrders",
    "sourceRu": "— в карточке на вкладке «Заказы». Здесь сводка очереди, подключение и пакетные операции.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.onTheHomePage",
    "sourceRu": "На главной",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.onTheWebsiteStorefront",
    "sourceRu": "На витрине сайта",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.openClients",
    "sourceRu": "Открыть клиентов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.openOrders",
    "sourceRu": "Открыть заказы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.openPreview",
    "sourceRu": "Открыть превью",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.openProducts",
    "sourceRu": "Открыть товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.order",
    "sourceRu": "Порядок",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderActions",
    "sourceRu": "Действия по заказу",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderDraft",
    "sourceRu": "Черновик заказа",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderItemsAreNotSaved",
    "sourceRu": "Позиции в заказе не сохранены.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders",
    "sourceRu": "Заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.outsideTheMatrix",
    "sourceRu": "Вне матрицы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.overridesThePurchaseCalculationOnThe",
    "sourceRu": "Перекрывает расчёт «закупочная + %» только на сайте.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.page",
    "sourceRu": "Страница",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pageHeadingH1",
    "sourceRu": "Заголовок страницы (H1)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pdfJpgPngOrWebpUp",
    "sourceRu": "PDF, JPG, PNG или WEBP до 10 МБ.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pdfWithAllStorefrontProductsAnd",
    "sourceRu": "PDF со всеми товарами витрины и фото. Накрутка применяется только в файле — настройки сайта не меняются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.personalManager",
    "sourceRu": "Личный менеджер",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.personalPrices",
    "sourceRu": "Персональных цен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.phoneEmail1cCounterpartyAddressesAnd",
    "sourceRu": "Телефон, email, контрагент 1С, адреса и заметка менеджера",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.priceCategoryIsNotSet",
    "sourceRu": "Категория цен не задана",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.priceFrom1c",
    "sourceRu": "Цена из 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.priceList",
    "sourceRu": "Прайс-лист",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pricePerSaleUnit",
    "sourceRu": "Цена за единицу продажи",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pricePerSelectedUnit",
    "sourceRu": "Цена за указанную единицу",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.print",
    "sourceRu": "Печать",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productCodeIn1c",
    "sourceRu": "Код товара в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productMatrixMode",
    "sourceRu": "Режим товарной матрицы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.products",
    "sourceRu": "Товаров",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsInTheMatrix",
    "sourceRu": "Товаров в матрице",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.productsOnTheStorefront",
    "sourceRu": "Товары на витрине",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.publicUrl",
    "sourceRu": "Публичный адрес:",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.published1cBaseUrl",
    "sourceRu": "Адрес опубликованной базы 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.purchase",
    "sourceRu": "Закупочная + %",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.pushAboutAPromoOrNew",
    "sourceRu": "Push-уведомление об акции или новинке",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.queueNotSent",
    "sourceRu": "Очередь / не отправлено",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.read",
    "sourceRu": "Прочитано",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.real1cOnTheLocalNetwork",
    "sourceRu": "Реальная 1С по локальной сети",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.recentCheckSendAndResetOperations",
    "sourceRu": "Последние операции проверки, передачи и сброса по очереди 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.recentSignInsCatalogMatrixPhoto",
    "sourceRu": "Последние входы, изменения каталога, матриц, фотографий и резервных копий.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.recordsWillAppearAfterAConnection",
    "sourceRu": "Записи появятся после проверки связи или передачи заказа.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.refreshDescriptions",
    "sourceRu": "Обновить описания",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.refreshStatus",
    "sourceRu": "Обновить статус",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removeFromStorefront",
    "sourceRu": "Убрать с витрины",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removeFromTheLog",
    "sourceRu": "Убрать из журнала",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removeImage",
    "sourceRu": "Убрать картинку",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removePhoto",
    "sourceRu": "Убрать фото",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.removeSelectedFromTheMatrix",
    "sourceRu": "Удалить выбранные из матрицы",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.requestStatus",
    "sourceRu": "Статус запроса",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.requiredSoThisClientSOrders",
    "sourceRu": "Нужен, чтобы заказы этого клиента создавались в 1С. Для заказов с сайта без регистрации используется служебный контрагент витрины.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.restoreDefaultText",
    "sourceRu": "Вернуть текст по умолчанию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.restoreExamples",
    "sourceRu": "Вернуть примеры",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.rules",
    "sourceRu": "Правила",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveProduct",
    "sourceRu": "Сохранить товар",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveTheProductFirstThenYou",
    "sourceRu": "Сначала сохраните товар — затем можно будет добавить фото.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveTheProductFirstThenYou2",
    "sourceRu": "Сначала сохраните товар — затем можно загрузить сертификат.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.saveTheRequestForTheNext",
    "sourceRu": "Сохранить запрос для следующей выгрузки из 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.search1cExportStorefront",
    "sourceRu": "Поиск по выгрузке 1С → витрина",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchCloverCatalog",
    "sourceRu": "Поиск по каталогу Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.searchingThe1cExport",
    "sourceRu": "Ищем в выгрузке 1С…",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selectAllNew",
    "sourceRu": "Отметить все новые",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.selectedProductsOnly",
    "sourceRu": "Только выбранные товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendSelectedTo1c",
    "sourceRu": "Передать выбранные в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sendToSubscribedClients",
    "sourceRu": "Отправить подписанным клиентам",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.sentAsATest",
    "sourceRu": "Передано тестово",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.serverCopies",
    "sourceRu": "Серверных копий",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.setPassword",
    "sourceRu": "Задать пароль",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.shortText",
    "sourceRu": "Краткий текст",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.showToClients",
    "sourceRu": "Показывать клиентам",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.signInBlocked",
    "sourceRu": "Вход заблокирован",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.slideChangeSeconds",
    "sourceRu": "Смена слайда, секунд",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.specifications",
    "sourceRu": "Характеристики",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.start",
    "sourceRu": "Начало",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.storefront.off",
    "sourceRu": "Не на витрине",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefrontCloverSpbRu",
    "sourceRu": "Витрина clover-spb.ru",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.storefrontContacts",
    "sourceRu": "Контакты на витрине",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.storefrontPriceType",
    "sourceRu": "Вид цен витрины",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.subcategory",
    "sourceRu": "Подкатегория",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.summaryAndBatchOperationsSendingA",
    "sourceRu": "Сводка и пакетные операции. Передача отдельного заказа — в карточке на вкладке «Заказы».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.field.bodyText",
    "sourceRu": "Текст",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients.oneCCounterparty",
    "sourceRu": "Контрагент 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients.oneCAndPrices",
    "sourceRu": "1С и цены",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients.oneCCounterpartyMissing",
    "sourceRu": "Контрагент 1С не выбран — откройте «Данные клиента».",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients.oneCPriceType",
    "sourceRu": "Категория цен 1С (вид цен)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.clients.oneCPriceTypeNoMarkup",
    "sourceRu": "Категория цен 1С без наценки",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.linkStatus",
    "sourceRu": "Связь 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.user",
    "sourceRu": "Пользователь обмена 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.drafts",
    "sourceRu": "Черновики 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchange.matchWizard",
    "sourceRu": "Мастер сопоставления с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders.oneCContour",
    "sourceRu": "Контур передачи в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.products.oneCCatalog",
    "sourceRu": "Каталог 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders.oneCErrors",
    "sourceRu": "Ошибки 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.settings.deliveryNomenclature",
    "sourceRu": "Номенклатура доставки в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.storefront.oneC.counterparty.title",
    "sourceRu": "Контрагент 1С для заказов с сайта",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.storefront.oneC.counterparty.id",
    "sourceRu": "ID контрагента 1С (необязательно)",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.products.oneC.article",
    "sourceRu": "Артикул 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.products.oneC.link",
    "sourceRu": "Связь с 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theCabinetWillShowAYour",
    "sourceRu": "В личном кабинете появится кнопка «Ваш менеджер». При наведении или нажатии клиент увидит ФИО, телефон и кнопки связи.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theCheckboxSelectsItemsToRemove",
    "sourceRu": "Галочка — выбор для удаления из матрицы. Снятие галочки товар не убирает.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theClientCannotSignInTo",
    "sourceRu": "Клиент не может авторизоваться в Clover.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theContactsButtonOpensAPage",
    "sourceRu": "Кнопка «Контакты» открывает страницу с телефоном, почтой, адресом, режимом работы и картой. Пустые поля на сайте скрываются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theCounterpartyIsNotLoadedYet",
    "sourceRu": "Контрагент ещё не загружен. Заказ всё равно передаст данные клиента в 1С, а точная связь сохранится автоматически после подтверждения 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theFileHasTheNamePhoto",
    "sourceRu": "В файле — название, фото и цена с вашей накруткой",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.thePhotoIsUploadedToThe",
    "sourceRu": "Фото загружается на сервер и автоматически появляется в личном кабинете клиента. JPG, PNG и WEBP до 5 МБ — при загрузке приводятся к квадрату 800×800 на белом фоне (JPEG).",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theseTextsAppearOnThePublic",
    "sourceRu": "Эти тексты видны на публичной карточке товара (/vitrina, clover-spb.ru). При добавлении из 1С пустые поля и фото подтягиваются автоматически.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theSiteNameMayDifferFrom",
    "sourceRu": "Название для сайта может отличаться от названия в 1С. Выберите позицию из полной выгрузки 1С или укажите код / точное название — после выгрузки Clover сможет связать автоматически.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.theTelegramBotTokenAndSmtp",
    "sourceRu": "Токен Telegram-бота и SMTP-пароль не вводятся в браузере — они уже задаются в server/.env на этом ПК (позже будет отдельный локальный настройщик). Для письма достаточно тумблера «Отправлять на email» и адреса выше. Push для проверки не обязателен.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.thisCopyDoesNotIncludeAccounts",
    "sourceRu": "Эта копия не содержит аккаунты и пароли. Она нужна только для переноса каталога, заказов и настроек.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.thisDoesNotLookLikeA",
    "sourceRu": "Не похоже на ссылку Яндекс.Карт. Вставьте адрес страницы карты из браузера.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.thisIsAClientFromAn",
    "sourceRu": "Это клиент из старого заказа без отдельного аккаунта Clover. Его данные в заказе сохранены, но карточка станет редактируемой после регистрации клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.timeoutMs",
    "sourceRu": "Тайм-аут, мс",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.tinForExactMatching",
    "sourceRu": "ИНН для точного сопоставления",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.toOrders",
    "sourceRu": "К заказам",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.totalOrders",
    "sourceRu": "Всего заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.unlink",
    "sourceRu": "Убрать связь",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.unlinked",
    "sourceRu": "Без связи",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.unread",
    "sourceRu": "Непрочитано",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.up",
    "sourceRu": "Вверх",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.uploadExcel",
    "sourceRu": "Загрузить Excel",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.uploadJsonCopy",
    "sourceRu": "Загрузить JSON-копию",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.usesProductsCurrentlyOnTheStorefront",
    "sourceRu": "Берутся товары, которые сейчас на витрине",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.viewOnlyCloverDataIsNot",
    "sourceRu": "Только просмотр. Данные Clover пока не изменяются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.visibleOnlyToCloverManagersNot",
    "sourceRu": "Виден только менеджерам Clover. Клиенту и в 1С не передаётся.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.waitingFor1cTransfer",
    "sourceRu": "Ждут передачи в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.websitePrice",
    "sourceRu": "Цена на сайте",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.websitePrices",
    "sourceRu": "Цены на сайте",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.websiteStorefront",
    "sourceRu": "Витрина сайта",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.yandexMapsLink",
    "sourceRu": "Ссылка на Яндекс.Карты",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.youCanUploadYourOwnSnapshot",
    "sourceRu": "Можно загрузить свой снимок. Если оставить пустым, сайт сам покажет карту Яндекса с меткой по ссылке выше.",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "shared.action.clearAll",
    "sourceRu": "Снять все",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.addAMissingProduct",
    "sourceRu": "+ Добавить отсутствующий товар",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.amount",
    "sourceRu": "Сумма",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.atLeast6CharactersAfterChanging",
    "sourceRu": "Минимум 6 символов. После смены другие сессии можно завершить отдельно.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.brandOrSpecifications",
    "sourceRu": "Марка или характеристики",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.canTFindTheProductYou",
    "sourceRu": "Не нашли нужный товар?",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.changePassword3",
    "sourceRu": "Смена пароля",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.clientsChangedCount",
    "sourceRu": "Изменено клиентов: {count}",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.currentPassword",
    "sourceRu": "Текущий пароль",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.deletePhoto",
    "sourceRu": "Удалить фото",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.emailIsTheAccountLoginAnd",
    "sourceRu": "Электронная почта — логин аккаунта, изменить нельзя.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.endOtherSessions",
    "sourceRu": "Завершить другие сессии",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.endsSignInOnOtherDevices",
    "sourceRu": "Завершает вход на других устройствах и в браузерах. Текущая сессия останется.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.enterTheNameQuantitySpecificationsAnd",
    "sourceRu": "Укажите название, количество, характеристики и при необходимости приложите фото.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.faceAndFingerprintDataStayOn",
    "sourceRu": "Данные лица и отпечатка остаются только на устройстве. Clover получает лишь подтверждение входа.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.faceIdFingerprint",
    "sourceRu": "Face ID / отпечаток",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.field.description",
    "sourceRu": "Описание",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.field.name",
    "sourceRu": "Название",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.field.positions",
    "sourceRu": "Позиций",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.field.price",
    "sourceRu": "Цена",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.field.qty",
    "sourceRu": "Количество",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.field.title",
    "sourceRu": "Заголовок",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.field.unit",
    "sourceRu": "Единица",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.fillInTheProfileBeforeCreating",
    "sourceRu": "Заполните профиль перед созданием первого заказа.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.fullAddress",
    "sourceRu": "Полный адрес",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.makePrimary",
    "sourceRu": "Сделать основным",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.media.certificate",
    "sourceRu": "Сертификат",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.media.noPhoto",
    "sourceRu": "Нет фото",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.myAddresses",
    "sourceRu": "Мои адреса",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.noPasskeysAddedYet",
    "sourceRu": "Ключи доступа пока не добавлены.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.notificationsAreAlreadyOnForAnother",
    "sourceRu": "Уведомления уже включены на другом устройстве. На этом телефоне или компьютере их можно включить отдельно.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "manager.notifications.countLabel",
    "sourceRu": "Уведомления: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "shared.numberOfItems",
    "sourceRu": "Кол-во позиций",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.onScreenPushAndWhereSupported",
    "sourceRu": "Push на экран и, где поддерживается, цифра на иконке приложения. Акции можно отключить отдельно.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.orderDate",
    "sourceRu": "Дата заказа",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.orderHistory",
    "sourceRu": "История заказа",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.ordersSavedCount",
    "sourceRu": "Заказов сохранено: {count}",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.organization",
    "sourceRu": "Организация",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.organizationProfile",
    "sourceRu": "Профиль организации",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.permissionIsGrantedButTheSubscription",
    "sourceRu": "Разрешение есть, но подписка на этом устройстве не активна — нажмите «Включить уведомления». На iPhone push работает только из установленного приложения (Safari → «На экран Домой»).",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.phoneNotifications",
    "sourceRu": "Уведомления на телефоне",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.productName",
    "sourceRu": "Название товара",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.productName2",
    "sourceRu": "Товар: {name}",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.productPhotoOptional",
    "sourceRu": "Фото товара — необязательно",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.productsInCatalogCount",
    "sourceRu": "Товаров в каталоге: {count}",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.receivePromosAndNewItems",
    "sourceRu": "Получать акции и новинки",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.saveAddress",
    "sourceRu": "Сохранить адрес",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.saveProfile",
    "sourceRu": "Сохранить профиль",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.saveSeveralAddressesAndPickOne",
    "sourceRu": "Сохраните несколько адресов и выбирайте нужный при заказе.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.section.documents",
    "sourceRu": "Документы",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.section.history",
    "sourceRu": "История",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.security",
    "sourceRu": "Безопасность",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.sendARequestToTheManager",
    "sourceRu": "Добавьте запрос менеджеру",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.sessions",
    "sourceRu": "Сессии",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.signOut",
    "sourceRu": "Выйти",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.theManagerWillSeeThisInformation",
    "sourceRu": "Эти данные менеджер увидит вместе с заказом.",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.theTechnicalPartIsReadyActual",
    "sourceRu": "Техническая часть подготовлена. Фактическая отправка включится после домена, HTTPS и VAPID-ключей (см. docs/deploy/PUSH_ENABLE.md).",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.tryAgain",
    "sourceRu": "Попробовать снова",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "shared.turnOffOnThisDevice",
    "sourceRu": "Отключить на этом устройстве",
    "namespace": "ui",
    "surface": "shared",
    "critical": false
  },
  {
    "key": "storefront.afterInstallation",
    "sourceRu": "После установки",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.allPromos",
    "sourceRu": "Все акции",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.anInstallOrIconAppearsOn",
    "sourceRu": "В адресной строке справа появится значок «Установить» или «⊕». Нажмите его и подтвердите установку.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.atTheBottomOfTheScreen",
    "sourceRu": "Внизу экрана нажмите кнопку с квадратом и стрелкой вверх (Поделиться).",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.cabinet",
    "sourceRu": "ЛК",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.call",
    "sourceRu": "Позвонить",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.cloverIsYourPersonalCabinetOn",
    "sourceRu": "Clover — это ваш личный кабинет на сайте",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.cloverMobileApp",
    "sourceRu": "Мобильное приложение Clover",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.cloverOpensAsASeparateApp",
    "sourceRu": "Clover откроется как отдельное приложение — удобно держать рядом с другими окнами.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.cloverWorksAsAPwaNo",
    "sourceRu": "Clover работает как PWA: не нужен App Store или Google Play. Добавьте сайт на экран — и откройте личный кабинет одним касанием.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.contact",
    "sourceRu": "Связаться",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.contactsAreNotSetYet",
    "sourceRu": "Контакты пока не указаны.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.emptyForNowAddProductsFrom",
    "sourceRu": "Пока пусто — добавьте товары из каталога.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.howAndroidChecksSitesInstalledOutside",
    "sourceRu": "— так Android проверяет сайты, установленные не из Play Store.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.howToFindUs",
    "sourceRu": "Как нас найти",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.howToInstallOnAPhone",
    "sourceRu": "Как установить на телефон",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.ifYouOnlySeeOkUpdate",
    "sourceRu": ". Если видите только «OK» — обновите Chrome и повторите шаг 2.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.installAnyway",
    "sourceRu": "«Всё равно установить»",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.installSafety",
    "sourceRu": "Безопасность установки",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.loadingCategories",
    "sourceRu": "Категории загружаются…",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.loadingContacts",
    "sourceRu": "Загружаем контакты…",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.loadingTheCard",
    "sourceRu": "Загрузка карточки…",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.moreDetails",
    "sourceRu": "«Подробнее»",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.nav.toCatalog",
    "sourceRu": "В каталог",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.noRegistrationNeededEnterContactDetails",
    "sourceRu": "Регистрация не нужна — укажите контакты для связи.",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.notAnAppFromGooglePlay",
    "sourceRu": ", а не приложение из Google Play. Предупреждение Play Protect означает лишь то, что установка идёт через браузер. Официальный адрес — только clover-spb.ru; не ставьте копии с других сайтов.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.notAVirus",
    "sourceRu": "не вирус",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.onSamsungAndOtherPhonesAn",
    "sourceRu": "На Samsung и других телефонах при установке может всплыть окно «Подозрительное приложение заблокировано». Это",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.openCloverSpbRuInChrome",
    "sourceRu": "Откройте clover-spb.ru в Chrome, Edge или другом современном браузере.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.openInYandexMaps",
    "sourceRu": "Открыть в Яндекс.Картах",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.orderNumber",
    "sourceRu": "Номер заказа",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.popularCategories",
    "sourceRu": "Популярные категории",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.scrollTheMenuAndChooseAdd",
    "sourceRu": "Пролистайте меню и выберите «На экран Домой» → «Добавить». Иконка Clover появится на рабочем столе.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.signInToCabinet",
    "sourceRu": "Войти в ЛК",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.signInToTheCabinetOrders",
    "sourceRu": "Войдите в личный кабинет — заказы, матрица товаров и статусы доставки будут под рукой. Уведомления о заказах работают в установленном приложении. Первое открытие может занять несколько секунд — дальше приложение загружается быстрее.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.specialOffersFromInformationalMaterialsNo",
    "sourceRu": "Специальные предложения компании КЛЕВЕР. Информационные материалы — без автоматического изменения цен в каталоге и корзине.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.tap",
    "sourceRu": "Нажмите",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.tapInstallOrAddTheClover",
    "sourceRu": "Нажмите «Установить» или «Добавить» — ярлык Clover появится среди приложений.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.tapInTheTopRightAnd",
    "sourceRu": "Нажмите ⋮ в правом верхнем углу и выберите «Установить приложение», «Добавить на главный экран» или «Установить сайт как приложение».",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.brand.wordmark",
    "sourceRu": "КЛЕВЕР",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.theCartIsEmpty",
    "sourceRu": "Корзина пуста.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.theOrderGoesToTheManager",
    "sourceRu": "Заказ уйдёт менеджеру и может быть передан в 1С из ЛК.",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.total",
    "sourceRu": "Итого:",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.websitePricesWithoutPersonalCabinetTerms",
    "sourceRu": "Цены сайта — без персональных условий ЛК.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.weWillContactYouToConfirm",
    "sourceRu": ". Мы свяжемся с вами для подтверждения.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "storefront.write",
    "sourceRu": "Написать",
    "namespace": "ui",
    "surface": "storefront",
    "critical": false
  },
  {
    "key": "manager.orderStatus.new",
    "sourceRu": "Новый",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatus.accepted",
    "sourceRu": "Принят",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatus.manual",
    "sourceRu": "Обработан вручную",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatus.picking",
    "sourceRu": "Собирается",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatus.ready",
    "sourceRu": "Готов к доставке",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatus.delivering",
    "sourceRu": "Доставляется",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatus.done",
    "sourceRu": "Выполнен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orderStatus.cancelled",
    "sourceRu": "Отменён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.customStatus.newRequest",
    "sourceRu": "Новый запрос",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.customStatus.clarifying",
    "sourceRu": "Уточняется",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.customStatus.agreed",
    "sourceRu": "Согласован",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.customStatus.addedToCatalog",
    "sourceRu": "Добавлен в каталог",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.customStatus.rejected",
    "sourceRu": "Отклонён",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeStatus.notSent",
    "sourceRu": "Не отправлен",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeStatus.queued",
    "sourceRu": "В очереди на передачу в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeStatus.sending",
    "sourceRu": "Передаётся в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeStatus.accepted",
    "sourceRu": "Принят в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeStatus.draft",
    "sourceRu": "Черновик создан в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.exchangeStatus.error",
    "sourceRu": "Не удалось передать",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.notifications.titleWithCount",
    "sourceRu": "Уведомления · {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders.selectOrder",
    "sourceRu": "Выбрать заказ {number}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.statusAria",
    "sourceRu": "Статус заказа {number}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.waitingOneCCount",
    "sourceRu": "Ждут передачи в 1С: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders.queuedCount",
    "sourceRu": "В очереди: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders.selectedCount",
    "sourceRu": "Выбрано: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.orders.inTrashCount",
    "sourceRu": "В корзине: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.acts.newRequestsCount",
    "sourceRu": "Новых запросов: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "manager.products.selectNamed",
    "sourceRu": "Выбрать «{name}»",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.deleteNamed",
    "sourceRu": "«{name}» будет удалён из каталога Clover, с витрины сайта и из матриц всех клиентов. Заказы с этим товаром не меняются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.deleteCountConfirm",
    "sourceRu": "Точно удалить {count} товаров из каталога Clover?",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.deletePhotoNamed",
    "sourceRu": "Удалить фотографию товара «{name}»?",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.deleteCertificateNamed",
    "sourceRu": "Удалить сертификат товара «{name}»?",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.deleteNamed",
    "sourceRu": "Удалить «{name}»?\n\nБудут удалены аккаунт, матрица, журнал доступов и связанные заказы. Это необратимо.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.failedToSend",
    "sourceRu": "Не удалось передать в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "auth.order.deleteForeverTitle",
    "sourceRu": "Удалить заказ № {number} навсегда?",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.order.restoreTitle",
    "sourceRu": "Восстановить заказ № {number}?",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.product.addToCatalogNamed",
    "sourceRu": "Товар «{name}» будет добавлен в каталог Clover.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "client.acts.readyCount",
    "sourceRu": "Готовых актов: {count}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.nav.notificationsCount",
    "sourceRu": "Уведомлений: {count}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.catalog.hideSubcategories",
    "sourceRu": "Скрыть подкатегории: {name}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.catalog.showSubcategories",
    "sourceRu": "Показать подкатегории: {name}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "shared.media.openPhotoNamed",
    "sourceRu": "Открыть фотографию: {name}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "auth.sync.keptOnScreen",
    "sourceRu": "{message}. Данные останутся на экране, но сервер пока их не сохранил.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.order.notSavedOnServer",
    "sourceRu": "{message} Заказ не сохранён на сервере — менеджер его не увидит.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.order.notDeletedOnServer",
    "sourceRu": "{message}. Заказ не удалён на сервере.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.order.notDeleted",
    "sourceRu": "{message}. Заказ не удалён.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.order.notMovedToTrash",
    "sourceRu": "{message}. Заказ не перемещён в корзину.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "shared.address.deleteNamed",
    "sourceRu": "Удалить адрес «{label}»?",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "admin.staff.roleUpdated",
    "sourceRu": "Роль обновлена: {role}",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.staff.managerCreated",
    "sourceRu": "Менеджер {email} создан. Пароль сохранён в журнале.",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.staff.accessClosedNamed",
    "sourceRu": "{email} не сможет войти в кабинет, пока доступ закрыт.",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.staff.accessOpenedNamed",
    "sourceRu": "{email} снова сможет войти.",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.staff.deleteForeverNamed",
    "sourceRu": "{email} будет удалён безвозвратно.",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.staff.passwordJournalCount",
    "sourceRu": " · {count} с паролем в журнале",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "client.matrix.categoryCount",
    "sourceRu": " · категория «{name}»: {count}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.matrix.unitEqualsPieces",
    "sourceRu": "1 {unit} = {multiplier} шт.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.orders.nextDelivery",
    "sourceRu": " · ближайшая доставка {date}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.orders.positionCount",
    "sourceRu": "{count} поз.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.orders.pieceTotal",
    "sourceRu": "{count} шт. всего",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.profile.helloNamed",
    "sourceRu": "Здравствуйте, {name}!",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.paidDelivery.confirm",
    "sourceRu": "Сумма заказа меньше {freeFrom}. Доставка — {fee}. Добавьте товаров ещё на {needMore} для бесплатной доставки либо оформите заказ с платной доставкой.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.paidDelivery.confirmLabel",
    "sourceRu": "Оформить (+{fee})",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.addendum.confirmWithCount",
    "sourceRu": "Добавить {count} поз. в заказ {orderLabel}? Дата, адрес и комментарий заказа не изменятся.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.addendum.confirm",
    "sourceRu": "Добавить позиции в заказ {orderLabel}? Дата, адрес и комментарий заказа не изменятся.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.addendum.titleNumber",
    "sourceRu": "Добавить в заказ №{number}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "shared.article.prefix",
    "sourceRu": "Арт. {article}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "client.order.deliveryPaidNeedMore",
    "sourceRu": "В заказе позиция «Доставка» — {fee}. До бесплатной ещё {needMore}.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.deliveryPaidAddMore",
    "sourceRu": "В заказе позиция «Доставка» — {fee}. Добавьте ещё на {needMore} для бесплатной.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.acts.fileName",
    "sourceRu": "Акт-сверки-{id}.pdf",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "manager.access.removePasswordNamed",
    "sourceRu": "Пароль для «{name}» исчезнет из журнала. Аккаунт клиента не удалится.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.access.deleteNamedWithLogin",
    "sourceRu": "Удалить «{name}» ({login})?\n\nБудут удалены аккаунт, матрица, журнал доступов и связанные заказы. Это необратимо.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.access.noLogin",
    "sourceRu": "без логина",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.access.updatedAt",
    "sourceRu": "Обновлён {datetime}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.clientAddresses",
    "sourceRu": "Клиент: {clientId} · адресов: {addresses}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.clientAddressesEmailChanged",
    "sourceRu": "Клиент: {clientId} · адресов: {addresses} · изменён email для входа",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.productMatrices",
    "sourceRu": "Товар: {name} · матриц: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.backupFallback",
    "sourceRu": "Резервная копия",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.backupWithPhotos",
    "sourceRu": "{reason} · фотографий: {photoCount}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.backupRestored",
    "sourceRu": "Файл: {fileName} · фотографий восстановлено: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.backupCopyFallback",
    "sourceRu": "копия",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.backupCleanup",
    "sourceRu": "Удалено копий: {removed} · осталось: {remaining}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.orderReady",
    "sourceRu": "Заказ № {number} · готов к передаче",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.orderIssues",
    "sourceRu": "Заказ № {number} · ошибок: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.orderReceipt",
    "sourceRu": "Заказ № {number} · Заказ покупателя: {receipt}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.orderFormat",
    "sourceRu": "Заказ № {number} · формат: {format}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.batchFormat",
    "sourceRu": "Формат: {format} · заказов: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.exchangeConfig",
    "sourceRu": "Режим: {mode} · адрес: {address}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.modeReal",
    "sourceRu": "реальная 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.addressFilled",
    "sourceRu": "заполнен",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.addressEmpty",
    "sourceRu": "не заполнен",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.connectionOk",
    "sourceRu": "{mode} · {detail}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.modeRealTitle",
    "sourceRu": "Реальная 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.modeSimulatorTitle",
    "sourceRu": "Симулятор",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.connectionChecked",
    "sourceRu": "подключение проверено",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.catalogPreview",
    "sourceRu": "{type} · записей: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.catalogError",
    "sourceRu": "{type} · {message}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.directory",
    "sourceRu": "Справочник",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.errorWord",
    "sourceRu": "ошибка",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.nomenclatureReceived",
    "sourceRu": "Получено: {received} · новых связей: {newlyLinked} · без совпадения: {unmatched}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.autoLinkSummary",
    "sourceRu": "Товаров Clover: {cloverTotal} · связанных: {linked} · новых связей: {newlyLinked}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.draftCreated",
    "sourceRu": "Заказ № {number} · документ {document} · {mode}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.documentCreated",
    "sourceRu": "создан",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.audit.orderError",
    "sourceRu": "Заказ № {number} · {message}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "shared.fileSize.bytes",
    "sourceRu": "{bytes} Б",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.fileSize.kilobytes",
    "sourceRu": "{value} КБ",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.fileSize.megabytes",
    "sourceRu": "{value} МБ",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "manager.backup.removedOld",
    "sourceRu": "Удалено старых копий: {count}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.backup.restoreConfirmNamed",
    "sourceRu": "Восстановить данные из копии «{fileName}»? Перед восстановлением сервер автоматически создаст страховочную копию.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.backup.fullCopyPhotos",
    "sourceRu": "полная копия, фото: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.saveFailedNamed",
    "sourceRu": "Не удалось сохранить товар: {message}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.fixedPriceMissing",
    "sourceRu": "Для «{name}» выбрана фиксированная цена, но сумма не указана. Введите цену или верните «По матрице».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.markupPercent",
    "sourceRu": "Наценка {percent}%",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.matrixProductCount",
    "sourceRu": "Товаров в матрице: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.matrixSelectedCount",
    "sourceRu": "В матрице: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.categoryPricePlaceholder",
    "sourceRu": "Категория: {price}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.catalogPricePlaceholder",
    "sourceRu": "Цена: {price}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.prodEnabledDatabases",
    "sourceRu": "prod включён · базы {databases}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.databaseName",
    "sourceRu": " · база {database}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.extensionVersion",
    "sourceRu": " · расширение {version}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.articleNamed",
    "sourceRu": " · артикул {article}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.innNamed",
    "sourceRu": " · ИНН {inn}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.unmatchedCounts",
    "sourceRu": "Не сопоставлено клиентов: {clients} · товаров: {products}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.errorCount",
    "sourceRu": "{count} ошибок",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.cancelTransferCount",
    "sourceRu": "Будет отменена передача для {count} заказ(ов). Кнопка снова станет «Передать в 1С».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.alreadyAllStatus",
    "sourceRu": "Все выбранные заказы уже в статусе «{status}».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.bulkUnavailable",
    "sourceRu": "Статус «{status}» недоступен для выбранных заказов. Уже в этом статусе: {unchanged}. Нельзя сменить: {blocked}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.bulkQueued",
    "sourceRu": "К обновлению: {updated}. Уже в этом статусе: {unchanged}. Нельзя сменить: {blocked}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.bulkPartialResult",
    "sourceRu": "Обновлено: {updated}. Уже в этом статусе: {unchanged}. Нельзя сменить: {blocked}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.detailsCount",
    "sourceRu": "Подробности ({count})",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.deletedByRole",
    "sourceRu": " · удалил: {role}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.customerOrderReceipt",
    "sourceRu": " · Заказ покупателя {receipt}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.autoLinkedCount",
    "sourceRu": "Автоматически связаны товары: {count}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.deleteEntireCatalog",
    "sourceRu": "Будет удалён весь каталог ({count} поз.): с витрины сайта и из матриц клиентов. Это не отмена Excel и не загрузка файла. Заказы не меняются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.deleteSelectedCount",
    "sourceRu": "Будет удалено из каталога Clover, с витрины сайта и из матриц клиентов: {count}. Заказы с этими товарами не меняются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.addedToCatalogNamed",
    "sourceRu": "В каталог: «{name}».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.addedToCatalogFromExcel",
    "sourceRu": "В каталог из Excel: {count} поз.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.oneCArticleCode",
    "sourceRu": "Артикул 1С: {code}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.acts.deleteConfirm",
    "sourceRu": "Запрос «{period}» для {client} будет удалён навсегда — и у менеджера, и в ЛК клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.acts.deleteConfirmWithPdf",
    "sourceRu": "Запрос «{period}» для {client} будет удалён навсегда — и у менеджера, и в ЛК клиента. PDF-файл тоже будет удалён с сервера.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.sentCount",
    "sourceRu": "Отправлено: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.channelSent",
    "sourceRu": "{channel}: отправлено",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.mailSentTo",
    "sourceRu": "Письмо ушло на {email}. {summary}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.namedAddressFallback",
    "sourceRu": "указанный адрес",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.defaultValue",
    "sourceRu": "По умолчанию: {value}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.addedCount",
    "sourceRu": "На витрину добавлено: {count}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.removedCount",
    "sourceRu": "С витрины снято: {count}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.descriptionFilled",
    "sourceRu": "описание {filled}/3",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.enrichQueued",
    "sourceRu": "Обновление описаний: {count} товар(ов). Старые тексты сохраняются до замены.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.addedCountSave",
    "sourceRu": "В матрицу клиента добавлено: {count} поз. Нажмите «Сохранить матрицу».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.listFromTotal",
    "sourceRu": " из {total}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.importProgress",
    "sourceRu": "Загружаем товары из Excel ({done}/{total})…",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.addedToStorefront",
    "sourceRu": "На витрину: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.addedToCatalog",
    "sourceRu": "В каталог: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.addedToMatrix",
    "sourceRu": "В матрицу: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.reusedFromCatalog",
    "sourceRu": "из каталога Clover без дублей: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.createdInCatalog",
    "sourceRu": "новых в каталоге: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.skippedStorefront",
    "sourceRu": "пропущено (уже на витрине/дубли): {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.skippedCatalog",
    "sourceRu": "пропущено (уже в каталоге/дубли): {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.skippedMatrix",
    "sourceRu": "пропущено (уже в матрице/дубли): {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.fileCode",
    "sourceRu": "Код из файла: {code}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.addingProgress",
    "sourceRu": "Добавляем… {done}/{total}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.addToCatalogCount",
    "sourceRu": "Добавить в каталог ({count})",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.addProductsCount",
    "sourceRu": "Добавить товары ({count})",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.addedNamed",
    "sourceRu": "Добавлено в матрицу: «{name}».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.addedCountPreview",
    "sourceRu": "Добавлено в матрицу: {count} поз. ({preview}).",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.skippedDuplicates",
    "sourceRu": "Пропущено дубликатов (уже в матрице): {count}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.addedNamedPricesLater",
    "sourceRu": "Добавлено в матрицу: «{name}». Цены подтянутся после обмена с 1С.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.addedFromExcelPricesLater",
    "sourceRu": "Добавлено в матрицу из Excel: {count} поз. Цены подтянутся после обмена с 1С («Обновить цены»).",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.addCount",
    "sourceRu": "Добавить ({count})",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.oneC.noExactShownCatalog",
    "sourceRu": "По «{query}» точных совпадений нет. Показан каталог 1С ({total}). Уточните слова и нажмите «Найти».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.oneC.foundInExport",
    "sourceRu": "Найдено в выгрузке 1С: {total}. Свободные сверху. Можно править строку поиска и жать «Найти» / «Весь каталог».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.oneC.selectedCategory",
    "sourceRu": "Позиция 1С выбрана. Категория: «{category}». Проверьте единицы и цены, затем «Сохранить товар».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.oneC.relinkConfirm",
    "sourceRu": "«{name}» уже связана с товаром «{linkedName}». Перепривязать к текущему товару?",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.subcategoryRequired",
    "sourceRu": "Для группы «{category}» нужно указать подкатегорию.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.updatedAt",
    "sourceRu": "Обновлено: {datetime}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.priceTypeTitle",
    "sourceRu": "Вид цен «{name}»",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.purchasePriceTitle",
    "sourceRu": "Закупочная цена товара",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.priceFromUpdate",
    "sourceRu": "Из «Обновить цены» (вид цен)",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.priceFromPurchaseExport",
    "sourceRu": "Из выгрузки закупочных цен",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.purchaseFallbackName",
    "sourceRu": "Закупочная",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.addedNamed",
    "sourceRu": "На витрину: «{name}».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.addedCountShort",
    "sourceRu": "На витрину: {count} поз.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.skippedAlready",
    "sourceRu": "Уже на витрине, пропущено: {count}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.exportTotal",
    "sourceRu": " В выгрузке: {count}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.addCount",
    "sourceRu": "Добавить на витрину ({count})",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.asNamed",
    "sourceRu": "как «{name}»",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.addedFromExcel",
    "sourceRu": "На витрину из Excel: {count} поз.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "storefront.nav.cartWithCount",
    "sourceRu": "Корзина ({count})",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.nav.cartAriaCount",
    "sourceRu": "Корзина: {count} поз.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.hero.slideAria",
    "sourceRu": "Слайд {index}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.qty.ariaWithUnit",
    "sourceRu": "Количество, {unit}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.qty.inUnitPieces",
    "sourceRu": "В {unit}: {count} шт",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.qty.multipleOf",
    "sourceRu": "Кратно {step}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.qty.multipleOfLower",
    "sourceRu": "кратно {step}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.unit.piecesInNamed",
    "sourceRu": "{size} шт в «{label}»",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.cart.unitSizePieces",
    "sourceRu": " · по {count} шт",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.cart.removeNamed",
    "sourceRu": "Удалить {name}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.cart.deliveryNeedMore",
    "sourceRu": "Доставка {fee}. До бесплатной ещё {needMore}.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.checkout.paidDeliverySpb",
    "sourceRu": "Доставка по СПб — {fee} (заказ менее {freeFrom})",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.product.pieceSuffix",
    "sourceRu": ", шт",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.product.unitSuffix",
    "sourceRu": " · {unit}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "manager.exchange.queuedContour",
    "sourceRu": "В очереди {contour}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.sendingContour",
    "sourceRu": "Передаётся в {contour}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.acceptedContour",
    "sourceRu": "Принят в {contour}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "shared.print.blockedTitle",
    "sourceRu": "Печать заблокирована",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.blockedMessage",
    "sourceRu": "Браузер заблокировал окно печати. Разрешите всплывающие окна для этого сайта.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.documentTitle",
    "sourceRu": "Заказ {number}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.orderHeading",
    "sourceRu": "Заказ № {number}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.systemLine",
    "sourceRu": "Система Clover · {datetime}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.clientLabel",
    "sourceRu": "Клиент:",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.deliveryLabel",
    "sourceRu": "Доставка:",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.colProduct",
    "sourceRu": "Товар",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.outsideMatrix",
    "sourceRu": "Товар вне матрицы · {details}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.totalAmount",
    "sourceRu": "Итого: {amount}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.managerComment",
    "sourceRu": "Комментарий менеджера:",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.print.externalId",
    "sourceRu": "Внешний ID: {id}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "manager.matrix.exportFileName",
    "sourceRu": "матрица-{name}.xlsx",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "shared.order.cannotTrashByStatus",
    "sourceRu": "Заказ со статусом «{status}» удалить нельзя (принят или обработан в 1С).",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "client.delivery.closedSunday",
    "sourceRu": "В этот день доставка не осуществляется.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.delivery.nextWorkingDay",
    "sourceRu": "Доставку можно оформить только на следующий рабочий день.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.delivery.afterCutoff",
    "sourceRu": "После 18:00 доставку можно оформить только на послезавтра в рабочий день.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.delivery.dateRequired",
    "sourceRu": "Укажите дату доставки.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "shared.order.notFound",
    "sourceRu": "Заказ не найден.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.order.alreadyTrashed",
    "sourceRu": "Заказ уже в корзине.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.order.completedAdminOnly",
    "sourceRu": "Выполненный заказ может удалить только администратор.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.order.exchangeBlocked",
    "sourceRu": "Заказ уже в обмене с 1С. Удаление запрещено.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.order.clientOnlyNew",
    "sourceRu": "Клиент может удалить только заказ со статусом «Новый».",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.order.notInTrash",
    "sourceRu": "Заказ не в корзине.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.order.purgeFromTrashOnly",
    "sourceRu": "Удалить навсегда можно только заказ из корзины.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.order.purgeCompletedAdminOnly",
    "sourceRu": "Удалить выполненный заказ навсегда может только администратор.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "manager.promo.status.active",
    "sourceRu": "Активна",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.promo.status.scheduled",
    "sourceRu": "Запланирована",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.promo.status.completed",
    "sourceRu": "Завершена",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.promo.status.disabled",
    "sourceRu": "Выключена",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.addressNumbered",
    "sourceRu": "Адрес {n}",
    "namespace": "ui",
    "surface": "manager",
    "critical": false
  },
  {
    "key": "shared.passkey.accessKeyNumbered",
    "sourceRu": "Ключ доступа {n}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "client.order.numberHeading",
    "sourceRu": "Заказ № {number}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "manager.order.numberHeading",
    "sourceRu": "Заказ № {number}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "client.order.createdAt",
    "sourceRu": "Создан: {datetime}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.orders.activeCount",
    "sourceRu": "Активных: {count}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.managerCommentPrefix",
    "sourceRu": "Менеджер: {comment}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.gate.fillOrgProfileInSettings",
    "sourceRu": "Сначала заполните профиль организации в {settings}.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.gate.addDeliveryAddressInSettings",
    "sourceRu": "Добавьте адрес доставки в {settings}.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.addendumInNumber",
    "sourceRu": "в №{number}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.order.outsideMatrixUnit",
    "sourceRu": "Товар вне матрицы · {unit}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.profile.contactsHint",
    "sourceRu": "Укажите ФИО, роль в компании и телефон. Основной контакт — для связи по заказам. Можно добавить до {max} контактов.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.profile.contactNumbered",
    "sourceRu": "Контакт {n}",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "client.matrix.activePositions",
    "sourceRu": "В матрице: {count} поз.",
    "namespace": "ui",
    "surface": "client",
    "critical": true
  },
  {
    "key": "manager.orders.selectedOrdersCount",
    "sourceRu": "Выбрано заказов: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.changeStatus",
    "sourceRu": "Изменить статус",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.trash",
    "sourceRu": "Корзина",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.oneCWithStatus",
    "sourceRu": "1С: {status}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.orders.inTrashSince",
    "sourceRu": "В корзине с {datetime}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.connectionTo1c",
    "sourceRu": "Подключение к 1С · {status}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.secretInEnv",
    "sourceRu": "Секрет в server/.env: {status}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.readStatus",
    "sourceRu": "Чтение: {status}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.writeStatus",
    "sourceRu": "Запись: {status}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.ordersContour",
    "sourceRu": "Контур заказов: {status}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.orderCreatedMeta",
    "sourceRu": "Создан {datetime} · доставка {date} · статус заказа: {status}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.documentLine",
    "sourceRu": "Документ: {document} · {posted} · {mode}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.clientsUnlinkedCount",
    "sourceRu": "Клиенты без связи с 1С: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.productsWithoutNomenclatureId",
    "sourceRu": "Товары без ID номенклатуры: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.exchange.logOrderLine",
    "sourceRu": "{datetime} · заказ № {number} · {user}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.codeAndInn",
    "sourceRu": "Код: {code} · ИНН: {inn}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matchPercent",
    "sourceRu": "Совпадение: {percent}%",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.alreadyLinkedToClient",
    "sourceRu": "Уже связан с клиентом Clover: {name}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.extraPhonesHint",
    "sourceRu": "Кроме основного телефона выше можно добавить ещё номера для связи. До {max} контактов всего.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.loginStaysEmail",
    "sourceRu": "Логин остаётся {email}. Матрица и заказы не меняются.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.ordersCount",
    "sourceRu": "{count} заказов",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.oneCNamed",
    "sourceRu": "1С: {name}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.counterparty1c",
    "sourceRu": "Контрагент 1С: {name}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.missingPriceWaitRefresh",
    "sourceRu": "Без цены: {count} — дождитесь «Обновить цены» в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.retryWithMessage",
    "sourceRu": "{message} · повторить",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.personalExceptionsCount",
    "sourceRu": "Индивидуальных исключений: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.markedCount",
    "sourceRu": "Отмечено: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.priceForClient",
    "sourceRu": "Клиенту: {price}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.sharedMarkupPercent",
    "sourceRu": "Общая наценка клиента: {percent}%",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.oneCPriceUpdated",
    "sourceRu": "Цена 1С обновлена: {datetime}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.categoryUpdated",
    "sourceRu": "Категория обновлена: {datetime}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.access.withPasswordCount",
    "sourceRu": "{count} с паролем",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.access.clientsCount",
    "sourceRu": "{count} клиентов",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.exportAt",
    "sourceRu": "Выгрузка: {datetime}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.notInFreshCatalog",
    "sourceRu": "Не в свежем каталоге: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.foundShownFirst",
    "sourceRu": "Найдено: {total}. Показаны первые {shown}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.linkedNamed",
    "sourceRu": "Связан: {name}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.paidDeliveryRule",
    "sourceRu": "Для заказов менее {freeFrom} ₽ Clover добавляет доставку {fee} ₽; от {freeFrom} ₽ — бесплатно.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.zoneEmptyFieldsHint",
    "sourceRu": "Для каждого адреса клиента можно выбрать зону. Пустые поля берут глобальные значения: бесплатно от {freeFrom} ₽, доставка {fee} ₽.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.nameEqualsMatrixHint",
    "sourceRu": "На сайте имя товара = как в матрице Clover (не сырое название 1С). Можно выбрать из каталога ниже или добавить из 1С / Excel, даже если позиции ещё нет ни у одного клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.nowOnStorefrontSelected",
    "sourceRu": "Сейчас на витрине: {onStorefront} из {total}. Выбрано: {selected}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.lastSave",
    "sourceRu": "Последнее сохранение: {datetime}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.inListCount",
    "sourceRu": "В списке: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.toAddCount",
    "sourceRu": "к добавлению: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.rowsCount",
    "sourceRu": "Строк: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.exactCount",
    "sourceRu": "Точных: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.byCodeCount",
    "sourceRu": "По коду: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.similarCount",
    "sourceRu": "Похожих: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.unmatchedCount",
    "sourceRu": "Без пары: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.toAddCount",
    "sourceRu": "К добавлению: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.excel.uploadProgress",
    "sourceRu": "Загрузка: {done}/{total}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.alreadyInCloverNamed",
    "sourceRu": "Уже в Clover: {name}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.matrix.oneCFoundToAdd",
    "sourceRu": "1С: {catalog} · найдено: {found} · к добавлению: {add}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.codeValue",
    "sourceRu": "Код: {code}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.websitePriceUnit",
    "sourceRu": "Цена на сайте, {unit}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.oneCExportListHint",
    "sourceRu": "В выгрузке 1С: {total}. В списке сейчас: {shown}. Свободные сверху; уже связанные можно перепривязать.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.products.alreadyLinkedToProduct",
    "sourceRu": "Уже связан с товаром Clover: {name}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.ifExistsKeepMatrixName",
    "sourceRu": "Если товар уже есть в Clover, на витрине останется его имя из матрицы. Новый товар получит имя из 1С (его можно потом поменять в карточке).",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.foundToAdd",
    "sourceRu": "Найдено: {found}. К добавлению: {add}.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.storefront.inCloverMatrixName",
    "sourceRu": "В Clover/матрице: «{name}» — это имя пойдёт на витрину",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "storefront.cart.spbUnderAmount",
    "sourceRu": "По СПб · заказ менее {amount}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "checkout.summary.goodsCountAmount",
    "sourceRu": "Товары: {count} поз. · {amount}",
    "namespace": "checkout",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.install.iosOpenSafari",
    "sourceRu": "Перейдите на {host} в браузере Safari. В Chrome и других браузерах на iOS установка на экран недоступна.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.install.androidOpenChrome",
    "sourceRu": "Зайдите на {host} в Google Chrome (желательно последняя версия из Play Store). Samsung Internet тоже подойдёт: меню → «Добавить на главный экран».",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.product.articleCode",
    "sourceRu": "Артикул {code}",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.product.quantity",
    "sourceRu": "Количество",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "admin.staff.adminsNowCount",
    "sourceRu": "Администраторов сейчас: {count}",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.staff.passwordUpdatedAt",
    "sourceRu": "Обновлён {stamp}",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "admin.staff.passwordUpdatedAtBy",
    "sourceRu": "Обновлён {stamp} · {who}",
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  },
  {
    "key": "manager.priceList.filePriceFormula",
    "sourceRu": "Цена в файле = закупка × (1 + {markup} / 100)",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.acts.attachPdfAndSend",
    "sourceRu": "Прикрепите PDF акта из 1С и нажмите «Отправить».",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.acts.sentFile",
    "sourceRu": "Отправлено: {fileName}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.notice.moreUnseen",
    "sourceRu": "Ещё непросмотренных: {count}",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "shared.orderHistory.clientAddendum",
    "sourceRu": "Клиент добавил позиции (дозаказ)",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.orderHistory.clientEdit",
    "sourceRu": "Клиент изменил состав или условия заказа",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.orderHistory.statusChanged",
    "sourceRu": "Статус изменён: {from} → {to}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.orderHistory.statusBulkChanged",
    "sourceRu": "Статус массово изменён: {from} → {to}",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.status.processing",
    "sourceRu": "Готовится",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.status.ready",
    "sourceRu": "Готов",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.period.q1",
    "sourceRu": "1 квартал",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.period.q2",
    "sourceRu": "2 квартал",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.period.q3",
    "sourceRu": "3 квартал",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.period.q4",
    "sourceRu": "4 квартал",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.period.all",
    "sourceRu": "За весь период",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.reconciliation.period.custom",
    "sourceRu": "Определённый период",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "manager.backup.reason.manualDefault",
    "sourceRu": "Ручная резервная копия",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.backup.reason.beforeRestore",
    "sourceRu": "Автоматическая копия перед восстановлением",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.backup.reason.beforeReset",
    "sourceRu": "Автоматическая копия перед полным сбросом",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.backup.reason.dailyStart",
    "sourceRu": "Автоматическая полная копия при первом запуске за день",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.clients.noCode",
    "sourceRu": "без кода",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "shared.orderHistory.createdFromSite",
    "sourceRu": "Заказ создан с сайта",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.orderHistory.exchangeCancelledManual",
    "sourceRu": "Передача в 1С отменена: заказ обработан вручную",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.orderHistory.statusChangedOneC",
    "sourceRu": "Статус изменён: {from} → {to} (1С: {state})",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.timeout",
    "sourceRu": "Сервер временно недоступен. Попробуйте ещё раз.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.network",
    "sourceRu": "Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.apiUnavailable",
    "sourceRu": "Сервер API сейчас недоступен. Обновите страницу через минуту или обратитесь к менеджеру.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.requestTooLarge",
    "sourceRu": "Запрос слишком большой для сервера. Обновите страницу и сохраните товар ещё раз.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.invalidResponse",
    "sourceRu": "Не удалось прочитать ответ сервера. Обновите страницу или войдите снова.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.noResponse",
    "sourceRu": "Сервер не ответил. Войдите снова или попробуйте позже.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.requestFailed",
    "sourceRu": "Не удалось выполнить запрос. Попробуйте позже.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.loadFailed",
    "sourceRu": "Не удалось загрузить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.saveFailed",
    "sourceRu": "Не удалось сохранить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.deleteFailed",
    "sourceRu": "Не удалось удалить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.addFailed",
    "sourceRu": "Не удалось добавить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.sendFailed",
    "sourceRu": "Не удалось отправить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.downloadFailed",
    "sourceRu": "Не удалось скачать",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.copyFailed",
    "sourceRu": "Не удалось скопировать в буфер обмена.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.restoreFailed",
    "sourceRu": "Не удалось восстановить",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.panelShowFailed",
    "sourceRu": "Не удалось показать блок",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.passkeyAddFailed",
    "sourceRu": "Не удалось добавить ключ доступа.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoAttachFailed",
    "sourceRu": "Не удалось прикрепить фотографию.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoReadFailed",
    "sourceRu": "Не удалось прочитать фотографию.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoPrepareFailed",
    "sourceRu": "Браузер не смог подготовить фотографию.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoUnrecognized",
    "sourceRu": "Файл не удалось распознать как фотографию.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoRequired",
    "sourceRu": "Выберите фотографию товара.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoType",
    "sourceRu": "Разрешены только изображения JPG, PNG или WEBP.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoMaxSize",
    "sourceRu": "Максимальный размер файла — 5 МБ.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.photoStillTooLarge",
    "sourceRu": "После обработки фото всё ещё слишком большое. Выберите снимок меньшего размера.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.error.excelNoNameRows",
    "sourceRu": "Не найдено ни одной строки с названием. Ожидаются колонки «Название»/«Товар» и опционально «Код».",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "shared.push.restoreHint",
    "sourceRu": "Нажмите «Включить уведомления», чтобы восстановить push на этом устройстве.",
    "namespace": "ui",
    "surface": "shared",
    "critical": true
  },
  {
    "key": "auth.error.faceIdLoginFailed",
    "sourceRu": "Не удалось войти по Face ID. Если ключ добавляли раньше — укажите почту или добавьте Face ID заново в профиле.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "manager.error.vaultLoadFailed",
    "sourceRu": "Не удалось загрузить доступы.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.backupReadFailed",
    "sourceRu": "Не удалось прочитать файл резервной копии.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.clientSaveFailed",
    "sourceRu": "Не удалось сохранить данные клиента.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.passwordChangeFailed",
    "sourceRu": "Не удалось сменить пароль",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.pricesLoadFailed",
    "sourceRu": "Не удалось загрузить цены",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.clientCreateFailed",
    "sourceRu": "Не удалось создать клиента",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.matrixSaveFailed",
    "sourceRu": "Не удалось сохранить матрицу.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.productDeleteFailed",
    "sourceRu": "Не удалось удалить товар.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.productsDeleteFailed",
    "sourceRu": "Не удалось удалить выбранные товары.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.oneCCancelFailed",
    "sourceRu": "Не удалось отменить передачу",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.oneCSendFailed",
    "sourceRu": "Не удалось передать в 1С",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.priceExportFailed",
    "sourceRu": "Не удалось выгрузить прайс",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.channelsCheckFailed",
    "sourceRu": "Не удалось проверить каналы",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.storefrontProductsSaveFailed",
    "sourceRu": "Не удалось сохранить товары",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.slideLoadFailed",
    "sourceRu": "Не удалось загрузить слайд",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.mapLoadFailed",
    "sourceRu": "Не удалось загрузить карту",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.descriptionsUpdateFailed",
    "sourceRu": "Не удалось обновить описания",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.promoImageLoadFailed",
    "sourceRu": "Не удалось загрузить картинку акции",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.enrichFailed",
    "sourceRu": "Не удалось дополнить",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.error.managerCreateFailed",
    "sourceRu": "Не удалось создать менеджера.",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.newsTitleDefault",
    "sourceRu": "Новость Clover",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "manager.settings.emailToggleHint",
    "sourceRu": "email: включите тумблер «Отправлять на email» и обновите страницу",
    "namespace": "ui",
    "surface": "manager",
    "critical": true
  },
  {
    "key": "storefront.error.catalogLoadFailed",
    "sourceRu": "Не удалось загрузить каталог.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.error.promosLoadFailed",
    "sourceRu": "Не удалось загрузить акции.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.error.homeLoadFailed",
    "sourceRu": "Не удалось загрузить витрину.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.error.contactsLoadFailed",
    "sourceRu": "Не удалось загрузить контакты.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "storefront.error.checkoutFailed",
    "sourceRu": "Не удалось оформить заказ.",
    "namespace": "ui",
    "surface": "storefront",
    "critical": true
  },
  {
    "key": "auth.forgot.sent",
    "sourceRu": "Если аккаунт существует, мы отправили ссылку для сброса пароля.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  },
  {
    "key": "auth.verify.resent",
    "sourceRu": "Письмо подтверждения отправлено.",
    "namespace": "ui",
    "surface": "auth",
    "critical": true
  }
];

export const UI_CATALOG = Object.freeze(
  RAW_CATALOG.map((entry) =>
    Object.freeze({
      key: entry.key,
      sourceRu: entry.sourceRu,
      namespace: entry.namespace,
      surface: entry.surface,
      critical: Boolean(entry.critical),
    })
  )
);

const CATALOG_LOOKUP = new Map(UI_CATALOG.map((entry) => [entry.key, entry]));

export const UI_CATALOG_BY_KEY = Object.freeze(
  Object.fromEntries(UI_CATALOG.map((entry) => [entry.key, entry]))
);

export const RU_DICTIONARY = Object.freeze(
  Object.fromEntries(UI_CATALOG.map((entry) => [entry.key, entry.sourceRu]))
);

export function getCatalogEntry(key) {
  return CATALOG_LOOKUP.get(key) || null;
}

export function hasCatalogKey(key) {
  return CATALOG_LOOKUP.has(key);
}
