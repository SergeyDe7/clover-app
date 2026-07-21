import { useMemo, useState } from "react";
import "./App.css";
import "./Catalog.css";
import cloverLogo from "./assets/clover-logo.png";

const PRODUCTS = [
  { id: 1, category: "Перчатки", name: "Перчатки нитриловые черные XL (100 шт.)" },
  { id: 2, category: "Упаковка", name: "Банка суповая 500 мл Перинт (50/400)" },
  { id: 3, category: "Пакеты и пленка", name: "Пакеты для мусора 240 л, 65 мкм, 100×140 (50 шт.)" },
  { id: 4, category: "Упаковка", name: "Крышка к банкам Перинт (50/800)" },
  { id: 5, category: "Перчатки", name: "Перчатки BEN FATTO нитриловые черные XL (100 шт.)" },
  { id: 6, category: "Пакеты и пленка", name: "Вакуумный пакет 300×400 мм, 70 мкм (100 шт.)" },
  { id: 7, category: "Пакеты и пленка", name: "Вакуумный пакет 200×300 мм, 60 мкм (100 шт.)" },
  { id: 8, category: "Упаковка", name: "Контейнер бумажный OneClick 800 крафт, дно (50/300)" },
  { id: 9, category: "Пакеты и пленка", name: "Вакуумный пакет 200×300 мм, 70 мкм (100 шт.)" },
  { id: 10, category: "Уборка", name: "Набор: щетка для пола и совок-ловушка с высокой ручкой" },
  { id: 11, category: "Перчатки", name: "Перчатки BEN FATTO нитриловые черные L (100 шт.)" },
  { id: 12, category: "Пакеты и пленка", name: "Вакуумный пакет 160×250 мм, 60 мкм (100 шт.)" },
  { id: 13, category: "Упаковка", name: "Бутылка прозрачная круглая с пробкой 500 мл (100 шт.)" },
  { id: 14, category: "Уборка", name: "МОП плоский 40×13 см, ухо-карман, арт. BF30562" },
  { id: 15, category: "Упаковка", name: "Крышка плоская к контейнеру OneClick 800 (50/300)" },
  { id: 16, category: "Уборка", name: "Пульверизатор ручной черный 500 мл" },
  { id: 17, category: "Уборка", name: "Швабра: рукоять 130 см + держатель мопов 40×11 см, арт. 636234" },
  { id: 18, category: "Упаковка", name: "Бутылка прозрачная с пробкой 2 л (48 шт.)" },
  { id: 19, category: "Пакеты и пленка", name: "Пергамент для выпечки силиконизированный 38 см × 50 м, крафт (15)" },
  { id: 20, category: "Одноразовая продукция", name: "Трубочки для коктейля толстые черные 8×240 мм (250 шт.)" },
  { id: 21, category: "Уборка", name: "Салфетка для стекол Эксперт 35×40 см HQ" },
  { id: 22, category: "Канцтовары", name: "Кассовая лента 80×12×80 (5/120)" },
  { id: 23, category: "Пакеты и пленка", name: "Пленка пищевая 250 м × 45 см (12)" },
  { id: 24, category: "Перчатки", name: "Перчатки KOMFI резиновые сверхпрочные красно-белые M (12/144)" },
  { id: 25, category: "Бытовая химия", name: "ХЕЛП — средство для мытья посуды 5 л (4)" },
  { id: 26, category: "Одноразовая продукция", name: "Трубочки для мартини черные 5×125 мм (400 шт.)" },
  { id: 27, category: "Одноразовая продукция", name: "Трубочки для коктейля с изгибом 5×210 мм, черные (250 шт.)" },
  { id: 28, category: "Канцтовары", name: "Кассовая лента 57×12×27 (6/210)" },
  { id: 29, category: "Уборка", name: "Щетка-сметка бытовая 6-рядная 240×40 мм" },
  { id: 30, category: "Канцтовары", name: "Бумага А4 (5)" },
  { id: 31, category: "Пакеты и пленка", name: "Пакеты для мусора 60 л (50 шт.) ПОЛИЭС (25)" },
  { id: 32, category: "Бытовая химия", name: "Санокс 750 мл (15)" },
  { id: 33, category: "Уборка", name: "Губка для посуды металлическая (3 шт.) (32)" },
  { id: 34, category: "Уборка", name: "Ведро хозяйственное 10 л" },
  { id: 35, category: "Канцтовары", name: "Ручка шариковая синяя STAFF (12)" },
  { id: 36, category: "Канцтовары", name: "Степлер № 24/6" },
  { id: 37, category: "Уборка", name: "Пипидастр" },
  { id: 38, category: "Канцтовары", name: "Ножницы Workmate 188 мм, пластиковые прорезиненные черные ручки" },
  { id: 39, category: "Бытовая химия", name: "Белизна, 1 л (15)" },
  { id: 40, category: "Уборка", name: "Губка «Мега» для посуды КонтинентПак (5 шт.)" },
  { id: 41, category: "Текстиль", name: "Вафельное полотно 45 см × 60 м, 140 г/м² (5)" },
  { id: 42, category: "Текстиль", name: "Вафельное полотно 40 см × 50 м, 110 г/м²" },
];


