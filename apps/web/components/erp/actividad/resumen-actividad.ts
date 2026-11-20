import { agruparCampos, resumenGrupos } from "@/lib/evidencia-grupos";
import { subtipoTareaVista, ACTIVITY_KINDS, type ActivityKind } from "@/lib/activity-kinds";
import {
  evaluarSemaforoActividad,
  textoChipSemaforo,
  formatoMinutos,
  normalizarPrioridad,
  PRIORIDAD_UI,
  type Semaforo,
  type Prioridad,
} from "@/lib/actividad-tiempos";

export type ResumenLinea = {
  texto: string;
  href?: string;
  tono?: "neutral" | "danger" | "warning" | "success" | "brand" | "outline";
};

export type BloqueResumen = {
  id: "que" | "paraQuien" | "porQue" | "quien" | "cuando";
  etiqueta: string;
  titulo: string;
  /** Href opcional del título (cliente, cotización). */
  href?: string;
  /** Color del título (p. ej. tipo de servicio en POR QUÉ). */
  tono?: ResumenLinea["tono"];
  lineas: ResumenLinea[];
};

export type CabeceraResumen = {
  prioridad: { clave: Prioridad; label: string } | null;
  tiempo: { semaforo: Semaforo; chip: string; reloj: string | null } | null;
};

export type ResumenActividadVista = {
  bloques: BloqueResumen[];
  cabecera: CabeceraResumen;
};

export type CamposResumenInput = Array<{
  nombre: string;
  momentos: string[];
  notas?: string | null;
}>;

export type ActividadResumenInput = {
  titulo?: string | null;
  coreKind?: string | null;
  ticketType?: string | null;
  ticketTypeCustom?: string | null;
  workType?: string | null;
  prioridad?: string | null;
  estatus?: string | null;
  client?: {
    id?: number;
    name?: string | null;
    salesClients?: Array<{ id: number; name?: string }> | null;
  } | null;
  project?: { id: number; title: string } | null;
  projectMilestone?: { id: number; name: string } | null;
  branchName?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  branchAddress?: string | null;
  responsable?: { id?: number; nombre?: string | null } | null;
  creador?: { id?: number; nombre?: string | null } | null;
  assignees?: Array<{
    rol?: string | null;
    retiradoAt?: string | null;
    userId?: number | null;
    user?: { id?: number; nombre?: string | null } | null;
  }> | null;
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaMaxima?: string | null;
  fechaFinalizacion?: string | null;
  tiempoEstandarMin?: number | null;
  minutosPlan?: number | null;
  minutosAtraso?: number | null;
  minutosParaVencer?: number | null;
  motivoSemaforo?: "inicio" | "tope" | "plan" | null;
  semaforo?: Semaforo | null;
  inicioRealAt?: string | null;
  finRealAt?: string | null;
  periodo?: { etiqueta?: string | null; estado?: string | null } | null;
  cotizacion?: { id: number; quoteNumber: string; status?: string | null } | null;
};

