import {
  acsIdentityKeys,
  buildAcsCheckInSuggestion,
  erpIdentityKeys,
  expectedStartHm,
  findAcsMatchKey,
  hybridTimeFlags,
  isLateVsSchedule,
  normalizeIdentityKey,
} from './attendance-hybrid.match';

describe('attendance-hybrid.match', () => {
  it('normaliza espacios y mayúsculas', () => {
    expect(normalizeIdentityKey('  NXR25SYS001 ')).toBe('nxr25sys001');
    expect(normalizeIdentityKey('')).toBeNull();
    expect(normalizeIdentityKey(null)).toBeNull();
  });

  it('une employeeNumber de User y de UserCompany', () => {
    expect(
      erpIdentityKeys({
        employeeNumber: 'NXR25SYS001',
        companyEmployeeNumber: '42',
      }).sort(),
    ).toEqual(['42', 'nxr25sys001']);
  });

  it('empareja personId o personCode del ACS', () => {
    const map = new Map<string, { personId: string }>([
      ['42', { personId: '42' }],
    ]);
    expect(findAcsMatchKey(['nxr25sys001', '42'], map)).toBe('42');
    expect(findAcsMatchKey(['nxr25sys001'], map)).toBeNull();
    expect(acsIdentityKeys({ personId: '42', personCode: 'NXR25SYS001' }).sort()).toEqual([
      '42',
      'nxr25sys001',
    ]);
  });

  it('marca contrastes honestos entre checador y ACS', () => {
    expect(
      hybridTimeFlags({
        acsFirstAt: '2026-09-04T14:00:00.000Z',
        acsPasses: 1,
        acsMinutes: null,
      }),
    ).toEqual(expect.arrayContaining(['acs_sin_checador', 'acs_sin_salida']));

    expect(
      hybridTimeFlags({
        erpCheckIn: '2026-09-04T14:00:00.000Z',
        erpCheckOut: '2026-09-04T23:00:00.000Z',
        acsFirstAt: '2026-09-04T15:00:00.000Z',
        acsLastAt: '2026-09-04T22:00:00.000Z',
        acsPasses: 3,
        acsMinutes: 420,
      }),
    ).toEqual(expect.arrayContaining(['desfase_entrada', 'desfase_salida']));
  });

  it('sugiere checador solo si hay ACS, usuario y falta ERP', () => {
    expect(
      buildAcsCheckInSuggestion({
        hasErp: false,
        hasUser: true,
        acsFirstAt: '2026-09-04T15:10:00.000Z',
        acsFirstDoor: 'Acceso General',
      }),
    ).toMatchObject({
      action: 'aplicar_entrada_acs',
      at: '2026-09-04T15:10:00.000Z',
      door: 'Acceso General',
    });
    expect(
      buildAcsCheckInSuggestion({
        hasErp: true,
        hasUser: true,
        acsFirstAt: '2026-09-04T15:10:00.000Z',
      }),
    ).toBeNull();
    expect(
      buildAcsCheckInSuggestion({
        hasErp: false,
        hasUser: false,
        acsFirstAt: '2026-09-04T15:10:00.000Z',
      }),
    ).toBeNull();
  });

  it('marca retardo vs horario de oficina (09:00 MX + 15 min gracia)', () => {
    expect(expectedStartHm('office_hours')).toBe('09:00');
    expect(expectedStartHm('contractor')).toBe('08:00');
    expect(expectedStartHm('always_on')).toBeNull();

    // 09:20 MX = 15:20 UTC en septiembre (UTC-6)
    expect(
      isLateVsSchedule('2026-09-04T15:20:00.000Z', 'office_hours', { graceMinutes: 15 }),
    ).toBe(true);
    // 09:10 MX = dentro de gracia
    expect(
      isLateVsSchedule('2026-09-04T15:10:00.000Z', 'office_hours', { graceMinutes: 15 }),
    ).toBe(false);

    expect(
      hybridTimeFlags({
        acsFirstAt: '2026-09-04T15:30:00.000Z',
        acsPasses: 2,
        acsMinutes: 400,
        scheduleKey: 'office_hours',
      }),
    ).toEqual(expect.arrayContaining(['retardo', 'acs_sin_checador']));
  });
});
