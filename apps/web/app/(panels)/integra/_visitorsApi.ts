/**
 * Cliente Visitas — citas Artemis (única) + recurrentes con acceso ACS limitado.
 * Consume `integra/visitors/recurring*` del sibling; si aún no aterriza, lista
 * vacía + nota (sin inventar ISAPI).
 */

import { integraApi } from "./_lib";
import {
  WEEK_DAYS,
  type ScheduleDoor,
  type WeekDay,
  fetchSchedulesCatalog,
} from "./_schedulesApi";

export { WEEK_DAYS };
export type { WeekDay, ScheduleDoor };

export type RecurringVisitorStatus =
  | "synced"
  | "pending"
  | "expired"
  | "cancelled"
  | string;

export type RecurringVisitor = {
  id: string;
  visitorName: string;
  phone?: string | null;
  hostEmployeeId?: string | null;
  hostEmployeeName?: string | null;
  doorIds: string[];
  doorNames?: string[];
  timeFrom: string;
  timeTo: string;
  weekdays: WeekDay[];
  validFrom: string;
  validTo: string;
  status: RecurringVisitorStatus;
  employeeNo?: string | null;
  personId?: string | null;
  hasFace?: boolean;
  note?: string;
  createdAt?: string;
};

export type CreateRecurringVisitorInput = {
  visitorName: string;
  phone?: string;
  hostEmployeeId?: string;
  hostEmployeeName?: string;
  doorIds: string[];
  timeFrom: string;
  timeTo: string;
  weekdays: WeekDay[];
  validFrom: string;
  validTo: string;
  faceBase64?: string;
};

export type HostEmployee = {
  id: string;
  name: string;
  code?: string;
  source: "acs" | "erp";
};

export type RecurringListResult = {
  items: RecurringVisitor[];
  source: "live" | "empty";
  note?: string;
  apiReady: boolean;
};

export type CancelResult = {
  success: boolean;
  note?: string;
};

function isNotReady(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return /404|501|503|Cannot GET|Cannot POST|Cannot PUT|Not Found|no implement|aún no|no disponible/i.test(
    msg,
  );
}

function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysLocal(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function defaultRecurringDraft(): {
  validFrom: string;
  validTo: string;
  timeFrom: string;
  timeTo: string;
  weekdays: WeekDay[];
} {
  const from = todayLocalDate();
  return {
    validFrom: from,
    validTo: addDaysLocal(from, 90),
    timeFrom: "09:00",
    timeTo: "18:00",
    weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  };
}

const WEEK_KEYS = new Set(WEEK_DAYS.map((d) => d.key));

function normalizeWeekday(raw: unknown): WeekDay | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (WEEK_KEYS.has(t as WeekDay)) return t as WeekDay;
  const map: Record<string, WeekDay> = {
    lun: "Monday",
    lunes: "Monday",
    mon: "Monday",
    1: "Monday",
    mar: "Tuesday",
    martes: "Tuesday",
    tue: "Tuesday",
    2: "Tuesday",
    mie: "Wednesday",
    mié: "Wednesday",
    miercoles: "Wednesday",
    miércoles: "Wednesday",
    wed: "Wednesday",
    3: "Wednesday",
    jue: "Thursday",
    jueves: "Thursday",
    thu: "Thursday",
    4: "Thursday",
    vie: "Friday",
    viernes: "Friday",
    fri: "Friday",
    5: "Friday",
    sab: "Saturday",
    sáb: "Saturday",
    sabado: "Saturday",
    sábado: "Saturday",
    sat: "Saturday",
    6: "Saturday",
    dom: "Sunday",
    domingo: "Sunday",
    sun: "Sunday",
    0: "Sunday",
    7: "Sunday",
  };
  return map[t.toLowerCase()] || null;
}

