import { useLocalization } from "../shared/i18n/LocalizationProvider";
import { errorDisplayMessage, isKnownErrorCode } from "../shared/i18n/errorDisplay.js";
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

function readPhoto(file, t) {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_PHOTO_TYPES.includes(file?.type)) {
      reject(new Error(t("shared.youCanAttachJpgPngOr")));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error(t("shared.maximumPhotoSizeIs12Mb")));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(Object.assign(new Error("Failed to read the photograph."), { code: "PHOTO_READ_FAILED" }));
    reader.onload = () => resolve({
      name: file.name || t("shared.productPhoto"),
      type: file.type,
      size: file.size,
      dataUrl: String(reader.result || ""),
    });
    reader.readAsDataURL(file);
  });
}

function CustomProductForm({ onAdd }) {
  const { t } = useLocalization();
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
      updateField("photo", await readPhoto(file, t));
    } catch (error) {
      setPhotoError(
        isKnownErrorCode(error?.code)
          ? errorDisplayMessage(error, t, "shared.error.photoAttachFailed")
          : error.message || t("shared.error.photoAttachFailed")
      );
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
        <span className="custom-product-label">{t("shared.canTFindTheProductYou")}</span>
        <h2>{t("shared.sendARequestToTheManager")}</h2>
        <p>{t("shared.enterTheNameQuantitySpecificationsAnd")}</p>
      </div>

      {!isOpen ? (
        <button className="open-custom-form" type="button" onClick={() => setIsOpen(true)}>{
          t("shared.addAMissingProduct")
        }</button>
      ) : (
        <form className="custom-product-form" onSubmit={handleSubmit}>
          <label>{
            t("shared.productName")
            }<input
              type="text"
              placeholder={t("shared.forExampleRedNapkins3333")}
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
            />
          </label>

          <div className="custom-product-row">
            <label>{
              t("shared.field.qty")
              }<input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.quantity}
                onChange={(event) => updateField("quantity", event.target.value)}
                required
              />
            </label>

            <label>{
              t("shared.field.unit")
              }<select value={form.unit} onChange={(event) => updateField("unit", event.target.value)}>
                <option value="шт.">шт.</option>
                <option value="пач.">пач.</option>
                <option value="уп.">уп.</option>
                <option value="кг">кг</option>
                <option value="л">л</option>
              </select>
            </label>
          </div>

          <label>{
            t("shared.brandOrSpecifications")
            }<textarea
              rows="3"
              placeholder={t("shared.colorSizeManufacturerOrAnotherDetail")}
              value={form.details}
              onChange={(event) => updateField("details", event.target.value)}
            />
          </label>

          <label>{
            t("shared.productPhotoOptional")
            }<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} />
          </label>
          {photoError && <div className="custom-photo-error">{photoError}</div>}
          {form.photo?.dataUrl && (
            <div className="custom-photo-preview">
              <img src={form.photo.dataUrl} alt={form.photo.name || t("shared.requestPhoto")} />
              <div>
                <strong>{form.photo.name}</strong>
                <button type="button" onClick={() => updateField("photo", null)}>{t("shared.deletePhoto")}</button>
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
            >{
              t("shared.modal.cancel")
            }</button>

            <button className="add-custom-product" type="submit">{t("checkout.addToOrder")}</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default CustomProductForm;
