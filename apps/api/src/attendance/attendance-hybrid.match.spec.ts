import {
  acsIdentityKeys,
  buildAcsCheckInSuggestion,
  erpIdentityKeys,
  expectedEndHm,
  expectedStartHm,
  findAcsMatchKey,
  horaEntradaGuardada,
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

  it('marca retardo vs horario de oficina (10:00 MX + 15 min gracia)', () => {
    // Oficina y contratista: entrada 10:00, salida 18:00. 24/7 no tiene horario.
    expect(expectedStartHm('office_hours')).toBe('10:00');
    expect(expectedStartHm('contractor')).toBe('10:00');
    expect(expectedStartHm('always_on')).toBeNull();
    expect(expectedEndHm('office_hours')).toBe('18:00');
    expect(expectedEndHm('contractor')).toBe('18:00');
    expect(expectedEndHm('always_on')).toBeNull();

    // 10:20 MX = 16:20 UTC en septiembre (UTC-6)
    expect(
      isLateVsSchedule('2026-09-04T16:20:00.000Z', 'office_hours', { graceMinutes: 15 }),
    ).toBe(true);
    // 10:10 MX = dentro de gracia
    expect(
      isLateVsSchedule('2026-09-04T16:10:00.000Z', 'office_hours', { graceMinutes: 15 }),
    ).toBe(false);

    // 10:30 MX: la primera puerta del día, sin checador, ya cuenta como retardo.
    expect(
      hybridTimeFlags({
        acsFirstAt: '2026-09-04T16:30:00.000Z',
        acsPasses: 2,
        acsMinutes: 400,
        scheduleKey: 'office_hours',
      }),
    ).toEqual(expect.arrayContaining(['retardo', 'acs_sin_checador']));
  });

  it('mide el retardo contra horaEntrada y, si no hay, contra las 10:00', () => {
    const tz = 'America/Mexico_City';
    // 15:00 UTC es las 09:00 en Ciudad de México (UTC-6, sin horario de verano).
    expect(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date('2026-10-20T15:00:00.000Z')),
    ).toBe('09:00');

    expect(horaEntradaGuardada('08:00')).toBe('08:00');
    expect(horaEntradaGuardada(' 07:30 ')).toBe('07:30');
    expect(horaEntradaGuardada(null)).toBeNull();
    expect(horaEntradaGuardada('')).toBeNull();
    expect(horaEntradaGuardada('8:00')).toBeNull();
    expect(horaEntradaGuardada('a las ocho')).toBeNull();

    expect(expectedStartHm('office_hours', '08:00')).toBe('08:00');
    expect(expectedStartHm('contractor', null)).toBe('10:00');
    expect(expectedStartHm('office_hours', 'ocho')).toBe('10:00');
    expect(expectedStartHm('always_on')).toBeNull();
    expect(expectedStartHm('visitor', null)).toBeNull();
    expect(expectedStartHm('always_on', '09:30')).toBe('09:30');

    // 09:00 MX. Tarde para quien entra a las 08:00; a tiempo contra las 10:00.
    const nueve = '2026-10-20T15:00:00.000Z';
    expect(isLateVsSchedule(nueve, 'office_hours', { horaEntrada: '08:00', tz })).toBe(true);
    expect(isLateVsSchedule(nueve, 'office_hours', { tz })).toBe(false);
    // 08:15 MX cabe en la gracia de 15 min; 08:16 ya es retardo.
    expect(
      isLateVsSchedule('2026-10-20T14:15:00.000Z', 'office_hours', { horaEntrada: '08:00', tz }),
    ).toBe(false);
    expect(
      isLateVsSchedule('2026-10-20T14:16:00.000Z', 'office_hours', { horaEntrada: '08:00', tz }),
    ).toBe(true);

    expect(
      hybridTimeFlags({
        erpCheckIn: nueve,
        scheduleKey: 'office_hours',
        horaEntrada: '08:00',
      }),
    ).toContain('retardo');
    expect(
      hybridTimeFlags({
        erpCheckIn: nueve,
        scheduleKey: 'office_hours',
      }),
    ).not.toContain('retardo');

    // 24/7 sin hora propia no marca. Con horaEntrada guardada, sí.
    const nueveVeinte = '2026-10-20T15:20:00.000Z';
    expect(
      hybridTimeFlags({ erpCheckIn: nueveVeinte, scheduleKey: 'always_on' }),
    ).not.toContain('retardo');
    expect(
      hybridTimeFlags({
        erpCheckIn: nueveVeinte,
        scheduleKey: 'always_on',
        horaEntrada: '09:00',
      }),
    ).toContain('retardo');
  });
});
