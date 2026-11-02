/**
 * De lo que leyó la IA en una memoria técnica a un modelo del catálogo. Puro: la pantalla enseña estos
 * renglones, la persona los corrige y de aquí sale lo que se guarda y lo que se le pasa al modelo 3D.
 */
import type { EquipoParaGuardar } from "./api";
import { ETIQUETA_TIPO_CAMARA, ETIQUETA_TIPO_EQUIPO, FAMILIA_DE_TIPO, type FamiliaEquipo, type TipoCamara, type TipoEquipo } from "./catalogo";
import { RESOLUCIONES } from "./optica";

export type CampoFicha =
  | "pxHoriz"
  | "pxVert"
  | "sensor"
  | "focalesMm"
  | "focalMinMm"
  | "focalMaxMm"
  | "hfovDeg"
  | "vfovDeg"
  | "zoomOptico"
  | "irM"
  | "diametroMm"
  | "anchoMm"
  | "altoMm"
  | "fondoMm"
  | "altoCarcasaMm"
  | "radioCupulaMm"
  | "pesoG"
  | "ip"
  | "ik"
  | "wattsMax"
  | "poeW"
  | "canales"
  | "bahias"
  | "mbpsEntrada"
  | "puertos"
  | "puertosPoe"
  | "poeTotalW"
  | "unidades"
  | "plumaM"
  | "alcanceM"
  | "decibeles"
  | "pantallaPulgadas";

export type TipoFicha = TipoCamara | TipoEquipo;

/** Lo que responde `POST cctv-disenos/catalogo/leer-ficha`. */
export type FichaLeida = {
  familia: string;
  tipo: TipoFicha;
  marca: string;
  modelo: string;
  descripcion: string;
  color: "blanco" | "negro" | "gris";
  cajaTrasera: boolean;
  lucesVisibles: number;
  datos: Array<{ campo: CampoFicha; valor: string; hoja: number | null }>;
  caracteristicas: string[];
  archivo: string;
  hojas: number;
  escaneado: boolean;
  ms: number;
};

export const ETIQUETA_CAMPO: Readonly<Record<CampoFicha, { etiqueta: string; unidad: string }>> = {
  pxHoriz: { etiqueta: "Resolución, ancho", unidad: "px" },
  pxVert: { etiqueta: "Resolución, alto", unidad: "px" },
  sensor: { etiqueta: "Sensor", unidad: "" },
  focalesMm: { etiqueta: "Focales", unidad: "mm" },
  focalMinMm: { etiqueta: "Focal mínima", unidad: "mm" },
  focalMaxMm: { etiqueta: "Focal máxima", unidad: "mm" },
  hfovDeg: { etiqueta: "Ángulo horizontal", unidad: "°" },
  vfovDeg: { etiqueta: "Ángulo vertical", unidad: "°" },
  zoomOptico: { etiqueta: "Zoom óptico", unidad: "×" },
  irM: { etiqueta: "Alcance de la luz", unidad: "m" },
  diametroMm: { etiqueta: "Diámetro", unidad: "mm" },
  anchoMm: { etiqueta: "Ancho", unidad: "mm" },
  altoMm: { etiqueta: "Altura", unidad: "mm" },
  fondoMm: { etiqueta: "Fondo", unidad: "mm" },
  altoCarcasaMm: { etiqueta: "Altura de la carcasa", unidad: "mm" },
  radioCupulaMm: { etiqueta: "Radio de la cúpula", unidad: "mm" },
  pesoG: { etiqueta: "Peso", unidad: "g" },
  ip: { etiqueta: "Protección IP", unidad: "" },
  ik: { etiqueta: "Protección IK", unidad: "" },
  wattsMax: { etiqueta: "Consumo máximo", unidad: "W" },
  poeW: { etiqueta: "Consumo por PoE", unidad: "W" },
  canales: { etiqueta: "Canales", unidad: "" },
  bahias: { etiqueta: "Bahías de disco", unidad: "" },
  mbpsEntrada: { etiqueta: "Ancho de banda de entrada", unidad: "Mbps" },
  puertos: { etiqueta: "Puertos", unidad: "" },
  puertosPoe: { etiqueta: "Puertos con PoE", unidad: "" },
  poeTotalW: { etiqueta: "Presupuesto PoE", unidad: "W" },
  unidades: { etiqueta: "Unidades de rack", unidad: "U" },
  plumaM: { etiqueta: "Largo de la pluma", unidad: "m" },
  alcanceM: { etiqueta: "Se escucha a", unidad: "m" },
  decibeles: { etiqueta: "Volumen", unidad: "dB" },
  pantallaPulgadas: { etiqueta: "Pantalla", unidad: "″" },
};

