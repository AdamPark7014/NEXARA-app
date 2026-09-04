import { decideAcsRoutes, classifyDoorRole } from './integra-event-router';

describe('decideAcsRoutes', () => {
  it('denegado → denied_alarm + ops_activity', () => {
    const d = decideAcsRoutes({
      eventType: 'AccessControllerEvent',
      major: 5,
      minor: 21,
      deviceName: 'Acceso General',
      hasErpLink: true,
    });
    expect(d.direction).toBe('denied');
    expect(d.routes).toEqual(expect.arrayContaining(['denied_alarm', 'ops_activity']));
  });

  it('entrada empleado Acceso General → employee_entry + ops_activity', () => {
    const d = decideAcsRoutes({
      eventType: 'AccessControllerEvent',
      major: 5,
      minor: 75,
      deviceName: 'Acceso General',
      hasErpLink: true,
      hadPriorGrantToday: true,
    });
    expect(d.direction).toBe('entry');
    expect(d.personKind).toBe('employee');
    expect(d.routes).toEqual(expect.arrayContaining(['ops_activity', 'employee_entry']));
    expect(d.routes).not.toContain('denied_alarm');
  });

  it('gerencia restringida → restricted_audit sin employee_entry', () => {
    expect(classifyDoorRole({ name: 'Gerencia' })).toBe('restricted');
    const d = decideAcsRoutes({
      eventType: 'AccessControllerEvent',
      major: 5,
      minor: 1,
      deviceName: 'Gerencia',
      hasErpLink: true,
      hadPriorGrantToday: true,
    });
    expect(d.routes).toContain('restricted_audit');
    expect(d.routes).toContain('ops_activity');
    expect(d.routes).not.toContain('employee_entry');
  });

  it('ignora no-ACS', () => {
    const d = decideAcsRoutes({
      eventType: 'VMD',
      major: 5,
      minor: 75,
    });
    expect(d.routes).toEqual([]);
    expect(d.reasons).toContain('not_acs');
  });
});
