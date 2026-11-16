/**
 * Revisión con IA de una actividad ya calificada (Adam, 15-11-2026): «hay actividades que ya califiqué
 * mal; que la IA diga si están bien o mal, por qué, y las incidencias».
 *
 * Reparto: el código saca los hechos que se pueden medir (a tiempo o tarde contra el mismo límite del
 * semáforo, fotos por campo completas, incidencias, tiempo real contra el estimado, la calificación y la
 * nota de quien revisó). Claude solo los lee y explica si la calificación les corresponde. No guarda
 * nada ni cambia la calificación: la persona decide. Módulo puro, para el servicio y las pruebas.
 */

export type DatosRevision = {
  titulo: string;
  tipo: string | null;
  subtipo: string | null;
  indicaciones: string | null;
  estatus: string;
  limite: Date | null;
  entregadaAt: Date | null;
  tiempoEstimadoMin: number | null;
  /** Minutos con el reloj de la actividad corriendo, si se registró. */
  minutosReales: number | null;
  campos: Array<{ nombre: string; pedidos: number; subidos: number }>;
  /** Fotos libres (sin campos) que subió quien la hizo. */
  fotosLibres: number;
  incidencias: Array<{ tipo: string; severidad: string; descripcion: string; resuelta: boolean }>;
  revision: { decision: string; calificacion: number | null; nota: string; revisor: string | null } | null;
};

export type Hecho = { texto: string; tono: 'bien' | 'mal' | 'neutro' };

export type SalidaRevision = {
  veredicto: 'correcta' | 'revisar' | 'incorrecta';
  calificacionSugerida: number | null;
  porque: string[];
  incidencias: string[];
  recomendacion: string | null;
};

const TIPO_INCIDENCIA: Record<string, string> = {
  ACCESO_DENEGADO: 'Acceso denegado',
  FALTA_MATERIAL: 'Falta de material',
  FALLA_EQUIPO: 'Falla de equipo',
  CONDICION_INSEGURA: 'Condición insegura',
  CLIMA: 'Clima',
  ALCANCE_ADICIONAL: 'Alcance adicional',
  RETRASO_CLIENTE: 'Retraso del cliente',
  DANO_INSTALACION: 'Daño a la instalación',
  OTRO: 'Otra',
};

const DECISION: Record<string, string> = {
  APROBADA: 'aprobada',
  DEVUELTA_PASOS: 'devuelta para corregir pasos',
  DEVUELTA_TODO: 'devuelta para rehacer todo',
};

function duracion(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Lo medible, en frases cortas y con su tono: se muestra tal cual y es lo único que lee la IA. */
export function hechosDe(d: DatosRevision, ahora: Date = new Date()): Hecho[] {
  const hechos: Hecho[] = [];
  if (d.entregadaAt && d.limite) {
    const tarde = Math.round((d.entregadaAt.getTime() - d.limite.getTime()) / 60_000);
    hechos.push(tarde > 0 ? { texto: `Se entregó ${duracion(tarde)} después del límite.`, tono: 'mal' } : { texto: 'Se entregó a tiempo.', tono: 'bien' });
  } else if (d.entregadaAt) {
    hechos.push({ texto: 'Se entregó; no tenía límite de entrega.', tono: 'neutro' });
  } else if (d.limite && d.limite.getTime() < ahora.getTime()) {
    hechos.push({ texto: `No se ha entregado y el límite venció hace ${duracion((ahora.getTime() - d.limite.getTime()) / 60_000)}.`, tono: 'mal' });
  } else {
    hechos.push({ texto: 'Todavía no se entrega.', tono: 'neutro' });
  }

  if (d.tiempoEstimadoMin && d.minutosReales != null && d.minutosReales > 0) {
    const razon = d.minutosReales / d.tiempoEstimadoMin;
    const texto = `Tomó ${duracion(d.minutosReales)} contra ${duracion(d.tiempoEstimadoMin)} estimados.`;
    hechos.push({ texto, tono: razon > 1.5 ? 'mal' : razon <= 1.1 ? 'bien' : 'neutro' });
  }

  if (d.campos.length) {
    const pedidos = d.campos.reduce((s, c) => s + c.pedidos, 0);
    const subidos = d.campos.reduce((s, c) => s + Math.min(c.subidos, c.pedidos), 0);
    const faltan = d.campos.filter((c) => c.subidos < c.pedidos).map((c) => c.nombre);
    hechos.push(
      faltan.length
        ? { texto: `Faltan fotos: ${subidos} de ${pedidos} (${faltan.slice(0, 4).join(', ')}${faltan.length > 4 ? '…' : ''}).`, tono: 'mal' }
        : { texto: `Fotos completas: ${pedidos} de ${pedidos} en ${d.campos.length} elementos.`, tono: 'bien' },
    );
  } else {
    hechos.push({ texto: d.fotosLibres ? `Subió ${d.fotosLibres} fotos de evidencia.` : 'No hay fotos de evidencia.', tono: d.fotosLibres ? 'neutro' : 'mal' });
  }

  for (const i of d.incidencias.slice(0, 5)) {
    hechos.push({
      texto: `Incidencia ${i.severidad.toLowerCase()}: ${TIPO_INCIDENCIA[i.tipo] ?? i.tipo}${i.descripcion ? ` («${i.descripcion.slice(0, 120)}»)` : ''}${i.resuelta ? ', resuelta' : ', sin resolver'}.`,
      tono: i.resuelta ? 'neutro' : 'mal',
    });
  }

  if (d.revision) {
    const r = d.revision;
    hechos.push({
      texto: `Calificación: ${DECISION[r.decision] ?? r.decision}${r.calificacion != null ? `, ${r.calificacion} de 5` : ''}${r.revisor ? ` (${r.revisor})` : ''}${r.nota ? `. Nota: «${r.nota.slice(0, 200)}»` : ''}.`,
      tono: 'neutro',
    });
  } else {
    hechos.push({ texto: 'Todavía no tiene calificación.', tono: 'neutro' });
  }
  return hechos;
}

export const ESQUEMA_REVISION: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['veredicto', 'calificacionSugerida', 'porque', 'incidencias', 'recomendacion'],
  properties: {
    veredicto: { type: 'string', enum: ['correcta', 'revisar', 'incorrecta'] },
    calificacionSugerida: { type: ['integer', 'null'] },
    porque: { type: 'array', items: { type: 'string' } },
    incidencias: { type: 'array', items: { type: 'string' } },
    recomendacion: { type: ['string', 'null'] },
  },
};