const PIE: readonly CampoFicha[] = ["pesoG", "ip", "ik"];
const CAJA: readonly CampoFicha[] = ["anchoMm", "altoMm", "fondoMm"];
const OPTICA: readonly CampoFicha[] = ["pxHoriz", "pxVert", "sensor", "focalesMm", "hfovDeg", "vfovDeg", "irM", "poeW", "wattsMax"];

/** Qué se pregunta de cada tipo: lo demás no le aplica. */
const CAMPOS_DE_TIPO: Readonly<Record<TipoFicha, readonly CampoFicha[]>> = {
  domo: [...OPTICA, "diametroMm", "altoMm", "altoCarcasaMm", "radioCupulaMm", ...PIE],
  turret: [...OPTICA, "diametroMm", "altoMm", ...PIE],
  bala: [...OPTICA, ...CAJA, ...PIE],
  ptz: ["pxHoriz", "pxVert", "sensor", "focalMinMm", "focalMaxMm", "zoomOptico", "hfovDeg", "vfovDeg", "irM", "poeW", "wattsMax", "diametroMm", "altoMm", ...PIE],
  panoramica: [...OPTICA, "diametroMm", "altoMm", ...PIE],
  "ojo-de-pez": [...OPTICA, "diametroMm", "altoMm", ...PIE],
  nvr: ["canales", "bahias", "mbpsEntrada", "unidades", "wattsMax", ...CAJA, "pesoG"],
  switch: ["puertos", "poeTotalW", "unidades", "wattsMax", ...CAJA, "pesoG"],
  servidor: ["unidades", "bahias", "wattsMax", ...CAJA, "pesoG"],
  ups: ["unidades", "wattsMax", ...CAJA, "pesoG"],
  gabinete: ["unidades", ...CAJA, "pesoG"],
  terminal: ["pantallaPulgadas", "poeW", "wattsMax", ...CAJA, ...PIE],
  barrera: ["plumaM", "wattsMax", ...CAJA, ...PIE],
  sirena: ["alcanceM", "decibeles", "wattsMax", ...CAJA, ...PIE],
  sismica: ["alcanceM", "decibeles", "wattsMax", ...CAJA, ...PIE],
  panel: ["wattsMax", ...CAJA, ...PIE],
  generico: ["poeW", "wattsMax", ...CAJA, ...PIE],
};

/** Solo se preguntan si la ficha los trae: una lente fija no tiene extremos. */
const SI_VIENEN: readonly CampoFicha[] = ["focalMinMm", "focalMaxMm", "zoomOptico", "puertosPoe"];

export function camposDeTipo(tipo: TipoFicha, valores: Partial<Record<CampoFicha, string>> = {}): readonly CampoFicha[] {
  const base = CAMPOS_DE_TIPO[tipo] ?? CAMPOS_DE_TIPO.generico;
  if (!esCamara(tipo) && tipo !== "switch") return base;
  const extra = SI_VIENEN.filter((c) => !base.includes(c) && valores[c] && (esCamara(tipo) ? c !== "puertosPoe" : c === "puertosPoe"));
  return [...base, ...extra];
}

export const esCamara = (tipo: TipoFicha): tipo is TipoCamara => tipo in ETIQUETA_TIPO_CAMARA;

export const FAMILIAS_FICHA: ReadonlyArray<{ id: FamiliaEquipo | "camaras"; tipos: readonly TipoFicha[] }> = [
  { id: "camaras", tipos: ["domo", "turret", "bala", "ptz", "panoramica", "ojo-de-pez"] },
  { id: "grabacion", tipos: ["nvr"] },
  { id: "acceso", tipos: ["terminal", "barrera"] },
  { id: "alarmas", tipos: ["sismica", "sirena", "panel"] },
  { id: "red", tipos: ["switch"] },
  { id: "servidores", tipos: ["servidor"] },
  { id: "infraestructura", tipos: ["gabinete", "ups"] },
  { id: "otros", tipos: ["generico"] },
];

