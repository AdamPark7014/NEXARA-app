/**
 * Cliente de horarios ACS — consume APIs reales:
 *   GET  integra/access-schedules
 *   GET  integra/people/:id/access
 *   PATCH integra/people/:id/access
 *   GET  integra/spaces/:doorId  (quién en una puerta)
 * Fallback a doors/people + PATCH people si el endpoint aún no responde.
 */

import { integraApi } from "./_lib";

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

export type ScheduleTemplate = {
  id: string;
  name: string;
  weekPlanNo?: number;
  enable?: boolean;
  summary?: string;
};

export type ScheduleDoor = {
  id: string;
  name: string;
  deviceIp: string;
  doorNo?: number;
  online?: boolean;
};

export type DoorPlanAssignment = {
  doorId: string;
  doorName?: string;
  deviceIp: string;
  doorNo?: number;
  /** "0" = sin acceso (disable en ese terminal) */
  planTemplateNo: string;
  planName?: string;
  present?: boolean;
  error?: string;
};

export type PersonSchedule = {
  personId: string;
  name: string;
  code?: string;
  validEnable: boolean;
  validFrom: string;
  validTo: string;
  indefinite: boolean;
  validMode: "indefinite" | "window" | "disabled";
  doorPlans: DoorPlanAssignment[];
  source?: "live" | "fallback";
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
  source: "live" | "fallback";
  note?: string;
  apiPresets?: Array<{ key: string; label: string }>;
};

export type AccessPresetId =
  | "indefinite_247"
  | "office_hours"
  | "after_hours"
  | "weekend"
  | "meeting_only"
  | "contractor"
  | "visit_1day"
  | "no_access";

export type AccessPreset = {
  id: AccessPresetId;
  title: string;
  blurb: string;
  tone: "ok" | "accent" | "warn" | "danger" | "neutral";
  /** Clave del PATCH people/:id/access cuando aplica a todo el sitio. */
  apiPreset?:
    | "always"
    | "never"
    | "office_hours"
    | "after_hours"
    | "weekend"
    | "visitor_today"
    | "contractor";
};

export const ACCESS_PRESETS: AccessPreset[] = [
  {
    id: "indefinite_247",
    title: "Indefinido 24/7",
    blurb: "Todas las puertas, todo el día, sin fecha fin",
    tone: "ok",
    apiPreset: "always",
  },
  {
    id: "office_hours",
    title: "Horario oficina",
    blurb: "Lun–Vie laborables · vigencia indefinida",
    tone: "accent",
    apiPreset: "office_hours",
  },
  {
    id: "after_hours",
    title: "Fuera de horario",
    blurb: "Lun–Vie 18:00–08:00 (2 franjas / medianoche)",
    tone: "warn",
    apiPreset: "after_hours",
  },
  {
    id: "weekend",
    title: "Solo fin de semana",
    blurb: "Sábado y domingo todo el día",
    tone: "accent",
    apiPreset: "weekend",
  },
  {
    id: "meeting_only",
    title: "Solo sala juntas",
    blurb: "Acceso a Sala de Juntas; resto deshabilitado",
    tone: "accent",
  },
  {
    id: "contractor",
    title: "Contratista temporal",
    blurb: "Ventana de fechas + horario de oficina",
    tone: "warn",
    apiPreset: "contractor",
  },
  {
    id: "visit_1day",
    title: "Visita 1 día",
    blurb: "Solo hoy · pase de visitante (hora México)",
    tone: "warn",
    apiPreset: "visitor_today",
  },
  {
    id: "no_access",
    title: "Sin acceso",
    blurb: "Deshabilita vigencia en todos los terminales",
    tone: "danger",
    apiPreset: "never",
  },
];

export const FALLBACK_TEMPLATES: ScheduleTemplate[] = [
  { id: "1", name: "24/7 todo el día", weekPlanNo: 1, summary: "Todos los días 00:00–24:00" },
  { id: "2", name: "Horario oficina", weekPlanNo: 2, summary: "Lun–Vie 08:00–18:00" },
  { id: "3", name: "Diurno restringido", weekPlanNo: 3, summary: "Lun–Vie 08:00–20:00" },
  { id: "4", name: "Fuera de horario", weekPlanNo: 4, summary: "Lun–Vie 18:00–08:00 (2 franjas)" },
  { id: "5", name: "Fin de semana", weekPlanNo: 5, summary: "Sáb–Dom 00:00–24:00" },
  { id: "0", name: "Sin acceso", weekPlanNo: 0, summary: "No abre esta puerta" },
];

