/**
 * «Cotizar con IA» del lado de la web: de la propuesta que arma la API
 * (`POST cotizaciones/interpretar`) a lo que se revisa en la tarjeta y de ahí al documento.
 *
 * Aquí vive lo que no es pantalla. Nada se guarda hasta que la persona usa la propuesta; al usarla,
 * el documento entra al autoguardado normal del editor.
 */
import {
  documentoDesdeDetalle,
  hoyISO,
  nuevaClave,
  partidaNueva,
  precioConMargen,
  sumarDias,
  type DocumentoCotizacion,
  type PartidaEditor,
} from "@/lib/cotizacion-documento";
import { crearAviso, type AvisoCt, type SubirPrecio } from "@/lib/aviso-costo-ct";
import { GRUPOS_PARTIDA, type CostoDeHoy, type CotizacionDetalle, type GrupoPartida, type OpcionPropuesta, type PartidaPropuesta, type Segmento } from "@/lib/cotizaciones-api";

export type FilaPropuesta = PartidaPropuesta & {
  key: string;
  /** Las partidas entran marcadas; lo que «suele ir con esto», sin marcar. */
  incluida: boolean;
  marginPercent: number | null;
  /** Cuál de las opciones se eligió. */
  opcionElegida: number | null;
  /** Se escribió a mano: el margen ya no lo cambia. */
  precioManual: boolean;
  /** Lo ya cotizado que hoy cuesta otra cosa en CT. */
  avisoCt: AvisoCt | null;
};

/** Trabajo y no producto: se cobra a costo, así que el margen de la tarjeta no le toca. */
const DE_SERVICIO = /instalaci|configuraci|mantenimiento|mano de obra|tendido|montaje|canalizaci|armado|maniobra|env[ií]o|servicio/i;

function esServicio(fila: Pick<PartidaPropuesta, "unidad" | "grupo" | "name">): boolean {
  return fila.unidad === "Servicio" || fila.grupo === "MANO_DE_OBRA" || DE_SERVICIO.test(fila.name);
}

/**
 * A cuál le toca el margen de la tarjeta: lo del mayorista y lo que todavía no tiene precio, para que
 * al escribir su costo el precio salga solo. Lo ya cotizado se queda con su precio de la última vez.
 */
function llevaMargen(fila: Pick<PartidaPropuesta, "fuente" | "unitCost" | "unitPrice" | "unidad" | "grupo" | "name">): boolean {
  if (esServicio(fila)) return false;
  if (fila.fuente === "catalogo") return Boolean(fila.unitCost);
  return fila.fuente === "libre" && !fila.unitPrice;
}

export function filasDePropuesta(partidas: PartidaPropuesta[], margen: number | null, incluida = true): FilaPropuesta[] {
  return partidas.map((p) => ({
    ...p,
    key: nuevaClave("f"),
    incluida,
    marginPercent: llevaMargen(p) ? margen : null,
    opcionElegida: null,
    precioManual: false,
    avisoCt: crearAviso(p.costoDeHoy, p.unitCost, p.unitPrice),
  }));
}

/** Cambió el margen de la tarjeta: se recalcula lo que depende de él, y nada más. */
export function conMargen(filas: FilaPropuesta[], margen: number | null): FilaPropuesta[] {
  return filas.map((f) => {
    if (f.precioManual || (!llevaMargen(f) && f.marginPercent == null)) return f;
    const precio = precioConMargen(f.unitCost, margen);
    return { ...f, marginPercent: margen, ...(precio != null ? { unitPrice: precio } : {}) };
  });
}

/** Se eligió una de las opciones: la fila toma sus datos. La unidad dicha («Metro») se respeta. */
export function elegirOpcion(fila: FilaPropuesta, indice: number, margen: number | null): FilaPropuesta {
  const opcion: OpcionPropuesta | undefined = fila.alternativas[indice];
  if (!opcion) return fila;
  const base = {
    ...fila,
    fuente: opcion.fuente,
    name: opcion.name,
    description: opcion.description,
    brand: opcion.brand,
    model: opcion.model,
    unidad: fila.unidad !== "Pieza" ? fila.unidad : opcion.unit || fila.unidad,
    unitCost: opcion.unitCost,
    unitPrice: opcion.unitPrice,
    grupo: opcion.grupo,
    imagenUrl: opcion.imagenUrl,
    veces: opcion.veces,
    ultimaVez: opcion.ultimaVez,
    stock: opcion.stock,
    productCtId: opcion.productCtId,
    opcionElegida: indice,
    precioManual: false,
    avisoCt: crearAviso(opcion.costoDeHoy, opcion.unitCost, opcion.unitPrice),
  };
  if (opcion.fuente === "catalogo" && !esServicio(base)) {
    return { ...base, marginPercent: margen, unitPrice: precioConMargen(opcion.unitCost, margen) ?? 0 };
  }
  return { ...base, marginPercent: null };
}

/** Pone el costo de CT. El precio se queda: subirlo es otro clic. */
export function usarCostoDeHoy(fila: FilaPropuesta): FilaPropuesta {
  return fila.avisoCt ? { ...fila, unitCost: fila.avisoCt.hoy.costo } : fila;
}