export const familiaDe = (tipo: TipoFicha): FamiliaEquipo | "camaras" => (esCamara(tipo) ? "camaras" : FAMILIA_DE_TIPO[tipo]);
export const etiquetaTipo = (tipo: TipoFicha): string => (esCamara(tipo) ? ETIQUETA_TIPO_CAMARA[tipo] : ETIQUETA_TIPO_EQUIPO[tipo]);

/** Lo que la persona ve y corrige. */
export type FormaFicha = {
  tipo: TipoFicha;
  marca: string;
  modelo: string;
  descripcion: string;
  color: "blanco" | "negro" | "gris";
  cajaTrasera: boolean;
  luces: string;
  valores: Partial<Record<CampoFicha, string>>;
  hojas: Partial<Record<CampoFicha, number>>;
  caracteristicas: string[];
};

export function formaDesdeFicha(f: FichaLeida): FormaFicha {
  const valores: FormaFicha["valores"] = {};
  const hojas: FormaFicha["hojas"] = {};
  for (const d of f.datos) {
    valores[d.campo] = d.valor;
    if (d.hoja) hojas[d.campo] = d.hoja;
  }
  return {
    tipo: f.tipo,
    marca: f.marca,
    modelo: f.modelo,
    descripcion: f.descripcion,
    color: f.color,
    cajaTrasera: f.cajaTrasera,
    luces: f.lucesVisibles ? String(f.lucesVisibles) : "",
    valores,
    hojas,
    caracteristicas: f.caracteristicas,
  };
}

const numero = (v: string | undefined): number | null => {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return String(v ?? "").trim() && Number.isFinite(n) && n > 0 ? n : null;
};