function isNotReady(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return /404|501|503|Cannot GET|Cannot PUT|Cannot PATCH|Not Found|no implement|aún no/i.test(
    msg,
  );
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
  validMode?: string;
}): string {
  if (p.validMode === "disabled" || p.validEnable === false) return "Sin acceso";
  if (p.validMode === "indefinite" || p.indefinite || isIndefiniteEnd(p.validTo)) {
    return "Indefinido";
  }
  const from = (p.validFrom || "").slice(0, 10) || "—";
  const to = (p.validTo || "").slice(0, 10) || "—";
  return `${from} → ${to}`;
}

export function findMeetingRoomDoor(doors: ScheduleDoor[]): ScheduleDoor | null {
  return doors.find((d) => /junta|meeting|sala/i.test(d.name)) || null;
}

export function templateLabel(templates: ScheduleTemplate[], planTemplateNo: string): string {
  if (!planTemplateNo || planTemplateNo === "0") return "Sin acceso";
  return templates.find((x) => x.id === planTemplateNo)?.name || `Plantilla ${planTemplateNo}`;
}

async function loadDoorsFallback(): Promise<ScheduleDoor[]> {
  const d = await integraApi<{ items: Array<Record<string, unknown>> }>("integra/doors").catch(
    () => ({ items: [] }),
  );
  return (d.items || []).map((row) => {
    const id = String(row.id || "");
    const parts = id.split("|");
    const doorNo = parts.length > 1 ? Number(parts[1]) : 1;
    return {
      id,
      name: String(row.name || id),
      deviceIp: parts[0] || "",
      doorNo: Number.isFinite(doorNo) ? doorNo : 1,
      online: row.online !== false,
    };
  });
}

