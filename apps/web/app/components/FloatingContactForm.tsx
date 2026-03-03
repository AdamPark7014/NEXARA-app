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
      {/* Floating Action Button */}
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
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="16" cy="12" r="1" fill="currentColor" />
            <circle cx="8" cy="12" r="1" fill="currentColor" />
          </svg>
        )}
      </button>

      {/* Floating Panel */}
      {open && (
        <>
          <div className={styles.overlay} onClick={handleClose} />
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3>Contáctanos</h3>
              <button
                type="button"
                className={styles.closeButton}
                onClick={handleClose}
                aria-label="Cerrar formulario"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
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
                  {loading ? "Enviando..." : "Enviar mensaje"}
                </button>
              </form>
            ) : (
              <div className={styles.success}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <h4>¡Mensaje enviado!</h4>
                <p>Nos pondremos en contacto contigo pronto.</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
