import { useState } from "react";
import "./CustomProductForm.css";

const INITIAL_FORM = {
  name: "",
  quantity: "1",
  unit: "шт.",
  details: "",
  photo: null,
};

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_PHOTO_TYPES.includes(file?.type)) {
      reject(new Error("Можно прикрепить JPG, PNG или WEBP."));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("Максимальный размер фотографии — 12 МБ."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию."));
    reader.onload = () => resolve({
      name: file.name || "Фото товара",
      type: file.type,
      size: file.size,
      dataUrl: String(reader.result || ""),
    });
    reader.readAsDataURL(file);
  });
}

function CustomProductForm({ onAdd }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [photoError, setPhotoError] = useState("");

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handlePhoto = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setPhotoError("");
    try {
      updateField("photo", await readPhoto(file));
    } catch (error) {
      setPhotoError(error.message || "Не удалось прикрепить фотографию.");
    }
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
      photo: form.photo || null,
    });

    setForm(INITIAL_FORM);
    setPhotoError("");
    setIsOpen(false);
  };

  return (
    <section className="custom-product-card">
      <div>
        <span className="custom-product-label">Не нашли нужный товар?</span>
        <h2>Добавьте запрос менеджеру</h2>
        <p>Укажите название, количество, характеристики и при необходимости приложите фото.</p>
      </div>

      {!isOpen ? (
        <button className="open-custom-form" type="button" onClick={() => setIsOpen(true)}>
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
              onChange={(event) => updateField("name", event.target.value)}
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
                onChange={(event) => updateField("quantity", event.target.value)}
                required
              />
            </label>

            <label>
              Единица
              <select value={form.unit} onChange={(event) => updateField("unit", event.target.value)}>
                <option value="шт.">шт.</option>
                <option value="пач.">пач.</option>
                <option value="уп.">уп.</option>
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
              onChange={(event) => updateField("details", event.target.value)}
            />
          </label>

          <label>
            Фото товара — необязательно
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} />
          </label>
          {photoError && <div className="custom-photo-error">{photoError}</div>}
          {form.photo?.dataUrl && (
            <div className="custom-photo-preview">
              <img src={form.photo.dataUrl} alt={form.photo.name || "Фото запроса"} />
              <div>
                <strong>{form.photo.name}</strong>
                <button type="button" onClick={() => updateField("photo", null)}>Удалить фото</button>
              </div>
            </div>
          )}

          <div className="custom-product-actions">
            <button
              className="cancel-custom-form"
              type="button"
              onClick={() => {
                setForm(INITIAL_FORM);
                setPhotoError("");
                setIsOpen(false);
              }}
            >
              Отмена
            </button>

            <button className="add-custom-product" type="submit">Добавить в заказ</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default CustomProductForm;