function normalizeStatus(raw: unknown, validTo?: string): RecurringVisitorStatus {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  // Prisma IntegraRecurringVisitor: ACTIVE | PENDING | SYNCED | EXPIRED | CANCELLED | ERROR
  if (
    /cancel|revok|disable|off/.test(s) ||
    s === "cancelled" ||
    s === "canceled"
  ) {
    return "cancelled";
  }
  if (/expir|vencid|ended|done/.test(s) || s === "expired") return "expired";
  if (
    s === "synced" ||
    s === "active" ||
    /enrol|ok|live|terminal|pushed|on_terminals/.test(s)
  ) {
    return "synced";
  }
  if (/pend|draft|queue|syncing|creatin|error/.test(s) || s === "pending" || !s) {
    if (validTo) {
      const end = Date.parse(`${validTo.slice(0, 10)}T23:59:59`);
      if (Number.isFinite(end) && end < Date.now()) return "expired";
    }
    return "pending";
  }
  if (validTo) {
    const end = Date.parse(`${validTo.slice(0, 10)}T23:59:59`);
    if (Number.isFinite(end) && end < Date.now()) return "expired";
  }
  return s || "pending";
}

export function statusUi(status: RecurringVisitorStatus): {
  label: string;
  tone: "ok" | "warn" | "danger" | "neutral" | "accent";
} {
  const s = normalizeStatus(status);
  if (s === "synced") return { label: "En terminales", tone: "ok" };
  if (s === "expired") return { label: "Vencida", tone: "danger" };
  if (s === "cancelled") return { label: "Cancelada", tone: "neutral" };
  return { label: "Pendiente", tone: "warn" };
}

function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.list)) return o.list;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function normalizeVisitor(raw: Record<string, unknown>): RecurringVisitor | null {
  const id = String(
    raw.id ?? raw.recurrenceId ?? raw.visitorId ?? raw.personId ?? "",
  ).trim();
  const visitorName = String(
    raw.visitorName ?? raw.name ?? raw.personName ?? "",
  ).trim();
  if (!id && !visitorName) return null;

  const doorsRaw =
    raw.doorIndexCodes ?? raw.doorIds ?? raw.doors ?? raw.doorList ?? [];
  const doorIds = asArray(doorsRaw)
    .map((d) => {
      if (typeof d === "string" || typeof d === "number") return String(d);
      if (d && typeof d === "object") {
        const r = d as Record<string, unknown>;
        return String(r.id ?? r.doorId ?? r.doorIndexCode ?? "");
      }
      return "";
    })
    .filter(Boolean);

  const doorNames = asArray(raw.doorNames ?? raw.doors)
    .map((d) => {
      if (typeof d === "string") return d;
      if (d && typeof d === "object") {
        const r = d as Record<string, unknown>;
        return String(r.name ?? r.doorName ?? "");
      }
      return "";
    })
    .filter(Boolean);

  const weekdays = asArray(raw.weekdays ?? raw.days ?? raw.weekDays)
    .map(normalizeWeekday)
    .filter((x): x is WeekDay => Boolean(x));

  const validFrom = String(
    raw.validFrom ?? raw.beginDate ?? raw.startDate ?? raw.vigenciaFrom ?? "",
  ).slice(0, 10);
  const validTo = String(
    raw.validTo ?? raw.endDate ?? raw.vigenciaTo ?? "",
  ).slice(0, 10);

  const timeFrom = String(raw.timeFrom ?? raw.beginTime ?? raw.hourFrom ?? "09:00").slice(
    0,
    5,
  );
  const timeTo = String(raw.timeTo ?? raw.endTime ?? raw.hourTo ?? "18:00").slice(0, 5);

  return {
    id: id || `tmp-${visitorName}`,
    visitorName: visitorName || "Visitante",
    phone: raw.phone != null ? String(raw.phone) : raw.phoneNo != null ? String(raw.phoneNo) : null,
    hostEmployeeId:
      raw.hostEmployeeId != null
        ? String(raw.hostEmployeeId)
        : raw.hostPersonId != null
          ? String(raw.hostPersonId)
          : raw.hostUserId != null
            ? String(raw.hostUserId)
            : null,
    hostEmployeeName:
      raw.hostEmployeeName != null
        ? String(raw.hostEmployeeName)
        : raw.hostName != null
          ? String(raw.hostName)
          : null,
    doorIds,
    doorNames: doorNames.length ? doorNames : undefined,
    timeFrom,
    timeTo,
    weekdays,
    validFrom,
    validTo,
    status: normalizeStatus(raw.status ?? raw.syncStatus ?? raw.state, validTo),
    employeeNo:
      raw.employeeNo != null
        ? String(raw.employeeNo)
        : raw.code != null
          ? String(raw.code)
          : null,
    personId: raw.personId != null ? String(raw.personId) : null,
    hasFace: Boolean(raw.hasFace ?? raw.faceEnrolled ?? ((raw.numOfFace as number) || 0) > 0),
    note: raw.note != null ? String(raw.note) : undefined,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
  };
}

