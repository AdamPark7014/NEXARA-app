import { BadRequestException } from '@nestjs/common';
import { assertRefsBelongToCompany } from './assert-refs.js';

/**
 * El aislamiento por empresa actúa sobre los `where` de las consultas. Un
 * `create` escribe las claves foráneas tal cual, así que las referencias que
 * llegan del cuerpo de la petición hay que comprobarlas a mano.
 */

const modeloCon = (ids: number[]) => ({
  findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
});

describe('referencias de otra empresa', () => {
  it('deja pasar lo que sí es de la empresa', async () => {
    const clientes = modeloCon([3, 4]);
    await expect(
      assertRefsBelongToCompany(7, [{ modelo: clientes as any, ids: [3, 4], etiqueta: 'Cliente' }]),
    ).resolves.toBeUndefined();
  });

  it('acota la consulta a la empresa', async () => {
    const clientes = modeloCon([3]);
    await assertRefsBelongToCompany(7, [{ modelo: clientes as any, ids: [3], etiqueta: 'Cliente' }]);

    const args = clientes.findMany.mock.calls[0][0];
    expect(args.where.companyId).toBe(7);
    expect(args.where.id.in).toEqual([3]);
  });

  it('rechaza la referencia ajena', async () => {
    const clientes = modeloCon([3]);
    await expect(
      assertRefsBelongToCompany(7, [{ modelo: clientes as any, ids: [3, 99], etiqueta: 'Cliente' }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('nombra sólo las ajenas, no las buenas', async () => {
    const clientes = modeloCon([3]);
    await expect(
      assertRefsBelongToCompany(7, [{ modelo: clientes as any, ids: [3, 99], etiqueta: 'Cliente' }]),
    ).rejects.toThrow('Cliente no disponible en esta empresa: 99');
  });

  it('ignora nulos: una referencia opcional no enviada no es un fallo', async () => {
    const clientes = modeloCon([]);
    await expect(
      assertRefsBelongToCompany(7, [
        { modelo: clientes as any, ids: [null, undefined], etiqueta: 'Cliente' },
      ]),
    ).resolves.toBeUndefined();
    expect(clientes.findMany).not.toHaveBeenCalled();
  });

  it('deduplica: diez renglones con el mismo producto son una consulta con un id', async () => {
    const productos = modeloCon([5]);
    await assertRefsBelongToCompany(7, [
      { modelo: productos as any, ids: [5, 5, 5, 5], etiqueta: 'Producto' },
    ]);
    expect(productos.findMany.mock.calls[0][0].where.id.in).toEqual([5]);
  });

  it('una consulta por modelo, no una por referencia', async () => {
    const productos = modeloCon([1, 2, 3]);
    await assertRefsBelongToCompany(7, [
      { modelo: productos as any, ids: [1, 2, 3], etiqueta: 'Producto' },
    ]);
    expect(productos.findMany).toHaveBeenCalledTimes(1);
  });

  it('comprueba varios modelos a la vez', async () => {
    const clientes = modeloCon([1]);
    const productos = modeloCon([2]);
    await assertRefsBelongToCompany(7, [
      { modelo: clientes as any, ids: [1], etiqueta: 'Cliente' },
      { modelo: productos as any, ids: [2], etiqueta: 'Producto' },
    ]);
    expect(clientes.findMany).toHaveBeenCalled();
    expect(productos.findMany).toHaveBeenCalled();
  });

  it('sin referencias no consulta nada', async () => {
    const clientes = modeloCon([]);
    await assertRefsBelongToCompany(7, [{ modelo: clientes as any, ids: [], etiqueta: 'Cliente' }]);
    expect(clientes.findMany).not.toHaveBeenCalled();
  });

  it('descarta ids inválidos en vez de consultarlos', async () => {
    const clientes = modeloCon([]);
    await assertRefsBelongToCompany(7, [
      { modelo: clientes as any, ids: [0, -1, NaN as any], etiqueta: 'Cliente' },
    ]);
    expect(clientes.findMany).not.toHaveBeenCalled();
  });
});
