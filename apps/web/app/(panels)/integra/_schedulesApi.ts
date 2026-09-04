/**
 * Cliente de horarios ACS (ISAPI UserRight* / RightPlan / Valid).
 * Consume `integra/schedules*` del sibling; si aún no aterriza, cae a
 * personas/puertas + PATCH people (rightPlan + Valid) sin inventar ISAPI.
 */

import { integraApi } from "./_lib";

/** Fin “indefinido” que usan los DS-K1T / doc HikGateway. */
export const ISAPI_INDEFINITE_END = "2037-12-31T23:59:59";
export const ISAPI_DEFAULT_BEGIN = "2020-01-01T00:00:00";

export type WeekDay =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export const WEEK_DAYS: { key: WeekDay; short: string; label: string }[] = [
  { key: "Monday", short: "Lun", label: "Lunes" },
  { key: "Tuesday", short: "Mar", label: "Martes" },
  { key: "Wednesday", short: "Mié", label: "Miércoles" },
  { key: "Thursday", short: "Jue", label: "Jueves" },
  { key: "Friday", short: "Vie", label: "Viernes" },
  { key: "Saturday", short: "Sáb", label: "Sábado" },
  { key: "Sunday", short: "Dom", label: "Domingo" },
];

export type TimeSegment = {
  id: number;
  enable: boolean;
  beginTime: string; // HH:mm:ss o HH:mm
  endTime: string;
};

export type DayPlan = {
  week: WeekDay;
  segments: TimeSegment[];
};

export type ScheduleTemplate = {
  id: string;
  name: string;
  weekPlanNo?: number;
  enable?: boolean;
  deviceIp?: string | null;
  /** Resumen corto p.ej. "Lun–Vie 09:00–18:00" */
  summary?: string;
  days?: DayPlan[];
};

export type ScheduleDoor = {
  id: string;
  name: string;
  location?: string;
  deviceIp?: string | null;
  doorNo?: number;
  online?: boolean;
};

export type DoorPlanAssignment = {
  doorId: string;
  doorName?: string;
  doorNo?: number;
  /** "0" / vacío = sin acceso a esa puerta */
  planTemplateNo: string;
  planName?: string;
};

export type PersonSchedule = {
  personId: string;
  name: string;
  code?: string;
  validEnable: boolean;
  validFrom: string;
  validTo: string;
  indefinite: boolean;
  doorPlans: DoorPlanAssignment[];
  source?: "live" | "mirror" | "mock" | "fallback";
  note?: string;
};

export type DoorAccessRow = {
  personId: string;
  name: string;
  code?: string;
  planTemplateNo: string;
  planName?: string;
  validEnable?: boolean;
  validFrom?: string;
  validTo?: string;
  indefinite?: boolean;
  weekSummary?: string;
};

export type OpResult = { deviceIp: string; ok: boolean; error?: string };

export type SaveScheduleResult = {
  success: boolean;
  note?: string;
  results?: OpResult[];
  source?: string;
};

export type SchedulesCatalog = {
  doors: ScheduleDoor[];
  templates: ScheduleTemplate[];
  meetingRoomDoorId?: string | null;
  source: "live" | "mock" | "fallback";
  note?: string;
};

export type AccessPresetId =
  | "indefinite_247"
  | "office_hours"
  | "meeting_only"
  | "contractor"
  | "visit_1day"
  | "no_access";

export type AccessPreset = {
  id: AccessPresetId;
  title: string;
  blurb: string;
  tone: "ok" | "accent" | "warn" | "danger" | "neutral";
};

export const ACCESS_PRESETS: AccessPreset[] = [
  {
    id: "indefinite_247",
    title: "Indefinido 24/7",
    blurb: "Todas las puertas, todo el día, sin fecha fin",
    tone: "ok",
  },
  {
    id: "office_hours",
    title: "Horario oficina",
    blurb: "Lun–Vie laborables · vigencia indefinida",
    tone: "accent",
  },
  {
    id: "meeting_only",
    title: "Solo sala juntas",
    blurb: "Acceso a Sala de Juntas; resto cerrado",
    tone: "accent",
  },
  {
    id: "contractor",
    title: "Contratista temporal",
    blurb: "Ventana de fechas + horario de oficina",
    tone: "warn",
  },
  {
    id: "visit_1day",
    title: "Visita 1 día",
    blurb: "Solo hoy, horario diurno, puertas elegidas",
    tone: "warn",
  },
  {
    id: "no_access",
    title: "Sin acceso",
    blurb: "Deshabilita vigencia en todos los terminales",
    tone: "danger",
  },
];

