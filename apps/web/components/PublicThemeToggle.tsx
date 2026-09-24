"use client";
import { useEffect, useState } from "react";
import styles from "./PublicThemeToggle.module.css";

/**
 * Conmutador de tema del sitio público (claro / oscuro).
 *
 * El tema vive en `<html data-public-theme="dark|light">`; lo fija un script
 * inline en el layout raíz antes del primer pintado (preferencia guardada en
 * localStorage o, si no hay, la del sistema). Todo el DS público lee tokens
 * `--ds-*`, así que el cambio es inmediato y sin recargar.
 */
export const PUBLIC_THEME_KEY = "nexara:public-theme";
type PublicTheme = "dark" | "light";

const readTheme = (): PublicTheme =>
  typeof document !== "undefined" && document.documentElement.getAttribute("data-public-theme") === "light"
    ? "light"
    : "dark";

export function applyPublicTheme(theme: PublicTheme) {
  document.documentElement.setAttribute("data-public-theme", theme);
  try {
    localStorage.setItem(PUBLIC_THEME_KEY, theme);
  } catch {
    /* almacenamiento bloqueado: el tema dura la sesión */
  }
  window.dispatchEvent(new CustomEvent("nexara:public-theme", { detail: theme }));
}

type Props = {
  /** `header`: botón compacto junto al CTA. `footer`: enlace de texto en la fila legal. */
  variant?: "header" | "footer";
  className?: string;
};

export default function PublicThemeToggle({ variant = "header", className }: Props) {
  const [theme, setTheme] = useState<PublicTheme>("dark");

  useEffect(() => {
    setTheme(readTheme());
    const onChange = (e: Event) => setTheme(((e as CustomEvent).detail as PublicTheme) || readTheme());
    window.addEventListener("nexara:public-theme", onChange);
    return () => window.removeEventListener("nexara:public-theme", onChange);
  }, []);

  const next: PublicTheme = theme === "dark" ? "light" : "dark";
  const label = theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  return (
    <button
      type="button"
      className={`${styles.toggle} ${variant === "footer" ? styles.footer : styles.header} ${className || ""}`}
      onClick={() => applyPublicTheme(next)}
      aria-label={label}
      title={label}
      data-theme={theme}
    >
      <span className={styles.icon} aria-hidden>
        {theme === "dark" ? (
          /* sol: pasar a claro */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" />
          </svg>
        ) : (
          /* luna: pasar a oscuro */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
          </svg>
        )}
      </span>
      {variant === "footer" ? <span>{theme === "dark" ? "Tema claro" : "Tema oscuro"}</span> : null}
    </button>
  );
}
