/**
 * Grabación de juntas con notas en vivo y minuta con IA (`apps/api/src/meetings/grabacion.*`).
 *
 * La web graba en partes de ~1 minuto y las sube conforme salen; el servidor las pasa a texto
 * con nuestro whisper (el audio se borra al transcribirse), toma notas por tramos mientras
 * sigue la junta y, al concluir, escribe la minuta y su PDF. Los tipos espejan `minuta-ia.ts`.
 */
import { buildApiUrl } from "@/lib/api-base";
import { extensionDe } from "@/lib/voz-api";

async function pedir<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.message) message = Array.isArray(json.message) ? json.message.join(", ") : String(json.message);
    } catch {
      if (text) message = text;
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return (text ? JSON.parse(text) : null) as T;
}

export type Prioridad = "alta" | "media" | "baja";
export type EstadoPrevio = "cumplido" | "en_proceso" | "sin_avance" | "bloqueado" | "cancelado" | "sin_mencion";

/** Cómo quedó cada tema de la minuta (desde el 23-10-2026; las minutas anteriores no lo traen). */
export type EstadoTema = "decidido" | "en_seguimiento" | "abierto" | "informativo";

export type ParticipanteMinuta = {
  nombre: string;
  organizacion: string | null;
  rol: string | null;
  persona: { id: number; nombre: string } | null;
};
export type Referencia = { id: number; nombre: string };

export type NotasTramo = {
  temas: Array<{ titulo: string; puntos: string[] }>;
  decisiones: string[];
  acuerdos: Array<{ que: string; responsable: string | null; fecha: string | null; prioridad: Prioridad }>;
  pendientes: string[];
  preguntas: string[];
  riesgos: string[];
  cifras: string[];
  lecciones: string[];
  avancesPrevios: Array<{ ref: string; estado: EstadoPrevio; detalle: string }>;
};

export type NotasGuardadas = {
  desde: number;
  hasta: number;
  inicioMs: number | null;
  finMs: number | null;
  palabras: number;
  notas: NotasTramo;
};

export type AcuerdoMinuta = {
  descripcion: string;
  textoResponsable: string | null;
  responsable: Referencia | null;
  responsableCandidatos: Referencia[];
  fechaCompromiso: string | null;
  prioridad: Prioridad;
};

export type Minuta = {
  tituloSugerido: string | null;
  /** Con quién y para qué fue la junta. Desde el 23-10-2026, como organizaciones, participantes y estado por tema. */
  descripcion?: string | null;
  tipoSugerido?: string | null;
  organizaciones?: string[];
  participantes?: ParticipanteMinuta[];
  resumenEjecutivo: string;
  loMasImportante: string[];
  temas: Array<{ titulo: string; resumen: string; puntos: string[]; conclusion: string | null; estado?: EstadoTema }>;
  decisiones: string[];
  acuerdos: AcuerdoMinuta[];
  pendientes: string[];
  preguntasAbiertas: string[];
  riesgos: Array<{ riesgo: string; mitigacion: string | null }>;
  cifras: Array<{ dato: string; contexto: string }>;
  proximosPasos: string[];
  lecciones: string[];
  seguimiento: Array<{ ref: string; agreementId: number | null; acuerdo: string; responsable: string | null; estado: EstadoPrevio; detalle: string | null }>;
  reunionAnterior: { id: number; titulo: string; fecha: string } | null;
  fuente: "transcripcion" | "notas";
};

export type EstadoGrabacion =
  | { disponible: boolean; existe: false }
  | {
      disponible: boolean;
      existe: true;
      estado: "GRABANDO" | "CONCLUYENDO" | "LISTA" | "ERROR";
      iniciadaAt: string;
      concluidaAt: string | null;
      total: number;
      listas: number;
      pendientes: number;
      conError: number;
      ultima: number;
      duracionMs: number;
      palabras: number;
      totalNotas: number;
      notasDesde: number;
      notas: NotasGuardadas[];
      minuta: Minuta | null;
      minutaAt: string | null;
      error: string | null;
      usdIa: number;
      acuerdosConfirmadosAt: string | null;
      /** Solo si se pidió `textoDesde`: texto de whisper de las partes nuevas. */
      textos?: Array<{ parte: number; inicioMs: number | null; duracionMs: number | null; texto: string }>;
    };

export type GrabacionExistente = Extract<EstadoGrabacion, { existe: true }>;

const base = (id: number) => `grabaciones-reuniones/${id}`;

export function subirParte(token: string, meetingId: number, parte: number, meta: { inicioMs: number; duracionMs: number }, audio: Blob) {
  const form = new FormData();
  form.append("parte", String(parte));
  form.append("inicioMs", String(Math.round(meta.inicioMs)));
  form.append("duracionMs", String(Math.round(meta.duracionMs)));
  form.append("audio", audio, `parte-${parte}.${extensionDe(audio.type)}`);
  return pedir<{ ok: boolean; parte: number }>(token, `${base(meetingId)}/partes`, { method: "POST", body: form });
}

export const estadoGrabacion = (token: string, meetingId: number, notasDesde = 0, textoDesde?: number) => {
  const q = new URLSearchParams();
  if (notasDesde) q.set("notasDesde", String(notasDesde));
  if (textoDesde !== undefined) q.set("textoDesde", String(textoDesde));
  const qs = q.toString();
  return pedir<EstadoGrabacion>(token, `${base(meetingId)}${qs ? `?${qs}` : ""}`);
};

