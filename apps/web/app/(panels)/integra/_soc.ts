/**
 * Lógica pura de la consola SOC: severidad, estado, orden, agrupación de
 * duplicados y correlación de eventos por puerta.
 *
 * Todo lo de aquí está calcado del backend real, no inventado:
 *   · severidad la produce `humanAlarmSeverity()` (Artemis) → alta | media | baja
 *     y `integra-acs-alarms.service.ts` → alta (DENIED) | media (AFTER_HOURS).
 *     NO existe «crítica» ni «informativa»: no se pintan.
 *   · estado lo produce el modelo `IntegraSocAlarm.status` → OPEN | ACK |
 *     CLEARED | TICKETED. `openCount` del backend suma OPEN + TICKETED.
 *   · `occurrenceCount` ya lo agrupa el backend por `alarmFingerprint()`
 *     (kind + persona + puerta + IP) dentro de `policy.windowMinutes`.
 */

import type { PushEvent } from "./_DetectionOverlay";

/* ── Alarma ─────────────────────────────────────────────────────────────── */

/**
 * La cola mezcla dos orígenes (ver `integra.controller.ts:alarmQueue`):
 *   · cola SOC push  → `integra-acs-alarms.service.ts` · `SocQueueItem`
 *   · Artemis        → `integra-artemis.service.ts:alarmQueue`
 * Solo `id`, `status`, `title`, `severity` y `timestamp` están en los dos.
 * El resto es opcional a propósito: pintar un campo que el otro origen no trae
 * es cómo se acaba enseñando «—» donde el operador espera un dato.
 */
export type AlarmItem = {
  id: string;
  status: string;
  title: string;
  severity: string;
  timestamp?: string | null;
  srcName?: string | null;
  cameraIndexCode?: string | null;
  doorIndexCode?: string | null;
  eventType?: string | null;
  note?: string | null;
  ackedAt?: string | null;
  clearedAt?: string | null;
  /* Solo cola push (SocQueueItem) */
  source?: string | null;
  kind?: string | null;
  personId?: string | null;
  personName?: string | null;
  photoPath?: string | null;
  doorNo?: number | null;
  doorName?: string | null;
  deviceIp?: string | null;
  deviceName?: string | null;
  occurrenceCount?: number | null;
  ticketRequestId?: number | null;
  pushEventId?: number | null;
  /* Solo Artemis */
  raw?: unknown;
};

export type AlarmQueueResponse = {
  items?: AlarmItem[];
  openCount?: number;
  source?: string | null;
  siteId?: number | null;
};

/* ── Tipo de alarma ─────────────────────────────────────────────────────── */

/**
 * Hoy el backend solo emite `DENIED` y `AFTER_HOURS` (`SocAlarmKind` en
 * `integra-acs-alarms.policy.ts:9`). Hay otro agente añadiendo ahora mismo
 * puerta forzada, mantenida abierta, antipassback, credencial caducada, lista
 * negra y sabotaje de cámara.
 *
 * Por eso esto NO es un `Record<SocAlarmKind, string>`: en cuanto el backend
 * emita un `kind` que este bundle no conoce —y va a pasar, porque el API se
 * despliega antes que el front— la tabla tiene que seguir legible. Los que ya
 * están anunciados se traducen bien desde hoy; cualquier otro cae en
 * `humanizeKind()` y sale como texto, nunca como enum crudo.
 */
export const ALARM_KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({
  DENIED: "Acceso denegado",
  AFTER_HOURS: "Entrada fuera de horario",
  DOOR_FORCED: "Puerta forzada",
  DOOR_HELD_OPEN: "Puerta mantenida abierta",
  ANTIPASSBACK: "Antipassback",
  CREDENTIAL_EXPIRED: "Credencial caducada",
  BLOCKLIST: "Persona en lista negra",
  // El `minor 76`: el equipo vio una cara y no la reconoció, en ráfaga de
  // reintentos. Es salud del lector, no un intento de intrusión.
  AUTH_FAILURE_BURST: "Ráfaga de fallos de reconocimiento",
  CAMERA_TAMPER: "Sabotaje de cámara",
});

