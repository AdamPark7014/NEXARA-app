/**
 * Catálogo semilla de cámaras del Diseñador de videovigilancia.
 *
 * Fase 2: los modelos de la propuesta «Bodegas VDM» con la óptica que guarda el diseñador de
 * SYSCOM, más una cámara genérica para capturar a mano. Ninguna ficha está verificada contra la
 * hoja técnica de Hikvision todavía (`verificado: false`): la tabla curada con «Leer ficha» es
 * la fase 5 (`docs/DISENADOR-CCTV.md` §6).
 */
import type { Optica } from "./optica";

export type TipoCamara = "domo" | "bala" | "turret" | "ptz" | "panoramica" | "ojo-de-pez";

export const ETIQUETA_TIPO_CAMARA: Readonly<Record<TipoCamara, string>> = {
  domo: "Domo",
  bala: "Bala",
  turret: "Turret",
  ptz: "PTZ",
  panoramica: "Panorámica",
  "ojo-de-pez": "Ojo de pez",
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
  caracteristicas: string[];
  /** De dónde salió la óptica: SYSCOM, captura a mano o la hoja técnica del fabricante. */
  fuente: "syscom" | "manual" | "ficha";
  verificado: boolean;
};

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
  return MODELOS_CAMARA.find((m) => m.id === id) ?? null;
}

/** «HIKVISION DS-2CD1143G2-LIUF» */
export function etiquetaModelo(m: Pick<ModeloCamara, "marca" | "modelo">): string {
  return [m.marca, m.modelo].filter(Boolean).join(" ");
}
