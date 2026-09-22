import { PeerRequestsService } from './peer-requests.service';

/**
 * A quién le puedo pedir una actividad. Antes el selector se llenaba con la
 * pizarra (`me/board`), que recorta por organigrama: Daniela veía un solo
 * nombre. Ahora ve a todo el personal, menos ella y las cuentas de plataforma.
 */
describe('PeerRequestsService.listCandidates', () => {
  const personal = [
    { id: 2, nombre: 'Ana Ruiz', email: 'ana.ruiz@nexara.com.mx', avatarUrl: null, puesto: 'Técnica', roleKey: 'ing_campo' },
    { id: 3, nombre: 'Christian', email: 'gerencia@nexara.com.mx', avatarUrl: null, puesto: 'CEO', roleKey: 'ceo' },
    { id: 4, nombre: 'Luis Mora', email: 'luis.mora@nexara.com.mx', avatarUrl: null, puesto: 'Coordinador', roleKey: 'coord_operaciones' },
  ];

  function servicio(findMany: jest.Mock) {
    return new PeerRequestsService({ user: { findMany } } as never, {} as never);
  }

  it('devuelve al personal de la empresa sin las cuentas de plataforma', async () => {
    const findMany = jest.fn().mockResolvedValue(personal);
    const candidatos = await servicio(findMany).listCandidates({ id: 1 }, 5);
    expect(candidatos.map((u) => u.id)).toEqual([2, 4]);
  });

  it('no me ofrece a mí mismo ni a gente de baja, y no filtra por organigrama', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await servicio(findMany).listCandidates({ id: 1 }, 5);
    const [{ where }] = findMany.mock.calls[0];
    expect(where).toEqual({
      isActive: true,
      id: { not: 1 },
      companyMemberships: { some: { companyId: 5 } },
    });
    expect(JSON.stringify(where)).not.toContain('managerId');
  });

  it('sin empresa activa no adivina: pide empresa', async () => {
    const findMany = jest.fn();
    await expect(servicio(findMany).listCandidates({ id: 1 }, null)).rejects.toThrow(
      'Se requiere empresa activa',
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
