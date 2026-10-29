/**
 * Tiempo estándar por especificidad (§8 de `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md`, tarifas de Adam).
 *
 * La tabla vive en la API (`GET ai/estandar/tabla`) y la web la pide una vez; la suma se hace aquí
 * con la misma fórmula que `calcularEstandar` de la API (`apps/api/src/ai/estandar/tabla-estandar.ts`),
 * para que el formulario responda al instante. La IA solo propone la cantidad y el destino; quien
 * asigna los confirma, y el tiempo lo da la tabla.
 */
import { erpFetch } from "@/lib/erp-api";
import type { Complejidad } from "@/lib/complejidad";

export type UnidadEstandar = {
  clave: string;
  singular: string;
  plural: string;
  pregunta: string;
  porUnidadMin: number;
  /** Unidades que ya cubre la base; se cobran solo las de más (cotización: hasta 10 partidas). */
  incluidas?: number;
};

export type ReglaEstandar = {
  clave: string;
  nombre: string;
  baseMin: number;
  unidades: UnidadEstandar[];
  porComplejidad?: Record<Complejidad, number>;
  destino: boolean;
  enLugarMin: number;
  agenda?: boolean;
};

export type TablaEstandar = { reglas: ReglaEstandar[]; topeMin: number; origen: { nombre: string } };

export type ModoTraslado = "AUTO" | "TRANSPORTE";
export type Ruta = {
  idaMin: number;
  vueltaMin: number;
  km: number;
  fuente: "google" | "osrm" | "aproximado";
  modo: ModoTraslado;
  estimado: boolean;
  origen: string;
};

export type Desglose = Array<{ concepto: string; minutos: number }>;
export type Faltante = "cantidad" | "destino" | "complejidad";
export type ResultadoEstandar = { totalMin: number | null; desglose: Desglose; faltan: Faltante[]; topado: boolean };

/** Lo que se guarda en la actividad (los mismos nombres que la API). */
export type EstandarGuardado = {
  unidades: { clave: string; cantidad: number } | null;
  destino: { direccion: string; lat: number; lng: number } | null;
  trasladoMin: number | null;
  trasladoModo: ModoTraslado | null;
  tiempoEstandarMin: number | null;
  estandarDesglose: Desglose | null;
  /** Quien asigna puso otro tiempo: por qué. Vacío = se usa el estándar. */
  estandarCambiadoMotivo: string | null;
};

export const TOPE_ESTANDAR_MIN = 720;
/** Cambiar el tiempo del estándar pide un motivo de al menos esto. */
export const MOTIVO_MINIMO = 5;

export function fetchTablaEstandar(token: string): Promise<TablaEstandar> {
  return erpFetch<TablaEstandar>("ai/estandar/tabla", token);
}

/** Sin `origen`, la ruta sale de la oficina. */
export function fetchRutaEstandar(
  token: string,
  body: {
    lat: number;
    lng: number;
    modo: ModoTraslado;
    salida?: string | null;
    origen?: { lat: number; lng: number; nombre?: string | null } | null;
  },
): Promise<Ruta> {
  const origen = body.origen
    ? { origenLat: body.origen.lat, origenLng: body.origen.lng, ...(body.origen.nombre ? { origenNombre: body.origen.nombre } : {}) }
    : {};
  return erpFetch<Ruta>("ai/estandar/ruta", token, {
    method: "POST",
    body: JSON.stringify({ lat: body.lat, lng: body.lng, modo: body.modo, ...(body.salida ? { salida: body.salida } : {}), ...origen }),
  });
}

