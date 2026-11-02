/**
 * Catálogo semilla de cámaras del Diseñador de videovigilancia.
 *
 * Fase 2: los modelos de la propuesta «Bodegas VDM» con la óptica que guarda el diseñador de
 * SYSCOM, más una cámara genérica para capturar a mano. Ninguna ficha está verificada contra la
 * hoja técnica de Hikvision todavía (`verificado: false`): la tabla curada con «Leer ficha» es
 * la fase 5 (`docs/DISENADOR-CCTV.md` §6).
 */
import { RESOLUCIONES, type Optica } from "./optica";

export type TipoCamara = "domo" | "bala" | "turret" | "ptz" | "panoramica" | "ojo-de-pez";

export const ETIQUETA_TIPO_CAMARA: Readonly<Record<TipoCamara, string>> = {
  domo: "Domo",
  bala: "Bala",
  turret: "Turret",
  ptz: "PTZ",
  panoramica: "Panorámica",
  "ojo-de-pez": "Ojo de pez",
};

/** Medidas de la ficha para armar el modelo 3D, en milímetros. Lo que falte usa la proporción típica. */
export type MedidasModelo = {
  diametroMm?: number;
  anchoMm?: number;
  altoMm?: number;
  fondoMm?: number;
  altoCarcasaMm?: number;
  radioCupulaMm?: number;
};

/** Cómo se ve su modelo 3D: lo dice su ficha o lo elige quien la revisa. */
export type AparienciaModelo = {
  color?: "blanco" | "negro" | "gris";
  luces?: number | null;
  cajaTrasera?: boolean;
};

export type ModeloCamara = {
  id: string;
  marca: string;
  modelo: string;
  tipo: TipoCamara;
  descripcion: string;
  optica: Optica;
  /** Consumo con IR encendido, si la ficha lo trae. */
  wattsPoe?: number | null;
  medidas?: MedidasModelo | null;
  apariencia?: AparienciaModelo | null;
  /** Foto de su modelo armado con la ficha; sin ella, la de su tipo. */
  foto?: string | null;
  caracteristicas: string[];
  /** De dónde salió la óptica: SYSCOM, captura a mano o la hoja técnica del fabricante. */
  fuente: "syscom" | "manual" | "ficha";
  verificado: boolean;
};

/* ── Lo que no es cámara ────────────────────────────────────────────────────────── */

export type FamiliaEquipo = "grabacion" | "acceso" | "alarmas" | "red" | "servidores" | "infraestructura" | "otros";

export const ETIQUETA_FAMILIA: Readonly<Record<FamiliaEquipo | "camaras", string>> = {
  camaras: "Cámaras",
  grabacion: "Grabación",
  acceso: "Control de acceso",
  alarmas: "Alarmas y sismo",
  red: "Red",
  servidores: "Servidores",
  infraestructura: "Infraestructura",
  otros: "Otros",
};

export type TipoEquipo = "nvr" | "switch" | "servidor" | "ups" | "gabinete" | "terminal" | "barrera" | "sirena" | "sismica" | "panel" | "generico";

export const ETIQUETA_TIPO_EQUIPO: Readonly<Record<TipoEquipo, string>> = {
  nvr: "Grabador NVR",
  switch: "Switch PoE",
  servidor: "Servidor",
  ups: "UPS",
  gabinete: "Gabinete 19″",
  terminal: "Terminal de acceso",
  barrera: "Barrera vehicular",
  sirena: "Sirena",
  sismica: "Alerta sísmica",
  panel: "Panel de alarma",
  generico: "Otro equipo",
};

export const FAMILIA_DE_TIPO: Readonly<Record<TipoEquipo, FamiliaEquipo>> = {
  nvr: "grabacion",
  switch: "red",
  servidor: "servidores",
  ups: "infraestructura",
  gabinete: "infraestructura",
  terminal: "acceso",
  barrera: "acceso",
  sirena: "alarmas",
  sismica: "alarmas",
  panel: "alarmas",
  generico: "otros",
};

