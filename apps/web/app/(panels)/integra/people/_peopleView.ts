/**
 * Semántica de la consola de Personas — sin React, para poder probarla y
 * reutilizarla desde la tabla, las tarjetas y la ficha sin duplicar criterio.
 *
 * Aquí vive la respuesta a «¿esta persona pasa o no pasa?», que es la única
 * pregunta que le importa a quien opera un control de acceso. El terminal
 * responde con tres campos sueltos (`validEnable`, `validFrom`, `validTo`) que
 * por separado no dicen nada; el trabajo de este módulo es convertirlos en un
 * estado con nombre, color y explicación.
 */

/** Persona ACS tal y como la entrega `GET integra/people`. */
export type Person = {
  id: string;
  name: string;
  code?: string;
  orgId?: string;
  orgName?: string;
  userType?: string;
  gender?: string;
  validEnable?: boolean;
  validFrom?: string;
  validTo?: string;
  doorRight?: string;
  rightPlan?: unknown;
  numOfFace?: number;
  numOfFP?: number;
  numOfCard?: number;
  /** Números de tarjeta ya resueltos por el sync. Puede no venir. */
  cardNos?: string[];
  faceUrl?: string | null;
  hasFace?: boolean;
  hasLocalFace?: boolean;
  localFpIds?: number[];
  sourceIp?: string;
  sourceName?: string;
  doorNames?: string[];
};

export type Tone = "ok" | "warn" | "danger" | "neutral" | "accent";
/** Tonos que puede tomar una vigencia. Subconjunto de los de `IgBadge`. */
export type ValidityTone = "ok" | "warn" | "danger" | "neutral";

/* ── Vigencia ─────────────────────────────────────────────────────────── */

/**
 * Claves de estado. Son las mismas cuatro que ya usaba el filtro del listado:
 * añadir una quinta rompería las vistas guardadas, así que «indefinida» viaja
 * como matiz de `ok` en vez de como clave propia.
 */
export type ValidityKey = "ok" | "warn" | "expired" | "off" | "unknown";

export type ValidityInfo = {
  key: ValidityKey;
  /** Etiqueta corta para insignias y celdas de tabla. */
  label: string;
  /** Qué implica de verdad para el portador. Se enseña en la ficha. */
  meaning: string;
  tone: ValidityTone;
  /** Días hasta el fin de vigencia. Negativo si ya caducó. */
  daysLeft: number | null;
  /** Fin de vigencia «de fábrica» (2036+): no es una fecha real. */
  indefinite: boolean;
};

/** Umbral de aviso: por debajo de esto la vigencia se marca en ámbar. */
export const WARN_DAYS = 30;

function dias(n: number): string {
  const abs = Math.abs(n);
  return `${abs} ${abs === 1 ? "día" : "días"}`;
}

/**
 * Los terminales Hikvision escriben 2037-12-31 (o similar) cuando el alta es
 * «sin caducidad». Tratar eso como «vence en 4000 días» sería mentir en la
 * pantalla, así que se nombra por lo que es.
 */
export function isIndefiniteEnd(validTo?: string): boolean {
  if (!validTo) return false;
  return /^20(3[6-9]|[4-9]\d)-/.test(validTo);
}

export function describeValidity(p: Person, now: number = Date.now()): ValidityInfo {
  if (p.validEnable === false) {
    return {
      key: "off",
      label: "Suspendida",
      meaning:
        "El terminal la rechaza aunque tenga rostro, huella y horario. La vigencia está apagada a mano.",
      tone: "danger",
      daysLeft: null,
      indefinite: false,
    };
  }
  if (!p.validTo) {
    return {
      key: "unknown",
      label: "Sin vigencia",
      meaning:
        "El terminal no devolvió fecha de fin. Puede que la ficha se creara fuera de NEXARA; revísala antes de fiarte.",
      tone: "neutral",
      daysLeft: null,
      indefinite: false,
    };
  }
  const end = Date.parse(p.validTo);
  if (!Number.isFinite(end)) {
    return {
      key: "unknown",
      label: "Vigencia ilegible",
      meaning: `El terminal devolvió «${p.validTo}», que no es una fecha válida.`,
      tone: "neutral",
      daysLeft: null,
      indefinite: false,
    };
  }
  const daysLeft = Math.floor((end - now) / 86_400_000);
  if (daysLeft < 0) {
    return {
      key: "expired",
      label: "Caducada",
      meaning: `Venció hace ${dias(daysLeft)}. El terminal ya no la deja pasar.`,
      tone: "danger",
      daysLeft,
      indefinite: false,
    };
  }
  if (isIndefiniteEnd(p.validTo)) {
    return {
      key: "ok",
      label: "Indefinida",
      meaning:
        "Alta sin caducidad real: el terminal guarda 2037 como «para siempre». Pasa mientras no se suspenda.",
      tone: "ok",
      daysLeft,
      indefinite: true,
    };
  }
  if (daysLeft < WARN_DAYS) {
    return {
      key: "warn",
      label: "Vence pronto",
      meaning: `Le ${daysLeft === 1 ? "queda" : "quedan"} ${dias(daysLeft)}. Cuando llegue el día dejará de abrir sin avisar a nadie.`,
      tone: "warn",
      daysLeft,
      indefinite: false,
    };
  }
  return {
    key: "ok",
    label: "Vigente",
    meaning: `Pasa con normalidad. Le ${dias(daysLeft)} de vigencia.`,
    tone: "ok",
    daysLeft,
    indefinite: false,
  };
}

