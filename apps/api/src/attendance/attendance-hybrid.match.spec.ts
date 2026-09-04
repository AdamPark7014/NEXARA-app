import {
  acsIdentityKeys,
  erpIdentityKeys,
  findAcsMatchKey,
  hybridTimeFlags,
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
});
