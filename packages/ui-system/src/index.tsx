import type {
  CSSProperties,
  PropsWithChildren,
  ReactNode,
} from "react";
import type {
  CommandCenterNavItem,
  CommandCenterSection,
  StatusBadgeTone,
} from "@sejfa/shared-types";
import "./styles.css";

type SurfaceTone = "neutral" | "active" | "warning" | "failed" | "positive";

interface ClassNameProps {
  className?: string;
  style?: CSSProperties;
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AppShell({
  nav,
  topbar,
  children,
  className,
}: PropsWithChildren<{
  nav: ReactNode;
  topbar: ReactNode;
  className?: string;
}>) {
  return (
    <div className={joinClasses("sejfa-shell", className)}>
      <aside className="sejfa-shell__nav">{nav}</aside>
      <div className="sejfa-shell__workspace">
        <div className="sejfa-shell__topbar">{topbar}</div>
        <main className="sejfa-shell__content">{children}</main>
      </div>
    </div>
  );
}

export function NavRail({
  productName,
  productLabel,
  items,
  activeSection,
  onSelect,
  footer,
}: {
  productName: string;
  productLabel?: string;
  items: CommandCenterNavItem[];
  activeSection: CommandCenterSection;
  onSelect: (section: CommandCenterSection) => void;
  footer?: ReactNode;
}) {
  return (
    <div className="sejfa-nav">
      <div className="sejfa-nav__brand">
        {productLabel ? <span>{productLabel}</span> : null}
        <strong>{productName}</strong>
      </div>

      <nav className="sejfa-nav__menu" aria-label={`${productName} navigation`}>
        {items.map((item) => {
          const isActive = item.section === activeSection;
          return (
            <button
              key={item.section}
              type="button"
              className={joinClasses(
                "sejfa-nav__item",
                isActive && "is-active",
              )}
              onClick={() => onSelect(item.section)}
            >
              <span>{item.label}</span>
              {item.badge !== undefined ? (
                <span
                  className={joinClasses(
                    "sejfa-nav__badge",
                    item.tone && `is-${item.tone}`,
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {footer ? <div className="sejfa-nav__footer">{footer}</div> : null}
    </div>
  );
}

export function TopStatusBar({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="sejfa-topbar">
      <div className="sejfa-topbar__titleGroup">
        <h1>{title}</h1>
        {subtitle ? <div className="sejfa-topbar__subtitle">{subtitle}</div> : null}
      </div>
      <div className="sejfa-topbar__actions">
        {children}
        {actions}
      </div>
    </div>
  );
}

export function Panel({
  children,
  className,
  tone = "neutral",
  style,
}: PropsWithChildren<
  ClassNameProps & {
    tone?: SurfaceTone;
  }
>) {
  return (
    <section
      className={joinClasses("sejfa-panel", `is-${tone}`, className)}
      style={style}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  detail,
  meta,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="sejfa-panelHeader">
      <div>
        {eyebrow ? <div className="sejfa-panelHeader__eyebrow">{eyebrow}</div> : null}
        <h2>{title}</h2>
        {detail ? <div className="sejfa-panelHeader__detail">{detail}</div> : null}
      </div>
      {meta ? <div className="sejfa-panelHeader__meta">{meta}</div> : null}
    </div>
  );
}

export function StatusBadge({
  label,
  tone = "idle",
}: {
  label: string;
  tone?: StatusBadgeTone;
}) {
  return (
    <span className={joinClasses("sejfa-statusBadge", `is-${tone}`)}>
      <span className="sejfa-statusBadge__dot" />
      {label}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  tone = "idle",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: StatusBadgeTone;
}) {
  return (
    <div className={joinClasses("sejfa-metricTile", `is-${tone}`)}>
      <span className="sejfa-metricTile__label">{label}</span>
      <strong className="sejfa-metricTile__value">{value}</strong>
      {detail ? <span className="sejfa-metricTile__detail">{detail}</span> : null}
    </div>
  );
}

export interface EventListItem {
  id: string;
  title: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
  tone?: StatusBadgeTone;
}

export function EventList({
  items,
  empty,
}: {
  items: EventListItem[];
  empty?: ReactNode;
}) {
  if (items.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <ul className="sejfa-eventList">
      {items.map((item) => (
        <li
          key={item.id}
          className={joinClasses(
            "sejfa-eventList__item",
            item.tone && `is-${item.tone}`,
          )}
        >
          <div className="sejfa-eventList__header">
            <strong>{item.title}</strong>
            {item.meta ? <span>{item.meta}</span> : null}
          </div>
          {item.detail ? (
            <div className="sejfa-eventList__detail">{item.detail}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={joinClasses("sejfa-emptyState", compact && "is-compact")}>
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

export function SurfaceCard({
  children,
  style,
  className,
}: PropsWithChildren<ClassNameProps>) {
  return (
    <Panel className={className} style={style}>
      {children}
    </Panel>
  );
}

export function SectionTitle({
  kicker,
  title,
  detail,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
}) {
  return <PanelHeader eyebrow={kicker} title={title} detail={detail} />;
}

export function StatusPill({
  label,
  tone = "idle",
}: {
  label: string;
  tone?: StatusBadgeTone | "neutral" | "good" | "warn" | "bad";
}) {
  const normalized: Record<string, StatusBadgeTone> = {
    neutral: "idle",
    good: "healthy",
    warn: "warning",
    bad: "failed",
  };

  return <StatusBadge label={label} tone={normalized[tone] ?? tone} />;
}
