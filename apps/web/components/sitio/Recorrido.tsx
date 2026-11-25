"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { HEXAGONO } from "./senales";
import v from "./vivo.module.css";

type Parada = { el: HTMLElement; nombre: string };

/**
 * La pista que baja por la orilla de la página (pantallas anchas): un nodo por sección, encendido hasta donde va la
 * lectura. Se arma con los títulos de la página, así que sirve en todas. Tocar un nodo lleva a su sección.
 */
export default function Recorrido() {
  const camino = usePathname();
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [activa, setActiva] = useState(0);
  const [noche, setNoche] = useState(true);

  useEffect(() => {
    const lista = Array.from(document.querySelectorAll<HTMLElement>("[data-sitio] main > section"))
      .map((el) => {
        const t = el.querySelector<HTMLElement>("h1, h2");
        const varios = el.querySelectorAll("h2").length > 1;
        const nombre = (!varios && t ? t.textContent : el.getAttribute("aria-label")) ?? "";
        return { el, nombre: nombre.replace(/\s+/g, " ").trim().replace(/\.$/, "") };
      })
      .filter((p) => p.nombre && p.el.offsetHeight > 160);
    const sirve = lista.length > 3;
    setParadas(sirve ? lista : []);
    setActiva(0);
    if (!sirve) return;

    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const mitad = window.innerHeight * 0.5;
      let i = 0;
      lista.forEach((p, n) => {
        if (p.el.getBoundingClientRect().top <= mitad) i = n;
      });
      setActiva(i);
      setNoche(
        Array.from(document.querySelectorAll("[data-hero-noche], [data-noche-zona]")).some((z) => {
          const r = z.getBoundingClientRect();
          return r.top < mitad && r.bottom > mitad;
        }),
      );
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, [camino]);

  if (!paradas.length) return null;
  return (
    <nav className={v.recorrido} aria-label="Secciones de la página" data-noche={noche ? "" : undefined}>
      <span className={v.recorridoPista} style={{ "--avance": activa / (paradas.length - 1) } as CSSProperties} aria-hidden="true" />
      {paradas.map((p, i) => (
        <button
          key={`${i}-${p.nombre}`}
          type="button"
          data-estado={i === activa ? "aqui" : i < activa ? "visto" : undefined}
          aria-current={i === activa ? "location" : undefined}
          onClick={() =>
            p.el.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
              block: "start",
            })
          }
        >
          <svg viewBox="0 0 52 56" aria-hidden="true">
            <path d={HEXAGONO} />
          </svg>
          <span>{p.nombre}</span>
        </button>
      ))}
    </nav>
  );
}
