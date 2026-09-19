/**
 * Personalización de la cotización en el editor: espejo de `apps/api/src/cotizaciones/personalizacion.ts`.
 *
 * Qué secciones y columnas lleva el PDF, carta de presentación, condiciones comerciales, moneda y
 * firmas. Sin nada guardado, lo de siempre (todas las secciones, tabla con precio unitario, sin
 * carta, MXN y la firma «Elaboró» del autor). La API vuelve a normalizar al guardar.
 */

export type SeccionesOpcionales = { objetivo: boolean; alcance: boolean; planos: boolean; terminos: boolean; firma: boolean };
export type ColumnasOpcionales = { marcaModelo: boolean; imagen: boolean; descuento: boolean; precioUnitario: boolean };
export type CartaPresentacion = { dirigidaA: string; cargo?: string; mensaje: string };
export type CondicionesComerciales = { formaPago: string; tiempoEntrega: string; garantia: string };
export type Firmante = { nombre: string; cargo?: string };
export type Moneda = "MXN" | "USD";

export type OpcionesCotizacion = {
  secciones: SeccionesOpcionales;
  columnas: ColumnasOpcionales;
  carta: CartaPresentacion | null;
  tipoCambioNota: string;
  condiciones: CondicionesComerciales;
  /** `null` = el autor de la cotización. */
  elaboro: Firmante | null;
  autorizo: (Firmante & { userId?: number | null }) | null;
};

/** Condiciones que sugiere el segmento (vienen de la API en `condicionesSugeridas` y en plantillas). */
export type CondicionesSugeridas = CondicionesComerciales & { anticipoPct: number; vigenciaDias: number };

export const SECCIONES_OPCIONALES: Array<{ clave: keyof SeccionesOpcionales; etiqueta: string; ayuda: string }> = [
  { clave: "objetivo", etiqueta: "01 Objetivo", ayuda: "Qué gana el cliente" },
  { clave: "alcance", etiqueta: "02 Alcance", ayuda: "Subsecciones del trabajo" },
  { clave: "planos", etiqueta: "03 Planos", ayuda: "Planos y fotos a página completa" },
  { clave: "terminos", etiqueta: "Términos y condiciones", ayuda: "Bajo la tabla de 04" },
  { clave: "firma", etiqueta: "Firma", ayuda: "Elaboró y, si aplica, Autorizó" },
];

export const COLUMNAS_OPCIONALES: Array<{ clave: keyof ColumnasOpcionales; etiqueta: string; ayuda: string }> = [
  { clave: "marcaModelo", etiqueta: "Marca y modelo", ayuda: "Dos columnas junto a la descripción" },
  { clave: "imagen", etiqueta: "Imagen del producto", ayuda: "Miniatura por partida" },
  { clave: "descuento", etiqueta: "Descuento por partida", ayuda: "Porcentaje en cada renglón" },
  { clave: "precioUnitario", etiqueta: "Precio unitario", ayuda: "Apagado: solo el total del renglón (a precio alzado)" },
];

