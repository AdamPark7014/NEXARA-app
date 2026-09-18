/**
 * Borrador del asistente «Nuevo proyecto»: qué falta en cada paso y cómo se convierte en el
 * único POST que crea el proyecto completo.
 *
 * Vive fuera de la página para poder probarlo: las reglas copian lo que la API rechaza
 * (título y renglones de al menos 3 letras, fin después del inicio) para decirlo antes de
 * mandar nada, y el armado descarta los renglones que quedaron vacíos.
 */
import type {
  CrearProyecto,
  RolEquipo,
  TipoAlcance,
} from "@/lib/proyectos-api";
import { diaDe } from "@/lib/proyecto-plan";

export type EtapaBorrador = { clave: string; name: string; plannedDate: string; responsableId: string };
export type AlcanceBorrador = { clave: string; kind: TipoAlcance; titulo: string; detalle: string };
export type RequerimientoBorrador = { clave: string; titulo: string; responsableId: string; dueDate: string };
export type MiembroBorrador = { clave: string; userId: string; role: RolEquipo; notas: string };

export type BorradorProyecto = {
  // Datos
  title: string;
  clienteId: string;
  projectType: string;
  siteCount: string;
  description: string;
  objective: string;
  // Fechas y presupuesto
  startDate: string;
  endDate: string;
  budget: string;
  currency: string;
  cotizacionId: string;
  importarAlcance: boolean;
  responsableId: string;
  // Colecciones
  etapas: EtapaBorrador[];
  scopeSummary: string;
  alcance: AlcanceBorrador[];
  requerimientos: RequerimientoBorrador[];
  equipo: MiembroBorrador[];
};

export const PASOS_ALTA = [
  { id: "datos", titulo: "Datos" },
  { id: "fechas", titulo: "Fechas y presupuesto" },
  { id: "cronograma", titulo: "Cronograma" },
  { id: "alcance", titulo: "Alcance" },
  { id: "requerimientos", titulo: "Requerimientos" },
  { id: "equipo", titulo: "Equipo" },
  { id: "revisar", titulo: "Revisar y crear" },
] as const;

export type PasoAlta = (typeof PASOS_ALTA)[number]["id"];

export function borradorVacio(hoy: string, responsableId: string): BorradorProyecto {
  return {
    title: "",
    clienteId: "",
    projectType: "OTRO",
    siteCount: "",
    description: "",
    objective: "",
    startDate: hoy,
    endDate: "",
    budget: "",
    currency: "MXN",
    cotizacionId: "",
    importarAlcance: true,
    responsableId,
    etapas: [],
    scopeSummary: "",
    alcance: [],
    requerimientos: [],
    equipo: [],
  };
}

/** «150,000.50» → 150000.5; `null` si está vacío; `NaN` si no es un número. */
export function leerImporte(texto: string): number | null {
  const limpio = texto.replace(/[\s,$]/g, "");
  if (!limpio) return null;
  return Number(limpio);
}

const corto = (texto: string) => texto.trim().length > 0 && texto.trim().length < 3;

/** Lo que impide avanzar en cada paso, en frases que se entiendan. Vacío = listo. */
export function erroresDelPaso(paso: PasoAlta, b: BorradorProyecto): string[] {
  const errores: string[] = [];
  switch (paso) {
    case "datos": {
      if (b.title.trim().length < 3) errores.push("Escribe el nombre del proyecto (al menos 3 letras).");
      if (!b.clienteId) errores.push("Elige el cliente.");
      if (b.siteCount.trim()) {
        const n = Number(b.siteCount);
        if (!Number.isInteger(n) || n < 0) errores.push("El número de sitios debe ser un número entero.");
      }
      break;
    }
    case "fechas": {
      const inicio = diaDe(b.startDate);
      const fin = diaDe(b.endDate);
      if (inicio === null) errores.push("Pon la fecha de inicio planeada.");
      if (inicio !== null && fin !== null && fin < inicio) {
        errores.push("El fin planeado no puede ser antes del inicio.");
      }
      const importe = leerImporte(b.budget);
      if (importe !== null && (!Number.isFinite(importe) || importe < 0)) {
        errores.push("El presupuesto debe ser una cantidad (sin letras).");
      }
      if (!b.responsableId) errores.push("Elige quién es el responsable del proyecto.");
      break;
    }
    case "cronograma": {
      for (const e of b.etapas) {
        if (corto(e.name)) errores.push(`La etapa «${e.name.trim()}» necesita un nombre de al menos 3 letras.`);
        if (!e.name.trim() && (e.plannedDate || e.responsableId)) {
          errores.push("Hay una etapa con fecha o responsable pero sin nombre.");
        }
      }
      break;
    }
    case "alcance": {
      for (const a of b.alcance) {
        if (corto(a.titulo)) errores.push(`«${a.titulo.trim()}» es muy corto: usa al menos 3 letras.`);
      }
      break;
    }
    case "requerimientos": {
      for (const r of b.requerimientos) {
        if (corto(r.titulo)) errores.push(`El requerimiento «${r.titulo.trim()}» necesita al menos 3 letras.`);
      }
      break;
    }
    case "equipo":
    case "revisar":
      break;
  }
  return errores;
}

