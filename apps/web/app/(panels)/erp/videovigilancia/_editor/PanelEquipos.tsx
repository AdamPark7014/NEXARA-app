"use client";

/**
 * Panel izquierdo del editor: lo que se puede colocar en el sitio. Se toca y luego se toca el
 * sitio, o se arrastra. Por ahora son las cámaras del catálogo y la ambientación de la maqueta; los
 * demás equipos, el stock y la memoria técnica llegan en sus fases.
 */
import { useMemo, useState } from "react";
import { MODELOS_CAMARA, MODELO_GENERICO, ETIQUETA_TIPO_CAMARA, etiquetaModelo, type ModeloCamara } from "@/lib/cctv/catalogo";
import type { MaterialPiso, TipoMueble } from "@/lib/cctv/plano";
import styles from "./editor.module.css";

export const TIPO_ARRASTRE = "application/x-cctv-equipo";

export type DatoArrastre = { clase: "camara"; id: string } | { clase: "mueble"; id: TipoMueble };

export function leerArrastre(texto: string): DatoArrastre | null {
  try {
    const d = JSON.parse(texto) as DatoArrastre;
    return d?.clase === "camara" || d?.clase === "mueble" ? d : null;
  } catch {
    return null;
  }
}

export const NOMBRE_MUEBLE: Readonly<Record<TipoMueble, string>> = {
  escritorio: "Escritorio",
  "mesa-juntas": "Mesa de juntas",
  mostrador: "Mostrador",
  sofa: "Sala de espera",
  planta: "Planta",
  arbol: "Árbol",
  camion: "Camión",
  auto: "Auto",
};

export const NOMBRE_PISO: Readonly<Record<MaterialPiso, string>> = {
  concreto: "Concreto pulido",
  madera: "Madera",
  piedra: "Piedra",
  tecnico: "Piso técnico",
  asfalto: "Asfalto",
  pasto: "Pasto",
};

/** Foto de estudio del modelo 3D propio (generada con `lib/cctv/maqueta/modelos.ts`). */
export function fotoCamara(tipo: ModeloCamara["tipo"]): string {
  const archivo = tipo === "bala" || tipo === "turret" || tipo === "ptz" ? tipo : "domo";
  return `/cctv/modelos/${archivo}.webp`;
}

type Filtro = "camaras" | "ambientacion";

export default function PanelEquipos({
  modeloActivo,
  muebleActivo,
  pisoActivo,
  herramienta,
  onElegirCamara,
  onElegirMueble,
  onElegirPiso,
}: {
  modeloActivo: ModeloCamara;
  muebleActivo: TipoMueble;
  pisoActivo: MaterialPiso;
  herramienta: string;
  onElegirCamara: (m: ModeloCamara) => void;
  onElegirMueble: (t: TipoMueble) => void;
  onElegirPiso: (p: MaterialPiso) => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("camaras");
  const q = buscar.trim().toLowerCase();

  const camaras = useMemo(() => {
    const todas = [...MODELOS_CAMARA, MODELO_GENERICO];
    return q ? todas.filter((m) => `${etiquetaModelo(m)} ${ETIQUETA_TIPO_CAMARA[m.tipo]} ${m.descripcion}`.toLowerCase().includes(q)) : todas;
  }, [q]);
  const muebles = useMemo(() => (Object.keys(NOMBRE_MUEBLE) as TipoMueble[]).filter((t) => !q || NOMBRE_MUEBLE[t].toLowerCase().includes(q)), [q]);
  const pisos = useMemo(() => (Object.keys(NOMBRE_PISO) as MaterialPiso[]).filter((t) => !q || NOMBRE_PISO[t].toLowerCase().includes(q)), [q]);

  return (
    <aside className={styles.equipos} aria-label="Equipos">
      <div className={styles.equiposCabeza}>
        <b>Equipos</b>
        <input className={styles.equiposBuscar} type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar modelo o tipo" aria-label="Buscar equipo" />
        <div className={styles.equiposFiltros} role="group" aria-label="Filtrar equipos">
          <button type="button" aria-pressed={filtro === "camaras"} onClick={() => setFiltro("camaras")}>
            Cámaras
          </button>
          <button type="button" aria-pressed={filtro === "ambientacion"} onClick={() => setFiltro("ambientacion")}>
            Ambientación
          </button>
        </div>
      </div>
      <div className={styles.equiposLista}>
        {filtro === "camaras"
          ? camaras.map((m) => (
              <button
                key={m.id}
                type="button"
                className={styles.equipo}
                aria-pressed={herramienta === "camara" && modeloActivo.id === m.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify({ clase: "camara", id: m.id } satisfies DatoArrastre))}
                onClick={() => onElegirCamara(m)}
              >
                <span className={styles.equipoFoto}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoCamara(m.tipo)} alt="" draggable={false} />
                </span>
                <span className={styles.equipoTexto}>
                  <b>{m.id === MODELO_GENERICO.id ? "Genérica" : ETIQUETA_TIPO_CAMARA[m.tipo]}</b>
                  <span>{m.modelo}</span>
                  <span>{m.descripcion}</span>
                </span>
              </button>
            ))
          : null}
        {filtro === "ambientacion" ? (
          <>
            <p className={styles.seccion}>Muebles y vehículos</p>
            {muebles.map((t) => (
              <button
                key={t}
                type="button"
                className={styles.equipo}
                aria-pressed={herramienta === "mueble" && muebleActivo === t}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify({ clase: "mueble", id: t } satisfies DatoArrastre))}
                onClick={() => onElegirMueble(t)}
              >
                <span className={styles.equipoFoto}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/cctv/mobiliario/${t}.webp`} alt="" draggable={false} />
                </span>
                <span className={styles.equipoTexto}>
                  <b>{NOMBRE_MUEBLE[t]}</b>
                </span>
              </button>
            ))}
            <p className={styles.seccion}>Pisos</p>
            <p className={styles.ayuda}>Elige el material y arrastra un rectángulo en el sitio.</p>
            <div className={styles.equiposPisos}>
              {pisos.map((t) => (
                <button key={t} type="button" aria-pressed={herramienta === "area" && pisoActivo === t} onClick={() => onElegirPiso(t)}>
                  <i className={styles[`piso_${t}`]} />
                  {NOMBRE_PISO[t]}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {(filtro === "camaras" ? !camaras.length : !muebles.length && !pisos.length) ? <p className={styles.ayuda}>Sin resultados para «{buscar.trim()}».</p> : null}
      </div>
      <p className={styles.equiposPie}>Toca un equipo y luego el sitio, o arrástralo a la maqueta.</p>
    </aside>
  );
}
