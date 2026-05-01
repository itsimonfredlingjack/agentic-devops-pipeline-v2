import styles from "./MetricsBar.module.css";

interface MetricsBarProps {
  toolCalls: number;
  cost: number;
  duration: string;
  successRate: number;
  tokens?: number;
  retries?: number;
  incident?: {
    state: string;
    text: string;
  } | null;
}

export function MetricsBar({
  toolCalls,
  cost,
  duration,
  successRate,
  tokens,
  retries,
  incident,
}: MetricsBarProps) {
  return (
    <div className={styles.metricsBar}>
      {incident && (
        <div className={styles.incident}>
          <span className={styles.incidentState}>{incident.state}</span>
          <span className={styles.incidentText}>{incident.text}</span>
        </div>
      )}
      <MetricCard label="Tool calls" value={toolCalls.toString()} variant="default" />
      <MetricCard label="Burn" value={`$${cost.toFixed(2)}`} variant="warning" />
      <MetricCard label="Run time" value={duration} variant="default" />
      <MetricCard label="Pass" value={`${successRate}%`} variant="success" />
      {tokens !== undefined && (
        <MetricCard
          label="Tokens"
          value={tokens.toLocaleString()}
          variant="default"
        />
      )}
      {retries !== undefined && (
        <MetricCard
          label="Retries"
          value={retries.toString()}
          variant="warning"
        />
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  variant: "default" | "success" | "warning" | "error";
}

function MetricCard({ label, value, variant }: MetricCardProps) {
  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
    </div>
  );
}
