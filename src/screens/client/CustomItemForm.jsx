// Форма запроса товара вне матрицы клиента + подготовка фотографии.
import { useState } from "react";
import { CustomRequestPhoto } from "../../shared/SharedPanels";
import { makeId } from "../../shared/appHelpers";

const CUSTOM_REQUEST_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const CUSTOM_REQUEST_PHOTO_MAX_SOURCE_BYTES = 12 * 1024 * 1024;

const CUSTOM_REQUEST_PHOTO_MAX_DIMENSION = 1600;

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function loadBrowserImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Файл не удалось распознать как фотографию."));
    image.onload = () => resolve(image);
    image.src = source;
  });
}

async function prepareCustomRequestPhoto(file) {
  if (!CUSTOM_REQUEST_PHOTO_TYPES.includes(file?.type)) {
    throw new Error("Можно прикрепить JPG, PNG или WEBP.");
  }
  if (file.size > CUSTOM_REQUEST_PHOTO_MAX_SOURCE_BYTES) {
    throw new Error("Фотография слишком большая. Максимальный исходный размер — 12 МБ.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadBrowserImage(source);
  const scale = Math.min(
    1,
    CUSTOM_REQUEST_PHOTO_MAX_DIMENSION / image.naturalWidth,
    CUSTOM_REQUEST_PHOTO_MAX_DIMENSION / image.naturalHeight
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не смог подготовить фотографию.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (dataUrl.length > 6 * 1024 * 1024) {
    throw new Error("После обработки фотография всё ещё слишком большая. Выберите снимок меньшего размера.");
  }

  return {
    name: file.name || "Фото товара.jpg",
    type: "image/jpeg",
    size: Math.round((dataUrl.length * 3) / 4),
    width,
    height,
    dataUrl,
  };
}

export function CustomItemForm({ onAdd }) {
  const initial = { name: "", quantity: "1", unit: "шт.", details: "", photo: null };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const resetForm = () => {
    setForm(initial);
    setPhotoBusy(false);
    setPhotoError("");
  };

  const selectPhoto = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setPhotoBusy(true);
    setPhotoError("");
    try {
      const photo = await prepareCustomRequestPhoto(file);
      setForm((current) => ({ ...current, photo }));
    } catch (error) {
      setPhotoError(error.message || "Не удалось прикрепить фотографию.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const quantity = Math.max(1, Number.parseInt(form.quantity, 10) || 1);
    if (!form.name.trim() || photoBusy) return;
    onAdd({
      id: makeId("custom"),
      name: form.name.trim(),
      quantity,
      unit: form.unit,
      details: form.details.trim(),
      photo: form.photo || null,
      requestStatus: "Новый запрос",
      unitPrice: 0,
      managerComment: "",
      matchedProductId: null,
      isCustom: true,
    });
    resetForm();
    setOpen(false);
  };

  return (
    <section className="custom-product-box">
      <span className="badge green">Не нашли нужный товар?</span>
      <h3>Добавьте запрос менеджеру</h3>
      <p className="muted small">Укажите название, количество и важные характеристики. При необходимости приложите фотографию.</p>
      {!open ? (
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ Добавить отсутствующий товар</button>
      ) : (
        <form className="custom-product-form" onSubmit={submit}>
          <label className="field">Название товара
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <div className="custom-row">
            <label className="field">Количество
              <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </label>
            <label className="field">Единица
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option>шт.</option><option>уп.</option><option>пач.</option><option>кг</option><option>л</option><option>рулон</option><option>кор.</option>
              </select>
            </label>
          </div>
          <label className="field">Марка или характеристики
            <textarea rows="3" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          </label>
          <label className="field request-photo-picker">Фото товара — необязательно
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photoBusy}
              onChange={selectPhoto}
            />
            <small>JPG, PNG или WEBP. Clover уменьшит фотографию перед сохранением.</small>
          </label>
          {photoBusy && <div className="request-photo-status">Подготавливаем фотографию…</div>}
          {photoError && <div className="request-photo-error">{photoError}</div>}
          {form.photo?.dataUrl && (
            <div className="request-photo-preview">
              <CustomRequestPhoto photo={form.photo} />
              <div>
                <strong>{form.photo.name}</strong>
                <small>{form.photo.width} × {form.photo.height} пикс.</small>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, photo: null }))}
                >
                  Удалить фото
                </button>
              </div>
            </div>
          )}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => { setOpen(false); resetForm(); }}>Отмена</button>
            <button className="primary-button" type="submit" disabled={photoBusy}>Добавить в заказ</button>
          </div>
        </form>
      )}
    </section>
  );
}
