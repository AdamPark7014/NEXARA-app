import {
  buildAccessScheduleAssignment,
  deviceMatchesDoorScope,
  resolveAccessScheduleKey,
} from './access-schedule-defaults';

describe('access-schedule-defaults', () => {
  it('CEO → always_on 24/7', () => {
    expect(resolveAccessScheduleKey({ roleKey: 'ceo', isActive: true })).toBe('always_on');
  });

  it('empleado oficina indefinido → office_hours', () => {
    expect(
      resolveAccessScheduleKey({
        roleKey: 'administrativo',
        tipoContrato: 'Indefinido',
        isActive: true,
      }),
    ).toBe('office_hours');
  });

  it('ing_campo / contratista → contractor', () => {
    expect(resolveAccessScheduleKey({ roleKey: 'ing_campo', isActive: true })).toBe(
      'contractor',
    );
    expect(
      resolveAccessScheduleKey({
        roleKey: 'vendedor',
        tipoContrato: 'Contratista',
        isActive: true,
      }),
    ).toBe('contractor');
  });

  it('cliente / visitante → visitor', () => {
    expect(resolveAccessScheduleKey({ roleKey: 'cliente', isActive: true })).toBe('visitor');
    expect(
      resolveAccessScheduleKey({
        roleKey: 'administrativo',
        tipoContrato: 'Visitante',
        isActive: true,
      }),
    ).toBe('visitor');
  });

  it('inactivo → disabled', () => {
    expect(resolveAccessScheduleKey({ roleKey: 'ceo', isActive: false })).toBe('disabled');
  });

  it('assignment: employee indefinite all doors', () => {
    const a = buildAccessScheduleAssignment({
      employeeNumber: 'NXR25SYS010',
      roleKey: 'rh',
      tipoContrato: 'Indefinido',
      isActive: true,
    });
    expect(a.key).toBe('office_hours');
    expect(a.employeeNumber).toBe('NXR25SYS010');
    expect(a.validEnable).toBe(true);
    expect(a.beginTime.startsWith('2020-')).toBe(true);
    expect(a.endTime.startsWith('2037-')).toBe(true);
    expect(a.RightPlan[0]?.doorNo).toBe(1);
    expect(a.doorScope).toBe('all');
  });

  it('assignment: contractor dated window', () => {
    const a = buildAccessScheduleAssignment({
      employeeNumber: 'NXR25SYS099',
      roleKey: 'ing_campo',
      fechaIngreso: '2026-03-01',
      isActive: true,
      now: new Date(2026, 8, 4),
    });
    expect(a.key).toBe('contractor');
    expect(a.beginTime.startsWith('2026-03-01')).toBe(true);
    expect(a.endTime.startsWith('2027-03-01')).toBe(true);
    expect(a.doorScope).toBe('contractor_subset');
  });

  it('assignment: visitor day Sala Juntas', () => {
    const a = buildAccessScheduleAssignment({
      employeeNumber: 'VIS-1',
      roleKey: 'cliente',
      isActive: true,
      now: new Date(2026, 8, 4, 12, 0, 0),
    });
    expect(a.key).toBe('visitor');
    expect(a.userType).toBe('visitor');
    expect(a.doorScope).toBe('meeting_room');
    expect(a.beginTime.startsWith('2026-09-04T00:00:00')).toBe(true);
    expect(a.endTime.startsWith('2026-09-04T23:59:59')).toBe(true);
  });

  it('device scope matching Oficinas names', () => {
    expect(
      deviceMatchesDoorScope('meeting_room', { name: 'Sala de Juntas', ip: '192.168.9.160' }),
    ).toBe(true);
    expect(
      deviceMatchesDoorScope('meeting_room', { name: 'Acceso General', ip: '192.168.9.163' }),
    ).toBe(false);
    expect(
      deviceMatchesDoorScope('contractor_subset', { name: 'Gerencia' }),
    ).toBe(false);
    expect(
      deviceMatchesDoorScope('contractor_subset', { name: 'Acceso General' }),
    ).toBe(true);
    expect(deviceMatchesDoorScope('all', { name: 'Gerencia' })).toBe(true);
  });
});
