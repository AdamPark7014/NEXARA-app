"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { openExternalUrl } from "@/lib/open-external-url";
import Map from "@/app/components/Map";

const WA_URL = "https://wa.me/525536505044?text=Hola%2C%20me%20interesa%20información";

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

    const message = String(data.message || "");
    const payload = {
      name: String(data.name || ""),
      email: String(data.email || ""),
      phone: data.phone ? String(data.phone) : undefined,
      subject: message.slice(0, 80) || "Contacto web",
      category: String(data.category || "VENTAS"),
      message,
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
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Contacto"
        title={
          <>
            Hablemos de tu{" "}
            <span className={heroStyles.titleAccent}>proyecto</span>
          </>
        }
        lead="Respuesta humana en horario laboral, normalmente en menos de 24 horas."
        imageSrc="/images/hero/hero-01.png"
        imageAlt="Infraestructura Nexara"
      />

      <section id="formulario" className={styles.contactSection} data-reveal="up">
        <div className={shared.inner}>
          <div className={styles.formLayout}>
            <aside className={styles.formAside} data-reveal="left">
              <p className={shared.eyebrow}>Directo</p>
              <h2 className={styles.formAsideTitle}>Otros canales</h2>
              <ul className={styles.directList}>
                <li>
                  <button
                    type="button"
                    className={styles.directLink}
                    onClick={() => void openExternalUrl(WA_URL)}
                  >
                    <span className={styles.directLabel}>WhatsApp</span>
                    <span className={styles.directValue}>+52 55 3650 5044</span>
                  </button>
                </li>
                <li>
                  <a className={styles.directLink} href="tel:+525536505044">
                    <span className={styles.directLabel}>Teléfono</span>
                    <span className={styles.directValue}>Lun–Vie · 9:00–18:00</span>
                  </a>
                </li>
                <li>
                  <a className={styles.directLink} href="mailto:ventas@nexara.com.mx">
                    <span className={styles.directLabel}>Email</span>
                    <span className={styles.directValue}>ventas@nexara.com.mx</span>
                  </a>
                </li>
              </ul>
              <p className={styles.expectNote}>
                En el mensaje indica qué necesitas, sedes aproximadas y urgencia.
              </p>
              <p className={styles.locationNote}>Puebla · CDMX · cobertura nacional</p>
            </aside>

            <div className={styles.formCard} data-reveal="right">
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
                  <label className={styles.field}>
                    <span>Teléfono</span>
                    <input name="phone" type="tel" placeholder="+52 55 0000 0000" disabled={loading} />
                  </label>
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
                    <span>Mensaje *</span>
                    <textarea
                      name="message"
                      rows={5}
                      required
                      placeholder="Qué necesitas, sitio y contexto…"
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
                  <h3>Mensaje recibido</h3>
                  <p>Te contactamos en horario laboral, normalmente en menos de 24 horas.</p>
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

      <section id="ubicacion" className={styles.mapSection} data-reveal="up">
        <div className={shared.inner}>
          <div className={styles.mapHeader}>
            <p className={shared.eyebrow}>Ubicación</p>
            <h2 className={styles.mapTitle}>Explanada Puebla, Santiago Momoxpan</h2>
          </div>
          <div className={styles.mapWrap}>
            <Map />
          </div>
        </div>
      </section>
    </main>
  );
}
