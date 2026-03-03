"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { buildApiUrl } from "@/lib/api-base";

export default function ContactoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const entries: [string, FormDataEntryValue][] = [];
    formData.forEach((value, key) => {
      entries.push([key, value]);
    });
    const data = Object.fromEntries(entries) as Record<string, FormDataEntryValue>;

    const payload = {
      name: String(data.name || ""),
      email: String(data.email || ""),
      phone: data.phone ? String(data.phone) : undefined,
      company: data.company ? String(data.company) : undefined,
      subject: data.subject ? String(data.subject) : undefined,
      message: String(data.message || ""),
      newsletter: Boolean(data.newsletter),
      source: "contacto-page",
      pageUrl: typeof window !== "undefined" ? window.location.pathname : "/contacto",
    };

    const response = await fetch(buildApiUrl("contact-messages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setLoading(false);
      return;
    }
    
    setLoading(false);
    setSubmitted(true);

    // Reset form after 5 seconds (cleared on unmount)
    timeoutRef.current = setTimeout(() => {
      setSubmitted(false);
      form.reset();
      timeoutRef.current = null;
    }, 5000);
  };

  return (
    <main className={styles.container} aria-label="Página de contacto">
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Contáctanos</h1>
          <p className={styles.heroSubtitle}>
            Estamos listos para ayudarte a impulsar tu proyecto tecnológico.
            Conversemos sobre tus necesidades y diseñemos juntos la solución ideal.
          </p>
        </div>
      </section>

      <div className={styles.contentGrid}>
        {/* Contact Information */}
        <aside className={styles.contactInfo}>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <h3>Ubicación</h3>
              <p>Ciudad de México, México</p>
              <p className={styles.infoDetail}>Cobertura nacional</p>
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div>
              <h3>Teléfono</h3>
              <p>
                <a href="tel:+525536505044" className={styles.contactLink}>
                  +52 55 3650 5044
                </a>
              </p>
              <p className={styles.infoDetail}>Lun - Vie: 9:00 AM - 6:00 PM</p>
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div>
              <h3>Email</h3>
              <p>
                <a href="mailto:contacto@nexara.com.mx" className={styles.contactLink}>
                  contacto@nexara.com.mx
                </a>
              </p>
              <p className={styles.infoDetail}>Respuesta en 24h</p>
            </div>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <div>
              <h3>WhatsApp</h3>
              <p>
                <a 
                  href="https://wa.me/525536505044" 
                  className={styles.contactLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chat directo
                </a>
              </p>
              <p className={styles.infoDetail}>Respuesta inmediata</p>
            </div>
          </div>

          {/* Quick Links */}
          <div className={styles.quickLinks}>
            <h4>Enlaces rápidos</h4>
            <ul>
              <li>
                <Link href="/nexara">Sobre nosotros</Link>
              </li>
              <li>
                <Link href="/soluciones">Nuestras soluciones</Link>
              </li>
              <li>
                <Link href="/">Inicio</Link>
              </li>
            </ul>
          </div>
        </aside>

        {/* Contact Form */}
        <section className={styles.formSection}>
          <div className={styles.formHeader}>
            <h2>Envíanos un mensaje</h2>
            <p>Completa el formulario y nos pondremos en contacto contigo lo antes posible.</p>
          </div>

          {!submitted ? (
            <form className={styles.form} onSubmit={onSubmit}>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label htmlFor="contact-name">
                    Nombre completo <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    required
                    placeholder="Juan Pérez"
                    disabled={loading}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="contact-email">
                    Correo electrónico <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    required
                    placeholder="tu@email.com"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label htmlFor="contact-phone">Teléfono</label>
                  <input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    placeholder="+52 55 0000 0000"
                    disabled={loading}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="contact-company">Empresa</label>
                  <input
                    id="contact-company"
                    name="company"
                    type="text"
                    placeholder="Nombre de tu empresa"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label htmlFor="contact-subject">
                  Asunto <span className={styles.required}>*</span>
                </label>
                <select
                  id="contact-subject"
                  name="subject"
                  required
                  disabled={loading}
                >
                  <option value="">Selecciona un tema</option>
                  <option value="cotizacion">Solicitar cotización</option>
                  <option value="soporte">Soporte técnico</option>
                  <option value="informacion">Información general</option>
                  <option value="arrendamiento">Arrendamiento de equipos</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="contact-message">
                  Mensaje <span className={styles.required}>*</span>
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={6}
                  required
                  placeholder="Cuéntanos sobre tu proyecto o necesidad..."
                  disabled={loading}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    name="newsletter"
                    disabled={loading}
                  />
                  <span>Deseo recibir información sobre productos y promociones</span>
                </label>
              </div>

              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className={styles.spinner} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" opacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    Enviando...
                  </>
                ) : (
                  <>
                    Enviar mensaje
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </>
                )}
              </button>

              <p className={styles.formNote}>
                Al enviar este formulario, aceptas nuestra política de privacidad.
              </p>
            </form>
          ) : (
            <div className={styles.successMessage}>
              <div className={styles.successIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h3>¡Mensaje enviado exitosamente!</h3>
              <p>
                Gracias por contactarnos. Hemos recibido tu mensaje y uno de nuestros
                asesores se pondrá en contacto contigo dentro de las próximas 24 horas.
              </p>
              <div className={styles.successActions}>
                <Link href="/" className={styles.primaryButton}>
                  Volver al inicio
                </Link>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSubmitted(false)}
                >
                  Enviar otro mensaje
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Extra CTA Section */}
      <section className={styles.extraCta}>
        <div className={styles.ctaCard}>
          <div className={styles.ctaIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div>
            <h3>¿Necesitas atención urgente?</h3>
            <p>Nuestro equipo está disponible para soporte 24/7</p>
            <a href="tel:+525536505044" className={styles.ctaButton}>
              Llamar ahora
            </a>
          </div>
        </div>

        <div className={styles.ctaCard}>
          <div className={styles.ctaIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div>
            <h3>¿Buscas una cotización?</h3>
            <p>Conoce nuestras soluciones y servicios especializados</p>
            <Link href="/soluciones" className={styles.ctaButton}>
              Ver soluciones
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
