import { useLocalization } from "../shared/i18n/LocalizationProvider";
import { useState } from "react";
import "./AddressManager.css";
import { appConfirm } from "../shared/AppModal";

const EMPTY_FORM = {
  label: "",
  address: "",
};

function AddressManager({ addresses, onChange }) {
  const { t } = useLocalization();
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
      title: t("shared.deleteTheAddress"),
      message: t("shared.address.deleteNamed", { label: addressToDelete.label }),
      confirmLabel: t("shared.action.delete"),
      cancelLabel: t("shared.modal.cancel"),
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
          <p className="small-title">{t("checkout.delivery")}</p>
          <h2>{t("shared.myAddresses")}</h2>
          <p>{
            t("shared.saveSeveralAddressesAndPickOne")
          }</p>
        </div>

        <button
          className="add-address-button"
          type="button"
          onClick={openAddForm}
        >{
          t("client.action.addAddress")
        }</button>
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
                    <span>{t("shared.address.primary")}</span>
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
                  >{
                    t("shared.makePrimary")
                  }</button>
                )}

                <button
                  type="button"
                  onClick={() => openEditForm(savedAddress)}
                >{
                  t("shared.action.edit")
                }</button>

                <button
                  className="delete-address-button"
                  type="button"
                  onClick={() => deleteAddress(savedAddress.id)}
                >{
                  t("shared.action.delete")
                }</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="address-empty">
          <p>{
            t("client.address.emptyHint")
          }</p>
        </div>
      )}

      {isFormOpen && (
        <form className="address-form" onSubmit={handleSubmit}>
          <h3>
            {editingId ? t("shared.editAddress") : t("shared.newAddress")}
          </h3>

          <label>{
            t("shared.field.name")
            }<input
              type="text"
              placeholder={t("shared.forExampleShopOnLeninStreet")}
              value={form.label}
              onChange={(event) =>
                updateField("label", event.target.value)
              }
              required
            />
          </label>

          <label>{
            t("shared.fullAddress")
            }<textarea
              rows="3"
              placeholder={t("shared.cityStreetBuildingPremises")}
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
            >{
              t("shared.modal.cancel")
            }</button>

            <button
              className="save-address-button"
              type="submit"
            >{
              t("shared.saveAddress")
            }</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default AddressManager;
