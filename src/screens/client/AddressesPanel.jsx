// Панель управления адресами доставки клиента.
import { useState } from "react";
import { makeId } from "../../shared/appHelpers";
import { appConfirm } from "../../shared/AppModal";

export function AddressesPanel({ addresses, onChange }) {
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
      title: `Удалить адрес «${item.label}»?`,
      message: "Адрес пропадёт из списка. При оформлении заказа его выбрать будет нельзя.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
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
          <p className="eyebrow">Доставка</p>
          <h2>Мои адреса</h2>
          <p>Добавьте несколько точек и выбирайте нужную при оформлении заказа.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => { setForm(empty); setEditingId(null); setFormOpen(true); }}>
          + Добавить адрес
        </button>
      </div>

      {addresses.length ? (
        <div className="address-list">
          {addresses.map((item) => (
            <article className="address-card" key={item.id}>
              <div>
                <div className="address-title"><h3>{item.label}</h3>{item.isDefault && <span className="badge green">Основной</span>}</div>
                <p>{item.address}</p>
              </div>
              <div className="inline-actions">
                {!item.isDefault && <button className="secondary-button" type="button" onClick={() => onChange(addresses.map((address) => ({ ...address, isDefault: address.id === item.id })))}>Сделать основным</button>}
                <button className="secondary-button" type="button" onClick={() => { setForm({ label: item.label, address: item.address }); setEditingId(item.id); setFormOpen(true); }}>Изменить</button>
                <button className="danger-button" type="button" onClick={() => remove(item)}>Удалить</button>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-box">Адресов пока нет.</div>}

      {formOpen && (
        <form className="address-edit-form" style={{ marginTop: 18 }} onSubmit={save}>
          <div className="form-grid">
            <label className="field">
              Название точки
              <input
                placeholder="Например: Магазин на Ленина"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </label>
            <label className="field">
              Полный адрес
              <textarea
                rows="3"
                placeholder="Город, улица, дом, помещение"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={close}>Отмена</button>
            <button className="primary-button" type="submit">Сохранить адрес</button>
          </div>
        </form>
      )}
    </section>
  );
}
