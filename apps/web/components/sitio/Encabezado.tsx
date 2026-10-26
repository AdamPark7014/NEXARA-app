"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import s from "./encabezado.module.css";
import base from "./sitio.module.css";
import TemaBoton from "./TemaBoton";
import Flecha from "./Flecha";

type Opcion = { href: string; titulo: string; texto: string; icono: PublicIconName };

export const MENU_SERVICIOS: Opcion[] = [
  { href: "/servicios#cctv", titulo: "Videovigilancia", texto: "Cámaras IP, grabación y monitoreo", icono: "camera" },
  { href: "/servicios#redes", titulo: "Redes y Wi‑Fi", texto: "Cableado certificado y Wi‑Fi estable", icono: "wifi" },
  { href: "/servicios#computo", titulo: "Infraestructura y cómputo", texto: "Racks, servidores y respaldos", icono: "server" },
  { href: "/servicios#soporte", titulo: "Soporte y gestión TI", texto: "Mesa de ayuda con SLA, remota y en sitio", icono: "headset" },
  { href: "/servicios#software", titulo: "Plataformas a la medida", texto: "Portales, automatización e indicadores", icono: "code" },
  { href: "/proyectos", titulo: "Proyectos", texto: "Instalaciones reales en operación", icono: "layers" },
];

export const MENU_INDUSTRIAS: Opcion[] = [
  { href: "/soluciones/retail", titulo: "Retail", texto: "Un estándar para cada sucursal", icono: "store" },
  { href: "/soluciones/manufactura", titulo: "Manufactura", texto: "Redes y perímetro de planta", icono: "factory" },
  { href: "/soluciones/hospitalidad", titulo: "Hospitalidad", texto: "Wi‑Fi y vigilancia por propiedad", icono: "hotel" },
  { href: "/soluciones/salud", titulo: "Salud", texto: "Continuidad para la atención", icono: "hospital" },
  { href: "/soluciones/educacion", titulo: "Educación", texto: "Campus seguros y conectados", icono: "school" },
  { href: "/soluciones/gobierno", titulo: "Gobierno", texto: "Entregables que se pueden auditar", icono: "landmark" },
];

const ENLACES = [
  { href: "/proyectos", label: "Proyectos" },
  { href: "/nosotros", label: "Nosotros" },
  { href: "/blog", label: "Blog" },
];

type MenuId = "servicios" | "industrias";

const Chevron = () => (
  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 3.5l3 3 3-3" />
  </svg>
);

