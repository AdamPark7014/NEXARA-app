/**
 * Expediente de un diseño como proyecto formal (Ola 5, mockup aprobado el 15-11-2026): datos del sitio,
 * documentos (planos, fotos, fichas, Excel, Word, PowerPoint, CAD) y lo que falta para entregar. Vive en
 * `plano.expediente` del plano raíz; los archivos los guarda `POST cctv-disenos/:id/documentos`.
 */
import { MODELO_GENERICO } from "./catalogo";
import type { Plano } from "./plano";

export type TipoDocumento = "pdf" | "imagen" | "excel" | "word" | "powerpoint" | "cad" | "otro";

export type DocumentoExpediente = {
  id: string;
  nombre: string;
  tipo: TipoDocumento;
  bytes: number;
  url: string;
  subidoAt: string;
  subidoPor?: number | null;
  /** Qué es, en palabras de quien lo sube («Plano · Nivel 1», «Alcance»). */
  descripcion?: string | null;
  /** Ya se digitalizó con IA (solo planos e imágenes). */
  digitalizado?: boolean;
};

export type Expediente = {
  sitio?: string | null;
  responsable?: string | null;
  /** «AAAA-MM-DD». */
  entrega?: string | null;
  requerimientos?: string | null;
  documentos: DocumentoExpediente[];
};

export const TIPOS_DOCUMENTO_ACEPTADOS = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,.dwg,.dxf,.txt";

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  pdf: "PDF",
  imagen: "Imagen",
  excel: "Excel",
  word: "Word",
  powerpoint: "PowerPoint",
  cad: "CAD",
  otro: "Documento",
};

export function expedienteDe(plano: Plano): Expediente {
  return { documentos: [], ...(plano.expediente ?? {}) };
}

/** Un plano o una imagen se puede pasar a croquis y digitalizar; lo demás solo se consulta. */
export function sePuedeDigitalizar(d: Pick<DocumentoExpediente, "tipo">): boolean {
  return d.tipo === "pdf" || d.tipo === "imagen";
}

export type Pendiente = { texto: string; hecho: boolean };

/**
 * «Qué falta para entregar»: lo que un proyecto formal necesita antes de la propuesta. Se calcula del
 * plano y del expediente; nada se guarda.
 */
export function queFalta(raiz: Plano, niveles: Plano[]): Pendiente[] {
  const exp = expedienteDe(raiz);
  const todos = [raiz, ...niveles];
  const camaras = todos.flatMap((p) => p.camaras);
  const sinModelo = camaras.filter((c) => !c.productoId || c.productoId === MODELO_GENERICO.id).length;
  const conCroquis = todos.filter((p) => p.croquis).length;
  const calibrados = todos.filter((p) => p.croquis && p.escala.calibracion).length;
  return [
    { texto: "Datos del proyecto: sitio, responsable y entrega", hecho: Boolean(exp.sitio?.trim() && exp.responsable?.trim() && exp.entrega) },
    { texto: "Requerimientos del cliente", hecho: Boolean(exp.requerimientos?.trim()) },
    { texto: conCroquis ? `Escala calibrada (${calibrados} de ${conCroquis} planos)` : "Plano o croquis del sitio", hecho: conCroquis > 0 && calibrados === conCroquis },
    { texto: camaras.length ? `Modelo elegido en cada cámara${sinModelo ? ` (faltan ${sinModelo})` : ""}` : "Cámaras colocadas", hecho: camaras.length > 0 && sinModelo === 0 },
    { texto: "Documentos de soporte en el expediente", hecho: exp.documentos.length > 0 },
  ];
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function marcarDocumentoDigitalizado(exp: Expediente, id: string): Expediente {
  if (!exp.documentos.some((d) => d.id === id)) return exp;
  return {
    ...exp,
    documentos: exp.documentos.map((d) => (d.id === id ? { ...d, digitalizado: true } : d)),
  };
}