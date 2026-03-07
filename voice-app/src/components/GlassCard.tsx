import type { ReactNode } from "react";
import styles from "../styles/components/GlassCard.module.css";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  noPadding?: boolean;
  style?: React.CSSProperties;
}

export function GlassCard({
  children,
  className,
  compact,
  noPadding,
  style,
}: GlassCardProps) {
  const classes = [
    styles.card,
    compact && styles.compact,
    noPadding && styles.noPadding,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
