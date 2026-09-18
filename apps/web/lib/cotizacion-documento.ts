/**
 * El documento de la cotización en el editor de Core, y cómo se guarda.
 *
 * El editor refleja la propuesta técnica modelo (01 Objetivo · 02 Alcance · 03 Planos · 04 Cotización).
 * Aquí vive lo que no es pantalla: el formato de texto del objetivo (el mismo que lee la API en
 * `apps/api/src/cotizaciones/objetivo-plantilla.ts`), las subsecciones de alcance con sus viñetas,
 * los importes de las partidas y qué cambió desde el último guardado.
 */
import {
  CLAVES_TERMINO,
  TITULO_TERMINO,
  type BloqueAlcance,
  type ClaveTermino,
  type CotizacionDetalle,
  type GrupoPartida,
  type GuardarCotizacion,
  type ObjetivoPartes,
  type PartidaCotizacion,
  type Segmento,
} from "@/lib/cotizaciones-api";

// ─── Claves locales ───────────────────────────────────────────────────────────

let contador = 0;
/** Clave estable para listas del editor (React la necesita; la API no la ve). */
export function nuevaClave(prefijo = "k"): string {
  contador += 1;
  return `${prefijo}-${contador}`;
}

export type ItemTexto = { key: string; texto: string };

export const itemsDesdeTextos = (textos: string[] | null | undefined): ItemTexto[] =>
  (textos ?? []).map((texto) => ({ key: nuevaClave("i"), texto }));

export const textosDeItems = (items: ItemTexto[]): string[] =>
  items.map((i) => i.texto.replace(/\s+/g, " ").trim()).filter(Boolean);

/** Mueve un elemento de una lista sin mutarla. Fuera de rango, devuelve la misma lista. */
export function mover<T>(lista: T[], desde: number, hacia: number): T[] {
  if (desde === hacia || desde < 0 || hacia < 0 || desde >= lista.length || hacia >= lista.length) return lista;
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  copia.splice(hacia, 0, elemento as T);
  return copia;
}

// ─── 01 Objetivo ──────────────────────────────────────────────────────────────
// Mismo formato que `leerObjetivo`/`escribirObjetivo` de la API: texto legible con las marcas
// «Beneficios:» y «Cierre:». Si cambia uno, cambia el otro (hay pruebas de los dos lados).

const MARCA_BENEFICIOS = /^\s*beneficios\s*:?\s*$/i;
const MARCA_CIERRE = /^\s*(cierre|conclusi[oó]n)\s*:?\s*$/i;
const FRASE_BENEFICIOS = /^\s*entre los principales beneficios se encuentran\s*:?\s*$/i;
const ITEM_LISTA = /^\s*(?:\d{1,2}\s*[.)-]|[-•*])\s+(.*\S)\s*$/;

