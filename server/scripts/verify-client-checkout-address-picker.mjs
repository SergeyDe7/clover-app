import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const orderEditorPath = fileURLToPath(
  new URL("../../src/screens/client/OrderEditor.jsx", import.meta.url)
);
const stylesPath = fileURLToPath(
  new URL("../../src/styles/clover-theme.css", import.meta.url)
);

const [orderEditor, styles] = await Promise.all([
  readFile(orderEditorPath, "utf8"),
  readFile(stylesPath, "utf8"),
]);

assert.match(
  orderEditor,
  /const \[addressPickerOpen, setAddressPickerOpen\] = useState\(false\)/,
  "checkout must track the address picker dialog state"
);
assert.match(
  orderEditor,
  /if \(addresses\.length > 1\) \{\s*setAddressPickerOpen\(true\);\s*return;\s*\}/s,
  "submitting with multiple unselected addresses must open the address picker"
);
assert.match(
  orderEditor,
  /className="address-picker-list"[\s\S]*addresses\.map\(\(item, index\) =>/,
  "the dialog must render every saved address"
);
assert.match(
  orderEditor,
  /onClick=\{\(\) => selectCheckoutAddress\(item\.id\)\}/,
  "choosing an address must use the explicit checkout selection handler"
);
assert.match(
  orderEditor,
  /aria-pressed=\{item\.id === addressId\}/,
  "the selected address must be exposed to assistive technology"
);
assert.match(
  orderEditor,
  /\.cart-sheet-scroll, \.address-picker-list, \.delivery-date-sheet-panel/,
  "mobile touch handling must recognize the address list as its scroll root"
);
assert.match(
  orderEditor,
  /const handleAddressPickerKeyDown = \(event\) => \{[\s\S]*event\.key === "Escape"[\s\S]*event\.key !== "Tab"/,
  "the address dialog must close on Escape and trap Tab navigation"
);
assert.match(
  orderEditor,
  /if \(list\.length === 1\) \{\s*return list\[0\]\.id;\s*\}/s,
  "a single saved address must remain auto-selected"
);
assert.match(
  styles,
  /\.address-picker-option\s*\{/,
  "the address choices must have dedicated responsive styling"
);
assert.match(
  styles,
  /\.address-picker-list\s*\{[\s\S]*touch-action: pan-y !important;/,
  "the mobile address list must permit vertical touch scrolling"
);

console.log("Client checkout address picker verification passed.");
