"use client";
import React, { useState, useEffect } from "react";
import styles from "../page.module.css";
import { buildApiUrl } from "@/lib/api-base";

export default function ContactFormToggle() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Allow other components (FAQ) to request opening this panel
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      const el = document.getElementById("contact-panel");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("open-contact-request", handler);
    return () => window.removeEventListener("open-contact-request", handler);
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
      category: String(data.category || "VENTAS"),
      message: String(data.message || "Solicitud de contacto desde landing"),
      newsletter: false,
      source: "landing-cta",
      pageUrl: typeof window !== "undefined" ? window.location.pathname : "/",
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
      setLoading(false);
      setSubmitted(true);
    } catch {
      setLoading(false);
    }
  };

  return (
    <section className={styles.contactSection}>
      <div className={styles.contactHeader}>
        <button
          type="button"
          className={styles.contactButton}
          aria-expanded={open}
          aria-controls="contact-panel"
          onClick={() => setOpen((v) => !v)}
        >
          Listo para transformar tu empresa
        </button>
        <p className={styles.contactHint}>Déjanos tus datos y te contactamos.</p>
      </div>

      <div
        id="contact-panel"
        className={`${styles.contactPanel} ${open ? styles.contactPanelOpen : ""}`}
      >
        {!submitted ? (
          <form className={styles.contactForm} onSubmit={onSubmit}>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label htmlFor="name">Nombre</label>
                <input id="name" name="name" type="text" required placeholder="Tu nombre" disabled={loading} />
              </div>
              <div className={styles.formField}>
                <label htmlFor="company">Empresa</label>
                <input id="company" name="company" type="text" placeholder="Nombre de la empresa" disabled={loading} />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label htmlFor="email">Correo</label>
                <input id="email" name="email" type="email" required placeholder="tucorreo@ejemplo.com" disabled={loading} />
              </div>
              <div className={styles.formField}>
                <label htmlFor="phone">Teléfono</label>
                <input id="phone" name="phone" type="tel" placeholder="(+52) 55 0000 0000" disabled={loading} />
              </div>
            </div>
            <div className={styles.formField}>
              <label htmlFor="cta-category">¿En qué te interesa?</label>
              <select id="cta-category" name="category" required disabled={loading}>
                <option value="">Selecciona una opción</option>
                <option value="SOPORTE">Soporte y ayuda</option>
                <option value="VENTAS">Ventas, productos o proyectos</option>
              </select>
            </div>
            <div className={styles.formField}>
              <label htmlFor="message">Mensaje</label>
              <textarea id="message" name="message" rows={4} placeholder="Cuéntanos qué necesitas" disabled={loading} />
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitButton} disabled={loading}>
                {loading ? "Enviando..." : "Enviar datos"}
              </button>
              <button type="button" className={styles.cancelButton} onClick={() => setOpen(false)} disabled={loading}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className={styles.contactSuccess}>¡Gracias! Te contactaremos pronto.</div>
        )}
      </div>
    </section>
  );
}