/** `DOOR_HELD_OPEN` → «Door held open». Feo, pero legible; el enum crudo no lo es. */
function humanizeKind(raw: string): string {
  const words = raw
    .trim()
    .replace(/[_.-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  const joined = words.join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** ¿Este bundle sabe qué es este `kind`? Sirve para avisar en el detalle. */
export function isKnownAlarmKind(kind: string | null | undefined): boolean {
  const k = String(kind ?? "").trim().toUpperCase();
  return k !== "" && k in ALARM_KIND_LABEL;
}

/**
 * Etiqueta legible de un tipo de alarma. Nunca devuelve el enum crudo y nunca
 * revienta: sin `kind`, cae al `eventType` (`acs.denied` → «Acs denied»), y sin
 * ninguno de los dos, cadena vacía para que quien llame decida qué pintar.
 */
export function alarmKindLabel(
  kind: string | null | undefined,
  eventType?: string | null,
): string {
  const k = String(kind ?? "").trim();
  if (k) {
    const known = ALARM_KIND_LABEL[k.toUpperCase()];
    if (known) return known;
    const human = humanizeKind(k);
    if (human) return human;
  }
  const et = String(eventType ?? "").trim();
  if (et) {
    // `acs.after_hours` es el eventType que fabrica el backend a partir del kind.
    const tail = et.includes(".") ? et.slice(et.lastIndexOf(".") + 1) : et;
    const known = ALARM_KIND_LABEL[tail.toUpperCase()];
    if (known) return known;
    return humanizeKind(tail);
  }
  return "";
}

/* ── Severidad ──────────────────────────────────────────────────────────── */

export type SocSeverity = "alta" | "media" | "baja" | "desconocida";

export const SOC_SEVERITIES: readonly SocSeverity[] = [
  "alta",
  "media",
  "baja",
  "desconocida",
] as const;

export const SEVERITY_LABEL: Record<SocSeverity, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  desconocida: "Sin clasificar",
};

/** Peso para ordenar y para decidir qué merece sonar. Alta es lo máximo que da el backend. */
export const SEVERITY_RANK: Record<SocSeverity, number> = {
  alta: 3,
  media: 2,
  baja: 1,
  desconocida: 0,
};

export function normalizeSeverity(raw: string | null | undefined): SocSeverity {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "alta" || s === "high") return "alta";
  if (s === "media" || s === "medium") return "media";
  if (s === "baja" || s === "low") return "baja";
  return "desconocida";
}

/* ── Estado del flujo de atención ───────────────────────────────────────── */

export type SocStatus = "OPEN" | "ACK" | "TICKETED" | "CLEARED" | "OTRO";

export const STATUS_LABEL: Record<SocStatus, string> = {
  OPEN: "Nueva",
  ACK: "Atendida",
  TICKETED: "Escalada a ticket",
  CLEARED: "Cerrada",
  OTRO: "Sin estado",
};

/** Orden operativo: lo que reclama atención primero. */
export const STATUS_RANK: Record<SocStatus, number> = {
  OPEN: 4,
  TICKETED: 3,
  ACK: 2,
  CLEARED: 1,
  OTRO: 0,
};

export function normalizeStatus(raw: string | null | undefined): SocStatus {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "OPEN" || s === "ACK" || s === "TICKETED" || s === "CLEARED") return s;
  return "OTRO";
}

/** Pendiente = lo que el backend cuenta en `openCount` (OPEN + TICKETED). */
export function isPending(status: SocStatus): boolean {
  return status === "OPEN" || status === "TICKETED";
}

export type StatusFilter = "PENDIENTES" | "OPEN" | "ACK" | "TICKETED" | "CLEARED" | "TODAS";

export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "PENDIENTES", label: "Pendientes (nuevas + escaladas)" },
  { value: "OPEN", label: "Nuevas" },
  { value: "TICKETED", label: "Escaladas a ticket" },
  { value: "ACK", label: "Atendidas" },
  { value: "CLEARED", label: "Cerradas" },
  { value: "TODAS", label: "Todas" },
];

export function matchesStatusFilter(status: SocStatus, filter: StatusFilter): boolean {
  if (filter === "TODAS") return true;
  if (filter === "PENDIENTES") return isPending(status);
  return status === filter;
}

/* ── Orden ──────────────────────────────────────────────────────────────── */

export type AlarmSortKey = "sev" | "title" | "src" | "dups" | "time" | "status";
export type SortDir = "asc" | "desc";

export function isAlarmSortKey(v: string): v is AlarmSortKey {
  return v === "sev" || v === "title" || v === "src" || v === "dups" || v === "time" || v === "status";
}

export function timeOf(item: { timestamp?: string | null }): number {
  const t = Date.parse(String(item.timestamp ?? ""));
  return Number.isFinite(t) ? t : 0;
}

