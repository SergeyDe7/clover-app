import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../../src/App.css";
import "../../../../src/styles/clover-theme.css";
import { APP_STYLES } from "../../../../src/shared/appHelpers.js";
import { getEarliestDeliveryDateIso } from "../../../../src/shared/deliveryDateRules.js";
import { OrderEditor } from "../../../../src/screens/client/OrderEditor.jsx";

const requestedCount = Math.max(
  1,
  Number(new URLSearchParams(window.location.search).get("count")) || 1
);

const addresses = Array.from({ length: requestedCount }, (_, index) => ({
  id: `address-${index + 1}`,
  label: index === 0 ? "Основной" : `Адрес ${index + 1}`,
  address: `Санкт-Петербург, тестовая улица, дом ${index + 1}`,
  isDefault: index === 0,
}));

window.__savedOrders = [];

function Harness() {
  const [favorites, setFavorites] = useState([]);
  return (
    <>
      <style>{APP_STYLES}</style>
      <OrderEditor
        session={{
          mode: "edit",
          order: {
            id: "fixture-order",
            status: "Новый",
            items: [],
            customItems: [
              {
                id: "custom-fixture",
                name: "Тестовая позиция",
                quantity: 1,
                unit: "шт",
                unitPrice: 100,
              },
            ],
            firstDeliveryDate: getEarliestDeliveryDateIso(),
            addressId: "",
            clientComment: "",
          },
        }}
        products={[]}
        addresses={addresses}
        favorites={favorites}
        setFavorites={setFavorites}
        settings={{
          enableDrafts: false,
          showPrices: false,
          deliveryZones: [],
          allowCustomItems: true,
        }}
        profile={{}}
        orders={[]}
        catalogPolicy={{ allowFullCatalog: false, matrixReady: true }}
        showFullCatalog={false}
        setShowFullCatalog={() => {}}
        onClose={() => {}}
        onOpenCatalogAdd={() => {}}
        onSave={async (payload) => {
          window.__savedOrders.push(payload);
        }}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
