/**
 * NEXARA · Ritmo operativo — cliente API
 * ---------------------------------------
 * Consume `apps/api/src/meetings/meetings.controller.ts`.
 * Usado por `/erp/reuniones`.
 *
 * Quién puede hacer qué lo decide la matriz de URLs del backend: todo el
 * personal lee y mueve sus propios acuerdos; convocar y registrar acuerdos
 * ajenos es de quien conduce la reunión. La UI esconde lo que no toca, pero
 * el permiso real se comprueba en el servidor.
 */
import { buildApiUrl } from "@/lib/api-base";
import { ROLES, type RoleKey } from "@/lib/rbac";

/**
 * Roles que conducen la reunión: convocan, cierran y registran acuerdos ajenos.
 *
 * Espeja `MEETINGS_LEAD_URL_RULES` del backend, que es quien decide de verdad.
 * Aquí sólo sirve para no enseñar un botón que va a devolver 403 — si esta
 * lista se desincroniza, el servidor sigue negando.
 */
export const MEETING_LEAD_ROLES: RoleKey[] = [
  ROLES.SUPER_ADMIN,
  ROLES.CEO,
  ROLES.ARQUITECTO,
  ROLES.DIR_OPERACIONES,
  ROLES.DIR_ADMIN,
  ROLES.COORD_ADMIN,
  ROLES.COORD_OPERACIONES,
  ROLES.COORD_VENTAS,
  ROLES.LIDER_DISENO,
  ROLES.RH,
];

export const canLeadMeetings = (roleKey: RoleKey | null | undefined): boolean =>
  Boolean(roleKey && MEETING_LEAD_ROLES.includes(roleKey));

export const MEETING_TYPES = [
  "DIARIA",
  "PLANEACION_SEMANAL",
  "REVISION_AVANCES",
  "CIERRE_SEMANAL",
  "EXTRAORDINARIA",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export type MeetingStatus = "PROGRAMADA" | "REALIZADA" | "CANCELADA";
export type AgreementKind = "ACUERDO" | "LECCION" | "RIESGO";
export type AgreementStatus = "PENDIENTE" | "EN_PROCESO" | "CUMPLIDO" | "CANCELADO";

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  DIARIA: "Reunión diaria",
  PLANEACION_SEMANAL: "Planeación semanal",
  REVISION_AVANCES: "Revisión de avances",
  CIERRE_SEMANAL: "Junta de cierre",
  EXTRAORDINARIA: "Extraordinaria",
};

/** El día de la semana que le toca a cada ritmo, según el organigrama. */
export const MEETING_TYPE_CADENCE: Record<MeetingType, string> = {
  DIARIA: "Todos los días · 10:00",
  PLANEACION_SEMANAL: "Lunes",
  REVISION_AVANCES: "Miércoles",
  CIERRE_SEMANAL: "Viernes",
  EXTRAORDINARIA: "Cuando haga falta",
};

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  PROGRAMADA: "Programada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
};

export const AGREEMENT_KIND_LABEL: Record<AgreementKind, string> = {
  ACUERDO: "Acuerdo",
  LECCION: "Lección aprendida",
  RIESGO: "Riesgo",
};

export const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  CUMPLIDO: "Cumplido",
  CANCELADO: "Cancelado",
};

export type UserBrief = { id: number; nombre: string; email?: string | null };

export type ActivityBrief = { id: number; anNumber: string; titulo: string };

export type Agreement = {
  id: number;
  meetingId: number;
  tipo: AgreementKind;
  descripcion: string;
  estado: AgreementStatus;
  responsableId?: number | null;
  responsable?: UserBrief | null;
  fechaCompromiso?: string | null;
  cumplidoAt?: string | null;
  activityId?: number | null;
  activity?: ActivityBrief | null;
  createdAt: string;
  /** Calculado por el backend al leer, no almacenado. */
  vencido: boolean;
  diasVencido: number;
  meeting?: { id: number; titulo: string; tipo: MeetingType; fecha: string } | null;
};

export type Attendee = {
  id: number;
  userId: number;
  asistio: boolean;
  user?: UserBrief | null;
};

export type MeetingRow = {
  id: number;
  tipo: MeetingType;
  titulo: string;
  fecha: string;
  horaInicio?: string | null;
  estado: MeetingStatus;
  agenda?: string | null;
  notas?: string | null;
  facilitador?: UserBrief | null;
  realizadaAt?: string | null;
  asistentes: number;
  acuerdos: number;
};

export type MeetingDetail = Omit<MeetingRow, "asistentes" | "acuerdos"> & {
  asistentes: Attendee[];
  acuerdos: Agreement[];
};

export type MyAgreements = { total: number; vencidos: number; acuerdos: Agreement[] };

