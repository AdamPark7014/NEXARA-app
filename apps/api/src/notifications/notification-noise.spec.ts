import { modoResumenActivo, omitirEnModoResumen, TIPOS_INFORMATIVOS } from './notification-noise.js';

describe('omitirEnModoResumen', () => {
  it('omite los avisos informativos de ruido (evidencia enviada, asistencia, «se creó»)', () => {
    for (const type of ['EVIDENCE_SUBMITTED', 'ATTENDANCE_CHECKIN', 'SALES_LEAD_CREATED', 'QUOTE_SENT', 'INVOICE_CREATED']) {
      expect(omitirEnModoResumen({ type })).toBe(true);
    }
  });

  it('nunca omite lo que pide una decisión o es urgente', () => {
    for (const type of [
      'WORKFLOW_PENDING',
      'WORKFLOW_ESCALATION',
      'SLA_ALERT',
      'SLA_BREACH',
      'MARGIN_ALERT',
      'QUOTE_SIGNED',
      'QUOTE_REJECTED',
      'QUOTE_EXPIRING',
      'ATTENDANCE_FLAGGED',
      'STOCK_ALERT',
      'CHAT_MENTION',
      'ACTIVITY_OVERTIME',
    ]) {
      expect(omitirEnModoResumen({ type })).toBe(false);
    }
  });

  it('la prioridad alta gana sobre la lista, y el resumen del CEO nunca se filtra', () => {
    expect(omitirEnModoResumen({ type: 'EVIDENCE_SUBMITTED', priority: 'high' })).toBe(false);
    expect(omitirEnModoResumen({ type: 'EVIDENCE_SUBMITTED', category: 'resumen-ceo' })).toBe(false);
    expect(omitirEnModoResumen({ type: 'EVIDENCE_SUBMITTED', priority: 'normal' })).toBe(true);
  });

  it('un tipo desconocido pasa (ante la duda, se avisa)', () => {
    expect(omitirEnModoResumen({ type: 'ALGO_NUEVO' })).toBe(false);
  });

  it('ningún tipo informativo es de los que piden decisión', () => {
    for (const t of TIPOS_INFORMATIVOS) {
      expect(t).not.toMatch(/WORKFLOW|SLA_|ALERT|BREACH|FLAGGED|MENTION/);
    }
  });
});

describe('modoResumenActivo', () => {
  it('reconoce 1/true/sí y nada más', () => {
    for (const v of ['1', 'true', 'TRUE', ' sí ', 'si']) expect(modoResumenActivo(v)).toBe(true);
    for (const v of [null, undefined, '', '0', 'false', 'no', 'x']) expect(modoResumenActivo(v as any)).toBe(false);
  });
});
