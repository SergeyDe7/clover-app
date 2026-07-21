import { useState } from "react";
import "./App.css";
import cloverLogo from "./assets/clover-logo.png";

function App() {
  const [isRegistration, setIsRegistration] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (isRegistration) {
      alert("Регистрация успешно заполнена!");
      setIsRegistration(false);
    } else {
      setIsLoggedIn(true);
    }
  };

  if (isLoggedIn) {
    return (
      <main className="dashboard-page">
        <header className="dashboard-header">
          <img
            className="dashboard-logo"
            src={cloverLogo}
            alt="Логотип Clover"
          />

          <div className="header-actions">
            <span>Здравствуйте, Клиент!</span>

            <button
              className="logout-button"
              type="button"
              onClick={() => setIsLoggedIn(false)}
            >
              Выйти
            </button>
          </div>
        </header>

        <section className="dashboard-content">
          <div className="welcome-block">
            <div>
              <p className="small-title">Личный кабинет</p>
              <h1>Ваши регулярные заказы</h1>
              <p>
                Создавайте, добавляйте, управляйте.
                                
              </p>
            </div>

            <button
              className="create-order-button"
              type="button"
              onClick={() =>
                alert("Следующим шагом создадим форму нового заказа")
              }
            >
              + Создать заказ
            </button>
          </div>

          <div className="dashboard-grid">
            <article className="dashboard-card next-order">
              <span className="card-icon">📦</span>
              <p>Ближайшая доставка</p>
              <h2>Заказов пока нет</h2>
              <span>Создайте первый заказ</span>
            </article>

            <article className="dashboard-card">
              <span className="card-icon">🔄</span>
              <p>Активные заказы</p>
              <h2>0</h2>
              <span>Регулярных заказов</span>
            </article>

            <article className="dashboard-card">
              <span className="card-icon">🧾</span>
              <p>История заказов</p>
              <h2>0</h2>
              <span>Выполненных доставок</span>
            </article>
          </div>

          <section className="orders-section">
            <div className="orders-heading">
              <div>
                <h2>Мои заказы</h2>
                <p>Здесь будут отображаться регулярные доставки</p>
              </div>
            </div>

            <div className="empty-orders">
              <div className="empty-icon">🌿</div>
              <h3>У вас ещё нет регулярных заказов</h3>
              <p>
                Создайте заказ и выберите, как часто его нужно повторять.
              </p>

              <button
                type="button"
                onClick={() =>
                  alert("Скоро здесь появится создание заказа")
                }
              >
                Создать первый заказ
              </button>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="login-card">
        <img className="logo" src={cloverLogo} alt="Логотип Clover" />

        <h1>
          {isRegistration ? "Создание аккаунта" : "Личный кабинет"}
        </h1>

        <p className="subtitle">
          {isRegistration
            ? "Зарегистрируйтесь для управления регулярными заказами"
            : "Управляйте регулярными заказами в одном месте"}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {isRegistration && (
            <>
              <label htmlFor="name">Имя</label>
              <input
                id="name"
                type="text"
                placeholder="Введите ваше имя"
                required
              />

              <label htmlFor="phone">Телефон</label>
              <input
                id="phone"
                type="tel"
                placeholder="+7 999 000-00-00"
                required
              />
            </>
          )}

          <label htmlFor="email">Электронная почта</label>
          <input
            id="email"
            type="email"
            placeholder="example@mail.ru"
            required
          />

          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            placeholder="Введите пароль"
            required
          />

          {isRegistration && (
            <>
              <label htmlFor="confirmPassword">
                Повторите пароль
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Повторите пароль"
                required
              />
            </>
          )}

          <button type="submit">
            {isRegistration ? "Зарегистрироваться" : "Войти"}
          </button>
        </form>

        {!isRegistration && (
          <button className="forgot-button" type="button">
            Забыли пароль?
          </button>
        )}

        <div className="registration">
          <span>
            {isRegistration
              ? "Уже зарегистрированы?"
              : "Ещё нет аккаунта?"}
          </span>

          <button
            type="button"
            onClick={() => setIsRegistration(!isRegistration)}
          >
            {isRegistration ? "Войти" : "Зарегистрироваться"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;