export default function Encabezado({ inicio = "/" }: { inicio?: string }) {
  const ruta = usePathname();
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [hoja, setHoja] = useState(false);
  const [hojaGrupo, setHojaGrupo] = useState<MenuId | null>(null);
  const [bajado, setBajado] = useState(false);
  const cierre = useRef<number>();

  useEffect(() => {
    const alBajar = () => setBajado(window.scrollY > 8);
    alBajar();
    window.addEventListener("scroll", alBajar, { passive: true });
    return () => window.removeEventListener("scroll", alBajar);
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(null);
      setHoja(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  // Con la hoja abierta la página de atrás no se mueve.
  useEffect(() => {
    if (!hoja) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [hoja]);

  useEffect(() => {
    setHoja(false);
    setMenu(null);
  }, [ruta]);

  const abrir = (id: MenuId) => {
    window.clearTimeout(cierre.current);
    setMenu(id);
  };
  const cerrarLuego = () => {
    window.clearTimeout(cierre.current);
    cierre.current = window.setTimeout(() => setMenu(null), 140);
  };

  const actual = (href: string) => (ruta === href || ruta?.startsWith(`${href}/`) ? "page" : undefined);

  const grupo = (id: MenuId, etiqueta: string, opciones: Opcion[], pie: React.ReactNode) => (
    <div className={s.grupo} onPointerEnter={() => abrir(id)} onPointerLeave={cerrarLuego}>
      <button
        type="button"
        className={s.navEnlace}
        aria-expanded={menu === id}
        aria-controls={`menu-${id}`}
        onClick={() => (menu === id ? setMenu(null) : abrir(id))}
      >
        {etiqueta}
        <Chevron />
      </button>
      {menu === id ? (
        <div className={s.panelPuente}>
          <div id={`menu-${id}`} className={`${s.panel} ${id === "industrias" ? s.panelAngosto : ""}`}>
            <div className={s.panelRejilla}>
              {opciones.map((o) => (
                <Link key={o.href} href={o.href} className={s.opcion} onClick={() => setMenu(null)}>
                  <span className={s.opcionIcono}>
                    <PublicIcon name={o.icono} size={20} />
                  </span>
                  <span>
                    <span className={s.opcionTitulo}>{o.titulo}</span>
                    <span className={s.opcionTexto}>{o.texto}</span>
                  </span>
                </Link>
              ))}
            </div>
            <div className={s.panelPie}>{pie}</div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <header className={s.barra} data-bajado={bajado || hoja ? "true" : "false"}>
      <div className={`${base.contenedor} ${s.fila}`}>
        <Link href={inicio} className={s.marca} aria-label="NEXARA, inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexara-mark-v2.png" alt="" className={s.marcaIso} width={30} height={30} />
          <span className={s.marcaNombre}>NEXARA</span>
        </Link>

        <nav className={s.nav} aria-label="Principal">
          {grupo(
            "servicios",
            "Servicios",
            MENU_SERVICIOS,
            <>
              <span>¿No sabes por dónde empezar?</span>
              <Link href="/contacto" onClick={() => setMenu(null)}>
                Agenda un diagnóstico
                <Flecha />
              </Link>
            </>,
          )}
          {grupo(
            "industrias",
            "Industrias",
            MENU_INDUSTRIAS,
            <>
              <span>Cada industria tiene su riesgo típico.</span>
              <Link href="/servicios" onClick={() => setMenu(null)}>
                Ver todos los servicios
                <Flecha />
              </Link>
            </>,
          )}
          {ENLACES.map((l) => (
            <Link key={l.href} href={l.href} className={s.navEnlace} aria-current={actual(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={s.lado}>
          <Link href="/contacto" className={`${s.navEnlace} ${s.contacto}`} aria-current={actual("/contacto")}>
            Contacto
          </Link>
          <TemaBoton className={s.icono} />
          <Link href="/contacto" className={s.cta} data-track-conversion="header_cta">
            Cotizar
            <Flecha />
          </Link>
          <button
            type="button"
            className={`${s.icono} ${s.menuBoton}`}
            aria-expanded={hoja}
            aria-controls="sitio-hoja"
            aria-label={hoja ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setHoja((v) => !v)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      {hoja ? (
        <div id="sitio-hoja" className={s.hoja} role="dialog" aria-modal="true" aria-label="Menú">
          {(
            [
              ["servicios", "Servicios", MENU_SERVICIOS],
              ["industrias", "Industrias", MENU_INDUSTRIAS],
            ] as const
          ).map(([id, etiqueta, opciones]) => (
            <div key={id} className={s.hojaGrupo}>
              <button
                type="button"
                className={s.hojaEnlace}
                aria-expanded={hojaGrupo === id}
                onClick={() => setHojaGrupo((g) => (g === id ? null : id))}
              >
                {etiqueta}
                <Chevron />
              </button>
              {hojaGrupo === id ? (
                <div className={s.hojaSub}>
                  {opciones.map((o) => (
                    <Link key={o.href} href={o.href}>
                      <span className={s.opcionIcono}>
                        <PublicIcon name={o.icono} size={18} />
                      </span>
                      {o.titulo}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {[...ENLACES, { href: "/contacto", label: "Contacto" }].map((l) => (
            <div key={l.href} className={s.hojaGrupo}>
              <Link href={l.href} className={s.hojaEnlace} aria-current={actual(l.href)}>
                {l.label}
              </Link>
            </div>
          ))}
          <div className={s.hojaAcciones}>
            <Link href="/contacto" className={`${base.boton} ${base.botonPrimario}`}>
              Cotiza tu proyecto
            </Link>
          </div>
          <div className={s.hojaPie}>
            <a href="tel:+522226960350">+52 222 696 0350</a>
            <a href="mailto:gerencia@nexara.com.mx">gerencia@nexara.com.mx</a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