/** Todos los errores del borrador, para el último paso. */
export function erroresDelBorrador(b: BorradorProyecto): string[] {
  return PASOS_ALTA.flatMap((p) => erroresDelPaso(p.id, b));
}

const entero = (texto: string): number | undefined => {
  const n = Number(texto);
  return texto.trim() && Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * El cuerpo del POST `/proyectos`. `clientId` es el del cliente de operación (el que usa la
 * API), que la página resuelve aparte porque puede requerir activarlo primero.
 */
export function cuerpoDeAlta(b: BorradorProyecto, clientId: number): CrearProyecto {
  const responsableId = entero(b.responsableId);
  const importe = leerImporte(b.budget);
  const cotizacionId = entero(b.cotizacionId);
  const sitios = b.siteCount.trim() ? Number(b.siteCount) : undefined;

  const etapas = b.etapas
    .filter((e) => e.name.trim())
    .map((e, i) => ({
      name: e.name.trim(),
      plannedDate: e.plannedDate || null,
      responsableId: entero(e.responsableId) ?? null,
      orden: i,
    }));

  const alcance = b.alcance
    .filter((a) => a.titulo.trim())
    .map((a, i) => ({
      kind: a.kind,
      titulo: a.titulo.trim(),
      ...(a.detalle.trim() ? { detalle: a.detalle.trim() } : {}),
      orden: i,
    }));

  const requerimientos = b.requerimientos
    .filter((r) => r.titulo.trim())
    .map((r, i) => ({
      titulo: r.titulo.trim(),
      responsableId: entero(r.responsableId) ?? null,
      dueDate: r.dueDate || null,
      orden: i,
    }));

  // El responsable ya entra solo al equipo; una persona, una vez.
  const vistos = new Set<number>(responsableId ? [responsableId] : []);
  const equipo = b.equipo.flatMap((m) => {
    const userId = entero(m.userId);
    if (!userId || vistos.has(userId)) return [];
    vistos.add(userId);
    return [{ userId, role: m.role, ...(m.notas.trim() ? { notas: m.notas.trim() } : {}) }];
  });

  return {
    title: b.title.trim(),
    clientId,
    ...(responsableId ? { responsableId } : {}),
    projectType: b.projectType || "OTRO",
    ...(b.description.trim() ? { description: b.description.trim() } : {}),
    ...(b.objective.trim() ? { objective: b.objective.trim() } : {}),
    ...(b.scopeSummary.trim() ? { scopeSummary: b.scopeSummary.trim() } : {}),
    ...(sitios !== undefined && Number.isInteger(sitios) && sitios >= 0 ? { siteCount: sitios } : {}),
    startDate: b.startDate,
    ...(b.endDate ? { endDate: b.endDate } : {}),
    ...(importe !== null && Number.isFinite(importe) ? { budgetAmount: importe } : {}),
    currency: (b.currency || "MXN").toUpperCase(),
    ...(cotizacionId ? { cotizacionId, importarAlcanceDeCotizacion: b.importarAlcance } : {}),
    milestones: etapas,
    scopeItems: alcance,
    requirements: requerimientos,
    members: equipo,
  };
}

/** Etapas típicas de un proyecto de integración, para no empezar en blanco. */
export const ETAPAS_SUGERIDAS = [
  "Levantamiento en sitio",
  "Ingeniería y compras",
  "Instalación",
  "Pruebas y puesta en marcha",
  "Entrega y capacitación",
];

/** Requerimientos que casi todo proyecto necesita antes de arrancar. */
export const REQUERIMIENTOS_SUGERIDOS = [
  "Orden de compra o contrato firmado",
  "Anticipo recibido",
  "Planos o croquis del sitio",
  "Permiso de acceso al sitio",
  "Contacto del cliente en sitio",
];