export type ArmarResumenOpts = {
  activity: ActividadResumenInput;
  camposEvidencia?: CamposResumenInput | null;
  baseErp?: string;
  ahora?: Date;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

export function formatFechaCorta(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MESES[d.getMonth()]}, ${hh}:${mm}`;
}

export function labelTipoServicio(
  ticketType?: string | null,
): { label: string; tono: NonNullable<ResumenLinea["tono"]> } {
  const t = String(ticketType ?? "")
    .trim()
    .toUpperCase();
  if (t === "CORRECTIVO" || t === "FALLA") return { label: "Falla (correctivo)", tono: "danger" };
  if (t === "PREVENTIVO") return { label: "Preventivo", tono: "success" };
  if (t === "INSTALACION") return { label: "Instalación", tono: "brand" };
  if (t === "EMERGENCIA" || t === "GARANTIA") return { label: "Garantía / emergencia", tono: "warning" };
  if (t) return { label: String(ticketType).trim(), tono: "neutral" };
  return { label: "Servicio", tono: "neutral" };
}

function kindOf(coreKind?: string | null): ActivityKind | null {
  const k = String(coreKind ?? "").toLowerCase();
  return k in ACTIVITY_KINDS ? (k as ActivityKind) : null;
}

function sitioDe(act: ActividadResumenInput): string | null {
  const joined = [act.branchName, act.branchCity, act.branchState].filter(Boolean).join(" · ");
  return joined || act.branchAddress || null;
}

function idDeAssignee(
  a: NonNullable<ActividadResumenInput["assignees"]>[number],
): number | null {
  const id = a.user?.id ?? a.userId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export function contarAyudantes(act: ActividadResumenInput): number {
  const respId = act.responsable?.id ?? null;
  return (act.assignees ?? []).filter((a) => {
    if (a.retiradoAt) return false;
    if (a.rol === "LEAD") return false;
    const id = idDeAssignee(a);
    if (id == null) return Boolean(a.user?.nombre);
    if (respId != null && id === respId) return false;
    return true;
  }).length;
}

function quienRevisa(act: ActividadResumenInput): string | null {
  const respId = act.responsable?.id ?? null;
  const lead = (act.assignees ?? []).find((a) => !a.retiradoAt && a.rol === "LEAD");
  if (!lead?.user?.nombre) return null;
  const leadId = idDeAssignee(lead);
  if (respId != null && leadId === respId) return null;
  return lead.user.nombre;
}

function queSubtitulo(
  act: ActividadResumenInput,
  campos?: CamposResumenInput | null,
): string | null {
  if (campos && campos.length > 0) {
    const texto = resumenGrupos(agruparCampos(campos));
    return texto || null;
  }
  const kind = kindOf(act.coreKind);
  if (kind === "tarea") {
    const vista = subtipoTareaVista(act.ticketTypeCustom);
    return vista.label || null;
  }
  if (kind === "servicio") return labelTipoServicio(act.ticketType).label;
  if (kind === "administrativa") return ACTIVITY_KINDS.administrativa.title;
  if (kind) return ACTIVITY_KINDS[kind].title;
  return act.ticketTypeCustom || act.ticketType || null;
}

function estaCerrada(estatus?: string | null): boolean {
  return /finalizada|completada|cancelada|aprobada|no cumplida|incumplida/i.test(estatus ?? "");
}

function cabeceraDe(act: ActividadResumenInput, ahora: Date): CabeceraResumen {
  const prioridad = act.prioridad
    ? {
        clave: normalizarPrioridad(act.prioridad),
        label: PRIORIDAD_UI[normalizarPrioridad(act.prioridad)].label,
      }
    : null;

  if (estaCerrada(act.estatus)) return { prioridad, tiempo: null };

  const evaluado = evaluarSemaforoActividad({
    fechaInicio: act.fechaInicio,
    fechaMaxima: act.fechaMaxima,
    fechaEntregaEsperada: act.fechaEntregaEsperada,
    inicioRealAt: act.inicioRealAt,
    finRealAt: act.finRealAt,
    estatus: act.estatus,
    periodoEstado: act.periodo?.estado,
    ahora,
  });

  const semaforo = act.semaforo ?? evaluado.semaforo;
  const minutosAtraso = act.minutosAtraso ?? evaluado.minutosAtraso;
  const minutosParaVencer = act.minutosParaVencer ?? evaluado.minutosParaVencer;
  const motivo = act.motivoSemaforo ?? evaluado.motivo;
  const chip = textoChipSemaforo(semaforo, minutosAtraso, minutosParaVencer, motivo);

  let reloj: string | null = null;
  if (minutosAtraso != null && minutosAtraso > 0) {
    const t = formatoMinutos(minutosAtraso);
    reloj = t ? `Retraso · ${t}` : null;
  } else if (minutosParaVencer != null && minutosParaVencer >= 0) {
    const t = formatoMinutos(minutosParaVencer);
    reloj = t ? `Faltan · ${t}` : null;
  }

  return { prioridad, tiempo: { semaforo, chip, reloj } };
}

export function armarResumenActividad(opts: ArmarResumenOpts): ResumenActividadVista {
  const baseErp = opts.baseErp ?? "/erp";
  const ahora = opts.ahora ?? new Date();
  const act = opts.activity;
  const campos = opts.camposEvidencia ?? null;

  const queLineas: ResumenLinea[] = [];
  const sub = queSubtitulo(act, campos);
  if (sub) queLineas.push({ texto: sub });

  const paraQuienLineas: ResumenLinea[] = [];
  if (act.project?.id) {
    paraQuienLineas.push({
      texto: act.project.title,
      href: `${baseErp}/proyectos/${act.project.id}`,
    });
  }
  const sitio = sitioDe(act);
  if (sitio) paraQuienLineas.push({ texto: sitio });
  const salesId = act.client?.salesClients?.[0]?.id;

  let porQue: BloqueResumen;
  if (act.cotizacion?.id) {
    const lineas: ResumenLinea[] = [];
    if (act.cotizacion.status) lineas.push({ texto: String(act.cotizacion.status) });
    if (act.projectMilestone?.name) lineas.push({ texto: `Etapa · ${act.projectMilestone.name}` });
    porQue = {
      id: "porQue",
      etiqueta: "POR QUÉ",
      titulo: act.cotizacion.quoteNumber,
      href: `${baseErp}/cotizaciones/${act.cotizacion.id}`,
      lineas,
    };
  } else if (act.projectMilestone?.name) {
    porQue = {
      id: "porQue",
      etiqueta: "POR QUÉ",
      titulo: act.projectMilestone.name,
      lineas: [],
    };
  } else if (kindOf(act.coreKind) === "servicio") {
    const tipo = labelTipoServicio(act.ticketType);
    porQue = {
      id: "porQue",
      etiqueta: "POR QUÉ",
      titulo: tipo.label,
      tono: tipo.tono,
      lineas: [],
    };
  } else if (act.creador?.nombre) {
    porQue = {
      id: "porQue",
      etiqueta: "POR QUÉ",
      titulo: `Asignada por ${act.creador.nombre}`,
      lineas: [],
    };
  } else {
    porQue = { id: "porQue", etiqueta: "POR QUÉ", titulo: "—", lineas: [] };
  }

  const quienLineas: ResumenLinea[] = [];
  const nAyuda = contarAyudantes(act);
  if (nAyuda > 0) {
    quienLineas.push({ texto: nAyuda === 1 ? "1 ayudante" : `${nAyuda} ayudantes` });
  }
  const revisa = quienRevisa(act);
  if (revisa) quienLineas.push({ texto: `Revisa · ${revisa}` });

  const cuandoLineas: ResumenLinea[] = [];
  const inicio = formatFechaCorta(act.fechaInicio);
  const fin = formatFechaCorta(act.fechaMaxima ?? act.fechaEntregaEsperada);
  let cuandoTitulo = "—";
  if (act.periodo?.etiqueta) cuandoTitulo = act.periodo.etiqueta;
  else if (inicio && fin) cuandoTitulo = `${inicio} – ${fin}`;
  else if (inicio) cuandoTitulo = `Inicio · ${inicio}`;
  else if (fin) cuandoTitulo = `Fin · ${fin}`;

  const estandar = formatoMinutos(act.tiempoEstandarMin ?? act.minutosPlan);
  if (estandar) cuandoLineas.push({ texto: `Tiempo estándar · ${estandar}` });
  const entrega = formatFechaCorta(act.fechaEntregaEsperada);
  if (entrega) cuandoLineas.push({ texto: `Entrega a más tardar · ${entrega}` });

  return {
    bloques: [
      {
        id: "que",
        etiqueta: "QUÉ",
        titulo: act.titulo?.trim() || "—",
        lineas: queLineas,
      },
      {
        id: "paraQuien",
        etiqueta: "PARA QUIÉN",
        titulo: act.client?.name?.trim() || "—",
        href: salesId ? `${baseErp}/clientes/${salesId}` : undefined,
        lineas: paraQuienLineas,
      },
      porQue,
      {
        id: "quien",
        etiqueta: "QUIÉN",
        titulo: act.responsable?.nombre?.trim() || "—",
        lineas: quienLineas,
      },
      {
        id: "cuando",
        etiqueta: "CUÁNDO",
        titulo: cuandoTitulo,
        lineas: cuandoLineas,
      },
    ],
    cabecera: cabeceraDe(act, ahora),
  };
}