export async function listRecurringVisitors(): Promise<RecurringListResult> {
  const paths = [
    "integra/visitors/recurring",
    "integra/visitors/recurrences",
    "integra/recurring-visitors",
  ];
  for (const path of paths) {
    try {
      const raw = await integraApi<unknown>(path);
      const items = asArray(raw)
        .map((row) =>
          row && typeof row === "object"
            ? normalizeVisitor(row as Record<string, unknown>)
            : null,
        )
        .filter((x): x is RecurringVisitor => Boolean(x));
      const note =
        raw && typeof raw === "object" && "note" in (raw as object)
          ? String((raw as { note?: unknown }).note || "") || undefined
          : undefined;
      return { items, source: "live", note, apiReady: true };
    } catch (e) {
      if (!isNotReady(e)) throw e;
    }
  }
  return {
    items: [],
    source: "empty",
    apiReady: false,
    note:
      "La API de visitas recurrentes aún no está disponible en este sitio. El formulario queda listo; reintenta cuando el sibling despliegue el endpoint.",
  };
}

export async function createRecurringVisitor(
  input: CreateRecurringVisitorInput,
): Promise<RecurringVisitor> {
  const body = {
    visitorName: input.visitorName.trim(),
    phone: input.phone?.trim() || undefined,
    hostEmployeeId: input.hostEmployeeId || undefined,
    hostEmployeeName: input.hostEmployeeName || undefined,
    hostPersonId: input.hostEmployeeId || undefined,
    doorIds: input.doorIds,
    doorIndexCodes: input.doorIds,
    timeFrom: input.timeFrom,
    timeTo: input.timeTo,
    beginTime: `${input.timeFrom}:00`,
    endTime: `${input.timeTo}:00`,
    weekdays: input.weekdays,
    validFrom: input.validFrom,
    validTo: input.validTo,
    faceBase64: input.faceBase64 || undefined,
  };

  const paths = [
    "integra/visitors/recurring",
    "integra/visitors/recurrences",
    "integra/recurring-visitors",
  ];
  let lastErr: unknown;
  for (const path of paths) {
    try {
      const raw = await integraApi<Record<string, unknown>>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const item =
        raw && typeof raw === "object" && "item" in raw
          ? normalizeVisitor((raw as { item: Record<string, unknown> }).item)
          : normalizeVisitor(raw);
      if (item) return item;
      return {
        id: String(raw?.id || Date.now()),
        visitorName: input.visitorName,
        phone: input.phone,
        hostEmployeeId: input.hostEmployeeId,
        hostEmployeeName: input.hostEmployeeName,
        doorIds: input.doorIds,
        timeFrom: input.timeFrom,
        timeTo: input.timeTo,
        weekdays: input.weekdays,
        validFrom: input.validFrom,
        validTo: input.validTo,
        status: "pending",
      };
    } catch (e) {
      lastErr = e;
      if (!isNotReady(e)) throw e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(
        "Alta recurrente aún no disponible en el servidor. Reintenta cuando aterrice la API.",
      );
}

export async function cancelRecurringVisitor(id: string): Promise<CancelResult> {
  const paths = [
    `integra/visitors/recurring/${encodeURIComponent(id)}/cancel`,
    `integra/visitors/recurrences/${encodeURIComponent(id)}/cancel`,
    `integra/recurring-visitors/${encodeURIComponent(id)}/cancel`,
  ];
  let lastErr: unknown;
  for (const path of paths) {
    try {
      const raw = await integraApi<CancelResult & { ok?: boolean }>(path, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return {
        success: raw.success !== false && raw.ok !== false,
        note:
          raw.note ||
          "Recurrencia cancelada: acceso ACS deshabilitado en terminales.",
      };
    } catch (e) {
      lastErr = e;
      if (!isNotReady(e)) throw e;
    }
  }
  // DELETE fallback
  try {
    const raw = await integraApi<CancelResult>(
      `integra/visitors/recurring/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return {
      success: raw.success !== false,
      note: raw.note || "Recurrencia cancelada.",
    };
  } catch (e) {
    if (!isNotReady(e)) throw e;
    lastErr = e;
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Cancelación aún no disponible en el servidor.");
}

export async function listVisitorDoors(): Promise<{
  doors: ScheduleDoor[];
  meetingRoomDoorId?: string | null;
  note?: string;
}> {
  try {
    const cat = await fetchSchedulesCatalog();
    return {
      doors: cat.doors,
      meetingRoomDoorId: cat.meetingRoomDoorId,
      note: cat.note,
    };
  } catch {
    const d = await integraApi<{ items?: Array<Record<string, unknown>> }>(
      "integra/doors",
    ).catch(() => ({ items: [] as Array<Record<string, unknown>> }));
    const doors: ScheduleDoor[] = (d.items || []).map((row) => {
      const id = String(row.id || "");
      const parts = id.split("|");
      const doorNo = parts.length > 1 ? Number(parts[1]) : 1;
      return {
        id,
        name: String(row.name || id),
        location: row.location != null ? String(row.location) : undefined,
        deviceIp: parts[0] || null,
        doorNo: Number.isFinite(doorNo) ? doorNo : 1,
        online: row.online !== false,
      };
    });
    return { doors };
  }
}

/** Anfitriones: personas ACS (empleados en terminales). */
export async function listHostEmployees(): Promise<HostEmployee[]> {
  const p = await integraApi<{ items?: Array<Record<string, unknown>> }>(
    "integra/people",
  ).catch(() => ({ items: [] as Array<Record<string, unknown>> }));
  return (p.items || [])
    .map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || row.id || ""),
      code: row.code != null ? String(row.code) : undefined,
      source: "acs" as const,
    }))
    .filter((h) => h.id && h.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function weekdaysLabel(days: WeekDay[]): string {
  if (!days.length) return "—";
  const set = new Set(days);
  const office =
    set.has("Monday") &&
    set.has("Tuesday") &&
    set.has("Wednesday") &&
    set.has("Thursday") &&
    set.has("Friday") &&
    !set.has("Saturday") &&
    !set.has("Sunday");
  if (office && days.length === 5) return "Lun–Vie";
  if (days.length === 7) return "Todos los días";
  return WEEK_DAYS.filter((d) => set.has(d.key))
    .map((d) => d.short)
    .join(" · ");
}

export function fileToJpegBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const m = /^data:image\/(\w+);base64,(.+)$/i.exec(dataUrl);
      if (!m) {
        reject(new Error("Archivo no es imagen"));
        return;
      }
      const kind = m[1].toLowerCase();
      if (kind !== "jpeg" && kind !== "jpg") {
        reject(new Error("Usa JPEG (.jpg). PNG no lo aceptan bien los DS-K1T."));
        return;
      }
      resolve(m[2]);
    };
    reader.readAsDataURL(file);
  });
}
