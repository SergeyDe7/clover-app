import { useState } from "react";
import "./AddressManager.css";
import { appConfirm } from "../shared/AppModal";

const EMPTY_FORM = {
  label: "",
  address: "",
};

function AddressManager({ addresses, onChange }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const openAddForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (savedAddress) => {
    setEditingId(savedAddress.id);
    setForm({
      label: savedAddress.label,
      address: savedAddress.address,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(false);
  };

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const label = form.label.trim();
    const address = form.address.trim();

    if (!label || !address) {
      return;
    }

    if (editingId) {
      onChange(
        addresses.map((item) =>
          item.id === editingId
            ? {
                ...item,
                label,
                address,
              }
            : item
        )
      );
    } else {
      const newAddress = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `address-${Date.now()}`,
        label,
        address,
        isDefault: addresses.length === 0,
      };

      onChange([...addresses, newAddress]);
    }

    closeForm();
  };

  const setDefaultAddress = (addressId) => {
    onChange(
      addresses.map((item) => ({
        ...item,
        isDefault: item.id === addressId,
      }))
    );
  };

  const deleteAddress = async (addressId) => {
    const addressToDelete = addresses.find(
      (item) => item.id === addressId
    );

    if (!addressToDelete) {
      return;
    }

    const shouldDelete = await appConfirm({
      title: "Удалить адрес?",
      message: `Удалить адрес «${addressToDelete.label}»?`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
    });

    if (!shouldDelete) {
      return;
    }

    const remainingAddresses = addresses.filter(
      (item) => item.id !== addressId
    );

    if (
      addressToDelete.isDefault &&
      remainingAddresses.length > 0
    ) {
      remainingAddresses[0] = {
        ...remainingAddresses[0],
        isDefault: true,
      };
    }

    onChange(remainingAddresses);
  };

  return (
    <section className="address-manager">
      <div className="address-manager-heading">
        <div>
          <p className="small-title">Доставка</p>
          <h2>Мои адреса</h2>
          <p>
            Сохраните несколько адресов и выбирайте нужный при заказе.
          </p>
        </div>

        <button
          className="add-address-button"
          type="button"
          onClick={openAddForm}
        >
          + Добавить адрес
        </button>
      </div>

      {addresses.length > 0 ? (
        <div className="address-list">
          {addresses.map((savedAddress) => (
            <article
              className="address-card"
              key={savedAddress.id}
            >
              <div>
                <div className="address-card-title">
                  <h3>{savedAddress.label}</h3>

                  {savedAddress.isDefault && (
                    <span>Основной</span>
                  )}
                </div>

                <p>{savedAddress.address}</p>
              </div>

              <div className="address-card-actions">
                {!savedAddress.isDefault && (
                  <button
                    type="button"
                    onClick={() =>
                      setDefaultAddress(savedAddress.id)
                    }
                  >
                    Сделать основным
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openEditForm(savedAddress)}
                >
                  Изменить
                </button>

                <button
                  className="delete-address-button"
                  type="button"
                  onClick={() => deleteAddress(savedAddress.id)}
                >
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="address-empty">
          <p>
            Адресов пока нет. Добавьте адрес перед созданием заказа.
          </p>
        </div>
      )}

      {isFormOpen && (
        <form className="address-form" onSubmit={handleSubmit}>
          <h3>
            {editingId ? "Изменить адрес" : "Новый адрес"}
          </h3>

          <label>
            Название
            <input
              type="text"
              placeholder="Например: Магазин на Ленина"
              value={form.label}
              onChange={(event) =>
                updateField("label", event.target.value)
              }
              required
            />
          </label>

          <label>
            Полный адрес
            <textarea
              rows="3"
              placeholder="Город, улица, дом, помещение"
              value={form.address}
              onChange={(event) =>
                updateField("address", event.target.value)
              }
              required
            />
          </label>

          <div className="address-form-actions">
            <button
              className="cancel-address-button"
              type="button"
              onClick={closeForm}
            >
              Отмена
            </button>

            <button
              className="save-address-button"
              type="submit"
            >
              Сохранить адрес
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default AddressManager;