export async function fetchSchedulesCatalog(): Promise<SchedulesCatalog> {
  // Preferir alias UI (doors + templates ya aplanados).
  try {
    const shaped = await integraApi<{
      doors?: ScheduleDoor[];
      templates?: ScheduleTemplate[];
      meetingRoomDoorId?: string | null;
      presets?: Array<{ key: string; label: string }>;
      note?: string;
      source?: string;
    }>("integra/schedules");
    if (shaped?.doors?.length || shaped?.templates?.length) {
      const doors = (shaped.doors || []).map((d) => ({
        id: d.id,
        name: d.name,
        deviceIp: d.deviceIp || String(d.id).split("|")[0] || "",
        doorNo: d.doorNo ?? 1,
        online: d.online !== false,
      }));
      const templatesMap = new Map<string, ScheduleTemplate>();
      for (const t of FALLBACK_TEMPLATES) templatesMap.set(t.id, t);
      for (const t of shaped.templates || []) {
        if (!t?.id) continue;
        templatesMap.set(String(t.id), {
          id: String(t.id),
          name: t.name || `Plantilla ${t.id}`,
          weekPlanNo: t.weekPlanNo,
          enable: t.enable,
          summary: t.summary || templatesMap.get(String(t.id))?.summary,
        });
      }
      templatesMap.set("0", FALLBACK_TEMPLATES.find((t) => t.id === "0")!);
      return {
        doors,
        templates: Array.from(templatesMap.values()).sort(
          (a, b) => Number(a.id) - Number(b.id),
        ),
        meetingRoomDoorId:
          shaped.meetingRoomDoorId ?? findMeetingRoomDoor(doors)?.id ?? null,
        source: "live",
        apiPresets: shaped.presets,
        note: shaped.note,
      };
    }
  } catch (e) {
    if (!isNotReady(e)) {
      /* seguir con access-schedules */
    }
  }

  try {
    const raw = await integraApi<{
      provider?: string;
      presets?: Array<{ key: string; label: string }>;
      devices?: Array<{
        deviceIp: string;
        deviceName?: string;
        doorIndexCode?: string;
        doorName?: string;
        ok?: boolean;
        templates?: Array<{ id?: number; templateName?: string; weekPlanNo?: number; enable?: boolean }>;
        weekPlans?: Array<{ id?: number; summary?: string; enabledSegments?: Array<{ week: string; beginTime: string; endTime: string }> }>;
        error?: string;
      }>;
      model?: { useCases?: string };
    }>("integra/access-schedules");

    const doors: ScheduleDoor[] = (raw.devices || []).map((d) => ({
      id: d.doorIndexCode || `${d.deviceIp}|1`,
      name: d.doorName || d.deviceName || d.deviceIp,
      deviceIp: d.deviceIp,
      doorNo: 1,
      online: d.ok !== false,
    }));

    const templatesMap = new Map<string, ScheduleTemplate>();
    for (const t of FALLBACK_TEMPLATES) templatesMap.set(t.id, t);
    for (const d of raw.devices || []) {
      for (const t of d.templates || []) {
        const id = String(t.id ?? "");
        if (!id) continue;
        const week = d.weekPlans?.find((w) => String(w.id) === id);
        const summary =
          week?.summary ||
          (week?.enabledSegments?.length
            ? week.enabledSegments
                .slice(0, 3)
                .map((s) => `${s.week.slice(0, 3)} ${String(s.beginTime).slice(0, 5)}–${String(s.endTime).slice(0, 5)}`)
                .join(" · ")
            : undefined);
        templatesMap.set(id, {
          id,
          name: t.templateName || `Plantilla ${id}`,
          weekPlanNo: t.weekPlanNo,
          enable: t.enable,
          summary: summary || templatesMap.get(id)?.summary,
        });
      }
    }
    templatesMap.set("0", FALLBACK_TEMPLATES.find((t) => t.id === "0")!);

    return {
      doors,
      templates: Array.from(templatesMap.values()).sort((a, b) => Number(a.id) - Number(b.id)),
      meetingRoomDoorId: findMeetingRoomDoor(doors)?.id ?? null,
      source: "live",
      apiPresets: raw.presets,
      note: doors.some((d) => d.online === false)
        ? "Algunos terminales no respondieron; se muestran igual para editar."
        : undefined,
    };
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  const doors = await loadDoorsFallback();
  return {
    doors,
    templates: FALLBACK_TEMPLATES,
    meetingRoomDoorId: findMeetingRoomDoor(doors)?.id ?? null,
    source: "fallback",
    note:
      "API access-schedules no disponible: catálogo local. El guardado intenta people/:id/access y cae a ficha.",
  };
}

export async function fetchPersonSchedule(
  personId: string,
  catalog: SchedulesCatalog,
): Promise<PersonSchedule> {
  try {
    const raw = await integraApi<{
      personId: string;
      name?: string;
      valid?: { enable?: boolean; beginTime?: string; endTime?: string } | null;
      validMode?: "indefinite" | "window" | "disabled";
      doors?: Array<{
        deviceIp: string;
        doorIndexCode?: string;
        doorName?: string;
        present?: boolean;
        doorNo?: number;
        planTemplateNo?: string | null;
        templateName?: string | null;
        Valid?: { enable?: boolean; beginTime?: string; endTime?: string } | null;
        error?: string;
      }>;
    }>(`integra/people/${encodeURIComponent(personId)}/access`);

    const valid = raw.valid;
    const mode =
      raw.validMode ||
      (valid?.enable === false
        ? "disabled"
        : isIndefiniteEnd(valid?.endTime)
          ? "indefinite"
          : "window");

    const doorPlans: DoorPlanAssignment[] = (raw.doors?.length
      ? raw.doors
      : catalog.doors.map((d) => ({
          deviceIp: d.deviceIp,
          doorIndexCode: d.id,
          doorName: d.name,
          present: false,
          doorNo: 1,
          planTemplateNo: null,
        }))
    ).map((d) => {
      const doorId = d.doorIndexCode || `${d.deviceIp}|1`;
      const plan =
        d.present === false || d.planTemplateNo == null || d.Valid?.enable === false
          ? "0"
          : String(d.planTemplateNo);
      return {
        doorId,
        doorName: d.doorName || catalog.doors.find((x) => x.deviceIp === d.deviceIp)?.name,
        deviceIp: d.deviceIp,
        doorNo: d.doorNo ?? 1,
        planTemplateNo: plan,
        planName: d.templateName || templateLabel(catalog.templates, plan),
        present: d.present,
        error: d.error,
      };
    });

    // Completar puertas del catálogo que no vinieron en la respuesta.
    for (const d of catalog.doors) {
      if (!doorPlans.some((x) => x.deviceIp === d.deviceIp)) {
        doorPlans.push({
          doorId: d.id,
          doorName: d.name,
          deviceIp: d.deviceIp,
          doorNo: d.doorNo ?? 1,
          planTemplateNo: "0",
          planName: "Sin acceso",
          present: false,
        });
      }
    }

    return {
      personId: raw.personId || personId,
      name: raw.name || personId,
      validEnable: mode !== "disabled",
      validFrom: valid?.beginTime || ISAPI_DEFAULT_BEGIN,
      validTo: valid?.endTime || ISAPI_INDEFINITE_END,
      indefinite: mode === "indefinite",
      validMode: mode,
      doorPlans,
      source: "live",
    };
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  const detail = await integraApi<Record<string, unknown>>(
    `integra/people/${encodeURIComponent(personId)}`,
  ).catch(() => ({}));

  const validTo =
    detail.validTo != null ? String(detail.validTo) : ISAPI_INDEFINITE_END;
  const enable = detail.validEnable !== false;
  return {
    personId,
    name: String(detail.name || personId),
    code: detail.code != null ? String(detail.code) : undefined,
    validEnable: enable,
    validFrom: detail.validFrom != null ? String(detail.validFrom) : ISAPI_DEFAULT_BEGIN,
    validTo,
    indefinite: isIndefiniteEnd(validTo),
    validMode: !enable ? "disabled" : isIndefiniteEnd(validTo) ? "indefinite" : "window",
    doorPlans: catalog.doors.map((d) => ({
      doorId: d.id,
      doorName: d.name,
      deviceIp: d.deviceIp,
      doorNo: d.doorNo ?? 1,
      planTemplateNo: "1",
      planName: templateLabel(catalog.templates, "1"),
    })),
    source: "fallback",
    note: "Leído desde ficha (espejo). Guarda con people/:id/access cuando el API esté up.",
  };
}

export async function fetchDoorAccess(
  doorId: string,
  catalog: SchedulesCatalog,
): Promise<{ door: ScheduleDoor; people: DoorAccessRow[]; source: string; note?: string }> {
  const door = catalog.doors.find((d) => d.id === doorId) || {
    id: doorId,
    name: doorId,
    deviceIp: doorId.split("|")[0] || "",
  };

  const mapPeople = (
    people: Array<{
      personId?: string;
      id?: string;
      name?: string;
      code?: string;
      planTemplateNo?: string;
      planName?: string;
      validEnable?: boolean;
      validFrom?: string;
      validTo?: string;
      validMode?: string;
      indefinite?: boolean;
      weekSummary?: string;
    }>,
  ): DoorAccessRow[] =>
    people.map((p) => {
      const plan = String(p.planTemplateNo || "1");
      return {
        personId: String(p.personId || p.id || ""),
        name: String(p.name || p.personId || ""),
        code: p.code,
        planTemplateNo: plan,
        planName: p.planName || templateLabel(catalog.templates, plan),
        validEnable: p.validEnable,
        validFrom: p.validFrom,
        validTo: p.validTo,
        indefinite:
          p.indefinite === true ||
          p.validMode === "indefinite" ||
          isIndefiniteEnd(p.validTo),
        weekSummary:
          p.weekSummary || catalog.templates.find((t) => t.id === plan)?.summary,
      };
    });

  try {
    const raw = await integraApi<{
      door?: { name?: string };
      people?: Array<Record<string, unknown>>;
      note?: string;
      source?: string;
    }>(`integra/schedules/doors/${encodeURIComponent(doorId)}`);
    if (raw?.people) {
      return {
        door: { ...door, name: (raw.door?.name as string) || door.name },
        people: mapPeople(raw.people as Parameters<typeof mapPeople>[0]),
        source: raw.source || "live",
        note: raw.note,
      };
    }
  } catch (e) {
    if (!isNotReady(e)) {
      /* seguir */
    }
  }

  try {
    const raw = await integraApi<{
      door?: { name?: string };
      people?: Array<{
        personId?: string;
        id?: string;
        name?: string;
        code?: string;
        planTemplateNo?: string;
        planName?: string;
        validEnable?: boolean;
        validFrom?: string;
        validTo?: string;
        validMode?: string;
        weekSummary?: string;
      }>;
    }>(`integra/spaces/${encodeURIComponent(doorId)}`);
    if (raw?.people) {
      return {
        door: { ...door, name: raw.door?.name || door.name },
        people: mapPeople(raw.people),
        source: "live",
      };
    }
  } catch (e) {
    if (!isNotReady(e)) {
      /* spaces puede no estar; seguir con people scan */
    }
  }

  const list = await integraApi<{ items: Array<Record<string, unknown>> }>("integra/people").catch(
    () => ({ items: [] }),
  );
  const rows: DoorAccessRow[] = [];
  for (const p of list.items || []) {
    const names = Array.isArray(p.doorNames) ? (p.doorNames as string[]) : [];
    if (!names.some((n) => n.toLowerCase() === door.name.toLowerCase()) && names.length) {
      continue;
    }
    if (p.validEnable === false) continue;
    rows.push({
      personId: String(p.id),
      name: String(p.name || p.id),
      code: p.code != null ? String(p.code) : undefined,
      planTemplateNo: "1",
      planName: templateLabel(catalog.templates, "1"),
      validEnable: p.validEnable as boolean | undefined,
      validFrom: p.validFrom != null ? String(p.validFrom) : undefined,
      validTo: p.validTo != null ? String(p.validTo) : undefined,
      indefinite: isIndefiniteEnd(p.validTo != null ? String(p.validTo) : null),
    });
  }
  return {
    door,
    people: rows,
    source: "fallback",
    note: "Lista aproximada desde espejo de personas. Abre «Por persona» para el detalle live por terminal.",
  };
}

export function applyPreset(
  preset: AccessPresetId,
  catalog: SchedulesCatalog,
  current: PersonSchedule,
): PersonSchedule {
  const doors = catalog.doors;
  const meeting = findMeetingRoomDoor(doors);
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const allWith = (plan: string, enable = true): DoorPlanAssignment[] =>
    doors.map((d) => ({
      doorId: d.id,
      doorName: d.name,
      deviceIp: d.deviceIp,
      doorNo: d.doorNo ?? 1,
      planTemplateNo: enable ? plan : "0",
      planName: templateLabel(catalog.templates, enable ? plan : "0"),
    }));

  switch (preset) {
    case "indefinite_247":
      return {
        ...current,
        validEnable: true,
        validMode: "indefinite",
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: allWith("1"),
      };
    case "office_hours":
      return {
        ...current,
        validEnable: true,
        validMode: "indefinite",
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: allWith("2"),
      };
    case "after_hours":
      return {
        ...current,
        validEnable: true,
        validMode: "indefinite",
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: allWith("4"),
      };
    case "weekend":
      return {
        ...current,
        validEnable: true,
        validMode: "indefinite",
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: allWith("5"),
      };
    case "meeting_only": {
      const targetIp = meeting?.deviceIp;
      return {
        ...current,
        validEnable: true,
        validMode: "indefinite",
        validFrom: ISAPI_DEFAULT_BEGIN,
        validTo: ISAPI_INDEFINITE_END,
        indefinite: true,
        doorPlans: doors.map((d) => {
          const on = targetIp ? d.deviceIp === targetIp : /junta|meeting/i.test(d.name);
          const plan = on ? "1" : "0";
          return {
            doorId: d.id,
            doorName: d.name,
            deviceIp: d.deviceIp,
            doorNo: d.doorNo ?? 1,
            planTemplateNo: plan,
            planName: templateLabel(catalog.templates, plan),
          };
        }),
      };
    }
    case "contractor": {
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
      return {
        ...current,
        validEnable: true,
        validMode: "window",
        validFrom: `${todayStr}T00:00:00`,
        validTo: `${endStr}T23:59:59`,
        indefinite: false,
        doorPlans: allWith("2"),
      };
    }
    case "visit_1day":
      return {
        ...current,
        validEnable: true,
        validMode: "window",
        validFrom: `${todayStr}T00:00:00`,
        validTo: `${todayStr}T23:59:59`,
        indefinite: false,
        doorPlans: allWith("1"),
      };
    case "no_access":
      return {
        ...current,
        validEnable: false,
        validMode: "disabled",
        indefinite: false,
        doorPlans: allWith("0", false),
      };
    default:
      return current;
  }
}

export async function savePersonSchedule(
  draft: PersonSchedule,
  opts?: { preset?: AccessPresetId | null },
): Promise<SaveScheduleResult> {
  const presetMeta = ACCESS_PRESETS.find((p) => p.id === opts?.preset);
  const doorPlans = draft.doorPlans.map((d) => ({
    deviceIp: d.deviceIp,
    doorNo: d.doorNo ?? 1,
    planTemplateNo: d.planTemplateNo === "0" ? undefined : d.planTemplateNo,
    disable: d.planTemplateNo === "0" || !draft.validEnable,
  }));

  const body: Record<string, unknown> = {
    validMode: draft.validEnable
      ? draft.indefinite
        ? "indefinite"
        : "window"
      : "disabled",
    beginTime: draft.validFrom || ISAPI_DEFAULT_BEGIN,
    endTime: draft.indefinite ? ISAPI_INDEFINITE_END : draft.validTo,
    doorPlans,
    ensurePresetsOnDevices: true,
  };

  // Presets globales del API (excepto meeting_only que es por puerta).
  if (presetMeta?.apiPreset && opts?.preset !== "meeting_only") {
    body.preset = presetMeta.apiPreset;
    if (presetMeta.apiPreset === "contractor") body.contractorDays = 30;
  } else if (opts?.preset === "meeting_only") {
    // Solo doorPlans con disable en el resto.
    delete body.preset;
  }

  try {
    const r = await integraApi<{
      success?: boolean;
      partial?: boolean;
      note?: string;
      results?: OpResult[];
    }>(`integra/people/${encodeURIComponent(draft.personId)}/access`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const ok = r.success !== false && !r.partial;
    return {
      success: ok,
      note:
        r.note ||
        (ok
          ? "Horario empujado a los terminales."
          : "Guardado parcial — revisa el detalle por IP."),
      results: r.results,
      source: "live",
    };
  } catch (e) {
    if (!isNotReady(e)) throw e;
  }

  const active = draft.doorPlans.filter((d) => d.planTemplateNo !== "0");
  const r = await integraApi<{ success?: boolean; note?: string; results?: OpResult[] }>(
    `integra/people/${encodeURIComponent(draft.personId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        validEnable: draft.validEnable,
        validFrom: draft.validFrom,
        validTo: draft.indefinite ? ISAPI_INDEFINITE_END : draft.validTo,
        doorRight: active.length ? "1" : "",
        rightPlan: active.length
          ? active.map((d) => ({
              doorNo: d.doorNo ?? 1,
              planTemplateNo: d.planTemplateNo,
            }))
          : [{ doorNo: 1, planTemplateNo: "1" }],
      }),
    },
  );
  return {
    success: r.success !== false,
    note: r.note || "Guardado vía ficha (fallback Valid + RightPlan).",
    results: r.results,
    source: "fallback",
  };
}

export async function listPeopleBrief(): Promise<
  Array<{ id: string; name: string; code?: string }>
> {
  const list = await integraApi<{ items: Array<Record<string, unknown>> }>("integra/people").catch(
    () => ({ items: [] }),
  );
  return (list.items || []).map((p) => ({
    id: String(p.id),
    name: String(p.name || p.id),
    code: p.code != null ? String(p.code) : undefined,
  }));
}
