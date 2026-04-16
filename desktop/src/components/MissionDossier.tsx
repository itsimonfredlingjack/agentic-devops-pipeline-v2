import styles from "./MissionDossier.module.css";
import { LinearIssue } from "../mockLinearData";

export function MissionDossier({ targetedTask }: { targetedTask: LinearIssue | undefined }) {
  if (!targetedTask) return null;

  return (
    <div className={styles.dossierContainer}>
      <h3 className={styles.dossierHeader}>TASK BRIEF</h3>
      
      <div className={styles.dossierMeta}>
        <div className={styles.metaRow}>
          <span>TARGET ID</span>
          <div className={styles.idGroup}>
            {targetedTask.estimate && <span className={styles.estimateLabel}>{targetedTask.estimate} pts</span>}
            <strong className={styles.monoStrong}>{targetedTask.id}</strong>
          </div>
        </div>
        <div className={styles.metaRow}>
          <span>SUMMARY</span>
          <strong className={styles.titleStrong}>{targetedTask.title}</strong>
        </div>
        <div className={styles.metaRow}>
          <span>STATUS</span>
          <div className={styles.statusPill}>{targetedTask.status.toUpperCase()}</div>
        </div>
        {targetedTask.assignee && (
          <div className={styles.metaRow}>
            <span>ASSIGNEE</span>
            <div className={styles.assigneeGroup}>
              {targetedTask.assigneeAvatar && <img src={targetedTask.assigneeAvatar} alt="" className={styles.avatar} />}
              <strong className={styles.assigneeName}>{targetedTask.assignee}</strong>
            </div>
          </div>
        )}
      </div>

      {targetedTask.labels && targetedTask.labels.length > 0 && (
        <div className={styles.labelSection}>
          {targetedTask.labels.map(l => (
            <span key={l} className={styles.labelPill}>{l}</span>
          ))}
        </div>
      )}

      {targetedTask.description && (
        <div className={styles.briefingSection}>
          <h4 className={styles.sectionHeader}>DESCRIPTION</h4>
          <p className={styles.descriptionText}>{targetedTask.description}</p>
        </div>
      )}

      {(targetedTask.branch || targetedTask.files) && (
        <div className={styles.briefingSection}>
          <h4 className={styles.sectionHeader}>CONTEXT</h4>
          {targetedTask.branch && (
             <div className={styles.contextRow}>
                <span className={styles.contextLabel}>BRANCH</span>
                <span className={styles.contextPill}>{targetedTask.branch}</span>
             </div>
          )}
          {targetedTask.files && targetedTask.files.length > 0 && (
             <div className={styles.contextRow}>
                <span className={styles.contextLabel}>FILES</span>
                <div className={styles.fileList}>
                  {targetedTask.files.map(f => (
                    <span key={f} className={styles.contextPill}>{f}</span>
                  ))}
                </div>
             </div>
          )}
        </div>
      )}

      <div className={styles.actionArea}>
        <div className={styles.ctaStatus} role="status" aria-live="polite">
          Ready for voice input
        </div>
      </div>
    </div>
  );
}
