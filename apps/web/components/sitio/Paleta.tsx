"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import { applyPublicTheme } from "@/components/PublicThemeToggle";
import { GEO_CITIES } from "@/lib/seo/geo-cities";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import p from "./paleta.module.css";
import { ABRIR_PALETA, MENU_INDUSTRIAS, MENU_SERVICIOS } from "./Encabezado";
import { ruta } from "./rutas";
import { GUIAS } from "@/lib/guias";

type Item = {
  id: string;
  grupo: "Páginas" | "Servicios" | "Industrias" | "Ciudades" | "Guías" | "Acciones";
  titulo: string;
  detalle?: string;
  /** Palabras que la gente escribe y no salen en el título (CCTV, wifi, ERP…). */
  claves?: string;
  icono: PublicIconName;
  href?: string;
  externo?: boolean;
  accion?: "copiar-correo" | "tema";
};

const CORREO = "gerencia@nexara.com.mx";

/** Sinónimos por sección de /servicios. */
const CLAVES_SERVICIO: Record<string, string> = {
  "#cctv": "cctv camaras seguridad videovigilancia nvr dvr grabacion monitoreo control de acceso",
  "#redes": "wifi wi-fi internet red redes cableado switch fibra radioenlace enlace",
  "#computo": "computadoras pc equipo de computo servidores rack respaldo backup laptops",
  "#soporte": "soporte mesa de ayuda helpdesk sla mantenimiento tecnico ti",
  "#software": "software erp automatizacion portal tablero dashboard indicadores app",
};

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function armarItems(): Item[] {
  const paginas: Item[] = [
    { id: "p-inicio", grupo: "Páginas", titulo: "Inicio", icono: "building", href: ruta("/") },
    { id: "p-servicios", grupo: "Páginas", titulo: "Servicios", detalle: "Las cinco especialidades", icono: "layers", href: ruta("/servicios") },
    { id: "p-proyectos", grupo: "Páginas", titulo: "Proyectos", detalle: "Casos y galería de campo", icono: "clipboard", href: ruta("/proyectos") },
    { id: "p-nosotros", grupo: "Páginas", titulo: "Nosotros", detalle: "Equipo y principios", icono: "users", href: ruta("/nosotros") },
    { id: "p-contacto", grupo: "Páginas", titulo: "Contacto", detalle: "Cotiza tu proyecto", icono: "phone", href: ruta("/contacto") },
    { id: "p-blog", grupo: "Páginas", titulo: "Blog", detalle: "Guías y notas de campo", icono: "fileCheck", href: "/blog" },
    { id: "p-qa", grupo: "Páginas", titulo: "Preguntas frecuentes", detalle: "Tiempos, garantías y cotización", claves: "faq dudas precio costo", icono: "search", href: "/qa" },
    { id: "p-privacidad", grupo: "Páginas", titulo: "Aviso de privacidad", detalle: "Legal", claves: "datos personales terminos cookies", icono: "lock", href: "/legal/privacidad" },
  ];
  const servicios: Item[] = MENU_SERVICIOS.filter((o) => o.href.includes("#")).map((o) => ({
    id: `s-${o.href}`,
    grupo: "Servicios",
    titulo: o.titulo,
    detalle: o.texto,
    claves: CLAVES_SERVICIO[o.href.slice(o.href.indexOf("#"))],
    icono: o.icono,
    href: ruta(o.href),
  }));
  const guias: Item[] = GUIAS.map((g) => ({
    id: `g-${g.slug}`,
    grupo: "Guías",
    titulo: g.titulo,
    detalle: `${g.tema} · ${g.lectura} min`,
    icono: "fileCheck",
    href: `/blog/${g.slug}`,
  }));
  const industrias: Item[] = MENU_INDUSTRIAS.map((o) => ({
    id: `i-${o.href}`,
    grupo: "Industrias",
    titulo: o.titulo,
    detalle: o.texto,
    icono: o.icono,
    href: o.href,
  }));
  const ciudades: Item[] = GEO_CITIES.map((c) => ({
    id: `c-${c.slug}`,
    grupo: "Ciudades",
    titulo: c.name,
    detalle: c.region === c.name ? "Cobertura" : `Cobertura · ${c.region}`,
    icono: "mapPin",
    href: `/cobertura/${c.slug}`,
  }));
  const acciones: Item[] = [
    {
      id: "a-whatsapp",
      grupo: "Acciones",
      titulo: "Escribir por WhatsApp",
      detalle: "+52 222 696 0350",
      icono: "phone",
      href: buildWhatsAppLeadUrl({ industryName: "mi empresa", serviceName: "CCTV, redes o soporte TI", path: "/" }),
      externo: true,
    },
    { id: "a-llamar", grupo: "Acciones", titulo: "Llamar", detalle: "Lunes a viernes, 9:00 a 18:00", icono: "phone", href: "tel:+522226960350", externo: true },
    { id: "a-correo", grupo: "Acciones", titulo: "Copiar correo", detalle: CORREO, icono: "fileCheck", accion: "copiar-correo" },
    { id: "a-tema", grupo: "Acciones", titulo: "Cambiar tema claro u oscuro", icono: "refresh", accion: "tema" },
  ];
  return [...paginas, ...servicios, ...industrias, ...ciudades, ...guias, ...acciones];
}