/** Prefijo de la clave en la maqueta y el plano: `AC-01`, `GAB-01`. */
export const PREFIJO_TIPO: Readonly<Record<TipoEquipo, string>> = {
  nvr: "NVR",
  switch: "SW",
  servidor: "SRV",
  ups: "UPS",
  gabinete: "GAB",
  terminal: "AC",
  barrera: "BA",
  sirena: "SI",
  sismica: "AS",
  panel: "PAN",
  generico: "EQ",
};

/** Los que se montan en el rack: al colocarlos, si hay gabinete, entran solos. */
export const TIPOS_DE_RACK: ReadonlySet<TipoEquipo> = new Set<TipoEquipo>(["nvr", "switch", "servidor", "ups"]);

/** Datos que dan su comportamiento en el diseño. Solo lo que aplica al tipo. */
export type DatosEquipo = {
  /** NVR: canales de video. */
  canales?: number | null;
  /** NVR: ancho de banda de entrada. */
  mbpsEntrada?: number | null;
  /** NVR: bahías de disco. */
  bahias?: number | null;
  /** Switch: puertos de red. */
  puertos?: number | null;
  /** Switch: potencia PoE total. */
  poeTotalW?: number | null;
  /** Lo que consume de un puerto PoE. */
  poeW?: number | null;
  /** Unidades que ocupa en el rack o, en un gabinete, las que tiene. */
  unidades?: number | null;
  /** Sirena y alerta: hasta dónde se escucha, estimado. */
  alcanceM?: number | null;
  /** Barrera: largo de la pluma. */
  plumaM?: number | null;
};

export type ModeloEquipo = {
  id: string;
  tipo: TipoEquipo;
  marca: string;
  modelo: string;
  descripcion: string;
  datos: DatosEquipo;
  medidas?: MedidasModelo | null;
  apariencia?: AparienciaModelo | null;
  /** Foto de su modelo armado con la ficha; sin ella, la de su tipo. */
  foto?: string | null;
  caracteristicas: string[];
  /** `ficha`: leída de la hoja técnica. `tipo`: valores típicos, falta su ficha. `manual`: capturada a mano. */
  fuente: "ficha" | "tipo" | "manual";
  verificado: boolean;
};

