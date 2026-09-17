import {
  avanceActividadPorEstado,
  debeVencer,
  esFinal,
  estadoADb,
  estadoDesdeDb,
  estaBloqueada,
  puedeFirmarse,
  transicionPermitida,
} from './estado-cotizacion.js';

describe('estados en español sobre el enum en inglés', () => {
  it('traduce lo guardado a los estados del contrato', () => {
    expect(estadoDesdeDb('DRAFT')).toBe('BORRADOR');
    expect(estadoDesdeDb('SENT')).toBe('ENVIADA');
    expect(estadoDesdeDb('APPROVED')).toBe('APROBADA');
    expect(estadoDesdeDb('REJECTED')).toBe('RECHAZADA');
    expect(estadoDesdeDb('EXPIRED')).toBe('VENCIDA');
  });

  it('acepta también el español, para los payloads de las apps', () => {
    expect(estadoADb('ENVIADA')).toBe('SENT');
    expect(estadoADb('VENCIDA')).toBe('EXPIRED');
  });

  it('un valor desconocido no revienta: se trata como borrador', () => {
    expect(estadoDesdeDb('LO_QUE_SEA')).toBe('BORRADOR');
  });
});

describe('bloqueo y transiciones', () => {
  it('solo el borrador se edita; lo demás está bloqueado', () => {
    expect(estaBloqueada('DRAFT')).toBe(false);
    expect(estaBloqueada('SENT')).toBe(true);
    expect(estaBloqueada('APPROVED')).toBe(true);
    expect(estaBloqueada('REJECTED')).toBe(true);
    expect(estaBloqueada('EXPIRED')).toBe(true);
  });

  it('de borrador se envía', () => {
    expect(transicionPermitida('BORRADOR', 'ENVIADA')).toBe(true);
  });

  it('una enviada la aprueba, la rechaza o la vence', () => {
    expect(transicionPermitida('ENVIADA', 'APROBADA')).toBe(true);
    expect(transicionPermitida('ENVIADA', 'RECHAZADA')).toBe(true);
    expect(transicionPermitida('ENVIADA', 'VENCIDA')).toBe(true);
  });

  it('editar una enviada la regresa a borrador (versión nueva)', () => {
    expect(transicionPermitida('ENVIADA', 'BORRADOR')).toBe(true);
  });

  it('una aprobada ya no se mueve', () => {
    expect(esFinal('APROBADA')).toBe(true);
    expect(transicionPermitida('APROBADA', 'BORRADOR')).toBe(false);
    expect(transicionPermitida('APROBADA', 'RECHAZADA')).toBe(false);
  });

  it('un borrador no se aprueba sin pasar por enviada', () => {
    expect(transicionPermitida('BORRADOR', 'APROBADA')).toBe(false);
  });

  it('una rechazada o vencida se retoma como borrador', () => {
    expect(transicionPermitida('RECHAZADA', 'BORRADOR')).toBe(true);
    expect(transicionPermitida('VENCIDA', 'BORRADOR')).toBe(true);
    expect(transicionPermitida('VENCIDA', 'APROBADA')).toBe(false);
  });
});

describe('firma desde el enlace público', () => {
  const hoy = new Date('2026-09-17T12:00:00Z');

  it('se firma una enviada en vigencia', () => {
    expect(puedeFirmarse({ estado: 'SENT', validUntil: '2026-10-01', hoy }).ok).toBe(true);
  });

  it('no se firma una vencida por fecha, aunque siga marcada como enviada', () => {
    const resultado = puedeFirmarse({ estado: 'SENT', validUntil: '2026-09-01', hoy });
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain('venció');
  });

  it('no se firma una rechazada', () => {
    expect(puedeFirmarse({ estado: 'REJECTED', hoy }).ok).toBe(false);
  });

  it('no se firma un borrador que nunca se envió', () => {
    expect(puedeFirmarse({ estado: 'DRAFT', hoy }).ok).toBe(false);
  });

  it('una aprobada no se vuelve a firmar', () => {
    expect(puedeFirmarse({ estado: 'APPROVED', hoy }).ok).toBe(false);
  });
});

describe('tarea diaria de vencimiento', () => {
  const hoy = new Date('2026-09-17T12:00:00Z');

  it('vence solo enviadas con fecha pasada', () => {
    expect(debeVencer({ estado: 'SENT', validUntil: '2026-09-16', hoy })).toBe(true);
    expect(debeVencer({ estado: 'SENT', validUntil: '2026-09-30', hoy })).toBe(false);
    expect(debeVencer({ estado: 'DRAFT', validUntil: '2026-09-01', hoy })).toBe(false);
    expect(debeVencer({ estado: 'SENT', validUntil: null, hoy })).toBe(false);
  });
});

describe('avance de la actividad comercial ligada', () => {
  it('enviada la deja por validar y aprobada la finaliza', () => {
    expect(avanceActividadPorEstado('SENT')).toBe('Por Validar');
    expect(avanceActividadPorEstado('APPROVED')).toBe('Finalizada');
  });

  it('rechazada o vencida no cierran la actividad: la revisa un superior', () => {
    expect(avanceActividadPorEstado('REJECTED')).toBeNull();
    expect(avanceActividadPorEstado('EXPIRED')).toBeNull();
  });
});