export function opcionesPorOmision(): OpcionesCotizacion {
  return {
    secciones: { objetivo: true, alcance: true, planos: true, terminos: true, firma: true },
    columnas: { marcaModelo: false, imagen: false, descuento: false, precioUnitario: true },
    carta: null,
    tipoCambioNota: "",
    condiciones: { formaPago: "", tiempoEntrega: "", garantia: "" },
    elaboro: null,
    autorizo: null,
  };
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const cadena = (v: unknown) => (typeof v === "string" ? v : "");
const bandera = (v: unknown, omision: boolean) => (typeof v === "boolean" ? v : omision);

function firmante(v: unknown): Firmante | null {
  const o = objeto(v);
  const nombre = cadena(o["nombre"]);
  if (!nombre.trim()) return null;
  const cargo = cadena(o["cargo"]);
  return cargo ? { nombre, cargo } : { nombre };
}

/** Lo que manda la API (o una plantilla) → opciones completas para el editor. */
export function opcionesDesdeApi(crudo: unknown): OpcionesCotizacion {
  const base = opcionesPorOmision();
  const o = objeto(crudo);
  const s = objeto(o["secciones"]);
  const c = objeto(o["columnas"]);
  const k = objeto(o["condiciones"]);
  const carta = objeto(o["carta"]);
  const autorizo = firmante(o["autorizo"]);
  const userId = Number(objeto(o["autorizo"])["userId"]);
  return {
    secciones: {
      objetivo: bandera(s["objetivo"], base.secciones.objetivo),
      alcance: bandera(s["alcance"], base.secciones.alcance),
      planos: bandera(s["planos"], base.secciones.planos),
      terminos: bandera(s["terminos"], base.secciones.terminos),
      firma: bandera(s["firma"], base.secciones.firma),
    },
    columnas: {
      marcaModelo: bandera(c["marcaModelo"], base.columnas.marcaModelo),
      imagen: bandera(c["imagen"], base.columnas.imagen),
      descuento: bandera(c["descuento"], base.columnas.descuento),
      precioUnitario: bandera(c["precioUnitario"], base.columnas.precioUnitario),
    },
    carta:
      o["carta"] && typeof o["carta"] === "object"
        ? {
            dirigidaA: cadena(carta["dirigidaA"]),
            ...(cadena(carta["cargo"]) ? { cargo: cadena(carta["cargo"]) } : {}),
            mensaje: cadena(carta["mensaje"]),
          }
        : null,
    tipoCambioNota: cadena(o["tipoCambioNota"]),
    condiciones: {
      formaPago: cadena(k["formaPago"]),
      tiempoEntrega: cadena(k["tiempoEntrega"]),
      garantia: cadena(k["garantia"]),
    },
    elaboro: firmante(o["elaboro"]),
    autorizo: autorizo ? { ...autorizo, ...(Number.isInteger(userId) && userId > 0 ? { userId } : {}) } : null,
  };
}

/**
 * Opciones del editor → lo que se guarda. Recorta espacios; una carta sin destinatario ni mensaje
 * y firmas sin nombre no se mandan (el PDF no imprimiría una firma vacía).
 */
export function opcionesParaApi(o: OpcionesCotizacion): OpcionesCotizacion {
  const limpio = (t: string) => t.replace(/\r\n?/g, "\n").trim();
  const firma = (f: (Firmante & { userId?: number | null }) | null) =>
    f && limpio(f.nombre)
      ? {
          nombre: limpio(f.nombre),
          ...(f.cargo && limpio(f.cargo) ? { cargo: limpio(f.cargo) } : {}),
          ...(f.userId ? { userId: f.userId } : {}),
        }
      : null;
  const carta =
    o.carta && (limpio(o.carta.dirigidaA) || limpio(o.carta.mensaje))
      ? {
          dirigidaA: limpio(o.carta.dirigidaA),
          ...(o.carta.cargo && limpio(o.carta.cargo) ? { cargo: limpio(o.carta.cargo) } : {}),
          mensaje: limpio(o.carta.mensaje),
        }
      : null;
  return {
    secciones: { ...o.secciones },
    columnas: { ...o.columnas },
    carta,
    tipoCambioNota: limpio(o.tipoCambioNota),
    condiciones: {
      formaPago: limpio(o.condiciones.formaPago),
      tiempoEntrega: limpio(o.condiciones.tiempoEntrega),
      garantia: limpio(o.condiciones.garantia),
    },
    elaboro: firma(o.elaboro),
    autorizo: firma(o.autorizo),
  };
}

/** Condiciones vacías se llenan con las del segmento (cotización nueva, «Usar las del segmento»). */
export function conCondicionesSugeridas(o: OpcionesCotizacion, sugeridas: CondicionesComerciales | null | undefined): OpcionesCotizacion {
  if (!sugeridas) return o;
  return {
    ...o,
    condiciones: {
      formaPago: o.condiciones.formaPago || sugeridas.formaPago,
      tiempoEntrega: o.condiciones.tiempoEntrega || sugeridas.tiempoEntrega,
      garantia: o.condiciones.garantia || sugeridas.garantia,
    },
  };
}

/** Una línea para el panel cerrado: qué cambia respecto a lo de siempre. */
export function resumenOpciones(o: OpcionesCotizacion, moneda: Moneda): string {
  const fuera = SECCIONES_OPCIONALES.filter((s) => !o.secciones[s.clave]).map((s) => s.etiqueta.replace(/^\d+ /, ""));
  const columnas = COLUMNAS_OPCIONALES.filter((c) => c.clave !== "precioUnitario" && o.columnas[c.clave]).map((c) => c.etiqueta.toLowerCase());
  const partes = [
    fuera.length ? `Sin ${fuera.join(", ").toLowerCase()}` : "Todas las secciones",
    columnas.length ? `tabla con ${columnas.join(", ")}` : null,
    o.columnas.precioUnitario ? null : "a precio alzado",
    o.carta ? "con carta" : null,
    moneda,
    o.autorizo?.nombre ? "firma Elaboró y Autorizó" : null,
  ];
  return partes.filter(Boolean).join(" · ");
}

/** Días entre emisión y validez (la «Vigencia (días)» de las condiciones). */
export function diasDeVigencia(emision: string, validez: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emision) || !/^\d{4}-\d{2}-\d{2}$/.test(validez)) return null;
  const dias = Math.round((Date.parse(`${validez}T00:00:00Z`) - Date.parse(`${emision}T00:00:00Z`)) / 86_400_000);
  return dias > 0 ? dias : null;
}

/**
 * Plantilla de columnas de la tabla de partidas: # · descripción · unidad · cantidad · precio ·
 * [marca · modelo · desc. % · imagen] · total · menú.
 */
export function columnasDeTabla(c: ColumnasOpcionales): string {
  return [
    "28px",
    "minmax(0, 1fr)",
    "88px",
    "56px",
    "100px",
    ...(c.marcaModelo ? ["84px", "92px"] : []),
    ...(c.descuento ? ["60px"] : []),
    ...(c.imagen ? ["44px"] : []),
    "112px",
    "32px",
  ].join(" ");
}