/** Plantillas locales cuando el API de calendarios aún no responde. */
export const FALLBACK_TEMPLATES: ScheduleTemplate[] = [
  {
    id: "1",
    name: "24/7 todo el día",
    weekPlanNo: 1,
    enable: true,
    summary: "Todos los días 00:00–24:00",
  },
  {
    id: "2",
    name: "Horario oficina",
    weekPlanNo: 2,
    enable: true,
    summary: "Lun–Vie 09:00–18:00",
  },
  {
    id: "3",
    name: "Diurno restringido",
    weekPlanNo: 3,
    enable: true,
    summary: "Lun–Vie 08:00–20:00",
  },
  {
    id: "0",
    name: "Sin acceso",
    weekPlanNo: 0,
    enable: false,
    summary: "No abre esta puerta",
  },
];

function isNotReady(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return /404|501|503|Cannot GET|Cannot PUT|Cannot PATCH|Not Found|no implement|aún no/i.test(
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

export function isIndefiniteEnd(end?: string | null): boolean {
  if (!end) return true;
  return end.startsWith("2037") || end.startsWith("2099") || end.startsWith("9999");
}

export function formatValidityLabel(p: {
  validEnable?: boolean;
  validFrom?: string;
  validTo?: string;
  indefinite?: boolean;
}): string {
  if (p.validEnable === false) return "Sin acceso";
  if (p.indefinite || isIndefiniteEnd(p.validTo)) return "Indefinido";
  const from = (p.validFrom || "").slice(0, 10) || "—";
  const to = (p.validTo || "").slice(0, 10) || "—";
  return `${from} → ${to}`;
}

export function findMeetingRoomDoor(doors: ScheduleDoor[]): ScheduleDoor | null {
  const hit = doors.find((d) => /junta|meeting|sala/i.test(d.name));
  return hit || null;
}

export function templateLabel(
  templates: ScheduleTemplate[],
  planTemplateNo: string,
): string {
  if (!planTemplateNo || planTemplateNo === "0") return "Sin acceso";
  const t = templates.find((x) => x.id === planTemplateNo);
  return t?.name || `Plantilla ${planTemplateNo}`;
}

function parseRightPlan(
  rightPlan: unknown,
  doors: ScheduleDoor[],
  templates: ScheduleTemplate[],
): DoorPlanAssignment[] {
  const byDoor = new Map<string, DoorPlanAssignment>();
  for (const d of doors) {
    byDoor.set(d.id, {
      doorId: d.id,
      doorName: d.name,
      doorNo: d.doorNo ?? 1,
      planTemplateNo: "0",
      planName: "Sin acceso",
    });
  }

  const rows = Array.isArray(rightPlan)
    ? rightPlan
    : rightPlan && typeof rightPlan === "object"
      ? [rightPlan]
      : [];

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const doorNo = Number(r.doorNo ?? r.door ?? 1);
    const plan = String(r.planTemplateNo ?? r.planTemplate ?? "1");
    const doorIdHint = r.doorId != null ? String(r.doorId) : null;
    const match =
      (doorIdHint && doors.find((d) => d.id === doorIdHint)) ||
      doors.find((d) => (d.doorNo ?? 1) === doorNo) ||
      doors[0];
    if (!match) continue;
    byDoor.set(match.id, {
      doorId: match.id,
      doorName: match.name,
      doorNo: match.doorNo ?? doorNo,
      planTemplateNo: plan === "0" ? "0" : plan,
      planName: templateLabel(templates, plan),
    });
  }

  // Si RightPlan trae un plan genérico y hay una sola entrada, aplicar a todas
  // las puertas del sitio (comportamiento típico de fan-out 1 puerta/terminal).
  if (rows.length === 1 && doors.length > 1) {
    const only = rows[0] as Record<string, unknown>;
    const plan = String(only.planTemplateNo ?? only.planTemplate ?? "");
    if (plan && plan !== "0") {
      for (const d of doors) {
        byDoor.set(d.id, {
          doorId: d.id,
          doorName: d.name,
          doorNo: d.doorNo ?? 1,
          planTemplateNo: plan,
          planName: templateLabel(templates, plan),
        });
      }
    }
  }

  return Array.from(byDoor.values());
}

async function loadDoorsPeople(): Promise<{
  doors: ScheduleDoor[];
  people: Array<{
    id: string;
    name: string;
    code?: string;
    validEnable?: boolean;
    validFrom?: string;
    validTo?: string;
    rightPlan?: unknown;
    doorNames?: string[];
  }>;
}> {
  const [d, p] = await Promise.all([
    integraApi<{ items: Array<Record<string, unknown>> }>("integra/doors").catch(() => ({
      items: [],
    })),
    integraApi<{ items: Array<Record<string, unknown>> }>("integra/people").catch(() => ({
      items: [],
    })),
  ]);

  const doors: ScheduleDoor[] = (d.items || []).map((row) => {
    const id = String(row.id || "");
    const parts = id.split("|");
    const doorNo = parts.length > 1 ? Number(parts[1]) : 1;
    return {
      id,
      name: String(row.name || id),
      location: row.location != null ? String(row.location) : undefined,
      deviceIp: parts[0] || (row.ip != null ? String(row.ip) : null),
      doorNo: Number.isFinite(doorNo) ? doorNo : 1,
      online: row.online !== false,
    };
  });

  const people = (p.items || []).map((row) => ({
    id: String(row.id || ""),
    name: String(row.name || row.id || ""),
    code: row.code != null ? String(row.code) : undefined,
    validEnable: row.validEnable as boolean | undefined,
    validFrom: row.validFrom != null ? String(row.validFrom) : undefined,
    validTo: row.validTo != null ? String(row.validTo) : undefined,
    rightPlan: row.rightPlan,
    doorNames: Array.isArray(row.doorNames) ? (row.doorNames as string[]) : undefined,
  }));

  return { doors, people };
}

export async function fetchSchedulesCatalog(): Promise<SchedulesCatalog> {
  try {
    const raw = await integraApi<Partial<SchedulesCatalog> & { items?: ScheduleTemplate[] }>(
      "integra/schedules",
    );
    if (raw?.doors?.length || raw?.templates?.length) {
      const templates =
        raw.templates?.length ? raw.templates : FALLBACK_TEMPLATES;
      return {
        doors: raw.doors || [],
        templates,
        meetingRoomDoorId:
          raw.meetingRoomDoorId ?? findMeetingRoomDoor(raw.doors || [])?.id ?? null,
        source: raw.source === "live" ? "live" : "fallback",
        note: raw.note,
      };
    }
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  try {
    const tpl = await integraApi<{ items: ScheduleTemplate[] }>(
      "integra/schedules/templates",
    );
    const { doors } = await loadDoorsPeople();
    return {
      doors,
      templates: tpl.items?.length ? tpl.items : FALLBACK_TEMPLATES,
      meetingRoomDoorId: findMeetingRoomDoor(doors)?.id ?? null,
      source: "live",
    };
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  const { doors } = await loadDoorsPeople();
  return {
    doors,
    templates: FALLBACK_TEMPLATES,
    meetingRoomDoorId: findMeetingRoomDoor(doors)?.id ?? null,
    source: "fallback",
    note:
      "API de horarios aún no disponible: se usan plantillas locales y el guardado va por ficha de persona (Valid + RightPlan).",
  };
}

export async function fetchPersonSchedule(
  personId: string,
  catalog: SchedulesCatalog,
): Promise<PersonSchedule> {
  try {
    const raw = await integraApi<Partial<PersonSchedule>>(
      `integra/schedules/people/${encodeURIComponent(personId)}`,
    );
    if (raw?.personId || raw?.doorPlans) {
      const validTo = raw.validTo || ISAPI_INDEFINITE_END;
      return {
        personId: raw.personId || personId,
        name: raw.name || personId,
        code: raw.code,
        validEnable: raw.validEnable !== false,
        validFrom: raw.validFrom || ISAPI_DEFAULT_BEGIN,
        validTo,
        indefinite: raw.indefinite ?? isIndefiniteEnd(validTo),
        doorPlans:
          raw.doorPlans?.length
            ? raw.doorPlans
            : parseRightPlan(null, catalog.doors, catalog.templates),
        source: raw.source || "live",
        note: raw.note,
      };
    }
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  const detail = await integraApi<Record<string, unknown>>(
    `integra/people/${encodeURIComponent(personId)}`,
  ).catch(async () => {
    const list = await integraApi<{ items: Array<Record<string, unknown>> }>("integra/people");
    return (list.items || []).find((p) => String(p.id) === personId) || {};
  });

  const validTo =
    detail.validTo != null ? String(detail.validTo) : ISAPI_INDEFINITE_END;
  return {
    personId,
    name: String(detail.name || personId),
    code: detail.code != null ? String(detail.code) : undefined,
    validEnable: detail.validEnable !== false,
    validFrom:
      detail.validFrom != null ? String(detail.validFrom) : ISAPI_DEFAULT_BEGIN,
    validTo,
    indefinite: isIndefiniteEnd(validTo),
    doorPlans: parseRightPlan(detail.rightPlan, catalog.doors, catalog.templates),
    source: "fallback",
    note: "Leído desde ficha de persona (espejo/live).",
  };
}

export async function fetchDoorAccess(
  doorId: string,
  catalog: SchedulesCatalog,
): Promise<{ door: ScheduleDoor; people: DoorAccessRow[]; source: string; note?: string }> {
  try {
    const raw = await integraApi<{
      door?: ScheduleDoor;
      people?: DoorAccessRow[];
      source?: string;
      note?: string;
    }>(`integra/schedules/doors/${encodeURIComponent(doorId)}`);
    if (raw?.people) {
      return {
        door: raw.door || catalog.doors.find((d) => d.id === doorId) || {
          id: doorId,
          name: doorId,
        },
        people: raw.people,
        source: raw.source || "live",
        note: raw.note,
      };
    }
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  const { people } = await loadDoorsPeople();
  const door = catalog.doors.find((d) => d.id === doorId) || {
    id: doorId,
    name: doorId,
  };
  const rows: DoorAccessRow[] = [];
  for (const p of people) {
    const plans = parseRightPlan(p.rightPlan, catalog.doors, catalog.templates);
    const hit = plans.find((x) => x.doorId === doorId && x.planTemplateNo !== "0");
    const byName =
      !hit &&
      p.doorNames?.some((n) => n.toLowerCase() === door.name.toLowerCase());
    if (!hit && !byName) continue;
    if (p.validEnable === false) continue;
    rows.push({
      personId: p.id,
      name: p.name,
      code: p.code,
      planTemplateNo: hit?.planTemplateNo || "1",
      planName: hit?.planName || templateLabel(catalog.templates, hit?.planTemplateNo || "1"),
      validEnable: p.validEnable,
      validFrom: p.validFrom,
      validTo: p.validTo,
      indefinite: isIndefiniteEnd(p.validTo),
      weekSummary: catalog.templates.find((t) => t.id === (hit?.planTemplateNo || "1"))
        ?.summary,
    });
  }
  return {
    door,
    people: rows,
    source: "fallback",
    note: "Quién tiene esta puerta según RightPlan / nombres del espejo.",
  };
}

export function applyPreset(
  preset: AccessPresetId,
  catalog: SchedulesCatalog,
  current: PersonSchedule,
): PersonSchedule {
  const doors = catalog.doors;
  const meeting = findMeetingRoomDoor(doors);
  const today = todayLocalDate();
  const allWith = (plan: string): DoorPlanAssignment[] =>
    doors.map((d) => ({
      doorId: d.id,
      doorName: d.name,
      doorNo: d.doorNo ?? 1,
      planTemplateNo: plan,
      planName: templateLabel(catalog.templates, plan),
    }));

  switch (preset) {
    case "indefinite_247":
      return {
        ...current,
        validEnable: true,
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: allWith("1"),
      };
    case "office_hours":
      return {
        ...current,
        validEnable: true,
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: allWith("2"),
      };
    case "meeting_only": {
      const targetId = meeting?.id || catalog.meetingRoomDoorId;
      return {
        ...current,
        validEnable: true,
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: doors.map((d) => {
          const on = targetId ? d.id === targetId : /junta|meeting/i.test(d.name);
          const plan = on ? "1" : "0";
          return {
            doorId: d.id,
            doorName: d.name,
            doorNo: d.doorNo ?? 1,
            planTemplateNo: plan,
            planName: templateLabel(catalog.templates, plan),
          };
        }),
      };
    }
    case "contractor":
      return {
        ...current,
        validEnable: true,
        validFrom: `${today}T00:00:00`,
        validTo: `${addDaysLocal(today, 30)}T23:59:59`,
        indefinite: false,
        doorPlans: allWith("2"),
      };
    case "visit_1day":
      return {
        ...current,
        validEnable: true,
        validFrom: `${today}T08:00:00`,
        validTo: `${today}T20:00:00`,
        indefinite: false,
        doorPlans: doors.map((d) => {
          const on = /junta|general|acceso/i.test(d.name);
          const plan = on ? "3" : "0";
          return {
            doorId: d.id,
            doorName: d.name,
            doorNo: d.doorNo ?? 1,
            planTemplateNo: plan,
            planName: templateLabel(catalog.templates, plan),
          };
        }),
      };
    case "no_access":
      return {
        ...current,
        validEnable: false,
        indefinite: false,
        doorPlans: allWith("0"),
      };
    default:
      return current;
  }
}

function rightPlanFromDoorPlans(doorPlans: DoorPlanAssignment[]): Array<{
  doorNo: number;
  planTemplateNo: string;
  doorId?: string;
}> {
  return doorPlans
    .filter((d) => d.planTemplateNo && d.planTemplateNo !== "0")
    .map((d) => ({
      doorNo: d.doorNo ?? 1,
      planTemplateNo: d.planTemplateNo,
      doorId: d.doorId,
    }));
}

export async function savePersonSchedule(
  draft: PersonSchedule,
): Promise<SaveScheduleResult> {
  const validTo = draft.indefinite
    ? ISAPI_INDEFINITE_END
    : draft.validTo || ISAPI_INDEFINITE_END;
  const validFrom = draft.validFrom || ISAPI_DEFAULT_BEGIN;
  const body = {
    validEnable: draft.validEnable,
    validFrom,
    validTo,
    indefinite: draft.indefinite,
    doorPlans: draft.doorPlans,
    rightPlan: rightPlanFromDoorPlans(draft.doorPlans),
    doorRight: draft.doorPlans.some((d) => d.planTemplateNo !== "0") ? "1" : "",
  };

  try {
    const r = await integraApi<SaveScheduleResult>(
      `integra/schedules/people/${encodeURIComponent(draft.personId)}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    return {
      success: r.success !== false,
      note: r.note,
      results: r.results,
      source: r.source || "live",
    };
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  // Fallback: ficha ISAPI ya soporta Valid + RightPlan.
  const r = await integraApi<{
    success?: boolean;
    note?: string;
    results?: OpResult[];
  }>(`integra/people/${encodeURIComponent(draft.personId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      validEnable: draft.validEnable,
      validFrom,
      validTo,
      doorRight: body.doorRight || undefined,
      rightPlan: body.rightPlan.length
        ? body.rightPlan.map(({ doorNo, planTemplateNo }) => ({
            doorNo,
            planTemplateNo,
          }))
        : [{ doorNo: 1, planTemplateNo: "1" }],
    }),
  });

  return {
    success: r.success !== false,
    note:
      r.note ||
      "Guardado vía ficha de persona (Valid + RightPlan). Plantillas semanales detalladas cuando aterrice el API de calendarios.",
    results: r.results,
    source: "fallback",
  };
}

export async function listPeopleBrief(): Promise<
  Array<{ id: string; name: string; code?: string }>
> {
  const { people } = await loadDoorsPeople();
  return people.map((p) => ({ id: p.id, name: p.name, code: p.code }));
}