function unirParrafos(lineas: string[]): string {
  return lineas
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function leerObjetivo(texto: string | null | undefined): ObjetivoPartes {
  const lineas = String(texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  const intro: string[] = [];
  const beneficios: string[] = [];
  const cierre: string[] = [];
  let fase: "intro" | "beneficios" | "cierre" = "intro";
  let huboBlanco = false;

  for (const linea of lineas) {
    if (MARCA_CIERRE.test(linea)) {
      fase = "cierre";
      continue;
    }
    if (fase !== "cierre" && (MARCA_BENEFICIOS.test(linea) || FRASE_BENEFICIOS.test(linea))) {
      fase = "beneficios";
      huboBlanco = false;
      continue;
    }
    if (fase === "cierre") {
      cierre.push(linea);
      continue;
    }
    const item = linea.match(ITEM_LISTA);
    if (fase === "intro") {
      if (item && /^\s*\d/.test(linea)) {
        fase = "beneficios";
        beneficios.push(item[1]!.trim());
        huboBlanco = false;
      } else {
        intro.push(linea);
      }
      continue;
    }
    if (item) {
      beneficios.push(item[1]!.trim());
      huboBlanco = false;
    } else if (!linea.trim()) {
      huboBlanco = true;
    } else if (huboBlanco || !beneficios.length) {
      fase = "cierre";
      cierre.push(linea);
    } else {
      beneficios[beneficios.length - 1] = `${beneficios[beneficios.length - 1]} ${linea.trim()}`;
    }
  }

  return {
    intro: unirParrafos(intro),
    beneficios: beneficios.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean),
    cierre: unirParrafos(cierre),
  };
}

export function escribirObjetivo(partes: Partial<ObjetivoPartes>): string {
  const intro = unirParrafos([String(partes.intro ?? "")]);
  const beneficios = (partes.beneficios ?? [])
    .map((b) => String(b ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const cierre = unirParrafos([String(partes.cierre ?? "")]);
  const bloques: string[] = [];
  if (intro) bloques.push(intro);
  if (beneficios.length) bloques.push(["Beneficios:", ...beneficios.map((b, i) => `${i + 1}. ${b}`)].join("\n"));
  if (cierre) bloques.push(`Cierre:\n${cierre}`);
  return bloques.join("\n\n");
}

// ─── 02 Alcance ───────────────────────────────────────────────────────────────

export type BloqueEditor = {
  key: string;
  clave: string;
  titulo: string;
  texto: string;
  vinetas: ItemTexto[];
  parametros?: Record<string, unknown> | null;
};

export function nuevoBloque(parcial: Partial<Omit<BloqueEditor, "key" | "vinetas">> & { vinetas?: string[] } = {}): BloqueEditor {
  return {
    key: nuevaClave("b"),
    clave: parcial.clave ?? `libre-${Date.now().toString(36)}-${contador}`,
    titulo: parcial.titulo ?? "",
    texto: parcial.texto ?? "",
    vinetas: itemsDesdeTextos(parcial.vinetas ?? []),
    parametros: parcial.parametros ?? null,
  };
}

/** Bloques guardados → bloques del editor (acepta los viejos: sin viñetas, viñetas en texto). */
export function bloquesDesdeApi(crudos: unknown): BloqueEditor[] {
  if (!Array.isArray(crudos)) return [];
  return crudos
    .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
    .map((b, i) => {
      const vinetas = Array.isArray(b.vinetas)
        ? (b.vinetas as unknown[]).map((v) => String(v ?? ""))
        : typeof b.vinetas === "string"
          ? b.vinetas.split("\n")
          : [];
      return {
        key: nuevaClave("b"),
        clave: String(b.clave ?? "").trim() || `libre-${i + 1}`,
        titulo: String(b.titulo ?? ""),
        texto: String(b.texto ?? ""),
        vinetas: itemsDesdeTextos(vinetas.map((v) => v.trim()).filter(Boolean)),
        parametros:
          b.parametros && typeof b.parametros === "object" && !Array.isArray(b.parametros)
            ? (b.parametros as Record<string, unknown>)
            : null,
      };
    });
}

/** Bloques del editor → lo que se guarda. Los vacíos no se mandan: en el PDF saldrían como «3.» solo. */
export function bloquesParaApi(bloques: BloqueEditor[]): BloqueAlcance[] {
  return bloques
    .map((b) => {
      const salida: BloqueAlcance = {
        clave: b.clave,
        titulo: b.titulo.trim(),
        texto: b.texto.trim() || null,
        vinetas: textosDeItems(b.vinetas),
      };
      if (b.parametros) salida.parametros = b.parametros;
      return salida;
    })
    .filter((b) => b.titulo || b.texto || (b.vinetas?.length ?? 0) > 0);
}

/** Un bloque vino de un paquete («Cámara bala instalada ×8»): se reescribe al reaplicarlo. */
export const esBloqueDePaquete = (b: Pick<BloqueEditor, "clave">) => b.clave.startsWith("paquete:");

// ─── 04 Cotización: partidas ─────────────────────────────────────────────────

/** Unidades de la propuesta modelo, más las que se usan en obra. */
export const UNIDADES = ["Pieza", "Servicio", "Insumo", "Metro", "Rollo", "Caja", "Kit", "Juego", "Lote", "Hora"] as const;

export type PartidaEditor = PartidaCotizacion & { key: string };

export function partidaNueva(parcial: Partial<PartidaCotizacion> = {}): PartidaEditor {
  return {
    key: nuevaClave("p"),
    name: "",
    unit: "Pieza",
    qty: 1,
    unitPrice: 0,
    discount: 0,
    tax: 16,
    ...parcial,
  };
}

export function partidasDesdeApi(items: PartidaCotizacion[] | null | undefined): PartidaEditor[] {
  return (items ?? []).map((p) => ({
    key: nuevaClave("p"),
    id: p.id,
    grupo: p.grupo ?? null,
    category: p.category ?? null,
    name: p.name ?? "",
    description: p.description ?? null,
    unit: p.unit || "Pieza",
    qty: Number(p.qty || 0),
    unitPrice: Number(p.unitPrice || 0),
    discount: Number(p.discount || 0),
    tax: p.tax == null ? 16 : Number(p.tax),
    laborHours: Number(p.laborHours || 0),
    laborRate: Number(p.laborRate || 0),
    paqueteClave: p.paqueteClave ?? null,
    paqueteCantidad: p.paqueteCantidad ?? null,
  }));
}

/** Lo que se guarda: sin renglones vacíos y con números sanos (la API exige cantidad ≥ 1). */
export function partidasParaApi(partidas: PartidaEditor[]): PartidaCotizacion[] {
  return partidas
    .filter((p) => p.name.trim())
    .map(({ key: _key, id: _id, lineTotal: _total, ...p }) => ({
      ...p,
      name: p.name.trim(),
      unit: p.unit?.trim() || "Pieza",
      qty: Math.max(1, Math.round(Number(p.qty) || 1)),
      unitPrice: Math.max(0, Number(p.unitPrice) || 0),
      discount: Math.min(100, Math.max(0, Number(p.discount) || 0)),
      tax: p.tax == null ? 16 : Math.min(100, Math.max(0, Number(p.tax))),
    }));
}

/** Importe antes de IVA de un renglón (cantidad × precio + mano de obra − descuento). */
export function importeDeLinea(p: Pick<PartidaCotizacion, "qty" | "unitPrice" | "laborHours" | "laborRate" | "discount">): number {
  const base = Number(p.qty || 0) * Number(p.unitPrice || 0) + Number(p.laborHours || 0) * Number(p.laborRate || 0);
  return base - base * (Number(p.discount || 0) / 100);
}

const redondeo = (n: number) => Math.round(n * 100) / 100;

export type Totales = { subtotal: number; iva: number; total: number; porGrupo: Record<GrupoPartida, number> };

export function totalesDePartidas(partidas: PartidaCotizacion[]): Totales {
  const porGrupo: Record<GrupoPartida, number> = { EQUIPOS: 0, MATERIALES: 0, MANO_DE_OBRA: 0 };
  let subtotal = 0;
  let iva = 0;
  for (const p of partidas) {
    if (!String(p.name ?? "").trim()) continue;
    const linea = importeDeLinea(p);
    subtotal += linea;
    iva += linea * (Number(p.tax ?? 16) / 100);
    const grupo = (p.grupo as GrupoPartida) || "EQUIPOS";
    porGrupo[grupo] = (porGrupo[grupo] ?? 0) + linea;
  }
  return {
    subtotal: redondeo(subtotal),
    iva: redondeo(iva),
    total: redondeo(subtotal + iva),
    porGrupo: {
      EQUIPOS: redondeo(porGrupo.EQUIPOS),
      MATERIALES: redondeo(porGrupo.MATERIALES),
      MANO_DE_OBRA: redondeo(porGrupo.MANO_DE_OBRA),
    },
  };
}

// ─── 04 Cotización: términos y condiciones ────────────────────────────────────
// Solo se guarda lo que quien cotiza reescribió (en `note`, con sus títulos): lo demás sigue al
// segmento y al anticipo. Mismo formato que `escribirTerminosPersonalizados` de la API.

export type TerminosPropios = Partial<Record<ClaveTermino, string>>;

export function escribirTerminos(propios: TerminosPropios): string {
  return CLAVES_TERMINO.map((clave) => {
    const texto = String(propios[clave] ?? "").replace(/\r\n?/g, "\n").trim();
    return texto ? `${TITULO_TERMINO[clave]}:\n${texto}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

/** Lo reescrito, tal como lo reporta la API (`terminos.partes[].personalizado`). */
export function terminosPropiosDeDetalle(d: Pick<CotizacionDetalle, "terminos">): TerminosPropios {
  const propios: TerminosPropios = {};
  for (const parte of d.terminos?.partes ?? []) {
    if (parte.clave === "vigencia" || !parte.personalizado) continue;
    propios[parte.clave] = parte.texto;
  }
  return propios;
}

// ─── El documento completo ───────────────────────────────────────────────────

export type DocumentoCotizacion = {
  segmento: Segmento;
  salesClientId: number | null;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientPhone: string;
  projectName: string;
  /** Párrafo de entrada de 02 Alcance. */
  alcanceIntro: string;
  objetivo: { intro: string; beneficios: ItemTexto[]; cierre: string };
  bloques: BloqueEditor[];
  issueDate: string;
  validUntil: string;
  depositPercent: number;
  partidas: PartidaEditor[];
  /** Términos reescritos (los demás son los del segmento). */
  terminos: TerminosPropios;
};

export const hoyISO = (hoy = new Date()) => {
  const d = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 10);
};

export function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const fechaCorta = (valor?: string | null) => (valor ? String(valor).slice(0, 10) : "");

export function documentoVacio(segmento: Segmento = "COMERCIAL", hoy = new Date()): DocumentoCotizacion {
  const emision = hoyISO(hoy);
  return {
    segmento,
    salesClientId: null,
    clientName: "",
    clientCompany: "",
    clientEmail: "",
    clientPhone: "",
    projectName: "",
    alcanceIntro: "",
    objetivo: { intro: "", beneficios: [], cierre: "" },
    bloques: [],
    issueDate: emision,
    validUntil: sumarDias(emision, 15),
    depositPercent: 50,
    partidas: [],
    terminos: {},
  };
}

export function documentoDesdeDetalle(d: CotizacionDetalle): DocumentoCotizacion {
  const objetivo = d.objetivoPartes ?? leerObjetivo(d.objetivo);
  return {
    segmento: d.segmento,
    salesClientId: d.salesClientId ?? null,
    clientName: d.clientName ?? "",
    clientCompany: d.clientCompany ?? "",
    clientEmail: d.clientEmail ?? "",
    clientPhone: d.clientPhone ?? "",
    projectName: d.projectName ?? "",
    alcanceIntro: d.scope ?? "",
    objetivo: {
      intro: objetivo.intro,
      beneficios: itemsDesdeTextos(objetivo.beneficios),
      cierre: objetivo.cierre,
    },
    bloques: bloquesDesdeApi(d.alcanceBloques),
    issueDate: fechaCorta(d.issueDate) || hoyISO(),
    validUntil: fechaCorta(d.validUntil),
    depositPercent: Number(d.depositPercent ?? 50),
    partidas: partidasDesdeApi(d.items),
    terminos: terminosPropiosDeDetalle(d),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const esCorreo = (valor: string) => EMAIL.test(valor.trim());

/**
 * Lo que se manda a la API. Solo campos que la API sabe guardar tal cual: un correo a medio escribir
 * o una fecha vacía no se mandan (la API los rechazaría y el autoguardado se quedaría en error).
 */
export function payloadDeDocumento(doc: DocumentoCotizacion): GuardarCotizacion {
  const payload: GuardarCotizacion = {
    segmento: doc.segmento,
    clientName: doc.clientName.trim(),
    clientCompany: doc.clientCompany.trim(),
    clientPhone: doc.clientPhone.trim(),
    projectName: doc.projectName.trim(),
    scope: doc.alcanceIntro.trim(),
    objetivo: escribirObjetivo({
      intro: doc.objetivo.intro,
      beneficios: textosDeItems(doc.objetivo.beneficios),
      cierre: doc.objetivo.cierre,
    }),
    alcanceBloques: bloquesParaApi(doc.bloques),
    depositPercent: Math.min(100, Math.max(0, Math.round(Number(doc.depositPercent) || 0))),
    note: escribirTerminos(doc.terminos),
    items: partidasParaApi(doc.partidas),
  };
  if (doc.salesClientId) payload.salesClientId = doc.salesClientId;
  if (esCorreo(doc.clientEmail)) payload.clientEmail = doc.clientEmail.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(doc.issueDate)) payload.issueDate = doc.issueDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(doc.validUntil)) payload.validUntil = doc.validUntil;
  return payload;
}

/** Campos que cambiaron entre dos payloads (lo único que viaja en el autoguardado). */
export function cambiosEntre<T extends object>(anterior: T | null, actual: T): Partial<T> {
  const cambios: Partial<T> = {};
  for (const clave of Object.keys(actual) as Array<keyof T>) {
    const antes = anterior ? JSON.stringify(anterior[clave]) : undefined;
    if (JSON.stringify(actual[clave]) !== antes) cambios[clave] = actual[clave];
  }
  return cambios;
}

/** Qué le falta al borrador para existir (la API exige cliente para emitir el folio). */
export function faltaParaGuardar(doc: DocumentoCotizacion): string | null {
  if (doc.clientName.trim().length < 2 && !doc.salesClientId) return "Escribe para quién es (cliente) y se guarda solo.";
  return null;
}

/** Qué falta para enviarla al cliente. */
export function faltaParaEnviar(doc: DocumentoCotizacion): string[] {
  const faltas: string[] = [];
  if (!doc.partidas.some((p) => p.name.trim())) faltas.push("al menos una partida en 04 Cotización");
  if (!doc.clientName.trim()) faltas.push("el cliente");
  return faltas;
}

/** Avance del documento por sección (para el índice). */
export function seccionesCompletas(doc: DocumentoCotizacion, planos: number) {
  return {
    objetivo: Boolean(doc.objetivo.intro.trim() || textosDeItems(doc.objetivo.beneficios).length),
    alcance: bloquesParaApi(doc.bloques).length > 0,
    planos: planos > 0,
    cotizacion: doc.partidas.some((p) => p.name.trim()),
  };
}
