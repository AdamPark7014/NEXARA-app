"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import PhoneField from "@/components/PhoneField";
import PublicIcon from "@/app/components/PublicIcon";
import { buildApiUrl } from "@/lib/api-base";
import { findGeoCity } from "@/lib/seo/geo-cities";
import { findIndustryLanding, findServiceLanding } from "@/lib/seo/programmatic-landings";
import s from "./sitio.module.css";
import p from "./paginas.module.css";
import x from "./profundo.module.css";
import Flecha from "./Flecha";
import { SENALES, type Senal } from "./senales";
import { MENU_INDUSTRIAS } from "./Encabezado";

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
  const [elegidos, setElegidos] = useState<Senal["id"][]>([]);
  const [avance, setAvance] = useState(0);

  const medirAvance = () => {
    const f = forma.current;
    if (!f) return;
    const campos = Array.from(f.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[required], textarea[required]"));
    setAvance(campos.filter((c) => c.value.trim() && c.checkValidity()).length / campos.length);
  };

  /** Lo que se toca arriba queda escrito como primer renglón del mensaje, sin borrar lo demás. */
  const alternar = (id: Senal["id"]) => {
    const lista = elegidos.includes(id) ? elegidos.filter((e) => e !== id) : [...elegidos, id];
    setElegidos(lista);
    const t = forma.current?.elements.namedItem("message");
    if (t instanceof HTMLTextAreaElement) {
      const resto = t.value.replace(/^Me interesa: [^\n]*\n?/, "");
      const nombres = SENALES.filter((n) => lista.includes(n.id)).map((n) => n.nombre);
      t.value = nombres.length ? `Me interesa: ${nombres.join(", ")}.\n${resto}` : resto;
    }
    medirAvance();
  };

  const prellenado = useMemo(() => {
    const servicio = params.get("servicio");
    const ciudad = params.get("city") ? findGeoCity(params.get("city") || "") : undefined;
    const landing = params.get("service") ? findServiceLanding(params.get("service") || "") : undefined;
    const slugIndustria = params.get("industry");
    const industria = slugIndustria
      ? (findIndustryLanding(slugIndustria)?.name ?? MENU_INDUSTRIAS.find((m) => m.href === `/soluciones/${slugIndustria}`)?.titulo)
      : undefined;
    const que = (servicio && SERVICIO_NOMBRE[servicio]) || landing?.name;
    if (!que && !ciudad && !industria) return "";
    const para = industria ? ` para ${que ? "" : "mi operación de "}${industria.toLowerCase()}` : "";
    return `Hola, NEXARA:\nMe interesa cotizar${que ? ` ${que}` : " un proyecto"}${para}${ciudad ? ` en ${ciudad.name}` : ""}.\n\nSitio y contexto:\n`;
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
              setElegidos([]);
              setAvance(0);
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
    <div className={p.formulario} data-luz="">
      <span className={x.avance} style={{ "--avance": avance } as CSSProperties} aria-hidden="true" />
      <h2 className={p.formularioTitulo}>Cuéntanos tu proyecto.</h2>
      <p className={p.formularioNota}>Qué necesitas, cuántas sedes y qué tan urgente es.</p>
      <form ref={forma} className={p.campos} onSubmit={enviar} onInput={medirAvance} data-cede-aviso="">
        <fieldset className={x.senales} disabled={enviando}>
          <legend>¿Qué quieres resolver? Elige uno o varios.</legend>
          {SENALES.map((n) => (
            <button key={n.id} type="button" aria-pressed={elegidos.includes(n.id)} onClick={() => alternar(n.id)} style={{ "--c": n.color } as CSSProperties}>
              <span>
                <PublicIcon name={n.icono} size={20} />
              </span>
              {n.nombre}
            </button>
          ))}
        </fieldset>
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