/** Opciones del filtro de vigencia, con el significado a mano. */
export const VALIDITY_FILTER_OPTIONS: Array<{ value: ValidityKey; label: string }> = [
  { value: "ok", label: "Vigentes" },
  { value: "warn", label: `Vencen en menos de ${WARN_DAYS} días` },
  { value: "expired", label: "Caducadas" },
  { value: "off", label: "Suspendidas" },
  { value: "unknown", label: "Sin vigencia" },
];

/* ── Credenciales ─────────────────────────────────────────────────────── */

export type CredentialKind = "face" | "fp" | "card";

export type CredentialInfo = {
  kind: CredentialKind;
  label: string;
  /** Cuántas tiene enroladas en los terminales. */
  count: number;
  on: boolean;
  /** Qué abre y con qué gesto. */
  meaning: string;
  /** Matiz de dónde vive el dato (terminal vs. NEXARA). */
  detail: string;
};

export function faceOn(p: Person): boolean {
  return (p.numOfFace ?? 0) > 0 || p.hasFace === true || p.hasLocalFace === true;
}

export function describeCredentials(p: Person): CredentialInfo[] {
  const face = faceOn(p);
  const faceCount = p.numOfFace ?? (face ? 1 : 0);
  const fpCount = p.numOfFP ?? 0;
  const cardCount = p.numOfCard ?? 0;
  const fpLocal = p.localFpIds?.length ?? 0;

  return [
    {
      kind: "face",
      label: "Rostro",
      count: faceCount,
      on: face,
      meaning: "Abre mirando al terminal. Es la credencial que NEXARA usa para poner cara al evento.",
      detail: p.hasLocalFace
        ? "JPEG guardado en NEXARA y modelo enrolado en el terminal."
        : face
          ? "Modelo en el terminal, sin JPEG en NEXARA: el listado y los eventos saldrán sin foto."
          : "Sin rostro enrolado: esta persona no puede abrir por reconocimiento.",
    },
    {
      kind: "fp",
      label: "Huella",
      count: fpCount,
      on: fpCount > 0 || fpLocal > 0,
      meaning: "Abre con el dedo en el sensor. Solo en terminales con lector (no todos lo tienen).",
      detail: fpLocal
        ? `${fpLocal} ${fpLocal === 1 ? "plantilla guardada" : "plantillas guardadas"} en NEXARA: se puede re-empujar a un terminal nuevo sin volver a capturar el dedo.`
        : fpCount > 0
          ? "Enrolada en el terminal, sin plantilla en NEXARA: si el equipo se sustituye hay que recapturarla."
          : "Sin huella enrolada.",
    },
    {
      kind: "card",
      label: "Tarjeta",
      count: cardCount,
      on: cardCount > 0,
      meaning: "Abre acercando la tarjeta al lector. Es la credencial que se puede prestar o perder.",
      detail: p.cardNos?.length
        ? `Nº ${p.cardNos.join(" · ")}`
        : cardCount > 0
          ? "El terminal cuenta la tarjeta pero el sync aún no ha leído su número."
          : "Sin tarjeta asignada.",
    },
  ];
}

/** Cuántos tipos de credencial tiene activos (0–3). Ordena «incompletos primero». */
export function credentialScore(p: Person): number {
  return describeCredentials(p).filter((c) => c.on).length;
}

/* ── Tipo de usuario ──────────────────────────────────────────────────── */

const USER_TYPE_LABELS: Record<string, string> = {
  normal: "Normal",
  visitor: "Visitante",
  blacklist: "Lista negra",
  patrol: "Ronda",
};

export function userTypeLabel(userType?: string): string {
  const raw = String(userType || "").trim();
  if (!raw) return "Sin tipo";
  return USER_TYPE_LABELS[raw.toLowerCase()] || raw;
}

