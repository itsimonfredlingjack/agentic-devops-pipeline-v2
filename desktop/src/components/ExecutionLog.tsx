import styles from "./ExecutionLog.module.css";

interface LogEntry {
  id: string;
  timestamp: string;
  tool: string;
  target: string;
  status: "ok" | "fail" | "running" | "queued" | "waiting";
  duration?: string;
}

const mockLogs: LogEntry[] = [
  {
    id: "1",
    timestamp: "14:32:01",
    tool: "git.clone",
    target: "repository: sejfa/core",
    status: "ok",
    duration: "1.2s",
  },
  {
    id: "2",
    timestamp: "14:32:15",
    tool: "lint.run",
    target: "files: 24, errors: 0",
    status: "ok",
    duration: "3.4s",
  },
  {
    id: "3",
    timestamp: "14:32:44",
    tool: "test.run",
    target: "suite: auth, failed: 2",
    status: "fail",
    duration: "8.1s",
  },
  {
    id: "4",
    timestamp: "14:33:02",
    tool: "deploy.staging",
    target: "target: api-staging-01",
    status: "ok",
    duration: "12.5s",
  },
  {
    id: "5",
    timestamp: "14:33:18",
    tool: "verify.health",
    target: "endpoint: /health",
    status: "running",
  },
  {
    id: "6",
    timestamp: "14:33:25",
    tool: "voice.context.inject",
    target: "source: operator",
    status: "queued",
  },
  {
    id: "7",
    timestamp: "14:33:30",
    tool: "create.pr",
    target: "branch: feature/PROJ-124-auth",
    status: "waiting",
  },
];

function LogRow({ entry }: { entry: LogEntry }) {
  const getStatusClass = () => {
    switch (entry.status) {
      case "ok":
        return styles.statusOk;
      case "fail":
        return styles.statusFail;
      case "running":
        return styles.statusRunning;
      case "queued":
        return styles.statusQueued;
      case "waiting":
        return styles.statusWaiting;
      default:
        return "";
    }
  };

  const getStatusLabel = () => {
    switch (entry.status) {
      case "ok":
        return "OK";
      case "fail":
        return "FAIL";
      case "running":
        return "RUNNING";
      case "queued":
        return "QUEUED";
      case "waiting":
        return "WAITING";
      default:
        return entry.status;
    }
  };

  return (
    <div className={`${styles.row} ${getStatusClass()}`}>
      <div className={styles.timestamp}>{entry.timestamp}</div>
      <div className={styles.tool}>{entry.tool}</div>
      <div className={styles.target}>{entry.target}</div>
      <div className={styles.meta}>
        <span className={`${styles.status} ${getStatusClass()}`}>
          {getStatusLabel()}
        </span>
        {entry.duration && (
          <span className={styles.duration}>{entry.duration}</span>
        )}
      </div>
    </div>
  );
}

export function ExecutionLog() {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Agent Trace</div>
          <div className={styles.subtitle}>Run ralph-loop-24 · worker claude-opus · repo sejfa/core</div>
        </div>
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          verify.health running
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.failureBanner}>
          <span className={styles.failureLabel}>Needs review</span>
          <span className={styles.failureText}>test.run failed 2 OAuth assertions. Loop is continuing health verification.</span>
        </div>
        <div className={styles.logHeader}>
          <div className={styles.colTime}>Time</div>
          <div className={styles.colTool}>Tool</div>
          <div className={styles.colTarget}>Target</div>
          <div className={styles.colStatus}>Status</div>
        </div>
        <div className={styles.logRows}>
          {mockLogs.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
