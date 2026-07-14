"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { openExternalUrl } from "@/lib/open-external-url";
import Map from "@/app/components/Map";
import EditorialImage from "../../components/EditorialImage";
import type { PageVisualsContent } from "@/lib/page-content-api";

const WA_URL = "https://wa.me/522226960350?text=Hola%2C%20me%20interesa%20informaci%C3%B3n%20de%20Nexara";
const WA_LABEL = "+52 222 696 0350";
const PHONE_LABEL = "+52 220 179 1871";
const PHONE_TEL = "tel:+522201791871";
const COMPANY_EMAIL = "gerencia@nexara.com.mx";

type Props = {
  visuals: PageVisualsContent;
};

export default function ContactoClient({ visuals }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const asideImg = visuals.slots[0];

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
    <>
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
                    className={`${styles.directLink} ${styles.whatsappLink}`}
                    onClick={() => void openExternalUrl(WA_URL)}
                    aria-label={`Abrir WhatsApp ${WA_LABEL}`}
                  >
                    <span className={`${styles.directLabel} ${styles.whatsappLabel}`}>
                      <svg className={styles.whatsappIcon} viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      WhatsApp
                    </span>
                    <span className={styles.directValue}>Escríbenos por chat</span>
                  </button>
                </li>
                <li>
                  <a className={styles.directLink} href={PHONE_TEL}>
                    <span className={styles.directLabel}>Teléfono</span>
                    <span className={styles.directValue}>{PHONE_LABEL} · Lun–Vie · 9:00–18:00</span>
                  </a>
                </li>
                <li>
                  <a className={styles.directLink} href={`mailto:${COMPANY_EMAIL}`}>
                    <span className={styles.directLabel}>Email</span>
                    <span className={styles.directValue}>{COMPANY_EMAIL}</span>
                  </a>
                </li>
              </ul>
              <p className={styles.expectNote}>
                En el mensaje indica qué necesitas, sedes aproximadas y urgencia.
              </p>
              <p className={styles.locationNote}>Puebla · CDMX · cobertura nacional</p>
              {asideImg?.desktopUrl ? (
                <div className={styles.asideMedia}>
                  <EditorialImage
                    desktopUrl={asideImg.desktopUrl}
                    mobileUrl={asideImg.mobileUrl}
                    alt={asideImg.alt}
                    caption={asideImg.caption}
                    layout={asideImg.layout}
                    objectPosition={asideImg.objectPosition}
                  />
                </div>
              ) : null}
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
                    Al enviar aceptas nuestra{" "}
                    <Link href="/legal/privacidad">Aviso de Privacidad Integral</Link>.
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
    </>
  );
}
