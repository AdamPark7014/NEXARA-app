"use client";

/**
 * Lógica de la bitácora de INTEGRA.
 *
 * Vive fuera de `page.tsx` porque es lo que hay que poder probar: decidir si una
 * entrada entra en un rango de fechas, o si «integra.door.open» es una acción
 * crítica, se rompe en silencio y nadie lo nota hasta que alguien tiene que
 * reconstruir qué pasó un martes por la tarde.
 *
 * ── Lo que el servidor NO hace ───────────────────────────────────────────────
 * `GET /integra/audit` (integra.controller.ts → `listAudit`) admite **un solo
 * parámetro: `limit`**, que además se recorta a `[1, 200]`. No filtra por fecha,
 * ni por actor, ni por acción, y no pagina. Su campo `total` es
 * `rows.length` — el tamaño de la página, no cuántas entradas hay.
 *
 * Consecuencia de diseño: todo el filtrado y la paginación de esta pantalla son
 * de navegador, sobre la ventana de las 200 más recientes. La pantalla lo dice
 * en voz alta (`avisoDeVentana`) en vez de fingir que filtra el servidor.
 */

import { DOOR_CONTROL_OPTIONS } from "../_lib";

/** Recorte real de `listAudit`: `Math.min(Math.max(limit ?? 40, 1), 200)`. */
export const TOPE_SERVIDOR = 200;

export const TAMANOS_PAGINA = [25, 50, 100] as const;
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number];

/**
 * Una entrada tal y como la devuelve el servidor.
 *
 * `entityId` **no es el id de la cosa tocada**: `auditMut` lo rellena con el
 * `siteId` (o 0 si no se resolvió sitio). Por eso la tabla lo etiqueta «Sitio».
 * `ipAddress`, `userAgent` y `previousData` existen en la tabla `audit_logs`
 * pero `listAudit` no los devuelve, así que aquí no se pintan.
 */
export type EntradaBitacora = {
  id: number;
  action: string;
  entityId?: number | null;
  createdAt: string;
  userEmail?: string | null;
  userName?: string | null;
  changes?: unknown;
};

export type RespuestaBitacora = {
  /** Ojo: es `rows.length`, no el total de la tabla. */
  total?: number;
  items?: EntradaBitacora[];
};

export type CategoriaAccion =
  | "puertas"
  | "personas"
  | "vehiculos"
  | "horarios"
  | "visitas"
  | "camaras"
  | "privilegios"
  | "otro";

export const ETIQUETA_CATEGORIA: Record<CategoriaAccion, string> = {
  puertas: "Puertas",
  personas: "Personas",
  vehiculos: "Vehículos",
  horarios: "Horarios",
  visitas: "Visitas",
  camaras: "Cámaras",
  privilegios: "Privilegios",
  otro: "Otras",
};

type FichaAccion = {
  etiqueta: string;
  categoria: CategoriaAccion;
  /**
   * Deja rastro de algo que altera quién puede entrar dónde. Son las que se
   * buscan cuando hay que reconstruir un incidente, y por eso van marcadas.
   */
  critica?: boolean;
};

/**
 * Catálogo. Solo acciones que el backend escribe de verdad — salen de las
 * llamadas a `auditMut(...)` y `audit.log({ action: ... })` de `apps/api`. Si
 * aparece una que no está aquí se muestra su código crudo, nunca se esconde.
 */
