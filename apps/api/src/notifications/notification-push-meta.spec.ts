import {
  buildCollapseKey,
  channelForCategory,
  fechaAviso,
  horaAviso,
  iconForNotification,
  nombreCorto,
  NOTIFICATION_ICONS,
} from './notification-push-meta.js';

describe('notification-push-meta', () => {
  it('enruta categorías operativas a canal ops', () => {
    expect(channelForCategory('activities')).toBe('ops');
    expect(channelForCategory('evidences')).toBe('ops');
    expect(channelForCategory('viatics')).toBe('ops');
  });

  it('enruta tickets y alarmas a tickets', () => {
    expect(channelForCategory('tickets')).toBe('tickets');
    expect(channelForCategory('integra-alarms')).toBe('tickets');
  });

  it('enruta workflow/approvals a approvals', () => {
    expect(channelForCategory('workflow')).toBe('approvals');
    expect(channelForCategory('approvals')).toBe('approvals');
  });

  it('collapse key es estable por evento+entidad+usuario', () => {
    const a = buildCollapseKey({
      type: 'ACTIVITY_STARTED',
      entityType: 'Activity',
      entityId: 42,
      userId: 7,
    });
    const b = buildCollapseKey({
      type: 'ACTIVITY_STARTED',
      entityType: 'Activity',
      entityId: 42,
      userId: 7,
    });
    expect(a).toBe(b);
    expect(a).toContain('activity_started');
    expect(a).toContain('42');
  });
});

describe('nombreCorto', () => {
  it.each([
    ['Christian Eduardo Del Pozo Sánchez', 'Christian Del Pozo'],
    ['Luis Joel Aguilar Castillo', 'Luis Aguilar'],
    ['Josué Teodulo Cervantes Arellano', 'Josué Cervantes'],
    ['Alejandro González Bustamante', 'Alejandro González'],
    ['Israel Ramos Lima', 'Israel Ramos'],
    ['Carolina Juárez Álvarez', 'Carolina Juárez'],
    ['Antonio Pérez', 'Antonio Pérez'],
    ['Soporte', 'Soporte'],
  ])('%s → %s', (completo, corto) => {
    expect(nombreCorto(completo)).toBe(corto);
  });

  it('mantiene las partículas con el apellido y no parte nombres compuestos por ellas', () => {
    expect(nombreCorto('María de la Luz')).toBe('María de la Luz');
    expect(nombreCorto('Ana María de la Fuente Ruiz')).toBe('Ana de la Fuente');
    expect(nombreCorto('Christian Del Pozo')).toBe('Christian Del Pozo');
  });

  it('limpia espacios y tolera vacíos', () => {
    expect(nombreCorto('  Israel   Ramos  Lima ')).toBe('Israel Ramos');
    expect(nombreCorto('')).toBe('');
    expect(nombreCorto(null)).toBe('');
    expect(nombreCorto(undefined)).toBe('');
  });
});

describe('iconForNotification', () => {
  it('usa el tipo cuando lo conoce', () => {
    expect(iconForNotification('ATTENDANCE_CHECKIN', 'attendance')).toBe('entrada');
    expect(iconForNotification('ATTENDANCE_CHECKOUT', 'attendance')).toBe('salida');
    expect(iconForNotification('LUNCH_CHECKIN', 'lunch_breaks')).toBe('comida_sale');
    expect(iconForNotification('LUNCH_CHECKOUT', 'lunch_breaks')).toBe('comida_regresa');
    expect(iconForNotification('ACTIVITY_ASSIGNED', 'activities')).toBe('actividad_nueva');
    expect(iconForNotification('ACTIVITY_STARTED', 'activities')).toBe('actividad_inicio');
    expect(iconForNotification('ACTIVITY_RESCHEDULED', 'activities')).toBe('reprogramada');
    expect(iconForNotification('ACTIVITY_COMPLETED', 'activities')).toBe('finalizada');
    expect(iconForNotification('EVIDENCE_SUBMITTED', 'evidences')).toBe('por_revisar');
    expect(iconForNotification('EVIDENCE_APPROVED', 'evidences')).toBe('aprobada');
    expect(iconForNotification('EVIDENCE_REJECTED', 'evidences')).toBe('devuelta');
    expect(iconForNotification('SLA_ALERT', 'sla-alert')).toBe('atraso');
    expect(iconForNotification('SLA_BREACH', 'sla-breach')).toBe('vencida');
    expect(iconForNotification('CHAT_MENTION', 'chat')).toBe('mencion');
    expect(iconForNotification('ACS_ACCESS_DENIED', 'security')).toBe('seguridad');
  });

  it('deduce por la terminación del tipo', () => {
    expect(iconForNotification('VIATICO_APPROVED', 'viatics')).toBe('aprobada');
    expect(iconForNotification('VEHICLE_DELIVERY_REJECTED', 'vehicles')).toBe('devuelta');
    expect(iconForNotification('QUOTE_EXPIRING', 'quotes')).toBe('atraso');
    expect(iconForNotification('QUOTE_EXPIRED', 'quotes')).toBe('vencida');
  });

  it('cae a la categoría y al final a aviso', () => {
    expect(iconForNotification('ALGO_NUEVO', 'security')).toBe('seguridad');
    expect(iconForNotification('ALGO_NUEVO', 'chat')).toBe('chat');
    expect(iconForNotification(undefined, 'lunch_break')).toBe('comida_sale');
    expect(iconForNotification('VIATICO_ASSIGNED', 'viatics')).toBe('aviso');
    expect(iconForNotification(null, null)).toBe('aviso');
  });

  it('nunca inventa claves fuera del vocabulario de las apps', () => {
    const tipos = ['ATTENDANCE_CHECKIN', 'TOOL_REQUESTED', 'FINE_CREATED', 'SALES_LEAD_CREATED', 'X', ''];
    const categorias = ['attendance', 'tools', 'fines', 'sales', 'integra-alarms', 'sla-alert', ''];
    for (const t of tipos) {
      for (const c of categorias) {
        expect(NOTIFICATION_ICONS).toContain(iconForNotification(t, c));
      }
    }
  });
});

describe('horaAviso / fechaAviso', () => {
  const tz = 'America/Mexico_City';

  it('escribe la hora como «8:02 a. m.»', () => {
    expect(horaAviso(new Date('2026-09-17T14:02:00Z'), tz)).toBe('8:02 a. m.');
    expect(horaAviso(new Date('2026-09-17T00:05:00Z'), tz)).toBe('6:05 p. m.');
  });

  it('escribe la fecha como «jue 17 sep, 9:00 a. m.»', () => {
    expect(fechaAviso(new Date('2026-09-17T15:00:00Z'), tz)).toBe('jue 17 sep, 9:00 a. m.');
  });
});
