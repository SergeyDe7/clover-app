import { useState } from "react";
import "./CustomProductForm.css";

const INITIAL_FORM = {
  name: "",
  quantity: "1",
  unit: "шт.",
  details: "",
};

function CustomProductForm({ onAdd }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const quantity = Number.parseInt(form.quantity, 10);

    if (!form.name.trim() || Number.isNaN(quantity) || quantity < 1) {
      return;
    }

    onAdd({
      name: form.name.trim(),
      quantity,
      unit: form.unit,
      details: form.details.trim(),
    });

    setForm(INITIAL_FORM);
    setIsOpen(false);
  };

  return (
    <section className="custom-product-card">
      <div>
        <span className="custom-product-label">
          Не нашли нужный товар?
        </span>
        <h2>Добавьте запрос менеджеру</h2>
        <p>
          Укажите название, количество и важные характеристики.
        </p>
      </div>

      {!isOpen ? (
        <button
          className="open-custom-form"
          type="button"
          onClick={() => setIsOpen(true)}
        >
          + Добавить отсутствующий товар
        </button>
      ) : (
        <form className="custom-product-form" onSubmit={handleSubmit}>
          <label>
            Название товара
            <input
              type="text"
              placeholder="Например: салфетки красные 33 × 33 см"
              value={form.name}
              onChange={(event) =>
                updateField("name", event.target.value)
              }
              required
            />
          </label>

          <div className="custom-product-row">
            <label>
              Количество
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.quantity}
                onChange={(event) =>
                  updateField("quantity", event.target.value)
                }
                required
              />
            </label>

            <label>
              Единица
              <select
                value={form.unit}
                onChange={(event) =>
                  updateField("unit", event.target.value)
                }
              >
                <option value="шт.">шт.</option>
                <option value="уп.">уп.</option>
                <option value="пач.">пач.</option>
                <option value="кг">кг</option>
                <option value="л">л</option>
              </select>
            </label>
          </div>

          <label>
            Марка или характеристики
            <textarea
              rows="3"
              placeholder="Цвет, размер, производитель или другое уточнение"
              value={form.details}
              onChange={(event) =>
                updateField("details", event.target.value)
              }
            />
          </label>

          <div className="custom-product-actions">
            <button
              className="cancel-custom-form"
              type="button"
              onClick={() => {
                setForm(INITIAL_FORM);
                setIsOpen(false);
              }}
            >
              Отмена
            </button>

            <button className="add-custom-product" type="submit">
              Добавить в заказ
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default CustomProductForm;
