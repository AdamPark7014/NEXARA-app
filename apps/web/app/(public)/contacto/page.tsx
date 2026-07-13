"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import { buildApiUrl } from "@/lib/api-base";
import ExternalLinkButton from "@/components/ExternalLinkButton";
import Map from "@/app/components/Map";

const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IconPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const IconPin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const channels = [
  {
    icon: <IconChat />,
    title: "WhatsApp",
    desc: "Respuesta humana en horario laboral",
    cta: "Iniciar chat",
    href: "https://wa.me/525536505044?text=Hola%2C%20me%20interesa%20información",
  },
  {
    icon: <IconPhone />,
    title: "Teléfono",
    desc: "Lun a Vie · 9:00 – 18:00 hrs",
    cta: "+52 55 3650 5044",
    href: "tel:+525536505044",
  },
  {
    icon: <IconMail />,
    title: "Email",
    desc: "ventas@nexara.com.mx",
    cta: "Escribir correo",
    href: "mailto:ventas@nexara.com.mx",
  },
];

export default function ContactoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const data: Record<string, FormDataEntryValue> = {};
    formData.forEach((v, k) => (data[k] = v));

    const payload = {
      name: String(data.name || ""),
      email: String(data.email || ""),
      phone: data.phone ? String(data.phone) : undefined,
      company: data.company ? String(data.company) : undefined,
      subject: data.subject ? String(data.subject) : undefined,
      category: String(data.category || "VENTAS"),
      message: String(data.message || ""),
      source: "contacto-page",
      pageUrl: typeof window !== "undefined" ? window.location.pathname : "/contacto",
    };

    try {
      const response = await fetch(buildApiUrl("contact-messages"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setLoading(false);
        return;
      }
    } catch {
      setLoading(false);
      return;
    }
    setLoading(false);
    setSubmitted(true);
    timeoutRef.current = setTimeout(() => {
      setSubmitted(false);
      form.reset();
      timeoutRef.current = null;
    }, 5000);
  };

  return (
    <main className={shared.page}>
      <section className={`${shared.hero} ${shared.heroNarrow}`}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Contacto</span>
              <h1 className={shared.heroTitle}>
                Cuéntanos el sitio o el <span className={shared.heroTitleAccent}>problema técnico</span>
              </h1>
              <p className={shared.heroLead}>
                Un especialista responde en horario laboral — normalmente en menos de 24 horas —
                con una ruta clara: alcance, tiempos y presupuesto orientativo.
              </p>
              <div className={shared.heroActions}>
                <ExternalLinkButton
                  href="https://wa.me/525536505044?text=Hola%2C%20me%20interesa%20agendar%20una%20llamada"
                  className={`${shared.btn} ${shared.btnPrimary}`}
                >
                  WhatsApp <span className={shared.btnArrow}>→</span>
                </ExternalLinkButton>
                <a href="#formulario" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Enviar formulario
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Canales</span>
            <h2 className={shared.sectionTitle}>
              Elige el <span className={shared.sectionTitleAccent}>medio que prefieras</span>
            </h2>
            <p className={shared.sectionLead}>Tres puertas. Todas llegan a un humano.</p>
          </div>
          <div className={shared.channelRow} data-reveal-stagger>
            {channels.map((c) => (
              <ExternalLinkButton
                key={c.title}
                href={c.href}
                className={`${shared.card} ${styles.channelCard}`}
              >
                <span className={shared.cardIcon}>{c.icon}</span>
                <h3 className={shared.cardTitle}>{c.title}</h3>
                <p className={shared.cardText}>{c.desc}</p>
                <span className={styles.channelCta}>
                  {c.cta} <span aria-hidden>→</span>
                </span>
              </ExternalLinkButton>
            ))}
          </div>
        </div>
      </section>

      <section id="formulario" className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={styles.formLayout}>
            <aside className={styles.formAside} data-reveal="up">
              <span className={shared.eyebrow}>Formulario</span>
              <h2 className={shared.sectionTitle} style={{ textAlign: "left", margin: "10px 0 18px" }}>
                Lo esencial para responderte bien
              </h2>
              <ul className={shared.bulletList}>
                <li>Qué necesitas (CCTV, redes, cómputo, soporte u otro)</li>
                <li>Cuántas sedes o puntos aproximados</li>
                <li>Urgencia y ventana de intervención</li>
                <li>Presupuesto orientativo si lo tienes</li>
              </ul>
              <p className={styles.expectNote}>
                Expectativa: respuesta humana en horario laboral, normalmente &lt; 24 h.
              </p>
              <div className={styles.asideContact}>
                <IconPin />
                <div>
                  <strong>Puebla · CDMX</strong>
                  <span>Cobertura nacional</span>
                </div>
              </div>
            </aside>

            <div className={`${shared.card} ${styles.formCard}`} data-reveal="up">
              {!submitted ? (
                <form className={styles.form} onSubmit={onSubmit}>
                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span>Nombre *</span>
                      <input name="name" type="text" required placeholder="Tu nombre" disabled={loading} />
                    </label>
                    <label className={styles.field}>
                      <span>Email *</span>
                      <input name="email" type="email" required placeholder="tu@correo.com" disabled={loading} />
                    </label>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span>Teléfono</span>
                      <input name="phone" type="tel" placeholder="+52 55 0000 0000" disabled={loading} />
                    </label>
                    <label className={styles.field}>
                      <span>Empresa</span>
                      <input name="company" type="text" placeholder="Nombre comercial" disabled={loading} />
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span>¿En qué te ayudamos? *</span>
                    <select name="category" required disabled={loading} defaultValue="">
                      <option value="" disabled>
                        Selecciona…
                      </option>
                      <option value="VENTAS">Proyecto nuevo / cotización</option>
                      <option value="SOPORTE">Soporte técnico</option>
                      <option value="ALIANZA">Alianza comercial</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Asunto *</span>
                    <input name="subject" type="text" required placeholder="Resumen breve" disabled={loading} />
                  </label>
                  <label className={styles.field}>
                    <span>Mensaje *</span>
                    <textarea
                      name="message"
                      rows={5}
                      required
                      placeholder="Sitio, problema y lo que ya intentaste…"
                      disabled={loading}
                    />
                  </label>
                  <button
                    type="submit"
                    className={`${shared.btn} ${shared.btnPrimary} ${styles.submitBtn}`}
                    disabled={loading}
                    data-track-conversion="contact_submit"
                  >
                    {loading ? "Enviando…" : "Enviar mensaje"} <span className={shared.btnArrow}>→</span>
                  </button>
                  <p className={styles.formNote}>
                    Al enviar aceptas nuestra <Link href="/legal/privacidad">política de privacidad</Link>.
                  </p>
                </form>
              ) : (
                <div className={styles.successBlock}>
                  <div className={styles.successIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <h3>Mensaje recibido</h3>
                  <p>Un especialista te contacta en horario laboral, normalmente en menos de 24 horas.</p>
                  <button
                    type="button"
                    className={`${shared.btn} ${shared.btnSecondary}`}
                    onClick={() => setSubmitted(false)}
                  >
                    Enviar otro mensaje
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="ubicacion" className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Ubicación</span>
            <h2 className={shared.sectionTitle}>
              Base en el centro, <span className={shared.sectionTitleAccent}>cobertura nacional</span>
            </h2>
            <p className={shared.sectionLead}>Operamos en sitio y remoto según el alcance del proyecto.</p>
          </div>
          <div className={styles.mapWrap} data-reveal="up">
            <Map />
          </div>
        </div>
      </section>
    </main>
  );
}
