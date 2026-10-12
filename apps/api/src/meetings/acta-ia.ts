/**
 * Acta de reunión con IA: la transcripción (o las notas) de una junta se convierte en
 * minuta, acuerdos, lecciones y riesgos.
 *
 * Igual que el asistente de actividades, Claude solo propone: este archivo busca a los
 * responsables en NEXARA y la web guarda lo que la persona confirme con los endpoints de
 * siempre (`PATCH /reuniones/:id` para la minuta, `POST /reuniones/:id/acuerdos`).
 */
import { aFechaISO, buscar, type Referencia } from '../ai/asistente/asistente-actividades.js';

/** ~4 horas de junta transcrita en español caben de sobra (≈ 36 mil palabras). */
export const MAX_CARACTERES_TRANSCRIPCION = 400_000;

export type AcuerdoPlan = {
  tipo: 'ACUERDO' | 'LECCION' | 'RIESGO';
  descripcion: string;
  responsable: string | null;
  fechaCompromiso: string | null;
};

export type ActaPlan = {
  resumen: string;
  temas: Array<{ titulo: string; detalle: string }>;
  decisiones: string[];
  acuerdos: AcuerdoPlan[];
  pendientesSinDueno: string[];
};

const textoONulo = { type: ['string', 'null'] };

export const ESQUEMA_ACTA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['resumen', 'temas', 'decisiones', 'acuerdos', 'pendientesSinDueno'],
  properties: {
    resumen: { type: 'string' },
    temas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'detalle'],
        properties: { titulo: { type: 'string' }, detalle: { type: 'string' } },
      },
    },
    decisiones: { type: 'array', items: { type: 'string' } },
    acuerdos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'descripcion', 'responsable', 'fechaCompromiso'],
        properties: {
          tipo: { type: 'string', enum: ['ACUERDO', 'LECCION', 'RIESGO'] },
          descripcion: { type: 'string' },
          responsable: textoONulo,
          fechaCompromiso: textoONulo,
        },
      },
    },
    pendientesSinDueno: { type: 'array', items: { type: 'string' } },
  },
};

export const PROMPT_ACTA = `Eres quien redacta las actas de reunión de NEXARA, una empresa mexicana de seguridad electrónica e integración (CCTV, control de acceso, redes, servicio de campo).

Recibes la transcripción de una junta (a veces de varias horas, con errores de dictado y sin puntuación) o notas sueltas. Devuelve un acta clara en español de México.

- resumen: 1 a 3 párrafos con lo importante, para alguien que no estuvo. Sin relleno ni saludos.
- temas: los asuntos tratados, en orden; título corto y un detalle de 1 a 4 frases con lo que se dijo y concluyó.
- decisiones: lo que se decidió, una frase cada una.
- acuerdos: compromisos con un responsable. tipo ACUERDO para algo que alguien debe hacer; LECCION para un aprendizaje que conviene recordar; RIESGO para algo que puede salir mal y hay que vigilar. descripcion en infinitivo y concreta ("Enviar la cotización de cámaras a Tox"). responsable: el nombre tal como aparece en la lista de personas de la empresa si coincide; si no, como lo dijeron; null si nadie lo tomó. fechaCompromiso en AAAA-MM-DD si se dijo una fecha o un plazo ("el viernes", "en dos semanas"), calculada desde la fecha de la reunión; si no, null.
- pendientesSinDueno: cosas que quedaron por hacer sin que nadie las tomara.
- No inventes nada que no esté en el texto. Si el texto es muy corto o no es una reunión, devuelve lo que haya y listas vacías.`;

export function bloquePersonasActa(personas: Array<{ nombre: string; puesto?: string | null }>): string {
  return `Personas de la empresa:\n${personas.map((p) => `- ${p.nombre}${p.puesto ? ` (${p.puesto})` : ''}`).join('\n') || '- (ninguna)'}`;
}

export function mensajeActa(
  reunion: { titulo: string; fecha: Date; agenda?: string | null; asistentes: string[] },
  transcripcion: string,
): string {
  // `fecha` es columna de día (medianoche UTC): se lee tal cual, sin zona.
  const fecha = reunion.fecha.toISOString().slice(0, 10);
  return [
    `Reunión: ${reunion.titulo}`,
    `Fecha de la reunión: ${fecha}`,
    reunion.asistentes.length ? `Asistentes: ${reunion.asistentes.join(', ')}` : null,
    reunion.agenda ? `Agenda:\n${reunion.agenda}` : null,
    '',
    'Transcripción o notas:',
    transcripcion.trim(),
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export type AcuerdoPropuesto = {
  tipo: AcuerdoPlan['tipo'];
  descripcion: string;
  textoResponsable: string | null;
  responsable: Referencia | null;
  responsableCandidatos: Referencia[];
  /** AAAA-MM-DD o null. */
  fechaCompromiso: string | null;
};

export type ActaPropuesta = {
  /** Texto listo para guardar en `notas` de la reunión. */
  minuta: string;
  resumen: string;
  temas: ActaPlan['temas'];
  decisiones: string[];
  acuerdos: AcuerdoPropuesto[];
  pendientesSinDueno: string[];
};

/** Minuta en texto plano: lo que queda guardado en la reunión y se lee por fecha. */
export function minutaTexto(plan: ActaPlan): string {
  const partes: string[] = [`RESUMEN\n${plan.resumen.trim()}`];
  if (plan.temas.length) {
    partes.push(`TEMAS\n${plan.temas.map((t, i) => `${i + 1}. ${t.titulo}\n   ${t.detalle}`).join('\n')}`);
  }
  if (plan.decisiones.length) partes.push(`DECISIONES\n${plan.decisiones.map((d) => `- ${d}`).join('\n')}`);
  if (plan.pendientesSinDueno.length) {
    partes.push(`PENDIENTES SIN RESPONSABLE\n${plan.pendientesSinDueno.map((d) => `- ${d}`).join('\n')}`);
  }
  return partes.join('\n\n');
}

export function construirActa(
  plan: ActaPlan,
  personas: Array<{ id: number; nombre: string }>,
): ActaPropuesta {
  const limpio: ActaPlan = {
    resumen: String(plan?.resumen ?? '').trim(),
    temas: Array.isArray(plan?.temas) ? plan.temas : [],
    decisiones: Array.isArray(plan?.decisiones) ? plan.decisiones : [],
    acuerdos: Array.isArray(plan?.acuerdos) ? plan.acuerdos : [],
    pendientesSinDueno: Array.isArray(plan?.pendientesSinDueno) ? plan.pendientesSinDueno : [],
  };
  return {
    minuta: minutaTexto(limpio),
    resumen: limpio.resumen,
    temas: limpio.temas,
    decisiones: limpio.decisiones,
    pendientesSinDueno: limpio.pendientesSinDueno,
    acuerdos: limpio.acuerdos
      .filter((a) => a?.descripcion?.trim())
      .map((a) => {
        const r = buscar(a.responsable, personas, (p) => p.nombre);
        return {
          tipo: a.tipo === 'LECCION' || a.tipo === 'RIESGO' ? a.tipo : 'ACUERDO',
          descripcion: a.descripcion.trim(),
          textoResponsable: a.responsable,
          responsable: r.elegido ? { id: r.elegido.id, nombre: r.elegido.nombre } : null,
          responsableCandidatos: r.elegido ? [] : r.candidatos.map((p) => ({ id: p.id, nombre: p.nombre })),
          fechaCompromiso: aFechaISO(a.fechaCompromiso, null) ? a.fechaCompromiso : null,
        };
      }),
  };
}