/** Sube el precio con el margen que dijo el botón. Queda como escrito a mano: el margen de la tarjeta ya no lo mueve. */
export function subirPrecioDeHoy(fila: FilaPropuesta, subir: SubirPrecio): FilaPropuesta {
  return { ...fila, unitPrice: subir.precio, marginPercent: subir.margen, precioManual: true };
}

export function deshacerCostoDeHoy(fila: FilaPropuesta): FilaPropuesta {
  if (!fila.avisoCt) return fila;
  return { ...fila, unitCost: fila.avisoCt.costoGuardado, unitPrice: fila.avisoCt.precioGuardado, marginPercent: null, precioManual: false };
}

export const importeDeFila = (f: Pick<FilaPropuesta, "cantidad" | "unitPrice">) => (Number(f.cantidad) || 0) * (Number(f.unitPrice) || 0);

export function resumenDeFilas(filas: FilaPropuesta[]): { subtotal: number; sinPrecio: number; partidas: number } {
  const dentro = filas.filter((f) => f.incluida && f.name.trim());
  return {
    subtotal: dentro.reduce((suma, f) => suma + importeDeFila(f), 0),
    sinPrecio: dentro.filter((f) => !f.unitPrice).length,
    partidas: dentro.length,
  };
}

const grupoValido = (grupo: string | null): GrupoPartida | null =>
  GRUPOS_PARTIDA.includes(grupo as GrupoPartida) ? (grupo as GrupoPartida) : null;

export function partidasDeFilas(filas: FilaPropuesta[]): PartidaEditor[] {
  return filas
    .filter((f) => f.incluida && f.name.trim())
    .map((f) =>
      partidaNueva({
        name: f.name.trim(),
        description: f.description,
        brand: f.brand,
        model: f.model,
        unit: f.unidad || "Pieza",
        qty: Math.max(1, Math.round(Number(f.cantidad) || 1)),
        unitCost: f.unitCost,
        unitPrice: Math.max(0, Number(f.unitPrice) || 0),
        marginPercent: f.marginPercent,
        grupo: grupoValido(f.grupo),
        imagenUrl: f.imagenUrl,
        avisoCt: f.avisoCt,
      }),
    );
}

export type DatosDePropuesta = {
  cliente: { salesClientId: number | null; nombre: string };
  proyecto: string;
  segmento: Segmento;
  conIva: boolean;
  filas: FilaPropuesta[];
};

/**
 * La propuesta entra al documento. El margen general queda en 0: cada partida ya trae su precio, y
 * el 20 % con que abre una cotización se sumaría encima (16 de 56 tuvieron que apagarlo a mano).
 */
export function documentoConPropuesta(doc: DocumentoCotizacion, datos: DatosDePropuesta): DocumentoCotizacion {
  return {
    ...doc,
    salesClientId: datos.cliente.salesClientId,
    clientName: datos.cliente.nombre.trim() || doc.clientName,
    projectName: datos.proyecto.trim() || doc.projectName,
    segmento: datos.segmento,
    conIva: datos.conIva,
    marginPercent: 0,
    partidas: [...doc.partidas.filter((p) => p.name.trim()), ...partidasDeFilas(datos.filas)],
  };
}

/**
 * Lo copiado trae los costos de entonces: cada partida que hoy cuesta otra cosa en CT lleva su aviso.
 * No cambia ninguna cifra. `conAviso` dice cuántas son, para decirlo al copiar.
 */
export function conAvisosDeCosto(doc: DocumentoCotizacion, costos: Record<number, CostoDeHoy>): { doc: DocumentoCotizacion; conAviso: number } {
  let conAviso = 0;
  const partidas = doc.partidas.map((p) => {
    const hoy = p.id ? costos[p.id] : undefined;
    const avisoCt = crearAviso(hoy, p.unitCost, p.unitPrice, p.unitPrice, p.marginPercent);
    if (!avisoCt) return p;
    conAviso += 1;
    return { ...p, avisoCt };
  });
  return { doc: { ...doc, partidas }, conAviso };
}

/**
 * Partir de una cotización anterior: todo su contenido con fechas nuevas. Si se dijo otro cliente,
 * sus datos de contacto no pasan a este. El folio lo emite el servidor al guardar: es una cotización nueva.
 */
export function documentoCopiadoDe(
  detalle: CotizacionDetalle,
  cliente: { salesClientId: number | null; nombre: string } | null,
  hoy = new Date(),
): DocumentoCotizacion {
  const emision = hoyISO(hoy);
  const copia: DocumentoCotizacion = { ...documentoDesdeDetalle(detalle), issueDate: emision, validUntil: sumarDias(emision, 15) };
  const nombre = cliente?.nombre.trim();
  if (!nombre || nombre.toLowerCase() === copia.clientName.trim().toLowerCase()) return copia;
  return {
    ...copia,
    salesClientId: cliente?.salesClientId ?? null,
    clientName: nombre,
    clientCompany: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    atencion: "",
  };
}