export const ACCIONES: Readonly<Record<string, FichaAccion>> = {
  "integra.door.open": {
    etiqueta: "Puerta abierta a distancia",
    categoria: "puertas",
    critica: true,
  },
  "integra.door.control": {
    etiqueta: "Puerta controlada a distancia",
    categoria: "puertas",
    critica: true,
  },
  "integra.person.add": { etiqueta: "Alta de persona", categoria: "personas", critica: true },
  "integra.person.update": { etiqueta: "Cambio en persona", categoria: "personas" },
  "integra.person.delete": { etiqueta: "Baja de persona", categoria: "personas", critica: true },
  "integra.person.access.patch": {
    etiqueta: "Cambio de accesos de persona",
    categoria: "personas",
    critica: true,
  },
  "integra.person.face.upload": { etiqueta: "Alta de rostro", categoria: "personas" },
  "integra.person.face.delete": { etiqueta: "Baja de rostro", categoria: "personas" },
  "integra.person.fp.enroll": { etiqueta: "Alta de huella", categoria: "personas" },
  "integra.person.fp.delete": { etiqueta: "Baja de huella", categoria: "personas" },
  "integra.person.fp.fetch": { etiqueta: "Lectura de huella", categoria: "personas" },
  "integra.privilege.assign": {
    etiqueta: "Personas asignadas a grupo",
    categoria: "privilegios",
    critica: true,
  },
  "integra.privilege.apply": {
    etiqueta: "Reaplicación de privilegios",
    categoria: "privilegios",
    critica: true,
  },
  "integra.schedule.template.put": {
    etiqueta: "Cambio de plantilla horaria",
    categoria: "horarios",
    critica: true,
  },
  "integra.schedule.weekPlan.put": {
    etiqueta: "Cambio de plan semanal",
    categoria: "horarios",
    critica: true,
  },
  "integra.schedule.preset.ensure": {
    etiqueta: "Alta de preset horario",
    categoria: "horarios",
    critica: true,
  },
  "integra.visitor.register": { etiqueta: "Registro de visita", categoria: "visitas" },
  "integra.visitor.recurring.create": {
    etiqueta: "Alta de visita recurrente",
    categoria: "visitas",
  },
  "integra.visitor.recurring.cancel": {
    etiqueta: "Baja de visita recurrente",
    categoria: "visitas",
  },
  "integra.vehicle.add": { etiqueta: "Alta de vehículo", categoria: "vehiculos" },
  "integra.vehicle.update": { etiqueta: "Cambio en vehículo", categoria: "vehiculos" },
  "integra.vehicle.delete": { etiqueta: "Baja de vehículo", categoria: "vehiculos" },
  "integra.camera.audio": { etiqueta: "Audio de cámara", categoria: "camaras" },
  "integra.ptz.preset": { etiqueta: "Preset PTZ", categoria: "camaras" },
};

/** El código crudo si no está en el catálogo: mejor eso que ocultarlo. */
export function etiquetaAccion(action: string): string {
  return ACCIONES[action]?.etiqueta ?? action;
}

/**
 * Categoría de una acción. Si no está catalogada se deduce del segundo tramo de
 * `integra.<familia>.<verbo>`, así una acción nueva del backend cae en su sitio
 * sin tocar este archivo.
 */
export function categoriaAccion(action: string): CategoriaAccion {
  const ficha = ACCIONES[action];
  if (ficha) return ficha.categoria;
  const familia = action.split(".")[1] ?? "";
  const porFamilia: Record<string, CategoriaAccion> = {
    door: "puertas",
    person: "personas",
    vehicle: "vehiculos",
    schedule: "horarios",
    visitor: "visitas",
    camera: "camaras",
    ptz: "camaras",
    privilege: "privilegios",
  };
  return porFamilia[familia] ?? "otro";
}

export function esAccionCritica(action: string): boolean {
  return ACCIONES[action]?.critica === true;
}

/**
 * Quién lo hizo.
 *
 * `userId` es opcional en `audit_logs`: si la mutación la disparó un proceso
 * sin sesión, la fila llega sin usuario. Decirlo así es información; poner «—»
 * hace pensar que se perdió el dato.
 */
export function describirActor(entrada: EntradaBitacora): string {
  const nombre = entrada.userName?.trim();
  const correo = entrada.userEmail?.trim();
  if (nombre && correo) return `${nombre} · ${correo}`;
  return nombre || correo || "Proceso automático (sin usuario)";
}

/** Texto que se compara al buscar: todo lo que la fila enseña. */
export function textoBuscable(entrada: EntradaBitacora): string {
  const partes = [
    entrada.action,
    etiquetaAccion(entrada.action),
    entrada.userName ?? "",
    entrada.userEmail ?? "",
    entrada.entityId != null ? String(entrada.entityId) : "",
  ];
  if (entrada.changes != null) {
    try {
      partes.push(JSON.stringify(entrada.changes));
    } catch {
      // Un `changes` con referencias cíclicas no debe tumbar la búsqueda.
    }
  }
  return partes.join(" ").toLowerCase();
}

export type Orden = "desc" | "asc";

