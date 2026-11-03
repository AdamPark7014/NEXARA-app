"use client";

/**
 * Panel izquierdo del editor: lo que se puede colocar en el sitio, por familia. Se toca y luego se
 * toca el sitio, o se arrastra. Lo de rack, si ya hay gabinete, entra directo. El stock llega en su fase.
 */
import { useMemo, useState } from "react";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import {
  ETIQUETA_TIPO_CAMARA,
  ETIQUETA_TIPO_EQUIPO,
  FAMILIA_DE_TIPO,
  MODELO_GENERICO,
  etiquetaModelo,
  type FamiliaEquipo,
  type ModeloCamara,
  type ModeloEquipo,
} from "@/lib/cctv/catalogo";
import type { MaterialPiso, TipoMueble } from "@/lib/cctv/plano";
import { fotoDeTipo } from "@/lib/cctv/sistema";
import { pesos, type Disponibilidad } from "@/lib/cctv/existencias";
import styles from "./editor.module.css";

export const TIPO_ARRASTRE = "application/x-cctv-equipo";

export type DatoArrastre = { clase: "camara"; id: string } | { clase: "equipo"; id: string } | { clase: "mueble"; id: TipoMueble };

export function leerArrastre(texto: string): DatoArrastre | null {
  try {
    const d = JSON.parse(texto) as DatoArrastre;
    return d?.clase === "camara" || d?.clase === "mueble" || d?.clase === "equipo" ? d : null;
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

type Filtro = "camaras" | "rack" | "acceso" | "alarmas" | "ambientacion";

const FILTROS: ReadonlyArray<[Filtro, string]> = [
  ["camaras", "Cámaras"],
  ["rack", "Rack y red"],
  ["acceso", "Acceso"],
  ["alarmas", "Alarmas"],
  ["ambientacion", "Ambientación"],
];

const FAMILIAS_DE_FILTRO: Partial<Record<Filtro, readonly FamiliaEquipo[]>> = {
  rack: ["infraestructura", "grabacion", "red", "servidores", "otros"],
  acceso: ["acceso"],
  alarmas: ["alarmas"],
};

function LineaStock({ d }: { d?: Disponibilidad }) {
  if (!d || (!d.almacen && !d.ct)) return null;
  const partes = [d.almacen ? `${d.almacen.piezas} en almacén` : null, d.ct ? `${d.ct.piezas} en CT` : null, d.ct && d.ct.precio > 0 ? pesos(d.ct.precio) : null].filter(Boolean);
  return <em className={styles.equipoStock}>{partes.join(" · ")}</em>;
}

export default function PanelEquipos({
  modeloActivo,
  muebleActivo,
  pisoActivo,
  equipoActivo,
  herramienta,
  camaras,
  equipos,
  onElegirCamara,
  onElegirEquipo,
  onElegirMueble,
  onElegirPiso,
  onAgregar,
  onArmar,
  existencias,
}: {
  modeloActivo: ModeloCamara;
  muebleActivo: TipoMueble;
  pisoActivo: MaterialPiso;
  equipoActivo: ModeloEquipo | null;
  herramienta: string;
  camaras: readonly ModeloCamara[];
  equipos: readonly ModeloEquipo[];
  onElegirCamara: (m: ModeloCamara) => void;
  onElegirEquipo: (m: ModeloEquipo) => void;
  onElegirMueble: (t: TipoMueble) => void;
  onElegirPiso: (p: MaterialPiso) => void;
  onAgregar: () => void;
  /** Para quien no quiere dibujar: el diseño completo a partir de una frase. */
  onArmar: () => void;
  /** Lo que hay de cada modelo en Almacén y en CT. */
  existencias?: ReadonlyMap<string, Disponibilidad>;
}) {
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("camaras");
  const q = buscar.trim().toLowerCase();

  const listaCamaras = useMemo(
    () => (q ? camaras.filter((m) => `${etiquetaModelo(m)} ${ETIQUETA_TIPO_CAMARA[m.tipo]} ${m.descripcion}`.toLowerCase().includes(q)) : camaras),
    [q, camaras],
  );
  const familias = FAMILIAS_DE_FILTRO[filtro];
  const listaEquipos = useMemo(() => {
    if (q) return equipos.filter((m) => `${etiquetaModelo(m)} ${ETIQUETA_TIPO_EQUIPO[m.tipo]} ${m.descripcion}`.toLowerCase().includes(q));
    if (!familias) return [];
    return equipos.filter((m) => familias.includes(FAMILIA_DE_TIPO[m.tipo])).sort((a, b) => familias.indexOf(FAMILIA_DE_TIPO[a.tipo]) - familias.indexOf(FAMILIA_DE_TIPO[b.tipo]));
  }, [q, equipos, familias]);
  const muebles = useMemo(() => (Object.keys(NOMBRE_MUEBLE) as TipoMueble[]).filter((t) => !q || NOMBRE_MUEBLE[t].toLowerCase().includes(q)), [q]);
  const pisos = useMemo(() => (Object.keys(NOMBRE_PISO) as MaterialPiso[]).filter((t) => !q || NOMBRE_PISO[t].toLowerCase().includes(q)), [q]);

  // Al buscar se ve todo lo que coincide, sin importar la familia.
  const verCamaras = q ? listaCamaras.length > 0 : filtro === "camaras";
  const verEquipos = q ? listaEquipos.length > 0 : Boolean(familias);
  const verAmbientacion = q ? muebles.length + pisos.length > 0 : filtro === "ambientacion";

  return (
    <aside className={styles.equipos} aria-label="Equipos">
      <div className={styles.equiposCabeza}>
        <button type="button" className={styles.botonArmar} onClick={onArmar}>
          <AutoAwesomeRoundedIcon fontSize="small" />
          Armar con IA
        </button>
        <b>Equipos</b>
        <input className={styles.equiposBuscar} type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar modelo o tipo" aria-label="Buscar equipo" />
        <div className={styles.equiposFiltros} role="group" aria-label="Filtrar equipos">
          {FILTROS.map(([id, texto]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filtro === id}
              onClick={() => {
                setFiltro(id);
                setBuscar("");
              }}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.equiposLista}>
        {verCamaras
          ? listaCamaras.map((m) => (
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
                  <img src={m.foto ?? fotoCamara(m.tipo)} alt="" draggable={false} />
                </span>
                <span className={styles.equipoTexto}>
                  <b>{m.id === MODELO_GENERICO.id ? "Genérica" : ETIQUETA_TIPO_CAMARA[m.tipo]}</b>
                  <span>{m.modelo}</span>
                  <span>{m.descripcion}</span>
                  <LineaStock d={existencias?.get(m.id)} />
                </span>
              </button>
            ))
          : null}
        {verEquipos
          ? listaEquipos.map((m) => (
              <button
                key={m.id}
                type="button"
                className={styles.equipo}
                aria-pressed={herramienta === "equipo" && equipoActivo?.id === m.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify({ clase: "equipo", id: m.id } satisfies DatoArrastre))}
                onClick={() => onElegirEquipo(m)}
              >
                <span className={styles.equipoFoto}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.foto ?? fotoDeTipo(m.tipo)} alt="" draggable={false} />
                </span>
                <span className={styles.equipoTexto}>
                  <b>{ETIQUETA_TIPO_EQUIPO[m.tipo]}</b>
                  <span>{m.modelo}</span>
                  <span>{m.fuente === "tipo" ? "Falta su ficha" : m.descripcion}</span>
                  <LineaStock d={existencias?.get(m.id)} />
                </span>
              </button>
            ))
          : null}
        {verAmbientacion ? (
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
        {q && !verCamaras && !verEquipos && !verAmbientacion ? <p className={styles.ayuda}>Sin resultados para «{buscar.trim()}».</p> : null}
        <button type="button" className={styles.equipoAgregar} onClick={onAgregar}>
          <b>+ Agregar equipo</b>
          <span>Sube su PDF y se llena solo, o captúralo a mano.</span>
        </button>
      </div>
      <p className={styles.equiposPie}>Toca un equipo y luego el sitio, o arrástralo a la maqueta.</p>
    </aside>
  );
}
