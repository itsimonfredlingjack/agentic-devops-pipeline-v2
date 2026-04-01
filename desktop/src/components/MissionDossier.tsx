import styles from "./MissionDossier.module.css";

export function MissionDossier({ targetedTask }: { targetedTask: any }) {
  if (!targetedTask) return null;

  return (
    <div className={styles.dossierContainer}>
      <h3 className={styles.dossierHeader}>SELECTED OBJECTIVE</h3>
      <div className={styles.dossierMeta}>
        <div className={styles.metaRow}>
          <span>TARGET ID</span>
          <strong>{targetedTask.id}</strong>
        </div>
        <div className={styles.metaRow}>
          <span>SUMMARY</span>
          <strong>{targetedTask.title}</strong>
        </div>
      </div>
    </div>
  );
}
