/**
 * Completitud del proyecto: ficha mínima → plan → listo para cerrar.
 *
 * Módulo puro (sin Prisma). El avance/salud viven en proyecto-salud.ts;
 * aquí solo se dice qué falta para que el proyecto cuente.
 */
import { isClosedStatus } from '../activities/activity-status.js';

export type NivelCompletitud = 'FICHA' | 'PLAN' | 'LISTO';

export type FaltanteProyecto = {
  clave: string;
  etiqueta: string;
  ayuda: string;
};

export type ResultadoCompletitud = {
  completo: boolean;
  faltantes: FaltanteProyecto[];
  /** Nivel en el que aún hay trabajo: FICHA si falta lo básico, PLAN si falta plan, LISTO si falta cierre. */
  nivel: NivelCompletitud;
  fichaOk: boolean;
  planOk: boolean;
  listoOk: boolean;
};

export type EntradaCompletitud = {
  title?: string | null;
  clientName?: string | null;
  clientDeletedAt?: Date | string | null;
  clientId?: number | null;
  clientEsRelleno?: boolean;
  projectType?: string | null;
  description?: string | null;
  responsableId?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  objective?: string | null;
  scopeSummary?: string | null;
  scopeItems?: Array<{ kind?: string | null }>;
  milestones?: Array<{ plannedDate?: Date | string | null; status?: string | null }>;
  activities?: Array<{ estatus?: string | null }>;
  documents?: Array<{ kind?: string | null; tipo?: string | null; name?: string | null; nombre?: string | null; titulo?: string | null }>;
};

const STOP = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'un', 'una', 'para', 'con', 'por', 'al', 'lo',
]);

const SUFIJO_SOCIETARIO =
  /\b(s\.?\s*a\.?\s*de\s*c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?(?:\s*de\s*c\.?\s*v\.?)?|s\.?\s*a\.?\s*p\.?\s*i\.?|s\.?\s*c\.?|s\.?\s*a\.?)\b/gi;

