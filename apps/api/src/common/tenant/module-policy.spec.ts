import { ForbiddenException } from '@nestjs/common';
import {
  aplicarPoliticaANavegacion,
  modulosOcultosPara,
  parsearPolitica,
  puedeUsarModulo,
  serializarPolitica,
} from './module-policy.js';
import { ModulePolicyService } from './module-policy.service.js';

const SOLO_CEO = parsearPolitica('{"employee-payments":["ceo"]}');

describe('parsearPolitica', () => {
  it('sin valor, JSON roto o forma equivocada = sin restricciones', () => {
    expect(parsearPolitica(null)).toEqual({});
    expect(parsearPolitica('')).toEqual({});
    expect(parsearPolitica('{no es json')).toEqual({});
    expect(parsearPolitica('[1,2]')).toEqual({});
    expect(parsearPolitica('"ceo"')).toEqual({});
  });

  it('lee la lista de roles y normaliza mayúsculas, espacios y repetidos', () => {
    expect(parsearPolitica('{"employee-payments":[" CEO ","ceo","dir_admin"]}')).toEqual({
      'employee-payments': ['ceo', 'dir_admin'],
    });
  });

  it('ignora módulos que no se pueden restringir', () => {
    expect(parsearPolitica('{"invoicing":["ceo"],"employee-payments":["ceo"]}')).toEqual({
      'employee-payments': ['ceo'],
    });
  });

  it('un rol mal escrito no abre el módulo: queda restringido a nadie (solo super admin)', () => {
    const politica = parsearPolitica('{"employee-payments":["directoor"]}');
    expect(politica['employee-payments']).toEqual([]);
    expect(puedeUsarModulo(politica, 'employee-payments', { roleKey: 'ceo' })).toBe(false);
    expect(puedeUsarModulo(politica, 'employee-payments', { roleKey: 'super_admin' })).toBe(true);
  });

  it('serializar y volver a leer conserva la política', () => {
    expect(parsearPolitica(serializarPolitica(SOLO_CEO))).toEqual(SOLO_CEO);
  });
});

describe('puedeUsarModulo', () => {
  it('sin política todos los roles siguen como antes', () => {
    expect(puedeUsarModulo({}, 'employee-payments', { roleKey: 'contabilidad' })).toBe(true);
  });

  it('solo CEO: la contabilidad, RH y la dirección administrativa quedan fuera', () => {
    expect(puedeUsarModulo(SOLO_CEO, 'employee-payments', { roleKey: 'ceo' })).toBe(true);
    for (const rol of ['contabilidad', 'rh', 'dir_admin', 'coord_admin', 'administrativo', 'dir_operaciones']) {
      expect(puedeUsarModulo(SOLO_CEO, 'employee-payments', { roleKey: rol })).toBe(false);
    }
  });

  it('el super admin (equipo de desarrollo) nunca queda fuera', () => {
    expect(puedeUsarModulo(SOLO_CEO, 'employee-payments', { roleKey: 'super_admin' })).toBe(true);
    expect(puedeUsarModulo(SOLO_CEO, 'employee-payments', { isSuperAdmin: true })).toBe(true);
  });

  it('un usuario sin rol reconocido queda fuera de un módulo restringido', () => {
    expect(puedeUsarModulo(SOLO_CEO, 'employee-payments', { roleKey: null })).toBe(false);
    expect(puedeUsarModulo(SOLO_CEO, 'employee-payments', null)).toBe(false);
  });
});