/* ── Ordenación ───────────────────────────────────────────────────────── */

export type SortKey = "nombre" | "vigencia" | "credenciales";

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "nombre", label: "Nombre (A→Z)" },
  { value: "vigencia", label: "Vigencia (urgentes primero)" },
  { value: "credenciales", label: "Credenciales (incompletas primero)" },
];

/** Cuanto más bajo, más urgente. Suspendidas y caducadas arriba del todo. */
const VALIDITY_RANK: Record<ValidityKey, number> = {
  off: 0,
  expired: 1,
  warn: 2,
  unknown: 3,
  ok: 4,
};

function byName(a: Person, b: Person): number {
  return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}

/** Devuelve una copia ordenada; nunca muta la lista de origen. */
export function sortPeople(list: Person[], key: SortKey, now: number = Date.now()): Person[] {
  const copy = [...list];
  if (key === "nombre") return copy.sort(byName);

  if (key === "credenciales") {
    return copy.sort((a, b) => {
      const d = credentialScore(a) - credentialScore(b);
      return d !== 0 ? d : byName(a, b);
    });
  }

  return copy.sort((a, b) => {
    const va = describeValidity(a, now);
    const vb = describeValidity(b, now);
    const rank = VALIDITY_RANK[va.key] - VALIDITY_RANK[vb.key];
    if (rank !== 0) return rank;
    // Dentro del mismo estado, primero lo que se acaba antes.
    const da = va.daysLeft ?? Number.POSITIVE_INFINITY;
    const db = vb.daysLeft ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return byName(a, b);
  });
}

/* ── Errores ──────────────────────────────────────────────────────────── */

export type ErrorKind =
  | "permiso"
  | "sesion"
  | "red"
  | "servidor"
  | "conflicto"
  | "ausente"
  | "datos";

export type ErrorNoticeInfo = {
  kind: ErrorKind;
  /** Titular: qué ha pasado, en una línea que el operador entienda. */
  title: string;
  /** Qué puede hacer al respecto. */
  hint: string;
  tone: "warn" | "danger";
  /** Si reintentar tiene sentido; si no, el botón sobra. */
  retriable: boolean;
};

/**
 * Traduce el mensaje crudo de la API a algo accionable. Se clasifica al pintar
 * y no al capturar: así los ~30 `setError` del módulo siguen guardando el texto
 * del servidor (que hace falta para depurar) y aun así la pantalla distingue
 * «no tienes permiso» de «el servidor no responde».
 */
export function describeError(message: string): ErrorNoticeInfo {
  const m = message.toLowerCase();

  if (/\b401\b|no autenticad|unauthorized|sesión expirada|sesion expirada|token/.test(m)) {
    return {
      kind: "sesion",
      title: "Tu sesión ya no vale",
      hint: "Vuelve a entrar en NEXARA y repite la operación. Nada se ha cambiado en los terminales.",
      tone: "warn",
      retriable: false,
    };
  }
  if (/\b403\b|sin permiso|forbidden|no autorizad|permission denied/.test(m)) {
    return {
      kind: "permiso",
      title: "No tienes permiso para esto",
      hint: "Tu rol no incluye esta acción sobre el control de acceso. Pídeselo a un administrador del sitio.",
      tone: "warn",
      retriable: false,
    };
  }
  if (
    /failed to fetch|networkerror|network error|load failed|err_connection|econnrefused|econnreset|ehostunreach|etimedout|timeout|tiempo de espera|no responde/.test(
      m,
    )
  ) {
    return {
      kind: "red",
      title: "El servidor no responde",
      hint: "Puede ser la red del sitio o el propio terminal. Vuelve a intentarlo; si insiste, comprueba la conexión del ACS.",
      tone: "danger",
      retriable: true,
    };
  }
  if (/\b50[0-4]\b|internal server error|bad gateway|service unavailable/.test(m)) {
    return {
      kind: "servidor",
      title: "El servidor falló al procesarlo",
      hint: "No es culpa de lo que escribiste. Reintenta; si vuelve a pasar, queda registrado para soporte.",
      tone: "danger",
      retriable: true,
    };
  }
  if (/\b409\b|ya existe|duplicad|conflict/.test(m)) {
    return {
      kind: "conflicto",
      title: "Ese dato ya está ocupado",
      hint: "Normalmente es un código de empleado repetido. Cambia el código o abre la ficha que ya lo usa.",
      tone: "warn",
      retriable: false,
    };
  }
  if (/\b404\b|no encontrad|not found|no existe/.test(m)) {
    return {
      kind: "ausente",
      title: "Eso ya no está donde se buscaba",
      hint: "La persona o el terminal pudo borrarse desde otro sitio. Actualiza el listado.",
      tone: "warn",
      retriable: true,
    };
  }
  return {
    kind: "datos",
    title: "No se pudo completar",
    hint: "Revisa el detalle: suele ser un campo que el terminal no acepta.",
    tone: "warn",
    retriable: true,
  };
}

