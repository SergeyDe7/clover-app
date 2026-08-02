// Shared UX: empty states, soft banners, list skeletons.

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  tone = "info",
}) {
  return (
    <div className={`ux-empty ux-empty-${tone}`} role="status">
      <div className="ux-empty-mark" aria-hidden="true" />
      <strong className="ux-empty-title">{title}</strong>
      {message ? <p className="ux-empty-message">{message}</p> : null}
      {actionLabel && typeof onAction === "function" ? (
        <button className="primary-button ux-empty-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SoftBanner({
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
  tone = "info",
}) {
  const safeTone = ["info", "warn", "danger", "success"].includes(tone) ? tone : "info";
  return (
    <div className={`ux-banner ux-banner-${safeTone}`} role="status">
      <div className="ux-banner-body">
        {title ? <strong className="ux-banner-title">{title}</strong> : null}
        {message ? <p className="ux-banner-message">{message}</p> : null}
      </div>
      <div className="ux-banner-actions">
        {actionLabel && typeof onAction === "function" ? (
          <button className="secondary-button ux-banner-action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
        {typeof onDismiss === "function" ? (
          <button
            className="ux-banner-dismiss"
            type="button"
            aria-label="Скрыть"
            onClick={onDismiss}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonRow({ variant }) {
  if (variant === "catalog") {
    return (
      <div className="ux-skeleton-row ux-skeleton-catalog" aria-hidden="true">
        <div className="ux-skeleton-block ux-skeleton-thumb" />
        <div className="ux-skeleton-lines">
          <div className="ux-skeleton-block ux-skeleton-line" />
          <div className="ux-skeleton-block ux-skeleton-line short" />
          <div className="ux-skeleton-block ux-skeleton-line mid" />
        </div>
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className="ux-skeleton-row ux-skeleton-card" aria-hidden="true">
        <div className="ux-skeleton-block ux-skeleton-line" />
        <div className="ux-skeleton-block ux-skeleton-line mid" />
        <div className="ux-skeleton-block ux-skeleton-line short" />
      </div>
    );
  }

  // orders (default)
  return (
    <div className="ux-skeleton-row ux-skeleton-order" aria-hidden="true">
      <div className="ux-skeleton-block ux-skeleton-badge" />
      <div className="ux-skeleton-lines">
        <div className="ux-skeleton-block ux-skeleton-line" />
        <div className="ux-skeleton-block ux-skeleton-line mid" />
        <div className="ux-skeleton-block ux-skeleton-line short" />
      </div>
      <div className="ux-skeleton-block ux-skeleton-amount" />
    </div>
  );
}

export function ListSkeleton({ rows = 4, variant = "orders" }) {
  const count = Math.max(1, Math.min(12, Number(rows) || 4));
  const safeVariant = ["orders", "catalog", "cards"].includes(variant) ? variant : "orders";
  return (
    <div className={`ux-skeleton ux-skeleton-${safeVariant}`} aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} variant={safeVariant} />
      ))}
    </div>
  );
}
