"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./FloatingContactForm.module.css";
import { buildApiUrl } from "@/lib/api-base";

export default function FloatingContactForm() {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
      category: String(data.category || "SOPORTE"),
      message: String(data.message || ""),
      newsletter: Boolean(data.newsletter),
      source: "contacto-floating",
      pageUrl: typeof window !== "undefined" ? window.location.pathname : undefined,
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

    // Reset form after 3 seconds (cleared on unmount)
    timeoutRef.current = setTimeout(() => {
      setSubmitted(false);
      setOpen(false);
      form.reset();
      timeoutRef.current = null;
    }, 3000);
  };

  const handleClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(false);
    setSubmitted(false);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.fab} ${open ? styles.fabOpen : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Abrir formulario de contacto"
        aria-expanded={open}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <span className={styles.fabIconWrap} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </span>
        )}
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={handleClose} />
          <div
            className={styles.panel}
            style={{ top: "calc(var(--header-offset, 72px) + 10px)", bottom: "72px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="floating-contact-title"
          >
            <div
              className={styles.panelHeader}
              style={{
                background: "linear-gradient(145deg, #2b58cb 0%, #3e73e6 100%)",
                borderBottomColor: "rgba(214, 232, 255, 0.34)",
              }}
            >
              <div>
                <p className={styles.panelEyebrow} style={{ color: "rgba(240, 247, 255, 0.92)" }}>
                  NEXARA | CONTACTO DIRECTIVO
                </p>
                <h3 id="floating-contact-title" style={{ color: "#ffffff" }}>
                  Asesoria corporativa inmediata
                </h3>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                style={{
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                  color: "#ffffff",
                }}
                onClick={handleClose}
                aria-label="Cerrar formulario"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.panelMeta}>
              <span>Respuesta en horario laboral</span>
              <span>Atencion comercial y tecnica</span>
            </div>

            {!submitted ? (
              <form className={styles.form} onSubmit={onSubmit}>
                <div className={styles.formField}>
                  <label htmlFor="float-name">Nombre *</label>
                  <input
                    id="float-name"
                    name="name"
                    type="text"
                    required
                    placeholder="Tu nombre completo"
                    disabled={loading}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="float-email">Correo electrónico *</label>
                  <input
                    id="float-email"
                    name="email"
                    type="email"
                    required
                    placeholder="tu@email.com"
                    disabled={loading}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="float-phone">Teléfono</label>
                  <input
                    id="float-phone"
                    name="phone"
                    type="tel"
                    placeholder="+52 55 0000 0000"
                    disabled={loading}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="float-company">Empresa</label>
                  <input
                    id="float-company"
                    name="company"
                    type="text"
                    placeholder="Nombre de tu empresa"
                    disabled={loading}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="float-category">¿En qué podemos ayudarte? *</label>
                  <select
                    id="float-category"
                    name="category"
                    required
                    disabled={loading}
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="SOPORTE">Soporte y ayuda</option>
                    <option value="VENTAS">Ventas, productos o proyectos</option>
                  </select>
                </div>

                <div className={styles.formField}>
                  <label htmlFor="float-message">Mensaje *</label>
                  <textarea
                    id="float-message"
                    name="message"
                    rows={4}
                    required
                    placeholder="¿En qué podemos ayudarte?"
                    disabled={loading}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" name="newsletter" disabled={loading} />
                    <span>Quiero recibir noticias y promociones</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={loading}
                >
                  {loading ? "Enviando solicitud..." : "Solicitar contacto"}
                </button>
                <p className={styles.footNote}>Al enviar aceptas recibir comunicacion de seguimiento sobre tu solicitud.</p>
              </form>
            ) : (
              <div className={styles.success}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <h4>Solicitud registrada</h4>
                <p>Un asesor de Nexara te contactara en breve.</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
