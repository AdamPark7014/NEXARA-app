"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  COOKIE_CONSENT_OPEN_EVENT,
  acceptAllConsent,
  createConsentState,
  getCookieConsent,
  necessaryOnlyConsent,
  setCookieConsent,
  type CookieConsentState,
} from "@/lib/cookie-consent";
import styles from "./CookieConsentBanner.module.css";

export default function CookieConsentBanner() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [preferences, setPreferences] = useState(false);

  useEffect(() => {
    setMounted(true);
    const existing = getCookieConsent();
    if (!existing) {
      setVisible(true);
      return;
    }
    setAnalytics(existing.categories.analytics);
    setPreferences(existing.categories.preferences);
  }, []);

  useEffect(() => {
    const onOpen = () => {
      const existing = getCookieConsent();
      setAnalytics(Boolean(existing?.categories.analytics));
      setPreferences(Boolean(existing?.categories.preferences));
      setConfigure(true);
      setVisible(true);
    };
    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, onOpen);
  }, []);

  if (!mounted || !visible) return null;

  const persist = (state: CookieConsentState) => {
    setCookieConsent(state);
    setAnalytics(state.categories.analytics);
    setPreferences(state.categories.preferences);
    setConfigure(false);
    setVisible(false);
  };

  return (
    <div
      className={styles.banner}
      role="dialog"
      aria-modal="false"
      aria-labelledby="nexara-cookie-consent-title"
      aria-describedby="nexara-cookie-consent-desc"
    >
      <h2 id="nexara-cookie-consent-title" className={styles.title}>
        Cookies y privacidad
      </h2>
      <p id="nexara-cookie-consent-desc" className={styles.text}>
        Usamos cookies necesarias para el sitio y, solo con tu permiso, cookies de analítica
        para mejorar NEXARA. Consulta el{" "}
        <Link href="/legal/privacidad">Aviso de Privacidad</Link> y la{" "}
        <Link href="/legal/cookies">Política de Cookies</Link>.
      </p>

      {!configure ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => persist(acceptAllConsent())}
          >
            Aceptar todas
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => persist(necessaryOnlyConsent())}
          >
            Solo necesarias
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setConfigure(true)}
          >
            Configurar
          </button>
        </div>
      ) : (
        <>
          <div className={styles.prefs}>
            <div className={styles.prefRow}>
              <div className={styles.prefCopy}>
                <span className={styles.prefLabel}>Necesarias</span>
                <p className={styles.prefDesc}>
                  Autenticación, seguridad y funcionamiento básico. Siempre activas.
                </p>
              </div>
              <button
                type="button"
                className={styles.toggle}
                data-on="true"
                data-disabled="true"
                aria-pressed="true"
                aria-label="Cookies necesarias (siempre activas)"
                disabled
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.prefRow}>
              <div className={styles.prefCopy}>
                <span className={styles.prefLabel}>Analítica</span>
                <p className={styles.prefDesc}>
                  Google Analytics y métricas de uso del sitio público para mejorar contenidos
                  y conversiones.
                </p>
              </div>
              <button
                type="button"
                className={styles.toggle}
                data-on={analytics ? "true" : "false"}
                aria-pressed={analytics}
                aria-label="Cookies de analítica"
                onClick={() => setAnalytics((v) => !v)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.prefRow}>
              <div className={styles.prefCopy}>
                <span className={styles.prefLabel}>Preferencias</span>
                <p className={styles.prefDesc}>
                  Recuerda opciones de interfaz cuando aplique (opcional).
                </p>
              </div>
              <button
                type="button"
                className={styles.toggle}
                data-on={preferences ? "true" : "false"}
                aria-pressed={preferences}
                aria-label="Cookies de preferencias"
                onClick={() => setPreferences((v) => !v)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>
          <div className={styles.actions} style={{ marginTop: 12 }}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() =>
                persist(createConsentState({ analytics, preferences }))
              }
            >
              Guardar preferencias
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setConfigure(false)}
            >
              Volver
            </button>
          </div>
        </>
      )}
    </div>
  );
}
