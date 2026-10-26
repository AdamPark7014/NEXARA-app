import Link from "next/link";
import { headers } from "next/headers";
import { Inter_Tight } from "next/font/google";
import styles from "@/components/ui/PanelState.module.scss";
import "@/components/sitio/sitio-documento.css";
import s from "@/components/sitio/sitio.module.css";
import Encabezado from "@/components/sitio/Encabezado";
import Pie from "@/components/sitio/Pie";
import NoEncontrado from "@/components/sitio/NoEncontrado";

const display = Inter_Tight({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--sitio-display" });

/** El dominio público (y el servidor local) ven el 404 del sitio; los paneles, el suyo. */
const esSitioPublico = (host: string) => /^(www\.)?nexara\.com\.mx$/.test(host) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);

export default function NotFound() {
  const h = headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().toLowerCase();

  if (esSitioPublico(host)) {
    return (
      <div className={`${s.sitio} ${display.variable}`} data-sitio>
        <Encabezado />
        <NoEncontrado />
        <Pie />
      </div>
    );
  }

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
          Puede que el enlace esté incompleto o que la página se haya movido, así que vuelve al inicio para seguir.
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
