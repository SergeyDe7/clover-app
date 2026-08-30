/** Injected last when matrix panel mounts — beats APP_STYLES / generic .product-card. */
export const MATRIX_STOREFRONT_CARD_STYLES = `
.clover-app.clover-app-client .page-content-client .client-matrix-panel .client-matrix-grid {
  align-items: stretch !important;
}
.clover-app.clover-app-client .page-content-client .client-matrix-panel .client-matrix-card,
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card {
  position: relative !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: auto minmax(0, 1fr) auto auto auto !important;
  grid-template-areas:
    "photo"
    "title"
    "code"
    "price"
    "actions" !important;
  height: 100% !important;
  align-self: stretch !important;
  min-width: 0 !important;
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 1px solid rgba(28, 31, 28, 0.08) !important;
  border-radius: 12px !important;
  background: #fff !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  box-shadow: none !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-card-top {
  position: absolute !important;
  top: 4px !important;
  left: 4px !important;
  right: 4px !important;
  z-index: 2 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: auto !important;
  height: 24px !important;
  min-height: 24px !important;
  max-height: 24px !important;
  margin: 0 !important;
  padding: 0 !important;
  grid-row: auto !important;
  grid-column: auto !important;
  grid-area: auto !important;
  pointer-events: none !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-card-top > * {
  pointer-events: auto !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-image-wrap {
  grid-area: photo !important;
  position: relative !important;
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  aspect-ratio: 1 / 1 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  overflow: hidden !important;
  background: #fff !important;
  box-sizing: border-box !important;
  flex: 0 0 auto !important;
  align-self: stretch !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-image,
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-image-placeholder {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  object-position: center !important;
  margin: 0 !important;
  padding: 4px !important;
  box-sizing: border-box !important;
  background: #fff !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card h2 {
  grid-area: title !important;
  align-self: start !important;
  margin: 6px 8px 0 !important;
  padding: 0 !important;
  font-size: 0.82rem !important;
  font-weight: 700 !important;
  line-height: 1.25 !important;
  color: #1c1f1c !important;
  min-height: 0 !important;
  max-height: none !important;
  height: auto !important;
  display: block !important;
  -webkit-line-clamp: unset !important;
  -webkit-box-orient: unset !important;
  overflow: visible !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
  flex: unset !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-code {
  grid-area: code !important;
  display: block !important;
  margin: 2px 8px 0 !important;
  padding: 0 !important;
  font-size: 0.72rem !important;
  line-height: 1.2 !important;
  color: #6b6f6b !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  min-width: 0 !important;
  max-width: calc(100% - 16px) !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-price {
  grid-area: price !important;
  display: block !important;
  margin: 4px 8px 0 !important;
  padding: 0 !important;
  font-size: 0.88rem !important;
  font-weight: 800 !important;
  line-height: 1.25 !important;
  color: #2f5f2f !important;
  min-height: calc(0.88rem * 1.25) !important;
  height: auto !important;
  max-height: none !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
  max-width: calc(100% - 16px) !important;
  align-self: start !important;
  flex: unset !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-card-controls {
  grid-area: actions !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  margin: 4px 8px 8px !important;
  padding: 0 !important;
  width: auto !important;
  max-width: calc(100% - 16px) !important;
  box-sizing: border-box !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .unit-choice,
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .unit-choice.unit-choice-single {
  display: grid !important;
  grid-auto-flow: column !important;
  grid-auto-columns: minmax(0, 1fr) !important;
  gap: 6px !important;
  width: 100% !important;
  height: auto !important;
  min-height: 34px !important;
  max-height: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  overflow: visible !important;
}
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .unit-choice button,
.clover-app.clover-app-client .client-matrix-panel .client-matrix-card .unit-choice.unit-choice-single button {
  width: 100% !important;
  min-width: 0 !important;
  min-height: 34px !important;
  height: 34px !important;
  max-height: 34px !important;
  padding: 6px 8px !important;
  border-radius: 8px !important;
  font-size: 0.84rem !important;
  font-weight: 700 !important;
  box-sizing: border-box !important;
}
@media (max-width: 900px) {
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card {
    border-radius: 14px !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card h2 {
    font-size: 0.78rem !important;
    line-height: 1.2 !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-code {
    font-size: 0.68rem !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-price {
    font-size: 0.82rem !important;
  }
}

/* Desktop ≥901: mobile composition, no crop, fewer cols if narrow */
@media (min-width: 901px) {
  .clover-app.clover-app-client .page-content-client .client-matrix-panel .client-matrix-grid,
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important;
    gap: 10px !important;
    align-items: stretch !important;
  }
  .clover-app.clover-app-client .page-content-client .client-matrix-panel .client-matrix-card,
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card {
    display: flex !important;
    flex-direction: column !important;
    grid-template-rows: none !important;
    grid-template-areas: none !important;
    height: 100% !important;
    overflow: visible !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-image-wrap {
    flex: 0 0 auto !important;
    grid-area: unset !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card h2 {
    flex: 0 1 auto !important;
    grid-area: unset !important;
    overflow: visible !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-code {
    flex: 0 0 auto !important;
    grid-area: unset !important;
    display: block !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-price {
    flex: 0 0 auto !important;
    grid-area: unset !important;
    color: #4F9A52 !important;
    overflow: visible !important;
    text-overflow: unset !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .product-card-controls {
    flex: 0 0 auto !important;
    margin-top: auto !important;
    grid-area: unset !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    padding: 0 8px 8px !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    overflow: visible !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .unit-choice,
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .unit-choice.unit-choice-single {
    overflow: visible !important;
    min-height: 34px !important;
    height: 34px !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .quantity-control {
    display: grid !important;
    grid-template-columns: 44px 1fr 44px !important;
    gap: 4px !important;
    height: 48px !important;
    min-height: 48px !important;
    max-height: 48px !important;
    width: 100% !important;
    overflow: visible !important;
  }
  .clover-app.clover-app-client .client-matrix-panel .client-matrix-card .quantity-control > button {
    width: 44px !important;
    min-width: 44px !important;
    max-width: 44px !important;
    height: 48px !important;
  }
}
`;