/* ── Detalle técnico legible ──────────────────────────────────────────── */

export type DetailFact = { path: string; label: string; value: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Nombres humanos para las claves que devuelven ISAPI y Artemis. */
const DETAIL_LABELS: Record<string, string> = {
  id: "ID de persona",
  personId: "ID de persona",
  employeeNo: "Nº de empleado",
  name: "Nombre",
  personName: "Nombre",
  code: "Código",
  personCode: "Código",
  userType: "Tipo de usuario",
  gender: "Género",
  orgId: "Organización",
  orgName: "Departamento",
  orgIndexCode: "Organización",
  valid: "Vigencia",
  Valid: "Vigencia",
  validMode: "Modo de vigencia",
  validEnable: "Vigencia activa",
  validFrom: "Vigencia desde",
  validTo: "Vigencia hasta",
  enable: "Activa",
  beginTime: "Vigencia desde",
  endTime: "Vigencia hasta",
  timeType: "Huso de la vigencia",
  doorRight: "Puertas (derecho)",
  doorNo: "Nº de puerta",
  doorName: "Puerta",
  doorNames: "Puertas",
  doorIndexCode: "Código de puerta",
  rightPlan: "Plan por puerta",
  RightPlan: "Plan por puerta",
  planTemplateNo: "Nº de plan horario",
  templateName: "Plan horario",
  numOfFace: "Rostros enrolados",
  numOfFP: "Huellas enroladas",
  numOfCard: "Tarjetas",
  cardNos: "Nº de tarjeta",
  faceUrl: "Rostro en el terminal",
  faceURL: "Rostro en el terminal",
  hasFace: "Rostro enrolado",
  hasLocalFace: "JPEG en NEXARA",
  localFpIds: "Huellas guardadas en NEXARA",
  sourceIp: "IP del terminal",
  sourceName: "Terminal",
  deviceIp: "IP del terminal",
  deviceName: "Terminal",
  present: "Presente en el terminal",
  source: "Origen del dato",
  note: "Nota",
  error: "Error",
  total: "Total",
  modelNote: "Modelo de horarios",
};

function humanize(segment: string): string {
  const spaced = segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function labelForPath(path: string): string {
  const last = path.split(".").pop() || path;
  return DETAIL_LABELS[last] || DETAIL_LABELS[path] || humanize(last);
}

function scalarText(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  const s = String(v).trim();
  return s || "—";
}

function arrayText(v: unknown[]): string {
  if (v.length === 0) return "—";
  const scalars = v.every((x) => x == null || typeof x !== "object");
  if (!scalars) return `${v.length} ${v.length === 1 ? "elemento" : "elementos"}`;
  const shown = v.slice(0, 8).map(scalarText).join(" · ");
  return v.length > 8 ? `${shown} · +${v.length - 8} más` : shown;
}

/**
 * Aplana un payload desconocido a pares clave-valor legibles. Sustituye al
 * `JSON.stringify` que se enseñaba como contenido principal de la ficha: el
 * crudo sigue disponible, pero plegado y en su sitio (depuración).
 */
export function flattenDetail(input: unknown, prefix = "", depth = 0): DetailFact[] {
  if (depth > 3) return [];
  if (Array.isArray(input)) {
    return prefix ? [{ path: prefix, label: labelForPath(prefix), value: arrayText(input) }] : [];
  }
  if (!isPlainObject(input)) {
    return prefix ? [{ path: prefix, label: labelForPath(prefix), value: scalarText(input) }] : [];
  }
  const out: DetailFact[] = [];
  for (const [k, v] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) {
      const nested = flattenDetail(v, path, depth + 1);
      if (nested.length) out.push(...nested);
      continue;
    }
    if (Array.isArray(v)) {
      out.push({ path, label: labelForPath(path), value: arrayText(v) });
      continue;
    }
    out.push({ path, label: labelForPath(path), value: scalarText(v) });
  }
  return out;
}

/* ── Utilidades de fecha compartidas ──────────────────────────────────── */

export function formatWhen(iso?: string): string {
  if (!iso) return "—";
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return iso;
  return new Date(d).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function genderLabel(g?: string): string | null {
  const v = String(g || "").toLowerCase();
  if (v === "male" || v === "1" || v === "m") return "Hombre";
  if (v === "female" || v === "2" || v === "f") return "Mujer";
  if (!g) return null;
  return String(g);
}