/** Con estos se puede diseñar desde el primer día; los demás se agregan al catálogo. */
export const MODELOS_EQUIPO: readonly ModeloEquipo[] = [
  {
    id: "hik-ds-7608nxi-k2",
    tipo: "nvr",
    marca: "HIKVISION",
    modelo: "DS-7608NXI-K2",
    descripcion: "NVR de 8 canales, 2 bahías, 80 Mbps de entrada",
    datos: { canales: 8, bahias: 2, mbpsEntrada: 80, unidades: 1 },
    medidas: { anchoMm: 385, fondoMm: 315, altoMm: 52 },
    caracteristicas: ["8 canales de video IP", "2 bahías de disco", "80 Mbps de entrada"],
    fuente: "ficha",
    verificado: true,
  },
  {
    id: "hik-ds-pwa96-kit1-we",
    tipo: "panel",
    marca: "HIKVISION",
    modelo: "DS-PWA96-Kit1-WE",
    descripcion: "Kit de alarma inalámbrico AX PRO",
    datos: {},
    medidas: { anchoMm: 170, altoMm: 170, fondoMm: 38.6 },
    caracteristicas: ["Panel inalámbrico AX PRO"],
    fuente: "ficha",
    verificado: true,
  },
  { id: "tipo-gabinete-24u", tipo: "gabinete", marca: "", modelo: "Gabinete 24U", descripcion: "19″ con puerta de vidrio; se llena unidad por unidad", datos: { unidades: 24 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-switch-24", tipo: "switch", marca: "", modelo: "Switch PoE 24 puertos", descripcion: "24 puertos PoE. Se revisa el consumo contra lo colocado", datos: { puertos: 24, poeTotalW: 370, unidades: 1 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-servidor-2u", tipo: "servidor", marca: "", modelo: "Servidor 2U", descripcion: "2U en gabinete, 8 bahías", datos: { unidades: 2 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-ups-2u", tipo: "ups", marca: "", modelo: "UPS 2U", descripcion: "Respaldo de energía en rack", datos: { unidades: 2 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-terminal", tipo: "terminal", marca: "", modelo: "Terminal facial", descripcion: "Rostro y tarjeta, en muro junto a la puerta", datos: { poeW: 12 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-barrera", tipo: "barrera", marca: "", modelo: "Barrera 4 m", descripcion: "Pluma de 4 m para acceso vehicular", datos: { plumaM: 4 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-sismica", tipo: "sismica", marca: "", modelo: "Receptor de alerta sísmica", descripcion: "Receptor con estrobo y bocina, en muro", datos: { alcanceM: 20 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-sirena", tipo: "sirena", marca: "", modelo: "Sirena con estrobo", descripcion: "Sirena con estrobo azul, en muro", datos: { alcanceM: 20 }, caracteristicas: [], fuente: "tipo", verificado: false },
  { id: "tipo-generico", tipo: "generico", marca: "", modelo: "Otro equipo", descripcion: "Para lo que no tiene modelo propio todavía", datos: {}, caracteristicas: [], fuente: "tipo", verificado: false },
];

/* ── Lo que cada empresa agrega (`GET cctv-disenos/catalogo`) ───────────────────── */

/** Un renglón de `cctv_equipos`, como lo manda la API. */
export type FilaCatalogo = {
  id: number;
  familia: string;
  tipo: string;
  marca: string;
  modelo: string;
  descripcion: string;
  datos: Record<string, unknown> | null;
  medidas: MedidasModelo | null;
  caracteristicas: string[] | null;
  fuente: string;
  verificado: boolean;
  productId: number | null;
};

const TIPOS_CAMARA = new Set<string>(Object.keys(ETIQUETA_TIPO_CAMARA));

/** Separa lo que llega de la API: las cámaras llevan óptica y lo demás, sus datos. Lo que no se entienda se ignora. */
export function leerFilasCatalogo(filas: readonly FilaCatalogo[]): { camaras: ModeloCamara[]; equipos: ModeloEquipo[] } {
  const camaras: ModeloCamara[] = [];
  const equipos: ModeloEquipo[] = [];
  for (const f of filas) {
    const { foto: fotoCruda, apariencia: aparienciaCruda, ficha: _ficha, ...resto } = (f.datos ?? {}) as Record<string, unknown>;
    const foto = typeof fotoCruda === "string" ? fotoCruda : null;
    const apariencia = (aparienciaCruda ?? null) as AparienciaModelo | null;
    const base = {
      id: `db-${f.id}`,
      marca: f.marca,
      modelo: f.modelo,
      descripcion: f.descripcion,
      medidas: f.medidas,
      caracteristicas: f.caracteristicas ?? [],
      fuente: f.fuente === "ficha" ? ("ficha" as const) : ("manual" as const),
      verificado: f.verificado,
    };
    if (f.familia === "camaras") {
      const d = (f.datos ?? {}) as { optica?: Optica; wattsPoe?: number | null };
      if (d.optica && TIPOS_CAMARA.has(f.tipo)) camaras.push({ ...base, tipo: f.tipo as TipoCamara, optica: d.optica, wattsPoe: d.wattsPoe ?? null, apariencia, foto });
    } else if (f.tipo in ETIQUETA_TIPO_EQUIPO) {
      // Solo lo que da comportamiento: esto se copia a cada equipo colocado en un diseño.
      equipos.push({ ...base, tipo: f.tipo as TipoEquipo, datos: resto as DatosEquipo, apariencia, foto });
    }
  }
  return { camaras, equipos };
}

let camarasAgregadas: readonly ModeloCamara[] = [];
let equiposAgregados: readonly ModeloEquipo[] = [];

/** Registra lo que se agregó al catálogo, para que todo el diseñador lo encuentre por su id. */
export function registrarCatalogo(camaras: readonly ModeloCamara[], equipos: readonly ModeloEquipo[]) {
  camarasAgregadas = camaras;
  equiposAgregados = equipos;
}

export function todasLasCamarasDelCatalogo(): readonly ModeloCamara[] {
  return [...MODELOS_CAMARA, ...camarasAgregadas];
}

export function todosLosEquiposDelCatalogo(): readonly ModeloEquipo[] {
  return [...MODELOS_EQUIPO, ...equiposAgregados];
}

export function equipoPorId(id: string | null | undefined): ModeloEquipo | null {
  if (!id) return null;
  return todosLosEquiposDelCatalogo().find((m) => m.id === id) ?? null;
}

export const MODELOS_CAMARA: readonly ModeloCamara[] = [
  {
    id: "hik-ds-2cd1143g2-liuf",
    marca: "HIKVISION",
    modelo: "DS-2CD1143G2-LIUF",
    tipo: "domo",
    descripcion: "Domo IP 4 MP, lente 2.8 mm, luz inteligente",
    optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, sensorAnchoMm: 4.8, sensorFormato: "1/3", irM: 30 },
    caracteristicas: [
      "Detección de personas y vehículos (Motion Detection 2.0)",
      "Imagen a color con muy poca luz",
      "WDR 120 dB para contraluces",
      "Ranura microSD hasta 512 GB",
      "Micrófono integrado",
    ],
    fuente: "syscom",
    verificado: false,
  },
  {
    id: "hik-ds-2cfw06-p",
    marca: "HIKVISION",
    modelo: "DS-2CFW06-P",
    tipo: "bala",
    descripcion: "Cámara IP 4 MP, lente 2.8 mm, gran angular",
    optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, sensorAnchoMm: 6, irM: 30 },
    caracteristicas: [
      "Clasifica personas y vehículos",
      "Audio bidireccional",
      "Visión nocturna a color con luz blanca",
      "Compresión H.265",
      "WDR 120 dB",
    ],
    fuente: "syscom",
    verificado: false,
  },
  {
    id: "hik-ds-2cd1t47g3-liuf-lsrb",
    marca: "HIKVISION",
    modelo: "DS-2CD1T47G3-LIUF/LSRB",
    tipo: "bala",
    descripcion: "Bala IP 4 MP ColorVu, lente 4 mm, bocina y estrobo",
    optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 4, sensorAnchoMm: 8.6, irM: 50 },
    caracteristicas: [
      "Bocina integrada para avisos a distancia",
      "Micrófono",
      "Luz estroboscópica roja y azul para disuadir",
      "Imagen a color las 24 horas (ColorVu)",
      "Filtra personas y vehículos para menos falsas alarmas",
    ],
    fuente: "syscom",
    verificado: false,
  },
  {
    id: "hik-ds-2cd2347g2-lu",
    marca: "HIKVISION",
    modelo: "DS-2CD2347G2-LU",
    tipo: "turret",
    descripcion: "Turret 4 MP ColorVu, lente 2.8 mm, luz blanca 30 m",
    optica: { pxHoriz: 2688, pxVert: 1520, focalMm: 2.8, sensorFormato: "1/1.8", hfovDeclaradoDeg: 112, vfovDeclaradoDeg: 61, irM: 30 },
    wattsPoe: 7.6,
    caracteristicas: ["Imagen a color las 24 horas (ColorVu, F1.0)", "Luz blanca hasta 30 m", "Micrófono integrado"],
    fuente: "ficha",
    verificado: true,
  },
  {
    id: "hik-ds-2de4a425iwg1-e",
    marca: "HIKVISION",
    modelo: "DS-2DE4A425IWG1-E",
    tipo: "ptz",
    descripcion: "PTZ 4 MP, zoom 25×, IR 50 m",
    optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 4.8, focalMinMm: 4.8, focalMaxMm: 120, sensorFormato: "1/2.8", hfovDeclaradoDeg: 53.3, vfovDeclaradoDeg: 30.6, irM: 50 },
    wattsPoe: 24,
    caracteristicas: ["Zoom óptico 25×", "Infrarrojo hasta 50 m", "Giro e inclinación motorizados"],
    fuente: "ficha",
    verificado: true,
  },
];

/** Para capturar una cámara que no está en el catálogo: se ajusta la óptica en el panel. */
export const MODELO_GENERICO: ModeloCamara = {
  id: "generica",
  marca: "",
  modelo: "Cámara genérica",
  tipo: "domo",
  descripcion: "Óptica capturada a mano",
  optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, sensorAnchoMm: null, sensorFormato: "1/3", irM: 30 },
  caracteristicas: [],
  fuente: "manual",
  verificado: false,
};