export function sourceLabel(item: AlarmItem): string {
  return (
    item.doorName?.trim() ||
    item.srcName?.trim() ||
    item.deviceName?.trim() ||
    (item.doorNo != null ? `Puerta ${item.doorNo}` : "") ||
    item.deviceIp?.trim() ||
    item.doorIndexCode?.trim() ||
    ""
  );
}

/** Repeticiones que el backend ya agrupó por huella, más las que agrupemos aquí. */
export function occurrencesOf(item: AlarmItem): number {
  const n = Number(item.occurrenceCount);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

export function sortAlarms<T extends AlarmItem>(
  rows: readonly T[],
  key: AlarmSortKey,
  dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const out = [...rows];
  out.sort((a, b) => {
    let d = 0;
    switch (key) {
      case "sev":
        d = SEVERITY_RANK[normalizeSeverity(a.severity)] - SEVERITY_RANK[normalizeSeverity(b.severity)];
        break;
      case "title":
        d = cmpText(a.title || "", b.title || "");
        break;
      case "src":
        d = cmpText(sourceLabel(a), sourceLabel(b));
        break;
      case "dups":
        d = occurrencesOf(a) - occurrencesOf(b);
        break;
      case "status":
        d = STATUS_RANK[normalizeStatus(a.status)] - STATUS_RANK[normalizeStatus(b.status)];
        break;
      case "time":
      default:
        d = timeOf(a) - timeOf(b);
        break;
    }
    // Empate: siempre la más reciente arriba. Una cola que baraja al reordenar
    // es una cola en la que el operador pierde el sitio.
    if (d === 0) d = timeOf(a) - timeOf(b);
    if (d === 0) d = cmpText(a.id, b.id);
    return d * sign;
  });
  return out;
}

/* ── Agrupación de duplicados en la cola ────────────────────────────────── */

export type AlarmGroup = AlarmItem & {
  /** Repeticiones totales: las del backend + las de las filas fusionadas aquí. */
  totalOccurrences: number;
  /** Alarmas fusionadas (incluye la representante). */
  members: AlarmItem[];
  /** Instante de la más antigua del grupo. */
  firstSeen: number;
};

/** Huella cliente: réplica de `alarmFingerprint()` con lo que llega al front. */
function clientFingerprint(item: AlarmItem): string {
  const kind = String(item.kind || item.eventType || item.title || "?").toLowerCase();
  const person = String(item.personId || item.personName || "anon").toLowerCase();
  const door = String(item.doorNo ?? item.doorIndexCode ?? sourceLabel(item) ?? "x").toLowerCase();
  return `${kind}|${person}|${door}`;
}

/**
 * Veinte avisos de la misma puerta en un minuto son una fila con contador.
 * Solo fusiona alarmas con el MISMO estado: una atendida y una nueva no son la
 * misma cosa aunque compartan huella, y esconder la nueva sería mentir.
 */
export function groupDuplicateAlarms(
  rows: readonly AlarmItem[],
  windowMs: number,
): AlarmGroup[] {
  const byKey = new Map<string, AlarmGroup[]>();
  const order: AlarmGroup[] = [];
  // Se recorre de más reciente a más antigua para que la representante sea la última.
  const sorted = [...rows].sort((a, b) => timeOf(b) - timeOf(a));

  for (const item of sorted) {
    const key = `${normalizeStatus(item.status)}|${clientFingerprint(item)}`;
    const at = timeOf(item);
    const buckets = byKey.get(key);
    const hit = buckets?.find((g) => Math.abs(g.firstSeen - at) <= windowMs || Math.abs(timeOf(g) - at) <= windowMs);
    if (hit) {
      hit.members.push(item);
      hit.totalOccurrences += occurrencesOf(item);
      hit.firstSeen = Math.min(hit.firstSeen, at);
      // La nota y la foto pueden venir en cualquiera de las repetidas.
      if (!hit.photoPath && item.photoPath) hit.photoPath = item.photoPath;
      if (!hit.note && item.note) hit.note = item.note;
      continue;
    }
    const group: AlarmGroup = {
      ...item,
      totalOccurrences: occurrencesOf(item),
      members: [item],
      firstSeen: at,
    };
    if (buckets) buckets.push(group);
    else byKey.set(key, [group]);
    order.push(group);
  }
  return order;
}

/** Sin agrupar: la misma forma de dato para que la tabla no tenga dos caminos. */
export function asSingleGroups(rows: readonly AlarmItem[]): AlarmGroup[] {
  return rows.map((item) => ({
    ...item,
    totalOccurrences: occurrencesOf(item),
    members: [item],
    firstSeen: timeOf(item),
  }));
}

/* ── Registros crudos (histórico Artemis) → pares clave-valor ───────────── */

/** Etiquetas de los campos que devuelve `eventRecordsPage()`. */
const RAW_KEY_LABELS: Record<string, string> = {
  eventId: "ID de evento",
  eventType: "Tipo (código)",
  eventTypeName: "Tipo",
  eventLvl: "Nivel",
  happenTime: "Ocurrió",
  startTime: "Inicio",
  endTime: "Fin",
  eventTime: "Hora",
  srcIndex: "Origen (código)",
  srcName: "Origen",
  srcType: "Tipo de origen",
  regionName: "Zona",
  regionIndexCode: "Zona (código)",
  doorName: "Puerta",
  doorIndexCode: "Puerta (código)",
  cameraIndexCode: "Cámara (código)",
  cameraName: "Cámara",
  deviceName: "Equipo",
  deviceIndexCode: "Equipo (código)",
  personName: "Persona",
  personId: "ID persona",
  cardNo: "Tarjeta",
  picUri: "Captura",
  status: "Estado",
  description: "Descripción",
  siteName: "Sitio",
  siteIndexCode: "Sitio (código)",
};

export function labelForRawKey(key: string): string {
  const known = RAW_KEY_LABELS[key];
  if (known) return known;
  // camelCase → «Camel case», que es más legible que `svcIndexCode` a pelo.
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type KeyValue = { key: string; label: string; value: string; empty: boolean };

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return isPlainRecord(v) ? v : null;
}

function scalarToText(v: unknown): string | null {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/**
 * Aplana un registro crudo a pares legibles. Un objeto anidado baja un nivel
 * («persona · nombre»); más profundo que eso se deja al bloque crudo plegable,
 * que para eso está.
 */
export function toKeyValues(raw: unknown, limit = 24): KeyValue[] {
  const rec = asRecord(raw);
  if (!rec) return [];
  const out: KeyValue[] = [];
  for (const [k, v] of Object.entries(rec)) {
    if (out.length >= limit) break;
    const flat = scalarToText(v);
    if (flat !== null) {
      out.push({ key: k, label: labelForRawKey(k), value: flat, empty: flat === "" });
      continue;
    }
    if (Array.isArray(v)) {
      const items = v.map(scalarToText).filter((s): s is string => s !== null && s !== "");
      if (items.length === v.length && items.length > 0) {
        out.push({ key: k, label: labelForRawKey(k), value: items.join(" · "), empty: false });
      } else {
        out.push({
          key: k,
          label: labelForRawKey(k),
          value: `${v.length} elemento${v.length === 1 ? "" : "s"} (ver crudo)`,
          empty: v.length === 0,
        });
      }
      continue;
    }
    const nested = asRecord(v);
    if (nested) {
      for (const [nk, nv] of Object.entries(nested)) {
        if (out.length >= limit) break;
        const nflat = scalarToText(nv);
        if (nflat === null) continue;
        out.push({
          key: `${k}.${nk}`,
          label: `${labelForRawKey(k)} · ${labelForRawKey(nk)}`,
          value: nflat,
          empty: nflat === "",
        });
      }
    }
  }
  return out;
}

/** Título legible de un registro histórico, con la misma prioridad que el backend. */
export function rawRecordTitle(raw: unknown): string {
  const rec = asRecord(raw);
  if (!rec) return "Registro";
  for (const k of ["eventTypeName", "srcName", "regionName", "doorName", "eventType"]) {
    const s = scalarToText(rec[k]);
    if (s) return s;
  }
  return "Registro";
}

export function rawRecordTime(raw: unknown): string {
  const rec = asRecord(raw);
  if (!rec) return "";
  for (const k of ["startTime", "happenTime", "eventTime", "time"]) {
    const s = scalarToText(rec[k]);
    if (s) return s;
  }
  return "";
}

/* ── Correlación de eventos por puerta y ventana ────────────────────────── */

export type EventOutcome = "granted" | "denied" | "other";

export function outcomeOf(ev: PushEvent): EventOutcome {
  if (ev.outcome === "granted") return "granted";
  if (ev.outcome === "denied") return "denied";
  const label = ev.label || "";
  if (/denegad|rechaz/i.test(label)) return "denied";
  if (/concedid|autorizad/i.test(label)) return "granted";
  return "other";
}

export function doorKeyOf(ev: PushEvent): string {
  const ip = (ev.deviceIp || "").trim();
  const door = ev.doorNo != null ? String(ev.doorNo) : "";
  return `${ip || ev.deviceName || "sin-puerta"}#${door}`;
}

export function doorLabelOf(ev: PushEvent): string {
  const name = (ev.deviceName || "").trim() || (ev.deviceIp || "").trim() || "Puerta";
  return ev.doorNo != null ? `${name} · puerta ${ev.doorNo}` : name;
}

export type EventSequence = {
  key: string;
  doorLabel: string;
  deviceIp: string | null;
  events: PushEvent[];
  from: number;
  to: number;
  denied: number;
  granted: number;
  people: string[];
  /** Sospechosa: hay denegados y además concedidos, o denegados repetidos. */
  tone: "danger" | "warn" | "ok" | "neutral";
};

/** Ventana por defecto: un minuto. Es la unidad con la que habla un operador. */
export const SEQUENCE_WINDOW_MS = 60_000;

/**
 * Un acceso denegado, un reintento y una entrada concedida en la misma puerta y
 * el mismo minuto son la MISMA historia. Se agrupan por puerta y por hueco
 * temporal: mientras los eventos sigan llegando a menos de `windowMs` uno del
 * otro, la secuencia continúa; el primer silencio la cierra.
 */
export function correlateEvents(
  events: readonly PushEvent[],
  windowMs: number = SEQUENCE_WINDOW_MS,
): EventSequence[] {
  const byDoor = new Map<string, PushEvent[]>();
  for (const ev of events) {
    const k = doorKeyOf(ev);
    const list = byDoor.get(k);
    if (list) list.push(ev);
    else byDoor.set(k, [ev]);
  }

  const sequences: EventSequence[] = [];
  for (const [key, list] of byDoor) {
    // Ascendente para partir por huecos; se invierte al pintar.
    const asc = [...list].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    let bucket: PushEvent[] = [];
    let lastAt = 0;

    const flush = () => {
      if (!bucket.length) return;
      sequences.push(buildSequence(key, bucket));
      bucket = [];
    };

    for (const ev of asc) {
      const at = Date.parse(ev.occurredAt);
      if (!Number.isFinite(at)) continue;
      if (bucket.length && at - lastAt > windowMs) flush();
      bucket.push(ev);
      lastAt = at;
    }
    flush();
  }

  return sequences.sort((a, b) => b.to - a.to);
}

function buildSequence(key: string, bucket: PushEvent[]): EventSequence {
  const asc = [...bucket].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const first = asc[0];
  const last = asc[asc.length - 1];
  let denied = 0;
  let granted = 0;
  const people = new Set<string>();
  for (const ev of asc) {
    const o = outcomeOf(ev);
    if (o === "denied") denied += 1;
    else if (o === "granted") granted += 1;
    const who = ev.personName?.trim();
    if (who) people.add(who);
  }
  const tone: EventSequence["tone"] =
    denied > 0 && granted > 0 ? "danger" : denied > 1 ? "danger" : denied === 1 ? "warn" : granted > 0 ? "ok" : "neutral";

  return {
    key,
    doorLabel: doorLabelOf(last),
    deviceIp: last.deviceIp || null,
    events: [...asc].reverse(),
    from: Date.parse(first.occurredAt),
    to: Date.parse(last.occurredAt),
    denied,
    granted,
    people: [...people],
    tone,
  };
}

/** Una frase que resume la secuencia. Solo describe lo que hay: no deduce intención. */
export function sequenceStory(seq: EventSequence): string {
  const total = seq.events.length;
  const quien =
    seq.people.length === 0
      ? "sin identidad ACS"
      : seq.people.length === 1
        ? seq.people[0]
        : `${seq.people.length} personas`;
  if (seq.denied > 0 && seq.granted > 0) {
    return `${seq.denied} denegado${seq.denied === 1 ? "" : "s"} y luego ${seq.granted} concedido${seq.granted === 1 ? "" : "s"} · ${quien}`;
  }
  if (seq.denied > 1) return `${seq.denied} intentos denegados seguidos · ${quien}`;
  if (seq.denied === 1) return `Un acceso denegado · ${quien}`;
  if (seq.granted > 0) return `${seq.granted} paso${seq.granted === 1 ? "" : "s"} concedido${seq.granted === 1 ? "" : "s"} · ${quien}`;
  return `${total} evento${total === 1 ? "" : "s"} de equipo · ${quien}`;
}

/* ── Formato ────────────────────────────────────────────────────────────── */

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleString("es-MX", { hour12: false });
}

export function fmtTime(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "—";
  return new Date(at).toLocaleTimeString("es-MX", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function relAge(iso: string | number): string {
  const at = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return fmtDateTime(new Date(at).toISOString());
}