describe('aplicarPoliticaANavegacion', () => {
  const nav = {
    webModuleIds: ['dashboard', 'employee-payments', 'erp-pagos-empleados', 'invoicing'],
    moduleKeys: ['dashboard', 'erp-pagos-empleados', 'employee-payments', 'expenses'],
  };

  it('quita el módulo restringido de web y apps, y lo declara oculto', () => {
    const ocultos = modulosOcultosPara(SOLO_CEO, { roleKey: 'contabilidad' });
    const r = aplicarPoliticaANavegacion(nav, ocultos);
    expect(r.webModuleIds).toEqual(['dashboard', 'invoicing']);
    expect(r.moduleKeys).toEqual(['dashboard', 'expenses']);
    expect(r.hiddenModuleIds).toEqual(['employee-payments', 'erp-pagos-empleados']);
  });

  it('el CEO conserva todo y no hay módulos ocultos', () => {
    const r = aplicarPoliticaANavegacion(nav, modulosOcultosPara(SOLO_CEO, { roleKey: 'ceo' }));
    expect(r.webModuleIds).toEqual(nav.webModuleIds);
    expect(r.moduleKeys).toEqual(nav.moduleKeys);
    expect(r.hiddenModuleIds).toEqual([]);
  });

  it('nunca toca la facturación', () => {
    const r = aplicarPoliticaANavegacion(nav, modulosOcultosPara(SOLO_CEO, { roleKey: 'contabilidad' }));
    expect(r.webModuleIds).toContain('invoicing');
  });
});

describe('ModulePolicyService', () => {
  const NEXARA = 7;
  const OTRA = 9;

  function crear(filas: Array<{ companyId: number | null; value: string }>) {
    const findMany = jest.fn(async ({ where }: any) => {
      const permitidos: Array<number | null> = where.OR
        ? where.OR.map((o: any) => o.companyId)
        : [where.companyId];
      return filas.filter((f) => permitidos.includes(f.companyId));
    });
    const servicio = new ModulePolicyService({ systemSetting: { findMany } } as any);
    return { servicio, findMany };
  }

  it('la restricción de una empresa no toca a las demás', async () => {
    const { servicio } = crear([{ companyId: NEXARA, value: '{"employee-payments":["ceo"]}' }]);
    expect(await servicio.puedeUsar('employee-payments', { roleKey: 'contabilidad' }, NEXARA)).toBe(false);
    expect(await servicio.puedeUsar('employee-payments', { roleKey: 'contabilidad' }, OTRA)).toBe(true);
  });

  it('la fila de la empresa gana sobre la de plataforma', async () => {
    const { servicio } = crear([
      { companyId: null, value: '{"employee-payments":["ceo","contabilidad"]}' },
      { companyId: NEXARA, value: '{"employee-payments":["ceo"]}' },
    ]);
    expect(await servicio.puedeUsar('employee-payments', { roleKey: 'contabilidad' }, NEXARA)).toBe(false);
    expect(await servicio.puedeUsar('employee-payments', { roleKey: 'contabilidad' }, OTRA)).toBe(true);
    expect(await servicio.puedeUsar('employee-payments', { roleKey: 'rh' }, OTRA)).toBe(false);
  });

  it('sin empresa resuelta solo cuenta la política de plataforma', async () => {
    const { servicio } = crear([{ companyId: NEXARA, value: '{"employee-payments":["ceo"]}' }]);
    expect(await servicio.puedeUsar('employee-payments', { roleKey: 'contabilidad' }, null)).toBe(true);
  });

  it('exigir responde 403 en español y deja pasar al permitido', async () => {
    const { servicio } = crear([{ companyId: NEXARA, value: '{"employee-payments":["ceo"]}' }]);
    await expect(servicio.exigir('employee-payments', { roleKey: 'rh' }, NEXARA)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.exigir('employee-payments', { roleKey: 'rh' }, NEXARA)).rejects.toThrow(/Pagos a personal/);
    await expect(servicio.exigir('employee-payments', { roleKey: 'ceo' }, NEXARA)).resolves.toBeUndefined();
  });

  it('guarda en memoria y invalidar fuerza releer', async () => {
    const { servicio, findMany } = crear([{ companyId: NEXARA, value: '{"employee-payments":["ceo"]}' }]);
    await servicio.politicaDe(NEXARA);
    await servicio.politicaDe(NEXARA);
    expect(findMany).toHaveBeenCalledTimes(1);
    servicio.invalidar(NEXARA);
    await servicio.politicaDe(NEXARA);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