export const PROMPT_REVISION = `Revisas la calificación de una actividad de campo de NEXARA (seguridad electrónica en México). La empresa mide «en tiempo y forma»: entregar antes del límite, con la evidencia completa y sin que la devuelvan. Recibes la actividad y los HECHOS ya medidos por el sistema; no hay más información.

Devuelve:
- veredicto: «correcta» si la calificación corresponde a los hechos; «incorrecta» si los contradice (aprobada o con 5 aunque se entregó tarde, faltan fotos o hay una incidencia sin resolver atribuible a quien la hizo; o devuelta o con nota baja aunque todo está a tiempo y completo); «revisar» si los hechos no alcanzan para decidir o si no tiene calificación.
- calificacionSugerida: 1 a 5 según los hechos (5 a tiempo y completa; 3 un problema; 1 no entregada o sin evidencia). null si no alcanza.
- porque: 1 a 3 frases cortas que citen los hechos.
- incidencias: lo que salió mal y hay que atender (fotos faltantes, retraso, incidencia sin resolver), en frases cortas; vacío si nada.
- recomendacion: una frase con qué hacer (corregir la calificación, pedir las fotos, nada); null si no hace falta.
No inventes hechos. Una incidencia de clima, acceso denegado o retraso del cliente no es culpa de quien la hizo. Español de México, sin rodeos.`;

export const CONFIG_REVISION = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 450,
  timeoutMs: 15_000,
  reintentos: 1,
};

/** La petición completa (el servicio y las pruebas mandan lo mismo). */
export function peticionRevision(d: DatosRevision, hechos: Hecho[]) {
  const linea = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
  return {
    sistema: [PROMPT_REVISION],
    usuario: [
      `Actividad: ${linea(d.titulo)} (${[d.tipo, d.subtipo].filter(Boolean).join(' · ') || 'sin tipo'}), estatus ${d.estatus}.`,
      d.indicaciones ? `Indicaciones: ${linea(d.indicaciones).slice(0, 400)}` : null,
      'HECHOS:',
      ...hechos.map((h) => `- ${h.texto}`),
    ]
      .filter(Boolean)
      .join('\n'),
    esquema: ESQUEMA_REVISION,
    modelo: CONFIG_REVISION.modelo,
    esfuerzo: CONFIG_REVISION.esfuerzo,
    pensar: CONFIG_REVISION.pensar,
    maxTokens: CONFIG_REVISION.maxTokens,
    timeoutMs: CONFIG_REVISION.timeoutMs,
    reintentos: CONFIG_REVISION.reintentos,
  };
}

/** Lo que devolvió Claude, recortado y saneado (nunca más de lo que se puede leer de un vistazo). */
export function salidaSegura(x: unknown): SalidaRevision {
  const s = (x ?? {}) as Partial<SalidaRevision>;
  const lista = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : []).filter((t): t is string => typeof t === 'string' && Boolean(t.trim())).map((t) => t.trim().slice(0, 240)).slice(0, max);
  const cal = typeof s.calificacionSugerida === 'number' ? Math.round(s.calificacionSugerida) : null;
  return {
    veredicto: s.veredicto === 'correcta' || s.veredicto === 'incorrecta' ? s.veredicto : 'revisar',
    calificacionSugerida: cal != null && cal >= 1 && cal <= 5 ? cal : null,
    porque: lista(s.porque, 3),
    incidencias: lista(s.incidencias, 5),
    recomendacion: typeof s.recomendacion === 'string' && s.recomendacion.trim() ? s.recomendacion.trim().slice(0, 240) : null,
  };
}
