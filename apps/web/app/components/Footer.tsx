"use client";
import React, { FormEvent, useState } from "react";
import Link from "next/link";
import styles from "./Footer.module.css";
import Map from "./Map";
import { buildApiUrl } from "@/lib/api-base";

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
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
    </svg>
  ),
  WhatsApp: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  ),
  Phone: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
    </svg>
  ),
  Email: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  ),
  TikTok: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 11.5c-.69.38-1.45.59-2.25.59-2.43 0-4.42-1.99-4.42-4.42s1.99-4.42 4.42-4.42c.79 0 1.55.21 2.24.59v2.61c0 .55.45 1 1 1h1.06v2.07c0 .55-.45 1-1 1h-1.06v2.07z"/>
    </svg>
  ),
  Briefcase: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  Headphones: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
    </svg>
  ),
};

export default function Footer() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl("newsletter/subscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source: "newsletter-footer",
          pageUrl: typeof window !== "undefined" ? window.location.pathname : "/",
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo registrar el correo");
      }

      setSubmitted(true);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const socialPresence = [
    {
      key: "facebook",
      title: "Facebook",
      href: "https://www.facebook.com/nexara.mexico/",
      status: "Canal principal",
      others: "También en TikTok, Instagram y LinkedIn",
    },
    {
      key: "instagram",
      title: "Instagram",
      href: "https://www.instagram.com/nexara_mx/",
      status: "1 publicación",
      others: "También en Facebook, TikTok y LinkedIn",
    },
    {
      key: "tiktok",
      title: "TikTok",
      href: "https://www.tiktok.com/@nexara_mx?_r=1&_t=ZS-948WJNIEdeu",
      status: "Sin contenido",
      others: "También en Facebook, Instagram y LinkedIn",
    },
    {
      key: "linkedin",
      title: "LinkedIn",
      href: "https://www.linkedin.com/in/nexara-mx-413717359/",
      status: "Sin contenido",
      others: "También en Facebook, TikTok e Instagram",
    },
  ] as const;

  return (
    <footer className={styles.footer}>
      <div className={styles.topAccent} />
      <div className={styles.footerInner}>
        
        {/* Newsletter Section */}
        <section className={styles.newsletter}>
          <div className={styles.newsletterContent}>
            <h2 className={styles.newsTitle}>Mantente informado</h2>
            <p className={styles.newsSubtitle}>
              Suscríbete para recibir las últimas novedades, proyectos y ofertas exclusivas.
            </p>
          </div>
          <form className={styles.newsForm} onSubmit={onSubmit}>
            <input
              type="email"
              required
              placeholder="Tu correo electrónico"
              className={styles.newsInput}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className={styles.newsButton} disabled={loading}>
              {loading ? "Enviando..." : "Suscribirme"}
            </button>
          </form>
          {error && <p className={styles.newsMessage} style={{ color: "var(--error)" }}>{error}</p>}
          {submitted && <p className={styles.newsMessage}>¡Gracias! Pronto recibirás noticias.</p>}
        </section>

        <div className={styles.divider} />

        {/* Main Layout - 2 Rows */}
        <section className={styles.mainLayout}>
          
          {/* Row 1: Brand | Map | Links */}
          <div className={styles.topRow}>
            {/* Brand */}
            <div className={styles.brandSection}>
              <div className={styles.brandName}>NEXARA</div>
              <div className={styles.brandTagline}>Transformamos tecnología en resultados reales</div>
              <div className={styles.socials}>
                <a className={styles.social} data-network="facebook" href="https://www.facebook.com/nexara.mexico/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><Icon.Facebook /></a>
                <a className={styles.social} data-network="tiktok" href="https://www.tiktok.com/@nexara_mx?_r=1&_t=ZS-948WJNIEdeu" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><Icon.TikTok /></a>
                <a className={styles.social} data-network="linkedin" href="https://www.linkedin.com/in/nexara-mx-413717359/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><Icon.LinkedIn /></a>
                <a className={styles.social} data-network="instagram" href="https://www.instagram.com/nexara_mx/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Icon.Instagram /></a>
              </div>
              <div className={styles.socialStatus}>PARQUE ECOLÓGICO · Presencia digital y cobertura nacional</div>
              <div className={styles.socialCards}>
                {socialPresence.map((network) => (
                  <a
                    key={network.key}
                    className={styles.socialCard}
                    data-network={network.key}
                    href={network.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>{network.title}</strong>
                    <span>{network.status}</span>
                    <small>{network.others}</small>
                    <em>PARQUE ECOLÓGICO</em>
                  </a>
                ))}
              </div>
            </div>

            {/* Map */}
            <div className={styles.mapCenter}>
              <Map />
            </div>

            {/* Links */}
            <div className={styles.linksRow}>
              <div className={styles.linkGroup}>
                <div className={styles.colTitle}>Soluciones</div>
                <ul className={styles.list}>
                  <li><Link href="/soluciones#infraestructura">Infraestructura</Link></li>
                  <li><Link href="/soluciones#energia">Energía</Link></li>
                  <li><Link href="/soluciones#seguridad">Ciberseguridad</Link></li>
                  <li><Link href="/soluciones#datos">Centro de datos</Link></li>
                </ul>
              </div>

              <div className={styles.linkGroup}>
                <div className={styles.colTitle}>Servicios</div>
                <ul className={styles.list}>
                  <li><Link href="/servicios#venta">Venta de equipos</Link></li>
                  <li><Link href="/servicios#integracion">Integración</Link></li>
                  <li><Link href="/servicios#soporte">Soporte</Link></li>
                  <li><Link href="/servicios#consultoria">Consultoría</Link></li>
                </ul>
              </div>

              <div className={styles.linkGroup}>
                <div className={styles.colTitle}>Compañía</div>
                <ul className={styles.list}>
                  <li><Link href="/nexara">Sobre Nexara</Link></li>
                  <li><Link href="/proyectos">Proyectos</Link></li>
                  <li><Link href="/contacto">Contacto</Link></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Row 2: Contact Cards Side by Side */}
          <div className={styles.contactRow}>
            {/* Sales Card */}
            <div className={styles.contactCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}><Icon.Briefcase /></div>
                <div className={styles.cardHeaderText}>
                  <h3 className={styles.cardTitle}>Ventas</h3>
                  <p className={styles.cardDesc}>Cotizaciones y proyectos</p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardContact}>
                  <span className={styles.contactInfo}><Icon.Phone /> +52 1 55 3650 5044</span>
                  <span className={styles.contactInfo}><Icon.Email /> ventas@nexara.com.mx</span>
                </div>
                <div className={styles.cardActions}>
                  <Link className={styles.actionBtn} href="mailto:ventas@nexara.com.mx?subject=Solicitud de información" data-type="email">
                    <Icon.Email /> Email
                  </Link>
                  <Link className={styles.actionBtn} href="https://wa.me/5215536505044?text=Hola,%20me%20interesa%20información%20sobre%20sus%20servicios" target="_blank" rel="noopener noreferrer" data-type="whatsapp">
                    <Icon.WhatsApp /> WhatsApp
                  </Link>
                </div>
              </div>
            </div>

            {/* Support Card */}
            <div className={styles.contactCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}><Icon.Headphones /></div>
                <div className={styles.cardHeaderText}>
                  <h3 className={styles.cardTitle}>Soporte</h3>
                  <p className={styles.cardDesc}>Ayuda técnica</p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardContact}>
                  <span className={styles.contactInfo}><Icon.Phone /> +52 1 55 4926 8141</span>
                  <span className={styles.contactInfo}><Icon.Email /> soporte@nexara.com.mx</span>
                </div>
                <div className={styles.cardActions}>
                  <Link className={styles.actionBtn} href="mailto:soporte@nexara.com.mx?subject=Solicitud de soporte" data-type="email">
                    <Icon.Email /> Email
                  </Link>
                  <Link className={styles.actionBtn} href="https://wa.me/5215549268141?text=Hola,%20necesito%20soporte%20técnico" target="_blank" rel="noopener noreferrer" data-type="whatsapp">
                    <Icon.WhatsApp /> WhatsApp
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.divider} />

        {/* Bottom Bar */}
        <div className={styles.bottomBar}>
          <div className={styles.legalLeft}>
            © {new Date().getUTCFullYear()} Nexara. Todos los derechos reservados.
          </div>
          <div className={styles.legalRight}>
            <Link href="/legal/privacidad">Privacidad</Link>
            <Link href="/legal/terminos">Términos</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <Link href="/legal/marca">Marca</Link>
          </div>
        </div>
      </div>

      <button
        aria-label="Volver arriba"
        className={styles.backTop}
        onClick={() => {
          if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
      >↑</button>
    </footer>
  );
}