function App() {
  const [isRegistration, setIsRegistration] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Все");
  const [cart, setCart] = useState({});
  const [firstDeliveryDate, setFirstDeliveryDate] = useState("");
  const [address, setAddress] = useState("");
  const [savedOrder, setSavedOrder] = useState(null);

  const categories = useMemo(
    () => ["Все", ...new Set(PRODUCTS.map((product) => product.category))],
    []
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return PRODUCTS.filter((product) => {
      const matchesCategory =
        selectedCategory === "Все" || product.category === selectedCategory;
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory]);

  const selectedItems = useMemo(
    () =>
      PRODUCTS.filter((product) => cart[product.id] > 0).map((product) => ({
        ...product,
        quantity: cart[product.id],
      })),
    [cart]
  );

  const totalUnits = selectedItems.reduce(
    (sum, product) => sum + product.quantity,
    0
  );

  const handleSubmit = (event) => {
    event.preventDefault();

    if (isRegistration) {
      alert("Регистрация заполнена. Позже подключим базу пользователей.");
      setIsRegistration(false);
      return;
    }

    setIsLoggedIn(true);
  };

  const changeQuantity = (productId, change) => {
    setCart((currentCart) => {
      const nextQuantity = Math.max(
        0,
        (currentCart[productId] || 0) + change
      );
      const nextCart = { ...currentCart };

      if (nextQuantity === 0) {
        delete nextCart[productId];
      } else {
        nextCart[productId] = nextQuantity;
      }

      return nextCart;
    });
  };

  const handleSaveOrder = (event) => {
    event.preventDefault();

    if (selectedItems.length === 0) {
      alert("Добавьте хотя бы один товар.");
      return;
    }

    if (!firstDeliveryDate || !address.trim()) {
      alert("Укажите дату первой доставки и адрес.");
      return;
    }

    setSavedOrder({
      items: selectedItems,
      firstDeliveryDate,
      address: address.trim(),
    });
    setIsCatalogOpen(false);
  };

  const openNewOrder = () => {
    setSearch("");
    setSelectedCategory("Все");
    setIsCatalogOpen(true);
  };

  if (isLoggedIn && isCatalogOpen) {
    return (
      <main className="catalog-page">
        <header className="dashboard-header">
          <img
            className="dashboard-logo"
            src={cloverLogo}
            alt="Логотип Clover"
          />

          <button
            className="catalog-back-button"
            type="button"
            onClick={() => setIsCatalogOpen(false)}
          >
            ← Вернуться в кабинет
          </button>
        </header>

        <section className="catalog-content">
          <div className="catalog-title-row">
            <div>
              <p className="small-title">Новый заказ</p>
              <h1>Выберите товары</h1>
              <p>
                Добавляйте любые позиции поштучно. Цены будут внесены позже.
              </p>
            </div>

            <div className="catalog-counter">
              Выбрано: <strong>{totalUnits}</strong>
            </div>
          </div>

          <div className="catalog-toolbar">
            <input
              className="catalog-search"
              type="search"
              placeholder="Поиск по названию товара"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="category-list">
              {categories.map((category) => (
                <button
                  className={
                    selectedCategory === category
                      ? "category-button active"
                      : "category-button"
                  }
                  type="button"
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="catalog-layout">
            <section className="product-grid">
              {filteredProducts.map((product) => {
                const quantity = cart[product.id] || 0;

                return (
                  <article className="product-card" key={product.id}>
                    <span className="product-category">
                      {product.category}
                    </span>
                    <h2>{product.name}</h2>
                    <p className="product-price">Цена уточняется</p>

                    <div className="quantity-control">
                      <button
                        type="button"
                        aria-label={`Уменьшить количество ${product.name}`}
                        onClick={() => changeQuantity(product.id, -1)}
                        disabled={quantity === 0}
                      >
                        −
                      </button>

                      <span>{quantity}</span>

                      <button
                        type="button"
                        aria-label={`Увеличить количество ${product.name}`}
                        onClick={() => changeQuantity(product.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </article>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="catalog-empty">
                  Товары по вашему запросу не найдены.
                </div>
              )}
            </section>

            <form className="order-summary" onSubmit={handleSaveOrder}>
              <h2>Ваш заказ</h2>

              {selectedItems.length === 0 ? (
                <p className="summary-empty">
                  Пока ничего не выбрано. Нажмите «+» на карточке товара.
                </p>
              ) : (
                <div className="summary-items">
                  {selectedItems.map((product) => (
                    <div className="summary-item" key={product.id}>
                      <span>{product.name}</span>
                      <strong>{product.quantity} шт.</strong>
                    </div>
                  ))}
                </div>
              )}

              <label htmlFor="firstDeliveryDate">
                Дата первой доставки
              </label>
              <input
                id="firstDeliveryDate"
                type="date"
                value={firstDeliveryDate}
                onChange={(event) =>
                  setFirstDeliveryDate(event.target.value)
                }
                required
              />

              <label htmlFor="address">Адрес доставки</label>
              <textarea
                id="address"
                rows="3"
                placeholder="Город, улица, дом, помещение"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                required
              />

              <div className="summary-total">
                <span>Всего единиц</span>
                <strong>{totalUnits}</strong>
              </div>

              <p className="price-note">
                Стоимость заказа появится после добавления цен.
              </p>

              <button className="save-order-button" type="submit">
                Сохранить заказ
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

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
            <span>Здравствуйте, клиент!</span>

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
              <h1>Ваши заказы</h1>
              <p>Создавайте, добавляйте, управляйте.</p>
            </div>

            <button
              className="create-order-button"
              type="button"
              onClick={openNewOrder}
            >
              + Создать заказ
            </button>
          </div>

          <div className="dashboard-grid">
            <article className="dashboard-card next-order">
              <span className="card-icon">📦</span>
              <p>Ближайшая доставка</p>
              <h2>
                {savedOrder
                  ? savedOrder.firstDeliveryDate
                  : "Заказов пока нет"}
              </h2>
              <span>
                {savedOrder
                  ? `${savedOrder.items.length} товарных позиций`
                  : "Создайте первый заказ"}
              </span>
            </article>

            <article className="dashboard-card">
              <span className="card-icon">🔄</span>
              <p>Активные заказы</p>
              <h2>{savedOrder ? 1 : 0}</h2>
              <span>Активных заказов</span>
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
                <p>Здесь отображаются ваши заказы</p>
              </div>
            </div>

            {savedOrder ? (
              <article className="saved-order-card">
                <div>
                  <span className="saved-order-label">Активный заказ</span>
                  <h3>{savedOrder.items.length} товарных позиций</h3>
                  <p>
                    Первая доставка: {savedOrder.firstDeliveryDate}
                  </p>
                  <p>{savedOrder.address}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCatalogOpen(true)}
                >
                  Изменить
                </button>
              </article>
            ) : (
              <div className="empty-orders">
                <div className="empty-icon">🌿</div>
                <h3>У вас ещё нет заказов</h3>
                <p>
                  Создайте свой первый заказ.
                </p>

                <button type="button" onClick={openNewOrder}>
                  Создать первый заказ
                </button>
              </div>
            )}
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
            ? "Зарегистрируйтесь для управления заказами"
            : "Управляйте заказами в одном месте"}
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
              <label htmlFor="confirmPassword">Повторите пароль</label>
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
