import Link from "next/link";
import styles from "@/components/ui/PanelState.module.scss";

export default function NotFound() {
  return (
    <main className={styles.wrap} style={{ minHeight: "100vh", background: "var(--bg, var(--ui-bg))" }}>
      <div className={styles.card}>
        <span className={styles.icon} data-tone="info" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <h1 className={styles.title}>Esta página no existe</h1>
        <p className={styles.text}>
          Puede que el enlace esté incompleto o que la página se haya movido. Vuelve al inicio para seguir.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.btnPrimary}>
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
