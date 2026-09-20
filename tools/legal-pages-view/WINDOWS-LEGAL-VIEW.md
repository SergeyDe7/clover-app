# Windows — просмотр настоящих React-страниц (юридические)

Не полный Metrika smoke. Не `mc.yandex.ru`. Не live. Не commit/push/deploy/restart.
Не включать `VITE_YANDEX_METRIKA_ENABLED=1`. Заказы не отправлять.

**Статичные HTML в `pages/` не заменяют эту проверку.** Нужен isolated React preview текущего грязного дерева этой ветки (`agent/yandex-metrika-safe-init-on-main`).
`LEGAL_PAGES_BROWSER_PASS` со старого dirty candidate `yandex-metrika-safe-init` сюда не переносится.

## Пакет

Путь: `tools/legal-pages-view/`

- `WINDOWS-LEGAL-VIEW.md` — эта инструкция
- `Run-LegalPagesView.ps1` — launcher
- `run-legal-pages-view.mjs` — сборка Metrika OFF + сервер `127.0.0.1` + boot `/__legal-view`

Перенос candidate — тот же, что для Метрики, но **не** запускать `Run-MetrikaBrowserSmoke.ps1`:

```powershell
ssh clover "node /opt/clover/worktrees/yandex-metrika-safe-init/tools/metrika-browser-smoke-portable/pack-candidate.mjs"
```

Скопировать архив с Linux (`/tmp/clover-metrika-candidate-*/yandex-metrika-safe-init-candidate.tar.gz`) на Windows, распаковать, `npm ci` если нет `node_modules`.

## Запуск на Windows

```powershell
cd C:\путь\к\распакованному\yandex-metrika-safe-init
powershell -File .\tools\legal-pages-view\Run-LegalPagesView.ps1
```

Launcher соберёт UI **без** Метрики, поднимет isolated HTTP и откроет Chrome/Edge на `/__legal-view` в окнах **390** и **1280**.

Отчёт: `tools/legal-pages-view/LEGAL_PAGES_VIEW.json`.

## Что открыть

На boot-странице сначала «RU + корзина» или «AR + корзина», затем:

| Поверхность | RU | AR |
| --- | --- | --- |
| Политика | `/privacy-policy` | `/ar/privacy-policy` |
| Согласие | `/personal-data-consent` | `/ar/personal-data-consent` |
| Ссылка заказа | `/checkout` после RU-корзины | `/checkout` после AR-корзины (`dir=rtl`) |

Checkout без префикса `/ar/`. Пустая корзина ссылку не показывает — поэтому кнопка «корзина» на boot.

## Чеклист текста

1. Учётные документы: не менее пяти лет (402-ФЗ и подп. 8 п. 1 ст. 23 НК РФ). Нет «четырёх лет».
2. Остальные данные заказа, профиля и обращений отдельно; сроки учёта на них не распространяются автоматически.
3. Пять лет — минимальная сохранность учётных документов, не удаление ровно через пять лет.
4. Нет фразы «не независимая проверка дата-центра» на публичной странице.
5. Филанко / 7838492138 / Россия — только сайт и рабочая база.
6. 1С — программа Оператора, не получатель.
7. Метрика: отзыв / выключение флага не удаляет уже отправленные данные.
8. Ссылка заказа, не чекбокс. Нет overflow на 390.

Linux Chrome здесь нет: визуальный PASS/FAIL ставит Windows.