/**
 * Paleta de comandos del sitio (⌘K / Ctrl+K o «/»): busca páginas, servicios, industrias y ciudades, y lanza
 * acciones de contacto. Flechas para moverse, Enter para abrir y Esc para cerrar.
 */
export default function Paleta() {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [activo, setActivo] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const previo = useRef<HTMLElement | null>(null);
  const todos = useMemo(armarItems, []);

  const resultados = useMemo(() => {
    const palabras = normal(consulta).split(/\s+/).filter(Boolean);
    if (!palabras.length) return todos.filter((i) => i.grupo !== "Ciudades" && i.grupo !== "Industrias" && i.grupo !== "Guías");
    return todos.filter((i) => {
      const texto = normal(`${i.titulo} ${i.detalle ?? ""} ${i.claves ?? ""} ${i.grupo}`);
      return palabras.every((w) => texto.includes(w));
    });
  }, [consulta, todos]);

  const abrir = useCallback(() => {
    previo.current = document.activeElement as HTMLElement | null;
    setConsulta("");
    setActivo(0);
    setAbierta(true);
  }, []);

  const cerrar = useCallback(() => {
    setAbierta(false);
    previo.current?.focus?.();
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const escribiendo = (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (abierta) cerrar();
        else abrir();
      } else if (e.key === "/" && !escribiendo && !abierta) {
        e.preventDefault();
        abrir();
      }
    };
    window.addEventListener("keydown", alTeclear);
    window.addEventListener(ABRIR_PALETA, abrir);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener(ABRIR_PALETA, abrir);
    };
  }, [abierta, abrir, cerrar]);

  useEffect(() => {
    if (!abierta) return;
    entrada.current?.focus();
    const previoOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previoOverflow;
    };
  }, [abierta]);

  useEffect(() => setActivo(0), [consulta]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  useEffect(() => {
    if (!aviso) return;
    const id = window.setTimeout(() => setAviso(null), 1800);
    return () => window.clearTimeout(id);
  }, [aviso]);

  const ejecutar = async (item: Item) => {
    if (item.accion === "copiar-correo") {
      try {
        await navigator.clipboard.writeText(CORREO);
        setAviso("Correo copiado");
      } catch {
        setAviso(CORREO);
      }
      return;
    }
    if (item.accion === "tema") {
      const oscuro = document.documentElement.getAttribute("data-public-theme") === "dark";
      applyPublicTheme(oscuro ? "light" : "dark");
      setAviso(oscuro ? "Tema claro" : "Tema oscuro");
      return;
    }
    if (!item.href) return;
    setAbierta(false);
    if (item.externo) window.open(item.href, item.href.startsWith("http") ? "_blank" : "_self", "noopener");
    else router.push(item.href);
  };

  const alTeclearLista = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => Math.min(resultados.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = resultados[activo];
      if (item) void ejecutar(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
    }
  };

  if (!abierta) return aviso ? <div className={p.aviso} role="status">{aviso}</div> : null;

  let grupoAnterior = "";
  return (
    <div className={p.fondo} onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className={p.paleta} role="dialog" aria-modal="true" aria-label="Buscar en el sitio" onKeyDown={alTeclearLista}>
        <div className={p.campo}>
          <PublicIcon name="search" size={20} />
          <input
            ref={entrada}
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Busca un servicio, una industria o una ciudad…"
            aria-label="Buscar"
            aria-controls="paleta-resultados"
            aria-activedescendant={resultados[activo] ? `paleta-${resultados[activo].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={p.tecla}>Esc</kbd>
        </div>
        <ul ref={lista} id="paleta-resultados" className={p.resultados} role="listbox" aria-label="Resultados">
          {resultados.length === 0 ? <li className={p.vacio}>Sin resultados para «{consulta}».</li> : null}
          {resultados.map((item, i) => {
            const encabezado = item.grupo !== grupoAnterior ? item.grupo : null;
            grupoAnterior = item.grupo;
            return (
              <li key={item.id} role="presentation">
                {encabezado ? <p className={p.grupo}>{encabezado}</p> : null}
                <button
                  type="button"
                  id={`paleta-${item.id}`}
                  role="option"
                  aria-selected={i === activo}
                  data-indice={i}
                  className={p.item}
                  onMouseMove={() => setActivo(i)}
                  onClick={() => void ejecutar(item)}
                  tabIndex={-1}
                >
                  <span className={p.icono}>
                    <PublicIcon name={item.icono} size={16} />
                  </span>
                  <span className={p.texto}>
                    <span className={p.titulo}>{item.titulo}</span>
                    {item.detalle ? <span className={p.detalle}>{item.detalle}</span> : null}
                  </span>
                  {i === activo ? <kbd className={p.tecla}>↵</kbd> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className={p.ayuda}>
          <span>
            <kbd className={p.tecla}>↑</kbd>
            <kbd className={p.tecla}>↓</kbd> para moverte
          </span>
          <span>
            <kbd className={p.tecla}>↵</kbd> para abrir
          </span>
          <span>
            <kbd className={p.tecla}>Esc</kbd> para cerrar
          </span>
        </p>
        {aviso ? (
          <p className={p.avisoDentro} role="status">
            {aviso}
          </p>
        ) : null}
      </div>
    </div>
  );
}
