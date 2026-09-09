import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Панель управления адресами доставки клиента.
import { useState } from "react";
import { makeId } from "../../shared/appHelpers";
import { appConfirm } from "../../shared/AppModal";

export function AddressesPanel({ addresses, onChange }) {
  const { t } = useLocalization();
  const empty = { label: "", address: "" };
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);

  const close = () => { setFormOpen(false); setEditingId(null); setForm(empty); };
  const save = (event) => {
    event.preventDefault();
    const label = form.label.trim();
    const address = form.address.trim();
    if (!label || !address) return;
    if (editingId) {
      onChange(addresses.map((item) => item.id === editingId ? { ...item, label, address } : item));
    } else {
      onChange([...addresses, { id: makeId("address"), label, address, isDefault: addresses.length === 0 }]);
    }
    close();
  };

  const remove = async (item) => {
    const ok = await appConfirm({
      title: t("shared.address.deleteNamed", { label: item.label }),
      message: t("client.theAddressWillDisappearFromThe"),
      confirmLabel: t("shared.action.delete"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    const next = addresses.filter((address) => address.id !== item.id);
    if (item.isDefault && next.length) next[0] = { ...next[0], isDefault: true };
    onChange(next);
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("checkout.delivery")}</p>
          <h2>{t("shared.myAddresses")}</h2>
          <p>{t("client.addSeveralLocationsAndPickOne")}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => { setForm(empty); setEditingId(null); setFormOpen(true); }}>{
          t("client.action.addAddress")
        }</button>
      </div>

      {addresses.length ? (
        <div className="address-list">
          {addresses.map((item) => (
            <article className="address-card" key={item.id}>
              <div>
                <div className="address-title"><h3>{item.label}</h3>{item.isDefault && <span className="badge green">{t("shared.address.primary")}</span>}</div>
                <p>{item.address}</p>
              </div>
              <div className="inline-actions">
                {!item.isDefault && <button className="secondary-button" type="button" onClick={() => onChange(addresses.map((address) => ({ ...address, isDefault: address.id === item.id })))}>{t("shared.makePrimary")}</button>}
                <button className="secondary-button" type="button" onClick={() => { setForm({ label: item.label, address: item.address }); setEditingId(item.id); setFormOpen(true); }}>{t("shared.action.edit")}</button>
                <button className="danger-button" type="button" onClick={() => remove(item)}>{t("shared.action.delete")}</button>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-box">{t("client.address.empty")}</div>}

      {formOpen && (
        <form className="address-edit-form" style={{ marginTop: 18 }} onSubmit={save}>
          <div className="form-grid">
            <label className="field">{
              t("client.locationName")
              }<input
                placeholder={t("shared.forExampleShopOnLeninStreet")}
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </label>
            <label className="field">{
              t("shared.fullAddress")
              }<textarea
                rows="3"
                placeholder={t("shared.cityStreetBuildingPremises")}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={close}>{t("shared.modal.cancel")}</button>
            <button className="primary-button" type="submit">{t("shared.saveAddress")}</button>
          </div>
        </form>
      )}
    </section>
  );
}