async function apiFetch<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(buildApiUrl(path), { ...init, headers });
  const text = await res.text();

  if (!res.ok) {
    // El backend explica el porqué (p. ej. "Un acuerdo necesita responsable").
    // Perder ese mensaje y mostrar "HTTP 400" dejaría a quien lo usa sin saber
    // qué corregir.
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.message) {
        message = Array.isArray(json.message) ? json.message.join(", ") : String(json.message);
      }
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  return (text ? JSON.parse(text) : null) as T;
}

// ── Reuniones ─────────────────────────────────────────────────────────────

export const listMeetings = async (
  token: string,
  filters?: { tipo?: string; estado?: string; desde?: string; hasta?: string },
): Promise<MeetingRow[]> => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters ?? {})) if (v) q.set(k, v);
  const suffix = q.toString() ? `?${q}` : "";
  const data = await apiFetch<MeetingRow[]>(`reuniones${suffix}`, token);
  return Array.isArray(data) ? data : [];
};

export const getMeeting = (token: string, id: number) =>
  apiFetch<MeetingDetail>(`reuniones/${id}`, token);

export const createMeeting = (
  token: string,
  body: {
    tipo: MeetingType;
    titulo?: string;
    fecha: string;
    horaInicio?: string;
    agenda?: string;
    asistentes?: number[];
  },
) => apiFetch<MeetingDetail>("reuniones", token, { method: "POST", body: JSON.stringify(body) });

export const updateMeeting = (
  token: string,
  id: number,
  body: Partial<{
    titulo: string;
    fecha: string;
    horaInicio: string;
    agenda: string;
    notas: string;
    estado: MeetingStatus;
  }>,
) => apiFetch<MeetingRow>(`reuniones/${id}`, token, { method: "PATCH", body: JSON.stringify(body) });

export const closeMeeting = (token: string, id: number, notas?: string) =>
  apiFetch<MeetingDetail>(`reuniones/${id}/cerrar`, token, {
    method: "POST",
    body: JSON.stringify({ notas }),
  });

export const setAttendance = (
  token: string,
  id: number,
  asistentes: Array<{ userId: number; asistio: boolean }>,
) =>
  apiFetch<Attendee[]>(`reuniones/${id}/asistencia`, token, {
    method: "PUT",
    body: JSON.stringify({ asistentes }),
  });

// ── Acuerdos, lecciones y riesgos ─────────────────────────────────────────

export const addAgreement = (
  token: string,
  meetingId: number,
  body: {
    tipo?: AgreementKind;
    descripcion: string;
    responsableId?: number | null;
    fechaCompromiso?: string | null;
    activityId?: number | null;
  },
) =>
  apiFetch<Agreement>(`reuniones/${meetingId}/acuerdos`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateAgreement = (
  token: string,
  meetingId: number,
  agreementId: number,
  body: Partial<{
    estado: AgreementStatus;
    descripcion: string;
    responsableId: number | null;
    fechaCompromiso: string | null;
    activityId: number | null;
  }>,
) =>
  apiFetch<Agreement>(`reuniones/${meetingId}/acuerdos/${agreementId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

/** Lo que me toca a mí. Disponible para todo el personal. */
export const listMyAgreements = (token: string) =>
  apiFetch<MyAgreements>("reuniones/mis-acuerdos", token);

/** Avanzar un acuerdo propio; el backend rechaza los ajenos. */
export const updateMyAgreement = (token: string, agreementId: number, estado: AgreementStatus) =>
  apiFetch<Agreement>(`reuniones/mis-acuerdos/${agreementId}`, token, {
    method: "PATCH",
    body: JSON.stringify({ estado }),
  });

export const listOverdueAgreements = (token: string) =>
  apiFetch<{ total: number; acuerdos: Agreement[] }>("reuniones/acuerdos/vencidos", token);

export const listLessons = async (token: string, q?: string): Promise<Agreement[]> => {
  const suffix = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const data = await apiFetch<Agreement[]>(`reuniones/lecciones${suffix}`, token);
  return Array.isArray(data) ? data : [];
};

// ── Presentación ──────────────────────────────────────────────────────────

/**
 * Fecha de una columna `@db.Date`.
 *
 * Llegan como medianoche UTC. Formatearlas con la zona local restaría horas y
 * mostraría el día anterior en México, así que se leen los componentes UTC.
 */
export const formatMeetingDate = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** Valor para un `<input type="date">` a partir de una fecha del backend. */
export const toDateInput = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** Hoy en formato `AAAA-MM-DD`, en el calendario de quien mira. */
export const todayInput = (): string => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** El tipo que toca hoy, para que convocar sea un clic. */
export const suggestedTypeForToday = (at: Date = new Date()): MeetingType => {
  switch (at.getDay()) {
    case 1:
      return "PLANEACION_SEMANAL";
    case 3:
      return "REVISION_AVANCES";
    case 5:
      return "CIERRE_SEMANAL";
    default:
      return "DIARIA";
  }
};
