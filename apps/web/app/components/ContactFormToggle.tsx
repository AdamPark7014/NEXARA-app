"use client";
import React, { useState, useEffect } from "react";
import styles from "../page.module.css";

export default function ContactFormToggle() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const entries: [string, FormDataEntryValue][] = [];
    formData.forEach((value, key) => {
      entries.push([key, value]);
    });
    const data = Object.fromEntries(entries);
    // TODO: Integrate with API endpoint or email service
    console.log("Contacto:", data);
    setSubmitted(true);
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
                <input id="name" name="name" type="text" required placeholder="Tu nombre" />
              </div>
              <div className={styles.formField}>
                <label htmlFor="company">Empresa</label>
                <input id="company" name="company" type="text" placeholder="Nombre de la empresa" />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label htmlFor="email">Correo</label>
                <input id="email" name="email" type="email" required placeholder="tucorreo@ejemplo.com" />
              </div>
              <div className={styles.formField}>
                <label htmlFor="phone">Teléfono</label>
                <input id="phone" name="phone" type="tel" placeholder="(+52) 55 0000 0000" />
              </div>
            </div>
            <div className={styles.formField}>
              <label htmlFor="message">Mensaje</label>
              <textarea id="message" name="message" rows={4} placeholder="Cuéntanos qué necesitas" />
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitButton}>Enviar datos</button>
              <button type="button" className={styles.cancelButton} onClick={() => setOpen(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className={styles.contactSuccess}>¡Gracias! Te contactaremos pronto.</div>
        )}
      </div>
    </section>
  );
}