function aFecha(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diaKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Texto comparable: sin acentos, minúsculas, sin razón social. */
export function normalizarTexto(s: string | null | undefined): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(SUFIJO_SOCIETARIO, ' ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function palabrasConSignificado(s: string | null | undefined): string[] {
  return normalizarTexto(s)
    .split(' ')
    .filter((p) => p.length > 0 && !STOP.has(p));
}

/**
 * ¿El título es solo el nombre del cliente (o casi)?
 * Falla también si tiene menos de 3 palabras o menos de 12 caracteres.
 */
export function nombreEsSoloCliente(
  titulo: string | null | undefined,
  nombreCliente: string | null | undefined,
): boolean {
  const crudo = String(titulo || '').replace(/\s+/g, ' ').trim();
  if (crudo.length < 12) return true;
  const palabras = crudo.split(' ').filter(Boolean);
  if (palabras.length < 3) return true;

  const cliente = palabrasConSignificado(nombreCliente);
  if (!cliente.length) return false;

  const resto = palabrasConSignificado(titulo).filter((p) => !cliente.includes(p));
  return resto.length < 2;
}

function faltante(clave: string, etiqueta: string, ayuda: string): FaltanteProyecto {
  return { clave, etiqueta, ayuda };
}

function faltantesFicha(e: EntradaCompletitud): FaltanteProyecto[] {
  const out: FaltanteProyecto[] = [];
  const titulo = String(e.title || '').replace(/\s+/g, ' ').trim();
  if (!titulo || nombreEsSoloCliente(titulo, e.clientName)) {
    out.push(
      faltante(
        'nombre_descriptivo',
        'Nombre descriptivo',
        'Di qué se hace y dónde: “Instalación de cámaras Anfora”, “Actualización de equipo CCTV IPADE”.',
      ),
    );
  }

  const clienteOk =
    Number.isFinite(Number(e.clientId)) &&
    Number(e.clientId) > 0 &&
    !e.clientDeletedAt &&
    !e.clientEsRelleno;
  if (!clienteOk) {
    out.push(faltante('cliente_valido', 'Cliente válido', 'Elige un cliente real del padrón.'));
  }

  const tipo = String(e.projectType || 'OTRO').toUpperCase();
  const desc = String(e.description || '').trim();
  if (tipo === 'OTRO' && !desc) {
    out.push(
      faltante('tipo', 'Tipo de proyecto', 'Elige el tipo de proyecto o describe qué es (OTRO).'),
    );
  }

  if (!e.responsableId || !Number.isFinite(Number(e.responsableId)) || Number(e.responsableId) <= 0) {
    out.push(faltante('responsable', 'Responsable', 'Asigna quién responde por el proyecto.'));
  }

  const inicio = aFecha(e.startDate);
  const fin = aFecha(e.endDate);
  if (!inicio) {
    out.push(faltante('fecha_inicio', 'Fecha de inicio', 'Pon la fecha de inicio planeada.'));
  }
  if (!fin) {
    out.push(faltante('fecha_fin', 'Fecha de fin', 'Pon la fecha de fin planeada.'));
  } else if (inicio && diaKey(fin) < diaKey(inicio)) {
    out.push(
      faltante('fecha_fin', 'Fecha de fin', 'La fecha de fin no puede ser anterior al inicio.'),
    );
  }

  return out;
}

function faltantesPlan(e: EntradaCompletitud): FaltanteProyecto[] {
  const out: FaltanteProyecto[] = [];
  const objetivo = String(e.objective || '').trim();
  const resumen = String(e.scopeSummary || '').trim();
  const entregables = (e.scopeItems ?? []).filter((s) => {
    const kind = String(s?.kind || 'ENTREGABLE').toUpperCase();
    return kind === 'ENTREGABLE' || !s?.kind;
  });
  if ((!objetivo && !resumen) || entregables.length < 1) {
    out.push(
      faltante(
        'alcance',
        'Objetivo y entregable',
        'Define el objetivo o un resumen de alcance y al menos un entregable.',
      ),
    );
  }

  const inicio = aFecha(e.startDate);
  const fin = aFecha(e.endDate);
  const hitosEnRango = (e.milestones ?? []).filter((h) => {
    const p = aFecha(h?.plannedDate);
    if (!p || !inicio || !fin) return false;
    const k = diaKey(p);
    return k >= diaKey(inicio) && k <= diaKey(fin);
  });
  if (hitosEnRango.length < 2) {
    out.push(
      faltante(
        'cronograma',
        'Cronograma',
        'Agrega al menos 2 hitos del cronograma con fecha dentro del proyecto.',
      ),
    );
  }

  if ((e.activities ?? []).length < 1) {
    out.push(faltante('actividad', 'Actividad ligada', 'Liga al menos una actividad al proyecto.'));
  }

  return out;
}

function faltantesListo(e: EntradaCompletitud): FaltanteProyecto[] {
  const out: FaltanteProyecto[] = [];
  const acts = e.activities ?? [];
  const hitos = e.milestones ?? [];
  const actsCerradas = acts.length > 0 && acts.every((a) => isClosedStatus(a?.estatus));
  const hitosCerrados =
    hitos.length === 0 ||
    hitos.every((h) => {
      const st = String(h?.status || '').toUpperCase();
      return st === 'CUMPLIDO' || st === 'CANCELADO';
    });
  if (!actsCerradas || !hitosCerrados || acts.length < 1) {
    out.push(
      faltante(
        'trabajo_cerrado',
        'Trabajo cerrado',
        'Cierra todas las actividades y marca los hitos cumplidos o cancelados.',
      ),
    );
  }

  const ACTA = /\b(acta|entrega|cierre|acceptance)\b/i;
  const tieneActa = (e.documents ?? []).some((d) => {
    if (String(d?.kind || '').toUpperCase() === 'ACTA') return true;
    const blob = [d?.kind, d?.tipo, d?.name, d?.nombre, d?.titulo].filter(Boolean).join(' ');
    return ACTA.test(blob);
  });
  if (!tieneActa) {
    out.push(
      faltante('acta', 'Acta de entrega', 'Sube el acta o documento de entrega.'),
    );
  }

  return out;
}

export function evaluarCompletitud(entrada: EntradaCompletitud): ResultadoCompletitud {
  const ficha = faltantesFicha(entrada);
  const plan = faltantesPlan(entrada);
  const listo = faltantesListo(entrada);
  const fichaOk = ficha.length === 0;
  const planOk = fichaOk && plan.length === 0;
  const listoOk = planOk && listo.length === 0;

  const faltantes = [...ficha, ...(fichaOk ? plan : []), ...(planOk ? listo : [])];
  // Para la UI del banner conviene ver también los del siguiente nivel:
  const todos = [...ficha, ...plan, ...listo];

  let nivel: NivelCompletitud = 'LISTO';
  if (!fichaOk) nivel = 'FICHA';
  else if (!planOk) nivel = 'PLAN';
  else nivel = 'LISTO';

  return {
    completo: listoOk,
    faltantes: todos.length ? todos : faltantes,
    nivel,
    fichaOk,
    planOk,
    listoOk,
  };
}

/** «falta fecha de fin, responsable y cronograma» */
export function mensajeFaltantes(faltantes: FaltanteProyecto[]): string {
  const etiquetas = faltantes.map((f) => f.etiqueta.toLowerCase());
  if (!etiquetas.length) return '';
  if (etiquetas.length === 1) return `falta ${etiquetas[0]}`;
  if (etiquetas.length === 2) return `falta ${etiquetas[0]} y ${etiquetas[1]}`;
  const ultimo = etiquetas[etiquetas.length - 1];
  return `falta ${etiquetas.slice(0, -1).join(', ')} y ${ultimo}`;
}

/** Sugerencia editable: Tipo + cliente (p. ej. Instalación de cámaras Anfora). */
export function sugerirNombreDescriptivo(
  tipoEtiqueta: string | null | undefined,
  clienteNombre: string | null | undefined,
): string {
  const cliente = String(clienteNombre || '').replace(/\s+/g, ' ').trim() || 'cliente';
  const tipo = String(tipoEtiqueta || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (/instal/.test(tipo)) return `Instalación de cámaras ${cliente}`;
  if (/manten/.test(tipo)) return `Mantenimiento de equipos ${cliente}`;
  if (/actualiz|upgrade|mejor/.test(tipo)) return `Actualización de equipo ${cliente}`;
  if (tipo) {
    const cap = tipo.charAt(0).toUpperCase() + tipo.slice(1);
    return `${cap} ${cliente}`;
  }
  return `Implementación de soluciones ${cliente}`;
}