export type FiltrosBitacora = {
  /** `datetime-local` (`YYYY-MM-DDTHH:mm`), hora local. Vacío = sin límite. */
  desde: string;
  hasta: string;
  /** Código exacto de acción, o "" para todas. */
  accion: string;
  categoria: string;
  /** Texto libre sobre nombre y correo del actor. */
  actor: string;
  /** Texto libre sobre toda la fila, `changes` incluido. */
  q: string;
  orden: Orden;
};

export const FILTROS_INICIALES: FiltrosBitacora = {
  desde: "",
  hasta: "",
  accion: "",
  categoria: "",
  actor: "",
  q: "",
  orden: "desc",
};

/** `NaN` si la cadena no es una fecha usable: quien llama decide qué hacer. */
function instante(valor: string | undefined | null): number {
  if (!valor) return Number.NaN;
  const t = new Date(valor).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
}

export function filtrarEntradas(
  items: EntradaBitacora[],
  filtros: FiltrosBitacora,
): EntradaBitacora[] {
  const desde = instante(filtros.desde);
  const hasta = instante(filtros.hasta);
  const actor = filtros.actor.trim().toLowerCase();
  const q = filtros.q.trim().toLowerCase();

  const filtradas = items.filter((e) => {
    const t = instante(e.createdAt);
    // Una fila con fecha ilegible no se esconde por un filtro de fechas: se
    // escondería justo la que más raro huele.
    if (Number.isFinite(t)) {
      if (Number.isFinite(desde) && t < desde) return false;
      if (Number.isFinite(hasta) && t > hasta) return false;
    }
    if (filtros.accion && e.action !== filtros.accion) return false;
    if (filtros.categoria && categoriaAccion(e.action) !== filtros.categoria) return false;
    if (actor) {
      const quien = `${e.userName ?? ""} ${e.userEmail ?? ""}`.toLowerCase();
      if (!quien.includes(actor)) return false;
    }
    if (q && !textoBuscable(e).includes(q)) return false;
    return true;
  });

  const signo = filtros.orden === "asc" ? 1 : -1;
  return filtradas.sort((a, b) => {
    const ta = instante(a.createdAt);
    const tb = instante(b.createdAt);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return (ta - tb) * signo;
    // Empate de milisegundo (o fecha ilegible): el id es monótono y desempata.
    return (a.id - b.id) * signo;
  });
}

export function hayFiltroActivo(filtros: FiltrosBitacora): boolean {
  return (
    filtros.desde !== "" ||
    filtros.hasta !== "" ||
    filtros.accion !== "" ||
    filtros.categoria !== "" ||
    filtros.actor.trim() !== "" ||
    filtros.q.trim() !== ""
  );
}

export type Pagina<T> = {
  visibles: T[];
  /** 1-based y siempre dentro de rango, aunque llegue basura por la URL. */
  pagina: number;
  paginas: number;
  /** 1-based e inclusivo, para el «N–M de T». 0 si no hay nada. */
  primero: number;
  ultimo: number;
  total: number;
};

export function paginar<T>(items: T[], pagina: number, tamano: number): Pagina<T> {
  const tam = Math.max(1, Math.floor(tamano) || 1);
  const total = items.length;
  const paginas = Math.max(1, Math.ceil(total / tam));
  const actual = Math.min(Math.max(Math.floor(pagina) || 1, 1), paginas);
  const inicio = (actual - 1) * tam;
  const visibles = items.slice(inicio, inicio + tam);
  return {
    visibles,
    pagina: actual,
    paginas,
    primero: total === 0 ? 0 : inicio + 1,
    ultimo: total === 0 ? 0 : inicio + visibles.length,
    total,
  };
}

/**
 * El aviso de que la ventana está topada.
 *
 * Regla 1 del encargo: nada de truncados mudos. Si el servidor devolvió
 * exactamente el tope, hay entradas más antiguas que esta pantalla no puede
 * ver, y hay que decirlo.
 */
export function avisoDeVentana(recibidas: number): string | null {
  if (recibidas < TOPE_SERVIDOR) return null;
  return `El servidor entrega como máximo ${TOPE_SERVIDOR} entradas y ya devolvió ${TOPE_SERVIDOR}: hay bitácora más antigua que esta pantalla no alcanza. El endpoint no admite filtro por fecha ni paginación, así que lo de abajo se filtra en el navegador sobre esas ${TOPE_SERVIDOR}.`;
}

