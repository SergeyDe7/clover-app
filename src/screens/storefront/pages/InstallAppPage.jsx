import {
  cabinetLoginUrl,
  navigateToCabinetLogin,
} from "../../../config/urls.js";
import { storefrontHref } from "../mode.js";
import { navigateStorefront } from "../components/StoreHeader.jsx";
import { getCloverUiBuildShort } from "../../../shared/uiBuildLabel.js";

function Step({ n, title, children }) {
  return (
    <li className="sf-install-step">
      <span className="sf-install-step-num" aria-hidden="true">
        {n}
      </span>
      <div className="sf-install-step-body">
        <h3>{title}</h3>
        {children}
      </div>
    </li>
  );
}

function PlatformCard({ title, badge, children }) {
  return (
    <section className="sf-install-platform" aria-labelledby={`sf-install-${badge}`}>
      <div className="sf-install-platform-head">
        <h2 id={`sf-install-${badge}`}>{title}</h2>
        <span className="sf-install-badge">{badge}</span>
      </div>
      <ol className="sf-install-steps">{children}</ol>
    </section>
  );
}

export function InstallAppPage() {
  const uiBuildShort = getCloverUiBuildShort();
  return (
    <div className="sf-install-page">
      <header className="sf-section-head">
        <p className="sf-install-eyebrow">Мобильное приложение Clover</p>
        <h1>Как установить на телефон</h1>
        <p className="sf-muted sf-install-lead">
          Clover работает как PWA: не нужен App Store или Google Play. Добавьте сайт на
          экран — и откройте личный кабинет одним касанием.
        </p>
        <p className="sf-install-build-id" aria-label="Версия интерфейса">
          Версия: {uiBuildShort}
        </p>
      </header>

      <div className="sf-install-grid">
        <PlatformCard title="iPhone и iPad" badge="iOS">
          <Step n="1" title="Откройте Safari">
            <p>
              Перейдите на{" "}
              <a href="/" onClick={(e) => { e.preventDefault(); navigateStorefront("home"); }}>
                clover-spb.ru
              </a>{" "}
              в браузере Safari. В Chrome и других браузерах на iOS установка на экран
              недоступна.
            </p>
          </Step>
          <Step n="2" title="Нажмите «Поделиться»">
            <p>
              Внизу экрана нажмите кнопку с квадратом и стрелкой вверх (Поделиться).
            </p>
          </Step>
          <Step n="3" title="На экран «Домой»">
            <p>
              Пролистайте меню и выберите «На экран Домой» → «Добавить». Иконка Clover
              появится на рабочем столе.
            </p>
          </Step>
        </PlatformCard>

        <PlatformCard title="Android" badge="Android">
          <Step n="1" title="Откройте Chrome">
            <p>
              Зайдите на{" "}
              <a href="/" onClick={(e) => { e.preventDefault(); navigateStorefront("home"); }}>
                clover-spb.ru
              </a>{" "}
              в Google Chrome (желательно последняя версия из Play Store). Samsung Internet
              тоже подойдёт: меню → «Добавить на главный экран».
            </p>
          </Step>
          <Step n="2" title="Меню браузера">
            <p>
              Нажмите ⋮ в правом верхнем углу и выберите «Установить приложение»,
              «Добавить на главный экран» или «Установить сайт как приложение».
            </p>
          </Step>
          <Step n="3" title="Подтвердите установку">
            <p>Нажмите «Установить» или «Добавить» — ярлык Clover появится среди приложений.</p>
          </Step>
          <Step n="4" title="Если появилось «Google Play Защита»">
            <p>
              На Samsung и других телефонах при установке может всплыть окно «Подозрительное
              приложение заблокировано». Это <strong>не вирус</strong> — так Android проверяет
              сайты, установленные не из Play Store.
            </p>
            <p className="sf-install-step-gap">
              Нажмите <strong>«Подробнее»</strong> → <strong>«Всё равно установить»</strong>.
              Если видите только «OK» — обновите Chrome и повторите шаг 2.
            </p>
          </Step>
        </PlatformCard>

        <PlatformCard title="Компьютер" badge="Windows / macOS">
          <Step n="1" title="Chrome или Edge">
            <p>Откройте clover-spb.ru в Chrome, Edge или другом современном браузере.</p>
          </Step>
          <Step n="2" title="Значок установки">
            <p>
              В адресной строке справа появится значок «Установить» или «⊕». Нажмите его
              и подтвердите установку.
            </p>
          </Step>
          <Step n="3" title="Отдельное окно">
            <p>
              Clover откроется как отдельное приложение — удобно держать рядом с другими
              окнами.
            </p>
          </Step>
        </PlatformCard>
      </div>

      <aside className="sf-install-alert" role="note">
        <h2>Безопасность установки</h2>
        <p>
          Clover — это ваш личный кабинет на сайте <strong>clover-spb.ru</strong>, а не
          приложение из Google Play. Предупреждение Play Protect означает лишь то, что
          установка идёт через браузер. Официальный адрес — только clover-spb.ru; не
          ставьте копии с других сайтов.
        </p>
      </aside>

      <aside className="sf-install-note">
        <h2>После установки</h2>
        <p>
          Войдите в личный кабинет — заказы, матрица товаров и статусы доставки будут под
          рукой. Уведомления о заказах работают в установленном приложении. Первое открытие
          может занять несколько секунд — дальше приложение загружается быстрее.
        </p>
        <div className="sf-install-actions">
          <a
            className="sf-btn sf-btn-primary"
            href={cabinetLoginUrl("/")}
            onClick={navigateToCabinetLogin}
          >
            Войти в ЛК
          </a>
          <a
            className="sf-btn sf-btn-ghost"
            href={storefrontHref("home")}
            onClick={(e) => {
              e.preventDefault();
              navigateStorefront("home");
            }}
          >
            На главную
          </a>
        </div>
      </aside>
    </div>
  );
}
