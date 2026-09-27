import Link from "next/link";
import styles from "@/components/ui/PanelState.module.scss";

export default function ErpNotFound() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={styles.icon} data-tone="info" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <h2 className={styles.title}>No encontramos lo que buscas</h2>
        <p className={styles.text}>
          Puede que el registro se haya borrado o que el enlace esté incompleto. Usa el menú de la izquierda
          o vuelve al inicio.
        </p>
        <div className={styles.actions}>
          <Link href="/erp" className={styles.btnPrimary}>
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
