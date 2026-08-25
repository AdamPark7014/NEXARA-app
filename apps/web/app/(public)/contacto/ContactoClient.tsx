"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { openExternalUrl } from "@/lib/open-external-url";
import EditorialImage from "../../components/EditorialImage";
import Map from "../../components/Map";
import type { PageVisualsContent } from "@/lib/page-content-api";
import { findGeoCity } from "@/lib/seo/geo-cities";
import { findServiceLanding } from "@/lib/seo/programmatic-landings";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

const WA_LABEL = "+52 222 696 0350";
const PHONE_LABEL = "+52 222 696 0350";
const PHONE_TEL = "tel:+522226960350";
const COMPANY_EMAIL = "gerencia@nexara.com.mx";
const MAPS_PLACE_URL = "https://maps.app.goo.gl/34XSHPwUSeMAB7x69";

type Props = {
  visuals: PageVisualsContent;
};

export default function ContactoClient({ visuals }: Props) {
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const asideImg = visuals.slots[0];

  const leadContext = useMemo(() => {
    const citySlug = searchParams.get("city") || "";
    const serviceSlug = searchParams.get("service") || "";
    const industrySlug = searchParams.get("industry") || "";
    const city = citySlug ? findGeoCity(citySlug) : undefined;
    const service = serviceSlug ? findServiceLanding(serviceSlug) : undefined;
    const parts = [
      city ? `Ciudad: ${city.name}` : "",
      service ? `Servicio: ${service.name}` : "",
      industrySlug ? `Industria: ${industrySlug}` : "",
    ].filter(Boolean);
    const prefill = parts.length
      ? `Hola Nexara,\nMe interesa cotizar${service ? ` ${service.name}` : ""}${city ? ` en ${city.name}` : ""}.\n${parts.join(" · ")}\n\nContexto / sitio:\n`
      : "";
    const wa = buildWhatsAppLeadUrl({
      industryName: city?.name || industrySlug || "mi empresa",
      serviceName: service?.name || "CCTV, redes o soporte TI",
      path: "/contacto",
    });
    return { prefill, wa, city, service };
  }, [searchParams]);

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
      pageUrl: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/contacto",
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
                    onClick={() => void openExternalUrl(leadContext.wa)}
                    aria-label={`Abrir WhatsApp ${WA_LABEL}`}
                  >
                    <span className={`${styles.directLabel} ${styles.whatsappLabel}`}>
                      <svg className={styles.whatsappIcon} viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      WhatsApp
                    </span>
                    <span className={styles.directValue}>
                      {(leadContext.city || leadContext.service)
                        ? `Chat con contexto${leadContext.service ? ` · ${leadContext.service.name}` : ""}${leadContext.city ? ` · ${leadContext.city.name}` : ""}`
                        : "Escríbenos por chat"}
                    </span>
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
              <div className={styles.formCardHead}>
                <h2 className={styles.formCardTitle}>Cuéntanos tu proyecto</h2>
                <p className={styles.formCardNote}>
                  Respuesta típica en menos de 24 horas en horario laboral.
                </p>
              </div>
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
                      key={leadContext.prefill || "empty"}
                      defaultValue={leadContext.prefill || undefined}
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
            <p className={styles.expectNote}>
              Cobertura{" "}
              <Link href="/cobertura/puebla/camaras-cctv">CCTV Puebla</Link>
              {" · "}
              <Link href="/cobertura/cdmx/camaras-cctv">CCTV CDMX</Link>
              {" · "}
              <Link href="/cobertura">más ciudades</Link>
            </p>
          </div>
          <div className={styles.mapFrame} data-reveal="up">
            <Map />
            <div className={styles.locationCard}>
              <div className={styles.locationCopy}>
                <p className={styles.locationLabel}>Base operativa</p>
                <p className={styles.locationAddress}>
                  Explanada Puebla · Santiago Momoxpan, Puebla
                </p>
                <p className={styles.locationHint}>
                  Visitas con cita. Para llegar, usa el enlace de Google Maps.
                </p>
              </div>
              <a
                className={`${shared.btn} ${shared.btnSecondary}`}
                href={MAPS_PLACE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalUrl(MAPS_PLACE_URL);
                }}
              >
                Abrir en Google Maps
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