export const concluirGrabacion = (token: string, meetingId: number) =>
  pedir<EstadoGrabacion>(token, `${base(meetingId)}/concluir`, { method: "POST" });

export const regenerarMinuta = (token: string, meetingId: number) =>
  pedir<EstadoGrabacion>(token, `${base(meetingId)}/regenerar`, { method: "POST" });

export const minutaDesdeTexto = (token: string, meetingId: number, texto: string) =>
  pedir<EstadoGrabacion>(token, `${base(meetingId)}/texto`, { method: "POST", body: JSON.stringify({ texto }) });

export const transcripcionGrabacion = (token: string, meetingId: number) =>
  pedir<{ texto: string }>(token, `${base(meetingId)}/transcripcion`);

export const borrarGrabacion = (token: string, meetingId: number) =>
  pedir<{ ok: boolean }>(token, base(meetingId), { method: "DELETE" });

export const enviarMinuta = (token: string, meetingId: number) =>
  pedir<{ enviados: number }>(token, `${base(meetingId)}/enviar`, { method: "POST" });

export type AcuerdoParaGuardar = {
  tipo: "ACUERDO" | "LECCION" | "RIESGO";
  descripcion: string;
  responsableId: number | null;
  fechaCompromiso: string | null;
  prioridad?: Prioridad;
  crearActividad: boolean;
};

export const confirmarAcuerdos = (token: string, meetingId: number, acuerdos: AcuerdoParaGuardar[]) =>
  pedir<{ guardados: number; actividades: number; errores: string[] }>(token, `${base(meetingId)}/acuerdos`, {
    method: "POST",
    body: JSON.stringify({ acuerdos }),
  });

/** Lo que va en una tarjeta de propuesta: acuerdos, lecciones y riesgos de la minuta. */
export type Propuesta = {
  incluir: boolean;
  tipo: AcuerdoParaGuardar["tipo"];
  descripcion: string;
  responsableId: string;
  fechaCompromiso: string;
  prioridad: Prioridad;
  crearActividad: boolean;
  textoResponsable: string | null;
  candidatos: Referencia[];
};

/** Acuerdos marcados (y con actividad); lecciones y riesgos se ofrecen sin marcar. */
export function propuestasDe(m: Minuta): Propuesta[] {
  return [
    ...m.acuerdos.map((a) => ({
      incluir: true,
      tipo: "ACUERDO" as const,
      descripcion: a.descripcion,
      responsableId: a.responsable ? String(a.responsable.id) : "",
      fechaCompromiso: a.fechaCompromiso ?? "",
      prioridad: a.prioridad,
      crearActividad: true,
      textoResponsable: a.textoResponsable,
      candidatos: a.responsableCandidatos,
    })),
    ...m.lecciones.map((l) => ({ ...vacia, tipo: "LECCION" as const, descripcion: l })),
    ...m.riesgos.map((r) => ({ ...vacia, tipo: "RIESGO" as const, descripcion: r.mitigacion ? `${r.riesgo} (mitigación: ${r.mitigacion})` : r.riesgo })),
  ];
}

const vacia: Omit<Propuesta, "tipo" | "descripcion"> = {
  incluir: false,
  responsableId: "",
  fechaCompromiso: "",
  prioridad: "media",
  crearActividad: false,
  textoResponsable: null,
  candidatos: [],
};

/** Un acuerdo marcado necesita responsable (regla del API); lección y riesgo no. */
export const faltaResponsable = (p: Propuesta) => p.incluir && p.tipo === "ACUERDO" && !p.responsableId;

export function cuerposParaGuardar(lista: Propuesta[]): AcuerdoParaGuardar[] {
  return lista
    .filter((p) => p.incluir && p.descripcion.trim() && !faltaResponsable(p))
    .map((p) => {
      const acuerdo = p.tipo === "ACUERDO";
      return {
        tipo: p.tipo,
        descripcion: p.descripcion.trim(),
        responsableId: acuerdo && p.responsableId ? Number(p.responsableId) : null,
        fechaCompromiso: acuerdo && p.fechaCompromiso ? p.fechaCompromiso : null,
        prioridad: p.prioridad,
        crearActividad: acuerdo && Boolean(p.responsableId) && p.crearActividad,
      };
    });
}

/** Junta notas parciales nuevas a las que ya se tienen (la API manda solo las nuevas). */
export function juntarNotas(previas: NotasGuardadas[], nuevas: NotasGuardadas[], desde: number): NotasGuardadas[] {
  return [...previas.slice(0, desde), ...nuevas];
}

export const PRIORIDAD_LABEL: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" };

export const ESTADO_TEMA_LABEL: Record<EstadoTema, string> = {
  decidido: "Decidido",
  en_seguimiento: "En seguimiento",
  abierto: "Abierto",
  informativo: "Informativo",
};

export const ESTADO_PREVIO_LABEL: Record<EstadoPrevio, string> = {
  cumplido: "Cumplido",
  en_proceso: "En proceso",
  sin_avance: "Sin avance",
  bloqueado: "Bloqueado",
  cancelado: "Cancelado",
  sin_mencion: "No se mencionó",
};