/** Rangos rápidos. Devuelven valores de `datetime-local` en hora local. */
export type PresetRango = "24h" | "48h" | "7d" | "30d" | "todo";

export const PRESETS_RANGO: ReadonlyArray<{ clave: PresetRango; etiqueta: string }> = [
  { clave: "24h", etiqueta: "24 h" },
  { clave: "48h", etiqueta: "48 h" },
  { clave: "7d", etiqueta: "7 días" },
  { clave: "30d", etiqueta: "30 días" },
  { clave: "todo", etiqueta: "Todo" },
];

function aDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function rangoDePreset(
  preset: PresetRango,
  ahora: Date = new Date(),
): { desde: string; hasta: string } {
  if (preset === "todo") return { desde: "", hasta: "" };
  const horas = preset === "24h" ? 24 : preset === "48h" ? 48 : preset === "7d" ? 168 : 720;
  return {
    desde: aDatetimeLocal(new Date(ahora.getTime() - horas * 3_600_000)),
    // `hasta` se deja abierto a propósito: acotarlo a «ahora» escondería una
    // entrada escrita entre que se pulsa el botón y se pinta la tabla.
    hasta: "",
  };
}

/** Acciones realmente presentes en la ventana, para poblar el desplegable. */
export function accionesPresentes(
  items: EntradaBitacora[],
): Array<{ valor: string; etiqueta: string; cuantas: number }> {
  const cuenta = new Map<string, number>();
  for (const e of items) cuenta.set(e.action, (cuenta.get(e.action) ?? 0) + 1);
  return [...cuenta.entries()]
    .map(([valor, cuantas]) => ({ valor, etiqueta: etiquetaAccion(valor), cuantas }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
}

const ETIQUETA_CAMPO: Readonly<Record<string, string>> = {
  doorIndexCode: "Puerta",
  controlType: "Tipo de control",
  cmd: "Comando ISAPI",
  reason: "Motivo",
  email: "Correo del actor",
  provider: "Proveedor",
  personId: "Persona (ACS)",
  personIds: "Personas",
  privilegeGroupId: "Grupo de privilegios",
  cameraIndexCode: "Cámara",
  enabled: "Activado",
  preset: "Preset PTZ",
  plate: "Placa",
  plateNo: "Placa",
  vehicleId: "Vehículo",
  deviceSync: "Empujado al equipo",
  deviceIp: "IP del equipo",
  fingerPrintID: "Huella",
  templateKey: "Plantilla",
};

const ETIQUETA_CONTROL = new Map<string, string>(
  DOOR_CONTROL_OPTIONS.map((o) => [o.value, o.label]),
);

export type CampoDetalle = {
  clave: string;
  etiqueta: string;
  valor: string;
  /** Campos que cuentan la historia: qué puerta, con qué orden y por qué. */
  destacado: boolean;
};

export type DetalleCambios = {
  campos: CampoDetalle[];
  /** El objeto completo, indentado. Nunca recortado. */
  json: string | null;
  vacio: boolean;
};

const DESTACADOS = new Set(["doorIndexCode", "controlType", "reason", "personIds", "personId"]);

function valorLegible(clave: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (clave === "controlType") {
      const etiqueta = ETIQUETA_CONTROL.get(v);
      return etiqueta ? `${etiqueta} (${v})` : v;
    }
    return v === "" ? "(vacío)" : v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "(lista vacía)";
    const escalares = v.every(
      (x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean",
    );
    return escalares ? v.join(", ") : JSON.stringify(v);
  }
  return JSON.stringify(v);
}

/**
 * Desmonta `changes` en campos legibles.
 *
 * Lo que había antes era `JSON.stringify(changes).slice(0, 120)` metido en una
 * celda: un JSON cortado a la mitad, ilegible y encima mentiroso, porque el
 * corte se comía justo el final del objeto sin avisar.
 */
export function describirCambios(changes: unknown): DetalleCambios {
  if (changes === null || changes === undefined) {
    return { campos: [], json: null, vacio: true };
  }

  let json: string | null = null;
  try {
    json = JSON.stringify(changes, null, 2);
  } catch {
    json = null;
  }

  if (typeof changes !== "object") {
    return {
      campos: [{ clave: "valor", etiqueta: "Valor", valor: String(changes), destacado: false }],
      json,
      vacio: false,
    };
  }

  if (Array.isArray(changes)) {
    return {
      campos: changes.map((v, i) => ({
        clave: String(i),
        etiqueta: `#${i + 1}`,
        valor: valorLegible(String(i), v),
        destacado: false,
      })),
      json,
      vacio: changes.length === 0,
    };
  }

  const entradas = Object.entries(changes as Record<string, unknown>);
  return {
    campos: entradas.map(([clave, v]) => ({
      clave,
      etiqueta: ETIQUETA_CAMPO[clave] ?? clave,
      valor: valorLegible(clave, v),
      destacado: DESTACADOS.has(clave),
    })),
    json,
    // Un `{}` es lo que escribe `integra.privilege.apply`: hay entrada, no hay
    // campos. Es distinto de no tener `changes`.
    vacio: entradas.length === 0,
  };
}

/**
 * Resumen de una línea para la celda «Detalle».
 *
 * Lo que sustituye: `JSON.stringify(changes).slice(0, 120)`, o sea un JSON
 * cortado por la mitad. Aquí se muestran campos enteros —los que cuentan la
 * historia primero— y si quedan fuera se dice cuántos, en vez de cortar.
 */
export function resumenDeCambios(changes: unknown, cuantos = 2): string {
  const { campos, vacio } = describirCambios(changes);
  if (vacio && campos.length === 0) return "";
  const ordenados = [...campos].sort(
    (a, b) => Number(b.destacado) - Number(a.destacado),
  );
  const mostrados = ordenados.slice(0, Math.max(1, cuantos));
  const texto = mostrados.map((c) => `${c.etiqueta}: ${c.valor}`).join(" · ");
  const restantes = ordenados.length - mostrados.length;
  return restantes > 0 ? `${texto} · +${restantes} campo${restantes === 1 ? "" : "s"}` : texto;
}

/** Fecha absoluta en hora local. Una fecha ilegible se dice, no se disimula. */
export function formatearFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Fecha ilegible";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Antigüedad en cristiano, para no tener que restar fechas de cabeza al leer.
 * Cadena vacía si no aporta (fecha ilegible o de hace más de un mes).
 */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = ahora.getTime() - t;
  // Una entrada con fecha futura es justo la que interesa ver marcada.
  if (ms < -60_000) return "fecha futura";
  if (ms < 60_000) return "hace instantes";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d <= 30) return `hace ${d} día${d === 1 ? "" : "s"}`;
  return "";
}