function normalizar(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La clave de la tabla para lo que se está asignando (igual que `claveDeTipo` de la API): en tarea,
 * su subtipo del catálogo; en servicio, el tipo de ticket; en lo demás, el tipo Core.
 */
export function claveEstandar(a: { coreKind?: string | null; ticketType?: string | null; tipoTarea?: string | null }): string | null {
  const kind = normalizar(a.coreKind);
  if (!kind) return null;
  if (kind === "tarea") return a.tipoTarea ? `tarea:${a.tipoTarea}` : null;
  if (kind === "servicio") return `servicio:${String(a.ticketType || "PREVENTIVO").toUpperCase()}`;
  return kind;
}

export function reglaPara(tabla: TablaEstandar | null | undefined, clave: string | null): ReglaEstandar | null {
  if (!tabla || !clave) return null;
  const buscada = normalizar(clave);
  return tabla.reglas.find((r) => normalizar(r.clave) === buscada) ?? null;
}

/** La misma cuenta que la API: base + (cantidad − incluidas) × tarifa (o por complejidad) + ida y vuelta + en el lugar. */
export function calcularEstandar(
  regla: ReglaEstandar,
  datos: { cantidad?: number | null; unidad?: string | null; complejidad?: Complejidad | "" | null; traslado?: { idaMin: number; vueltaMin: number } | null },
  topeMin = TOPE_ESTANDAR_MIN,
): ResultadoEstandar {
  const desglose: Desglose = [];
  const faltan: Faltante[] = [];
  if (regla.agenda) return { totalMin: null, desglose, faltan, topado: false };
  if (regla.unidades.length) {
    const unidad = regla.unidades.find((x) => x.clave === datos.unidad) ?? regla.unidades[0];
    const n = Math.max(0, Math.round(Number(datos.cantidad) || 0));
    const incluidas = Math.max(0, unidad.incluidas ?? 0);
    if (regla.baseMin) {
      const hasta = incluidas ? ` (hasta ${incluidas} ${unidad.plural})` : "";
      desglose.push({ concepto: `Base de ${regla.nombre.toLowerCase()}${hasta}`, minutos: regla.baseMin });
    }
    // Lo que la base ya cubre no se cobra otra vez: solo las unidades de más.
    const extra = n - incluidas;
    if (n > 0 && extra > 0) {
      desglose.push({
        concepto: `${extra} ${extra === 1 ? unidad.singular : unidad.plural}${incluidas ? " más" : ""} × ${unidad.porUnidadMin} min`,
        minutos: extra * unidad.porUnidadMin,
      });
    }
    if (n <= 0) faltan.push("cantidad");
  } else if (regla.porComplejidad) {
    if (datos.complejidad) desglose.push({ concepto: `${regla.nombre} · complejidad`, minutos: regla.porComplejidad[datos.complejidad] });
    else faltan.push("complejidad");
  } else if (regla.baseMin) {
    desglose.push({ concepto: regla.nombre, minutos: regla.baseMin });
  }
  if (regla.destino) {
    if (datos.traslado) {
      desglose.push({ concepto: "Ida", minutos: Math.max(0, Math.round(datos.traslado.idaMin)) });
      desglose.push({ concepto: "Vuelta", minutos: Math.max(0, Math.round(datos.traslado.vueltaMin)) });
    } else {
      faltan.push("destino");
    }
    if (regla.enLugarMin) desglose.push({ concepto: "En el lugar", minutos: regla.enLugarMin });
  }
  if (faltan.length) return { totalMin: null, desglose, faltan, topado: false };
  const suma = desglose.reduce((s, d) => s + d.minutos, 0);
  const redondeado = Math.max(5, Math.round(suma / 5) * 5);
  return { totalMin: Math.min(topeMin, redondeado), desglose, faltan, topado: redondeado > topeMin };
}

/** «Falta la cantidad», «Faltan la cantidad y el destino». */
export function textoFaltan(faltan: Faltante[], regla: ReglaEstandar | null): string | null {
  if (!faltan.length) return null;
  const nombres = faltan.map((f) =>
    f === "cantidad" ? (regla?.unidades[0] ? `la cantidad de ${regla.unidades[0].plural}` : "la cantidad") : f === "destino" ? "el destino" : "la complejidad",
  );
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `Para calcularlo falta ${lista}.`;
}

/** El motivo para no usar el estándar: obligatorio y con sustancia. */
export function motivoValido(motivo: string | null | undefined): boolean {
  return String(motivo ?? "").trim().length >= MOTIVO_MINIMO;
}

/** Lo que se manda a la API. Sin estándar (tipo sin regla) no manda nada. */
export function payloadEstandar(e: EstandarGuardado | null | undefined): Record<string, unknown> {
  if (!e) return {};
  return {
    unidades: e.unidades,
    destino: e.destino,
    trasladoMin: e.trasladoMin,
    trasladoModo: e.trasladoModo,
    tiempoEstandarMin: e.tiempoEstandarMin,
    estandarDesglose: e.estandarDesglose,
    estandarCambiadoMotivo: e.estandarCambiadoMotivo && e.estandarCambiadoMotivo.trim() ? e.estandarCambiadoMotivo.trim() : null,
  };
}

/**
 * «4 h» con su desglose en una línea, para «Datos clave» del detalle:
 * «Base de cotización 40 min · 50 partidas × 4 min 3 h 20 min · Se cambió: …».
 */
export function resumenEstandar(e: EstandarGuardado | null | undefined, formato: (min: number) => string): { valor: string; detalle: string | null } | null {
  if (!e || e.tiempoEstandarMin == null) return null;
  // «Supuesto: …» va sin minutos (lo que el título no decía y se supuso).
  const partes = (e.estandarDesglose ?? []).map((d) => (d.minutos > 0 ? `${d.concepto} ${formato(d.minutos)}` : d.concepto));
  if (e.destino?.direccion) partes.push(`Destino: ${e.destino.direccion}${e.trasladoModo === "TRANSPORTE" ? " (en transporte)" : ""}`);
  if (e.estandarCambiadoMotivo) partes.push(`Se cambió el tiempo: ${e.estandarCambiadoMotivo}`);
  return { valor: formato(e.tiempoEstandarMin), detalle: partes.length ? partes.join(" · ") : null };
}

/** Lo guardado en la actividad (para editar o para el detalle). */
export function estandarDeRegistro(r: Record<string, unknown> | null | undefined): EstandarGuardado | null {
  if (!r) return null;
  const n = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const unidades = r.unidades as EstandarGuardado["unidades"];
  const destino = r.destino as EstandarGuardado["destino"];
  const tiempoEstandarMin = n(r.tiempoEstandarMin);
  if (tiempoEstandarMin == null && !unidades && !destino) return null;
  return {
    unidades: unidades && typeof unidades === "object" ? unidades : null,
    destino: destino && typeof destino === "object" ? destino : null,
    trasladoMin: n(r.trasladoMin),
    trasladoModo: r.trasladoModo === "TRANSPORTE" ? "TRANSPORTE" : r.trasladoModo === "AUTO" ? "AUTO" : null,
    tiempoEstandarMin,
    estandarDesglose: Array.isArray(r.estandarDesglose) ? (r.estandarDesglose as Desglose) : null,
    estandarCambiadoMotivo: typeof r.estandarCambiadoMotivo === "string" ? r.estandarCambiadoMotivo : null,
  };
}