const listaFocales = (v: string | undefined) => (String(v ?? "").match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", "."))).filter((x) => x > 0);

/** Qué le falta para poder guardarse: sin esto el diseñador no puede calcular nada. Null si está completo. */
export function faltaParaGuardar(forma: FormaFicha): string | null {
  if (!forma.modelo.trim()) return "Falta la clave del modelo.";
  if (esCamara(forma.tipo)) {
    if (!numero(forma.valores.pxHoriz) || !numero(forma.valores.pxVert)) return "Falta la resolución: sin ella no se calcula el detalle.";
    if (!listaFocales(forma.valores.focalesMm).length && !numero(forma.valores.focalMinMm)) return "Falta el lente: sin él no se calcula la cobertura.";
  }
  return null;
}

/** Forma del sensor como la entiende la óptica: «1/3″» → «1/3». */
const sensorDe = (v: string | undefined) => String(v ?? "").replace(/["″”'\s]/g, "") || null;

function medidasDe(v: FormaFicha["valores"]) {
  const salida: Record<string, number> = {};
  for (const k of ["diametroMm", "anchoMm", "altoMm", "fondoMm", "altoCarcasaMm", "radioCupulaMm"] as const) {
    const n = numero(v[k]);
    if (n) salida[k] = n;
  }
  return Object.keys(salida).length ? salida : null;
}

/** Lo que se manda a guardar. `foto` es la del modelo ya armado. */
export function equipoDesdeForma(forma: FormaFicha, ficha: { archivo: string; hojas: number }, foto: string | null): EquipoParaGuardar {
  const v = forma.valores;
  const apariencia = { color: forma.color, luces: numero(forma.luces), cajaTrasera: forma.cajaTrasera };
  // Lo que no da comportamiento también se conserva: es de lo que se leyó la ficha.
  const extra = { peso: numero(v.pesoG), ip: v.ip?.trim() || null, ik: v.ik?.trim() || null, wattsMax: numero(v.wattsMax), decibeles: numero(v.decibeles), pantalla: numero(v.pantallaPulgadas) };
  const comun = { apariencia, ficha: { archivo: ficha.archivo, hojas: ficha.hojas, fuentes: forma.hojas, ...extra }, ...(foto ? { foto } : {}) };
  const datos: Record<string, unknown> = esCamara(forma.tipo)
    ? {
        ...comun,
        wattsPoe: numero(v.poeW) ?? numero(v.wattsMax),
        optica: {
          pxHoriz: numero(v.pxHoriz),
          pxVert: numero(v.pxVert),
          focalMm: listaFocales(v.focalesMm)[0] ?? numero(v.focalMinMm),
          focalMinMm: numero(v.focalMinMm) ?? (listaFocales(v.focalesMm).length > 1 ? Math.min(...listaFocales(v.focalesMm)) : null),
          focalMaxMm: numero(v.focalMaxMm) ?? (listaFocales(v.focalesMm).length > 1 ? Math.max(...listaFocales(v.focalesMm)) : null),
          sensorFormato: sensorDe(v.sensor),
          hfovDeclaradoDeg: numero(v.hfovDeg),
          vfovDeclaradoDeg: numero(v.vfovDeg),
          irM: numero(v.irM),
        },
      }
    : {
        ...comun,
        canales: numero(v.canales),
        bahias: numero(v.bahias),
        mbpsEntrada: numero(v.mbpsEntrada),
        puertos: numero(v.puertos),
        poeTotalW: numero(v.poeTotalW),
        poeW: numero(v.poeW),
        unidades: numero(v.unidades),
        alcanceM: numero(v.alcanceM),
        plumaM: numero(v.plumaM),
      };
  return {
    familia: familiaDe(forma.tipo),
    tipo: forma.tipo,
    marca: forma.marca.trim(),
    modelo: forma.modelo.trim(),
    descripcion: forma.descripcion.trim(),
    datos,
    medidas: medidasDe(v),
    caracteristicas: forma.caracteristicas,
    fuente: ficha.archivo ? "ficha" : "manual",
  };
}

/** Lo que recibe el modelo 3D. Lo que falte usa la proporción típica de su tipo. */
export function paramsDeForma(forma: FormaFicha): Record<string, unknown> {
  const m = medidasDe(forma.valores) ?? {};
  return {
    ...m,
    marca: forma.marca.trim() || undefined,
    modelo: forma.modelo.trim() || undefined,
    color: forma.color,
    cajaTrasera: forma.cajaTrasera,
    ledsVisibles: numero(forma.luces) ?? undefined,
    puertos: numero(forma.valores.puertos) ?? undefined,
    bahias: forma.tipo === "servidor" ? (numero(forma.valores.bahias) ?? undefined) : undefined,
    unidades: forma.tipo === "gabinete" ? (numero(forma.valores.unidades) ?? undefined) : undefined,
    largoMm: numero(forma.valores.plumaM) ? (numero(forma.valores.plumaM) as number) * 1000 : undefined,
  };
}

/** Lo que se enseña abajo del modelo: las medidas con las que se armó. */
export function medidasParaVer(forma: FormaFicha): Array<{ etiqueta: string; valor: string }> {
  const lista: Array<[CampoFicha, string]> =
    forma.valores.diametroMm || forma.tipo === "domo" || forma.tipo === "turret" || forma.tipo === "ptz"
      ? [
          ["diametroMm", "Diámetro"],
          ["altoMm", "Altura"],
          ...(forma.tipo === "domo" ? ([["radioCupulaMm", "Cúpula"]] as Array<[CampoFicha, string]>) : []),
        ]
      : [
          ["anchoMm", "Ancho"],
          ["altoMm", "Alto"],
          ["fondoMm", "Fondo"],
        ];
  return lista.map(([campo, etiqueta]) => {
    const n = numero(forma.valores[campo]);
    return { etiqueta, valor: n ? `${campo === "radioCupulaMm" ? "R " : ""}${n} mm` : "No viene" };
  });
}

/** «4 MP, 2560 × 1440»: para el título de la resolución. */
export function megapixeles(forma: FormaFicha): string | null {
  const h = numero(forma.valores.pxHoriz);
  const w = numero(forma.valores.pxVert);
  if (!h || !w) return null;
  const mp = RESOLUCIONES.find((r) => r.pxHoriz === h && r.pxVert === w)?.mp ?? Math.round((h * w) / 1_000_000);
  return `${mp} MP`;
}
