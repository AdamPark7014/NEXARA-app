"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./Footer.module.css";
import { openExternalUrl } from "@/lib/open-external-url";
import { openCookiePreferences } from "@/lib/cookie-consent";

const WA_URL = "https://wa.me/522226960350?text=Hola%2C%20me%20interesa%20informaci%C3%B3n%20de%20Nexara";
const WA_LABEL = "+52 222 696 0350";
const COMPANY_EMAIL = "gerencia@nexara.com.mx";
const COMPANY_PHONE_LABEL = "+52 222 696 0350";
const COMPANY_TEL = "tel:+522226960350";

const Icon = {
  Facebook: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  LinkedIn: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  Instagram: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  ),
  TikTok: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.32 5.56a5.1 5.1 0 0 1-3.06-3.83h-3.14v12.16a2.82 2.82 0 1 1-1.95-2.69V8.01A5.95 5.95 0 1 0 16.24 13.9V7.73c.98.39 2.02.6 3.08.61V5.56z"/>
    </svg>
  ),
};

export default function Footer() {
  const [showBackTop, setShowBackTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 720);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <footer className={styles.footer}>
      <div className={styles.topAccent} />
      <div className={styles.footerInner}>
        <div className={styles.ctaRow}>
          <div className={styles.ctaCopy}>
            <p className={styles.ctaKicker}>¿Arrancamos?</p>
            <p className={styles.ctaTitle}>
              Cuéntanos tu sitio y te decimos qué instalar, qué posponer y con qué presupuesto.
            </p>
          </div>
          <Link href="/contacto" className={styles.ctaButton} data-track-conversion="footer_cta">
            Cotiza tu proyecto <span aria-hidden>→</span>
          </Link>
        </div>

        <div className={styles.brandRow}>
          <div className={styles.brandBlock}>
            <Link href="/" className={styles.brandLogoLink} aria-label="Nexara — Inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-nexara-lockup.png"
                alt="Nexara"
                className={styles.brandLogo}
                width={200}
                height={63}
              />
            </Link>
            <p className={styles.brandTagline}>
              Conectamos tecnología. Impulsamos operación en campo.
            </p>
          </div>
          <div className={styles.socials} aria-label="Redes sociales">
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.facebook.com/nexara.mexico/")} aria-label="Facebook"><Icon.Facebook /></button>
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.linkedin.com/in/nexara-mx-413717359/")} aria-label="LinkedIn"><Icon.LinkedIn /></button>
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.instagram.com/nexara_mx/")} aria-label="Instagram"><Icon.Instagram /></button>
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.tiktok.com/@nexara_mx")} aria-label="TikTok"><Icon.TikTok /></button>
          </div>
        </div>

        <div className={styles.navGrid}>
          <nav className={styles.linkCol} aria-label="Sitio">
            <h4 className={styles.colTitle}>Sitio</h4>
            <ul className={styles.list}>
              <li><Link href="/">Inicio</Link></li>
              <li><Link href="/soluciones">Soluciones</Link></li>
              <li><Link href="/servicios">Servicios</Link></li>
              <li><Link href="/nosotros">Nosotros</Link></li>
              <li><Link href="/contacto">Contacto</Link></li>
            </ul>
          </nav>

          <nav className={styles.linkCol} aria-label="Capacidades">
            <h4 className={styles.colTitle}>Capacidades</h4>
            <ul className={styles.list}>
              <li><Link href="/servicios#cctv">Videovigilancia</Link></li>
              <li><Link href="/servicios#redes">Redes y Wi‑Fi</Link></li>
              <li><Link href="/servicios#computo">Cómputo</Link></li>
              <li><Link href="/servicios#soporte">Soporte TI</Link></li>
              <li><Link href="/servicios#software">Plataformas a medida</Link></li>
            </ul>
          </nav>

          <nav className={styles.linkCol} aria-label="Cobertura">
            <h4 className={styles.colTitle}>Cobertura</h4>
            <ul className={styles.list}>
              <li><Link href="/cobertura/puebla">Puebla</Link></li>
              <li><Link href="/cobertura/cdmx">Ciudad de México</Link></li>
              <li><Link href="/cobertura/cholula">San Andrés Cholula</Link></li>
              <li><Link href="/cobertura/queretaro">Querétaro</Link></li>
              <li><Link href="/cobertura">Todas las ciudades</Link></li>
            </ul>
          </nav>

          <div className={styles.linkCol}>
            <h4 className={styles.colTitle}>Contacto</h4>
            <ul className={styles.list}>
              <li>
                <button type="button" className={styles.textBtn} onClick={() => void openExternalUrl(`mailto:${COMPANY_EMAIL}`)}>
                  {COMPANY_EMAIL}
                </button>
              </li>
              <li>
                <a className={styles.textBtn} href={COMPANY_TEL}>
                  {COMPANY_PHONE_LABEL}
                </a>
              </li>
              <li>
                <button
                  type="button"
                  className={styles.whatsappBtn}
                  onClick={() => void openExternalUrl(WA_URL)}
                  aria-label={`Abrir WhatsApp ${WA_LABEL}`}
                >
                  <svg className={styles.whatsappIcon} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span>WhatsApp</span>
                </button>
              </li>
              <li>
                <span className={styles.muted}>
                  Ignacio Allende 512 · Santiago Momoxpan
                  <br />
                  San Pedro Cholula, Puebla
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.bottomBar}>
          <p className={styles.copyright}>
            © {new Date().getUTCFullYear()} NEXARA · NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.
          </p>
          <nav className={styles.legalLinks} aria-label="Legal">
            <Link href="/legal/privacidad">Privacidad</Link>
            <Link href="/legal/terminos">Términos</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <button
              type="button"
              className={styles.legalButton}
              onClick={() => openCookiePreferences()}
            >
              Gestionar cookies
            </button>
          </nav>
        </div>
      </div>

      {showBackTop && (
        <button
          type="button"
          aria-label="Volver arriba"
          className={styles.backTop}
          onClick={() => {
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 6l-6 6h4v6h4v-6h4z" />
          </svg>
        </button>
      )}
    </footer>
  );
}
