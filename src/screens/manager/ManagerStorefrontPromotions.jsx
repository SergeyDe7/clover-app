import { useState } from "react";
import { api } from "../../serverApi";
import { appAlert } from "../../shared/AppModal";
import {
  PROMO_STATUS_LABEL,
  STOREFRONT_MAX_PROMOTIONS,
  promotionStatus,
} from "../../shared/storefrontPromotions.js";

function newLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function emptyPromotion(sortOrder = 0) {
  return {
    id: newLocalId(),
    enabled: true,
    showOnHome: false,
    imageUrl: "",
    title: "",
    shortText: "",
    fullDescription: "",
    link: "",
    buttonText: "",
    startsAt: null,
    endsAt: null,
    sortOrder,
  };
}

export function clonePromotions(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item, index) => ({
    id: String(item?.id || newLocalId()),
    enabled: item?.enabled === true,
    showOnHome: item?.showOnHome === true,
    imageUrl: String(item?.imageUrl || ""),
    title: String(item?.title || ""),
    shortText: String(item?.shortText || ""),
    fullDescription: String(item?.fullDescription || ""),
    link: String(item?.link || ""),
    buttonText: String(item?.buttonText || ""),
    startsAt: item?.startsAt || null,
    endsAt: item?.endsAt || null,
    sortOrder: Number.isFinite(Number(item?.sortOrder))
      ? Number(item.sortOrder)
      : index,
  }));
}

export function promotionsKey(value) {
  return JSON.stringify(clonePromotions(value));
}

/**
 * Admin → Витрина → Акции (informational CMS only).
 */
export function ManagerStorefrontPromotions({
  promotions,
  onChange,
}) {
  const [promoBusy, setPromoBusy] = useState(false);
  const list = clonePromotions(promotions);

  function updateList(updater) {
    onChange(updater(clonePromotions(promotions)));
  }

  function patchPromo(id, patch) {
    updateList((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  return (
    <div className="manager-contact-settings" style={{ marginTop: 20 }}>
      <h3>Акции</h3>
      <p className="storefront-settings-hint">
        Информационный блок для витрины и страницы /aktsii. Не меняет цены,
        корзину, заказы и доставку. Просроченные акции остаются здесь, но скрыты
        на сайте.
      </p>

      <div className="storefront-promo-list">
        {list.map((promo) => {
          const status = promotionStatus(promo);
          return (
            <div key={promo.id} className="storefront-promo-row">
              <div className="storefront-promo-preview">
                {promo.imageUrl ? (
                  <img src={promo.imageUrl} alt="" loading="lazy" />
                ) : (
                  <div className="storefront-promo-preview-empty">Нет фото</div>
                )}
                <span className={`storefront-promo-status is-${status}`}>
                  {PROMO_STATUS_LABEL[status] || status}
                </span>
              </div>

              <div className="storefront-promo-fields">
                <label className="field field-wide">
                  Заголовок
                  <input
                    value={promo.title}
                    placeholder="Название акции"
                    onChange={(event) =>
                      patchPromo(promo.id, { title: event.target.value })
                    }
                  />
                </label>
                <label className="field field-wide">
                  Краткий текст
                  <input
                    value={promo.shortText}
                    placeholder="Короткое описание для списка и главной"
                    onChange={(event) =>
                      patchPromo(promo.id, { shortText: event.target.value })
                    }
                  />
                </label>
                <label className="field field-wide">
                  Полное описание
                  <textarea
                    rows={4}
                    value={promo.fullDescription}
                    placeholder="Подробный текст на странице акций"
                    onChange={(event) =>
                      patchPromo(promo.id, {
                        fullDescription: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    Ссылка
                    <input
                      value={promo.link}
                      placeholder="/catalog или https://…"
                      onChange={(event) =>
                        patchPromo(promo.id, { link: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Текст кнопки
                    <input
                      value={promo.buttonText}
                      placeholder="Подробнее"
                      onChange={(event) =>
                        patchPromo(promo.id, { buttonText: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Начало
                    <input
                      type="datetime-local"
                      value={toDatetimeLocalValue(promo.startsAt)}
                      onChange={(event) =>
                        patchPromo(promo.id, {
                          startsAt: fromDatetimeLocalValue(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Окончание
                    <input
                      type="datetime-local"
                      value={toDatetimeLocalValue(promo.endsAt)}
                      onChange={(event) =>
                        patchPromo(promo.id, {
                          endsAt: fromDatetimeLocalValue(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Порядок
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={promo.sortOrder}
                      onChange={(event) =>
                        patchPromo(promo.id, {
                          sortOrder:
                            event.target.value === ""
                              ? 0
                              : Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="storefront-promo-toggles">
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={promo.enabled === true}
                      onChange={(event) =>
                        patchPromo(promo.id, { enabled: event.target.checked })
                      }
                    />
                    Включена
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={promo.showOnHome === true}
                      onChange={(event) =>
                        patchPromo(promo.id, {
                          showOnHome: event.target.checked,
                        })
                      }
                    />
                    На главной
                  </label>
                </div>
              </div>

              <div className="storefront-promo-actions">
                <label className="secondary-button">
                  {promoBusy ? "Загрузка…" : "Картинка"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    disabled={promoBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setPromoBusy(true);
                      void api
                        .uploadStorefrontPromoImage(file)
                        .then((result) => {
                          const imageUrl = result.imageUrl || "";
                          if (!imageUrl) return;
                          patchPromo(promo.id, { imageUrl });
                        })
                        .catch((error) =>
                          appAlert({
                            title: "Не удалось загрузить картинку акции",
                            message: error.message || "Ошибка загрузки.",
                            tone: "danger",
                          })
                        )
                        .finally(() => setPromoBusy(false));
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => patchPromo(promo.id, { imageUrl: "" })}
                  disabled={!promo.imageUrl}
                >
                  Убрать фото
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    updateList((items) =>
                      items.filter((item) => item.id !== promo.id)
                    )
                  }
                >
                  Удалить
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="form-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="secondary-button"
          disabled={list.length >= STOREFRONT_MAX_PROMOTIONS}
          onClick={() =>
            updateList((items) => [
              ...items,
              emptyPromotion(items.length ? items[items.length - 1].sortOrder + 10 : 10),
            ])
          }
        >
          Создать акцию
        </button>
      </div>
    </div>
  );
}
