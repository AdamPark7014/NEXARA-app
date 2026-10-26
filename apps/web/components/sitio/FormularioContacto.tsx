"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PhoneField from "@/components/PhoneField";
import PublicIcon from "@/app/components/PublicIcon";
import { buildApiUrl } from "@/lib/api-base";
import { findGeoCity } from "@/lib/seo/geo-cities";
import { findServiceLanding } from "@/lib/seo/programmatic-landings";
import s from "./sitio.module.css";
import p from "./paginas.module.css";
import Flecha from "./Flecha";

/** `?servicio=` llega desde los bloques de Servicios. */
const SERVICIO_NOMBRE: Record<string, string> = {
  cctv: "videovigilancia",
  redes: "redes y Wi‑Fi",
  computo: "infraestructura y cómputo",
  soporte: "soporte TI",
  software: "una plataforma a la medida",
};

/**
 * El mismo envío que el formulario actual de Contacto (`POST contact-messages`, origen `contacto-page`);
 * solo cambia la presentación. Lee `?servicio=`, `?service=`, `?city=` e `?industry=` para prellenar el mensaje.
 */
export default function FormularioContacto() {
  const params = useSearchParams();
  const [estado, setEstado] = useState<"listo" | "enviando" | "enviado">("listo");
  const [error, setError] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const forma = useRef<HTMLFormElement>(null);

  const prellenado = useMemo(() => {
    const servicio = params.get("servicio");
    const ciudad = params.get("city") ? findGeoCity(params.get("city") || "") : undefined;
    const landing = params.get("service") ? findServiceLanding(params.get("service") || "") : undefined;
    const que = (servicio && SERVICIO_NOMBRE[servicio]) || landing?.name;
    if (!que && !ciudad) return "";
    return `Hola, NEXARA:\nMe interesa cotizar${que ? ` ${que}` : ""}${ciudad ? ` en ${ciudad.name}` : ""}.\n\nSitio y contexto:\n`;
  }, [params]);

  const enviar: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError(null);
    setEstado("enviando");
    const datos = new FormData(e.currentTarget);
    const mensaje = String(datos.get("message") || "");
    try {
      const res = await fetch(buildApiUrl("contact-messages"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(datos.get("name") || ""),
          email: String(datos.get("email") || ""),
          phone: telefono.trim() || undefined,
          subject: mensaje.slice(0, 80) || "Contacto web",
          category: String(datos.get("category") || "VENTAS"),
          message: mensaje,
          source: "contacto-page",
          pageUrl: window.location.pathname + window.location.search,
        }),
      });
      if (!res.ok) {
        setError("No se pudo enviar el mensaje. Intenta de nuevo o escríbenos por WhatsApp.");
        setEstado("listo");
        return;
      }
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
      setEstado("listo");
      return;
    }
    setEstado("enviado");
  };

  if (estado === "enviado") {
    return (
      <div className={p.formulario}>
        <div className={p.listo} role="status">
          <span className={p.listoIcono}>
            <PublicIcon name="check" size={28} />
          </span>
          <h2 className={p.formularioTitulo}>Mensaje recibido.</h2>
          <p className={p.formularioNota}>Te contactamos en horario laboral; por lo general, en menos de un día hábil.</p>
          <button
            type="button"
            className={`${s.boton} ${s.botonSecundario}`}
            onClick={() => {
              setEstado("listo");
              forma.current?.reset();
            }}
          >
            Enviar otro mensaje
          </button>
        </div>
      </div>
    );
  }

  const enviando = estado === "enviando";
  return (
    <div className={p.formulario}>
      <h2 className={p.formularioTitulo}>Cuéntanos tu proyecto.</h2>
      <p className={p.formularioNota}>Qué necesitas, cuántas sedes y qué tan urgente es.</p>
      <form ref={forma} className={p.campos} onSubmit={enviar}>
        <div className={p.camposFila}>
          <label className={p.campo}>
            Nombre
            <input name="name" type="text" required autoComplete="name" placeholder="Tu nombre" disabled={enviando} />
          </label>
          <label className={p.campo}>
            Correo
            <input name="email" type="email" required autoComplete="email" placeholder="tu@empresa.com" disabled={enviando} />
          </label>
        </div>
        <div className={p.camposFila}>
          <label className={p.campo}>
            Teléfono (opcional)
            <PhoneField value={telefono} onChange={setTelefono} disabled={enviando} placeholder="+52 222 000 0000" />
          </label>
          <label className={p.campo}>
            ¿En qué te ayudamos?
            <select name="category" required disabled={enviando} defaultValue="VENTAS">
              <option value="VENTAS">Proyecto nuevo o cotización</option>
              <option value="SOPORTE">Soporte técnico</option>
              <option value="ALIANZA">Alianza comercial</option>
            </select>
          </label>
        </div>
        <label className={p.campo}>
          Mensaje
          <textarea
            name="message"
            required
            key={prellenado || "vacio"}
            defaultValue={prellenado || undefined}
            placeholder="Qué necesitas, dónde y para cuándo."
            disabled={enviando}
          />
        </label>
        {error ? (
          <p className={p.error} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className={`${s.boton} ${s.botonPrimario} ${p.enviar}`} disabled={enviando} data-track-conversion="contact_submit">
          {enviando ? "Enviando…" : error ? "Reintentar" : "Enviar mensaje"}
          <Flecha />
        </button>
        <p className={p.legal}>
          Al enviar aceptas el <Link href="/legal/privacidad">Aviso de Privacidad</Link>.
        </p>
      </form>
    </div>
  );
}