export function modeloPorId(id: string | null | undefined): ModeloCamara | null {
  if (!id) return null;
  if (id === MODELO_GENERICO.id) return MODELO_GENERICO;
  return MODELOS_CAMARA.find((m) => m.id === id) ?? camarasAgregadas.find((m) => m.id === id) ?? null;
}

/** «HIKVISION DS-2CD1143G2-LIUF» */
export function etiquetaModelo(m: Pick<ModeloCamara, "marca" | "modelo">): string {
  return [m.marca, m.modelo].filter(Boolean).join(" ");
}

/* ── Lo que se lee en una tarjeta ───────────────────────────────────────────────── */

const medidasTexto = (m: MedidasModelo | null | undefined) => {
  if (!m) return null;
  const partes = [m.anchoMm, m.altoMm, m.fondoMm].filter((x): x is number => typeof x === "number" && x > 0);
  if (m.diametroMm && !partes.length) return `Ø${m.diametroMm} mm`;
  return partes.length ? `${partes.join(" × ")} mm` : null;
};

/** «8 canales · 2 bahías · 80 Mbps · 385 × 52 × 315 mm». Solo lo que se sabe. */
export function especificacionesEquipo(m: ModeloEquipo): string {
  const d = m.datos;
  const partes = [
    d.canales ? `${d.canales} canales` : null,
    d.bahias ? `${d.bahias} ${d.bahias === 1 ? "bahía" : "bahías"}` : null,
    d.mbpsEntrada ? `${d.mbpsEntrada} Mbps` : null,
    d.puertos ? `${d.puertos} puertos` : null,
    d.poeTotalW ? `${d.poeTotalW} W PoE` : null,
    d.poeW ? `${d.poeW} W` : null,
    d.unidades ? `${d.unidades}U` : null,
    d.plumaM ? `Pluma de ${d.plumaM} m` : null,
    d.alcanceM ? `~${d.alcanceM} m` : null,
    medidasTexto(m.medidas),
  ];
  return partes.filter(Boolean).join(" · ") || m.descripcion;
}

/** «4 MP · 2.8 mm · IR 30 m». */
export function especificacionesCamara(m: ModeloCamara): string {
  const o = m.optica;
  // Como lo dice el fabricante: 2560 × 1440 son «4 MP», aunque den 3.7.
  const mp = RESOLUCIONES.find((r) => r.pxHoriz === o.pxHoriz && r.pxVert === o.pxVert)?.mp ?? Math.round((o.pxHoriz * o.pxVert) / 1_000_000);
  const partes = [`${mp} MP`, o.focalMinMm && o.focalMaxMm ? `${o.focalMinMm}–${o.focalMaxMm} mm` : `${o.focalMm} mm`, o.irM ? `IR ${o.irM} m` : null, m.wattsPoe ? `${m.wattsPoe} W` : null, medidasTexto(m.medidas)];
  return partes.filter(Boolean).join(" · ");
}
