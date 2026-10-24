"use client";
import Link from "next/link";
import styles from "./Footer.module.css";
import { openExternalUrl } from "@/lib/open-external-url";
import { openCookiePreferences } from "@/lib/cookie-consent";

const WA_URL = "https://wa.me/522226960350?text=Hola%2C%20me%20interesa%20informaci%C3%B3n%20de%20Nexara";
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
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.brandRow}>
          <div className={styles.brandBlock}>
            <Link href="/" className={styles.brandLogoLink} aria-label="Nexara — Inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/nexara-mark-v2.png"
                alt=""
                className={styles.brandMark}
                width={44}
                height={40}
                aria-hidden
              />
              <span className={styles.brandWordmark}>NEXARA</span>
            </Link>
          </div>
          <div className={styles.socials} aria-label="Redes sociales">
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.facebook.com/nexara.mexico/")} aria-label="Facebook"><Icon.Facebook /></button>
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.linkedin.com/in/nexara-mx-413717359/")} aria-label="LinkedIn"><Icon.LinkedIn /></button>
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.instagram.com/nexara_mx/")} aria-label="Instagram"><Icon.Instagram /></button>
            <button type="button" className={styles.social} onClick={() => void openExternalUrl("https://www.tiktok.com/@nexara_mx")} aria-label="TikTok"><Icon.TikTok /></button>
          </div>
        </div>

        <div className={styles.infoGrid}>
          <div className={styles.navBlock}>
            <div className={styles.linkCols}>
              <nav className={styles.linkCol} aria-label="Sitio">
                <h4 className={styles.colTitle}>Sitio</h4>
                <ul className={styles.list}>
                  <li><Link href="/">Inicio</Link></li>
                  <li><Link href="/servicios">Servicios</Link></li>
                  <li><Link href="/cobertura">Cobertura</Link></li>
                  <li><Link href="/proyectos">Proyectos</Link></li>
                  <li><Link href="/contacto">Contacto</Link></li>
                </ul>
              </nav>
            </div>
          </div>

          <aside className={styles.contactCard}>
            <h4 className={styles.colTitle}>Contacto</h4>
            <ul className={styles.list}>
              <li>
                <a className={styles.textBtn} href={COMPANY_TEL}>
                  {COMPANY_PHONE_LABEL}
                </a>
              </li>
              <li>
                <a className={styles.textBtn} href={WA_URL} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </li>
              <li>
                <button type="button" className={styles.textBtn} onClick={() => void openExternalUrl(`mailto:${COMPANY_EMAIL}`)}>
                  {COMPANY_EMAIL}
                </button>
              </li>
              <li>
                <span className={styles.muted}>
                  Ignacio Allende 512, Santiago Momoxpan, San Pedro Cholula, Puebla
                </span>
              </li>
            </ul>
          </aside>
        </div>

        <div className={styles.bottomBar}>
          <p className={styles.copyright}>
            © {new Date().getUTCFullYear()} NEXARA · NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.
          </p>
          <nav className={styles.legalLinks} aria-label="Legal">
            <Link href="/login">Acceso</Link>
            <Link href="/legal/privacidad">Privacidad</Link>
            <Link href="/legal/terminos">Términos</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <Link href="/legal/eliminar-cuenta">Eliminar cuenta</Link>
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
    </footer>
  );
}
