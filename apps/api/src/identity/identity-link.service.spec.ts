import { normalizeIdentityKey } from '../attendance/attendance-hybrid.match';

describe('identity canonical key', () => {
  it('normaliza employeeNo ACS y employeeNumber ERP al mismo key', () => {
    expect(normalizeIdentityKey('NXR25SYS001')).toBe('nxr25sys001');
    expect(normalizeIdentityKey(' 42 ')).toBe('42');
    expect(normalizeIdentityKey('ACS-1042')).toBe('acs-1042');
  });
});
