import {
  MEETING_AGENDA,
  MEETING_DEFAULTS,
  MEETING_TYPES,
  agreementRequiresOwner,
  daysOverdue,
  isOverdue,
} from './meeting-rhythm.js';

const HOY = new Date('2026-08-16T12:00:00Z');

describe('los cuatro ritmos del organigrama', () => {
  it('cada tipo trae título y hora por defecto', () => {
    for (const tipo of MEETING_TYPES) {
      expect(MEETING_DEFAULTS[tipo].titulo).toBeTruthy();
      expect(MEETING_DEFAULTS[tipo].horaInicio).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('la diaria es a las 10:00, como dice el organigrama', () => {
    expect(MEETING_DEFAULTS.DIARIA.horaInicio).toBe('10:00');
  });

  it('la junta de cierre pregunta explícitamente por lecciones aprendidas', () => {
    // Sin el punto en la agenda, el viernes acaba siendo un repaso de
    // pendientes y la leccion se pierde.
    expect(MEETING_AGENDA.CIERRE_SEMANAL).toContain('Lecciones aprendidas');
  });

  it('cada tipo tiene agenda propia', () => {
    for (const tipo of MEETING_TYPES) {
      expect(MEETING_AGENDA[tipo].length).toBeGreaterThan(0);
    }
  });
});

describe('acuerdo vencido', () => {
  it('un acuerdo pendiente con fecha pasada está vencido', () => {
    expect(isOverdue({ estado: 'PENDIENTE', fechaCompromiso: new Date('2026-08-10T00:00:00Z') }, HOY)).toBe(true);
  });

  it('el mismo día del compromiso todavía no vence', () => {
    expect(isOverdue({ estado: 'PENDIENTE', fechaCompromiso: new Date('2026-08-16T00:00:00Z') }, HOY)).toBe(false);
  });

  it('sin fecha compromiso no hay vencimiento', () => {
    // Hay acuerdos legitimamente abiertos: marcarlos vencidos seria ruido.
    expect(isOverdue({ estado: 'PENDIENTE', fechaCompromiso: null }, HOY)).toBe(false);
  });

  it('un acuerdo cumplido nunca está vencido', () => {
    expect(isOverdue({ estado: 'CUMPLIDO', fechaCompromiso: new Date('2026-01-01T00:00:00Z') }, HOY)).toBe(false);
  });

  it('uno cancelado tampoco', () => {
    expect(isOverdue({ estado: 'CANCELADO', fechaCompromiso: new Date('2026-01-01T00:00:00Z') }, HOY)).toBe(false);
  });

  it('en proceso sí cuenta: sigue esperando a alguien', () => {
    expect(isOverdue({ estado: 'EN_PROCESO', fechaCompromiso: new Date('2026-08-01T00:00:00Z') }, HOY)).toBe(true);
  });

  it('cuenta los días de retraso', () => {
    expect(daysOverdue({ estado: 'PENDIENTE', fechaCompromiso: new Date('2026-08-10T00:00:00Z') }, HOY)).toBe(6);
  });

  it('sin retraso son cero días', () => {
    expect(daysOverdue({ estado: 'PENDIENTE', fechaCompromiso: new Date('2026-09-01T00:00:00Z') }, HOY)).toBe(0);
  });
});

describe('quién necesita responsable', () => {
  it('un acuerdo sí', () => {
    // Un acuerdo sin dueño es un deseo, y es lo que vuelve inutil la junta.
    expect(agreementRequiresOwner('ACUERDO')).toBe(true);
  });

  it('una lección aprendida no: es conocimiento, no tarea', () => {
    expect(agreementRequiresOwner('LECCION')).toBe(false);
  });

  it('un riesgo tampoco', () => {
    expect(agreementRequiresOwner('RIESGO')).toBe(false);
  });
});
