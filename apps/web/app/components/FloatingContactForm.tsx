"use client";
import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./FloatingContactForm.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { openExternalUrl } from "@/lib/open-external-url";

const WA_URL =
  "https://wa.me/522226960350?text=Hola%2C%20me%20interesa%20informaci%C3%B3n%20de%20Nexara";

const TIPO_OPTIONS = [
  { value: "EMPRESA", label: "Empresa" },
  { value: "PERSONA", label: "Persona" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "VENTAS", label: "Proyecto / cotización" },
  { value: "SOPORTE", label: "Soporte técnico" },
  { value: "ALIANZA", label: "Alianza comercial" },
] as const;

type Tipo = (typeof TIPO_OPTIONS)[number]["value"];

export default function FloatingContactForm() {
  const pathname = usePathname();
  const hideOnContact = (pathname?.replace(/\/+$/, "") || "") === "/contacto";
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("EMPRESA");
  const [category, setCategory] = useState("");
  const [categoryError, setCategoryError] = useState(false);
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
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!category) {
      setCategoryError(true);
      return;
    }
    setCategoryError(false);
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const entries: [string, FormDataEntryValue][] = [];
    formData.forEach((value, key) => {
      entries.push([key, value]);
    });
    const data = Object.fromEntries(entries) as Record<string, FormDataEntryValue>;

    const categoryLabel =
      CATEGORY_OPTIONS.find((option) => option.value === category)?.label || category;

    const payload = {
      name: String(data.name || ""),
      email: String(data.email || ""),
      phone: data.phone ? String(data.phone) : undefined,
      company: tipo === "EMPRESA" && data.company ? String(data.company) : undefined,
      subject: `${categoryLabel} · ${tipo === "EMPRESA" ? "Empresa" : "Persona"}`,
      category,
      message: String(data.message || ""),
      source: "contacto-floating",
      pageUrl: typeof window !== "undefined" ? window.location.pathname : undefined,
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
      setOpen(false);
      setCategory("");
      setCategoryError(false);
      setTipo("EMPRESA");
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

  if (hideOnContact) return null;

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
            role="dialog"
            aria-modal="true"
            aria-labelledby="floating-contact-title"
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Hablemos</p>
                <h3 id="floating-contact-title">Cuéntanos tu proyecto</h3>
              </div>
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

            <div className={styles.panelMeta}>
              <span>Respuesta típica &lt; 24 h hábiles</span>
              <button
                type="button"
                className={styles.waQuick}
                onClick={() => void openExternalUrl(WA_URL)}
              >
                <svg className={styles.waIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp directo
              </button>
            </div>

            {!submitted ? (
              <form className={styles.form} onSubmit={onSubmit}>
                <div className={styles.formField}>
                  <span className={styles.fieldLabel}>Soy</span>
                  <div className={styles.segmented} role="radiogroup" aria-label="Tipo de contacto">
                    {TIPO_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={tipo === option.value}
                        className={`${styles.segmentedOption} ${tipo === option.value ? styles.segmentedActive : ""}`}
                        onClick={() => setTipo(option.value)}
                        disabled={loading}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label htmlFor="float-name">Nombre *</label>
                    <input
                      id="float-name"
                      name="name"
                      type="text"
                      required
                      placeholder="Tu nombre"
                      disabled={loading}
                    />
                  </div>
                  {tipo === "EMPRESA" ? (
                    <div className={styles.formField}>
                      <label htmlFor="float-company">Empresa *</label>
                      <input
                        id="float-company"
                        name="company"
                        type="text"
                        required
                        placeholder="Nombre de la empresa"
                        disabled={loading}
                      />
                    </div>
                  ) : null}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label htmlFor="float-email">Email *</label>
                    <input
                      id="float-email"
                      name="email"
                      type="email"
                      required
                      placeholder="tu@correo.com"
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
                </div>

                <div className={styles.formField}>
                  <span id="float-category-label" className={styles.fieldLabel}>
                    ¿En qué podemos ayudarte? *
                  </span>
                  <div
                    className={styles.chipGroup}
                    role="radiogroup"
                    aria-labelledby="float-category-label"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={category === option.value}
                        className={`${styles.chip} ${category === option.value ? styles.chipActive : ""} ${categoryError && !category ? styles.chipInvalid : ""}`}
                        onClick={() => {
                          setCategory(option.value);
                          setCategoryError(false);
                        }}
                        disabled={loading}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {categoryError && (
                    <p className={styles.fieldError}>Selecciona una opción para continuar.</p>
                  )}
                </div>

                <div className={styles.formField}>
                  <label htmlFor="float-message">Mensaje *</label>
                  <textarea
                    id="float-message"
                    name="message"
                    rows={3}
                    required
                    placeholder={
                      tipo === "EMPRESA"
                        ? "Qué necesitas, sedes aproximadas y urgencia…"
                        : "Qué necesitas y en qué zona…"
                    }
                    disabled={loading}
                  />
                </div>

                <button type="submit" className={styles.submitButton} disabled={loading}>
                  {loading ? "Enviando…" : "Enviar mensaje"}
                </button>
                <p className={styles.footNote}>
                  Al enviar aceptas el seguimiento de tu solicitud.
                </p>
              </form>
            ) : (
              <div className={styles.success}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <h4>Mensaje recibido</h4>
                <p>Te contactamos en horario laboral.</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