function celdaCsv(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export const CABECERAS_CSV = [
  "id",
  "fecha_iso",
  "accion_codigo",
  "accion",
  "categoria",
  "critica",
  "usuario",
  "correo",
  "site_id",
  "detalle_json",
] as const;

/**
 * CSV de lo que hay en pantalla tras filtrar.
 *
 * Se genera en el navegador porque `GET /integra/audit` no tiene export y
 * `GET /audit/export.csv` (el genérico, `audit.controller.ts`) no sabe filtrar
 * por el criterio de INTEGRA: usa `entityType` exacto y se dejaría fuera todo
 * lo que solo casa por `source: 'integra'` o por el prefijo de la acción.
 */
export function aCsv(items: EntradaBitacora[]): string {
  const lineas = [CABECERAS_CSV.join(",")];
  for (const e of items) {
    let detalle = "";
    if (e.changes != null) {
      try {
        detalle = JSON.stringify(e.changes);
      } catch {
        detalle = "(no serializable)";
      }
    }
    lineas.push(
      [
        e.id,
        e.createdAt,
        e.action,
        etiquetaAccion(e.action),
        ETIQUETA_CATEGORIA[categoriaAccion(e.action)],
        esAccionCritica(e.action) ? "sí" : "no",
        e.userName ?? "",
        e.userEmail ?? "",
        e.entityId ?? "",
        detalle,
      ]
        .map(celdaCsv)
        .join(","),
    );
  }
  // BOM: sin él Excel en español abre el CSV en Latin-1 y parte los acentos.
  return `﻿${lineas.join("\r\n")}`;
}

export function nombreArchivoCsv(ahora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `bitacora-integra-${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}.csv`;
}
