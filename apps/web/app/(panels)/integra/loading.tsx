import styles from "./integra.module.css";

export default function PanelLoading() {
  return (
    <div className={styles.igLoading} role="status" aria-live="polite">
      <div>
        <div className={styles.igLoadingSpin} aria-hidden />
        <div className={styles.igLoadingLabel}>Cargando…</div>
      </div>
    </div>
  );
}
