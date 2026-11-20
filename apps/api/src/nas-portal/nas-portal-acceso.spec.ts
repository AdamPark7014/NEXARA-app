import { decidirAccesoNas, listaNasDesdeEntorno, urlLoginNas } from './nas-portal-acceso';

describe('acceso al portal del NAS', () => {
  it('sin lista configurada solo entra super_admin', () => {
    const lista = listaNasDesdeEntorno({});
    expect(decidirAccesoNas({ id: 5, roleKey: 'arquitecto' }, lista)).toBe('denegar');
    expect(decidirAccesoNas({ id: 5, roleKey: 'super_admin' }, lista)).toBe('permitir');
  });

  it('entran los ids de la lista y nadie más', () => {
    const lista = listaNasDesdeEntorno({ NAS_PORTAL_USER_IDS: ' 1, 3 ,x,8,-2' });
    expect([...lista.userIds].sort((a, b) => a - b)).toEqual([1, 3, 8]);
    expect(decidirAccesoNas({ id: 3, roleKey: 'arquitecto' }, lista)).toBe('permitir');
    expect(decidirAccesoNas({ id: 4, roleKey: 'arquitecto' }, lista)).toBe('denegar');
  });

  it('un usuario inactivo no entra aunque esté en la lista', () => {
    const lista = listaNasDesdeEntorno({ NAS_PORTAL_USER_IDS: '1' });
    expect(decidirAccesoNas({ id: 1, roleKey: 'ceo', isActive: false }, lista)).toBe('denegar');
  });

  it('NAS_PORTAL_ROLE_KEYS vacío quita el pase por rol', () => {
    const lista = listaNasDesdeEntorno({ NAS_PORTAL_ROLE_KEYS: '' });
    expect(decidirAccesoNas({ id: 9, roleKey: 'super_admin' }, lista)).toBe('denegar');
  });

  it('el rol se compara sin importar mayúsculas', () => {
    const lista = listaNasDesdeEntorno({ NAS_PORTAL_ROLE_KEYS: 'CEO' });
    expect(decidirAccesoNas({ id: 9, roleKey: 'ceo' }, lista)).toBe('permitir');
  });

  it('manda al login de la consola por omisión', () => {
    expect(urlLoginNas({})).toBe('https://app.nexara.com.mx/login');
  });
});
