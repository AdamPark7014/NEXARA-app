import { conBaseDesechable } from './base-desechable';
import {
  destinatariosConfigurados,
  direccionReal,
  personasPorRol,
  ROLES_DIRECCION,
  type LectorUsuarios,
} from './destinatarios';
import { ROLES } from '../rbac/roles.v2';

type Persona = {
  id: number;
  email: string;
  puesto?: string | null;
  managerId?: number | null;
  roleKey: string | null;
  isActive?: boolean;
  empresas: number[];
};
type Ajuste = { key: string; companyId: number | null; value: string };

const INT4_MAX = 2_147_483_647;
/** Como Postgres: un entero que no cabe en una columna `Int` hace fallar la consulta entera. */
function exigirInt4(valores: unknown[]) {
  for (const v of valores) {
    if (typeof v === 'number' && (v > INT4_MAX || v < -INT4_MAX - 1)) {
      throw new Error(`Unable to fit integer value '${v}' into an INT4 (32-bit signed integer).`);
    }
  }
}

/**
 * Base en memoria con SOLO las cláusulas que usa el código (isActive, roleKey.in, id.in, companyMemberships.some,
 * key y OR de empresa). Rechaza enteros fuera de INT4 igual que Postgres. La prueba de verdad contra Postgres está al
 * final de este archivo (`NEXARA_PRUEBAS_URL`).
 */
function baseEnMemoria(personas: Persona[], ajustes: Ajuste[] = []) {
  const user = {
    findMany: jest.fn(async (args: any) => {
      const w = args.where ?? {};
      exigirInt4([...(w.id?.in ?? []), w.companyMemberships?.some?.companyId]);
      return personas
        .filter((p) => (w.isActive === undefined ? true : (p.isActive ?? true) === w.isActive))
        .filter((p) => (w.roleKey?.in ? w.roleKey.in.includes(p.roleKey) : true))
        .filter((p) => (w.id?.in ? w.id.in.includes(p.id) : true))
        .filter((p) =>
          w.companyMemberships?.some && 'companyId' in w.companyMemberships.some
            ? p.empresas.includes(w.companyMemberships.some.companyId)
            : true,
        )
        .sort((a, b) => a.id - b.id)
        .map((p) => ({
          id: p.id,
          email: p.email,
          puesto: p.puesto ?? null,
          managerId: p.managerId ?? null,
          roleKey: p.roleKey,
        }));
    }),
  };
  const systemSetting = {
    findMany: jest.fn(async (args: any) => {
      const w = args.where;
      exigirInt4((w.OR ?? []).map((o: { companyId: number | null }) => o.companyId));
      return ajustes
        .filter((a) => a.key === w.key)
        .filter((a) => (w.OR ? w.OR.some((o: { companyId: number | null }) => o.companyId === a.companyId) : true))
        .map((a) => ({ companyId: a.companyId, value: a.value }));
    }),
  };
  return { prisma: { user, systemSetting } as unknown as LectorUsuarios, user, systemSetting };
}

const EMPRESA = 1;
const OTRA = 2;
const real = (id: number, roleKey: string, extra: Partial<Persona> = {}): Persona => ({
  id,
  email: `persona${id}@nexara.com.mx`,
  roleKey,
  empresas: [EMPRESA],
  ...extra,
});

describe('personasPorRol', () => {
  it('pide solo activos, de esos roles y miembros de ESA empresa, en orden estable', async () => {
    const { prisma, user } = baseEnMemoria([real(1, ROLES.CEO)]);
    await personasPorRol(prisma, EMPRESA, [ROLES.CEO, ROLES.DIR_ADMIN]);
    expect(user.findMany).toHaveBeenCalledWith({
      where: { isActive: true, roleKey: { in: ['ceo', 'dir_admin'] }, companyMemberships: { some: { companyId: EMPRESA } } },
      select: { id: true, email: true, puesto: true, managerId: true, roleKey: true },
      orderBy: { id: 'asc' },
    });
  });

  it('devuelve id, email, puesto, jefe y rol', async () => {
    const { prisma } = baseEnMemoria([real(7, ROLES.DIR_OPERACIONES, { puesto: 'Jefe de Operaciones', managerId: 1 })]);
    expect(await personasPorRol(prisma, EMPRESA, [ROLES.DIR_OPERACIONES])).toEqual([
      { id: 7, email: 'persona7@nexara.com.mx', puesto: 'Jefe de Operaciones', managerId: 1, roleKey: 'dir_operaciones' },
    ]);
  });

  it('excluye inactivos, miembros de otra empresa y otros roles', async () => {
    const { prisma } = baseEnMemoria([
      real(1, ROLES.CEO),
      real(2, ROLES.CEO, { isActive: false }),
      real(3, ROLES.CEO, { empresas: [OTRA] }),
      real(4, ROLES.CEO, { empresas: [OTRA, EMPRESA] }),
      real(5, ROLES.VENDEDOR),
    ]);
    expect((await personasPorRol(prisma, EMPRESA, [ROLES.CEO])).map((p) => p.id)).toEqual([1, 4]);
    expect((await personasPorRol(prisma, OTRA, [ROLES.CEO])).map((p) => p.id)).toEqual([3, 4]);
  });

  it.each([
    ['developer', 'developer@nexara.com.mx', null],
    ['developer en mayúsculas', ' Developer@Nexara.com.mx ', null],
    ['Claudia de pruebas', 'claudia.bernal@nexara.com.mx', null],
    ['revisor de tiendas', 'play.review@nexara.com.mx', null],
    ['correo .invalid', 'alguien@nexara.invalid', null],
    ['demo@', 'demo@nexara.com.mx', null],
    ['test@', 'test@nexara.com.mx', null],
    ['tester@', 'tester@nexara.com.mx', null],
    ['review@', 'review@nexara.com.mx', null],
    ['example.com', 'x@example.com', null],
    ['puesto «Demo»', 'real@nexara.com.mx', 'Cuenta demo'],
    ['puesto «Tester»', 'real2@nexara.com.mx', 'Tester de la app'],
    ['puesto «Demostración»', 'real3@nexara.com.mx', 'Demostración'],
    ['sin correo', '', null],
  ])('no avisa a cuentas técnicas, de prueba ni demo: %s', async (_nombre, email, puesto) => {
    const { prisma } = baseEnMemoria([
      { id: 1, email: 'persona1@nexara.com.mx', roleKey: ROLES.CEO, empresas: [EMPRESA] },
      { id: 2, email, puesto, roleKey: ROLES.CEO, empresas: [EMPRESA] },
    ]);
    expect((await personasPorRol(prisma, EMPRESA, [ROLES.CEO])).map((p) => p.id)).toEqual([1]);
  });

  it('el CEO real (gerencia) sí recibe', async () => {
    const { prisma } = baseEnMemoria([
      { id: 1, email: 'gerencia@nexara.com.mx', roleKey: ROLES.CEO, empresas: [EMPRESA] },
    ]);
    expect((await personasPorRol(prisma, EMPRESA, [ROLES.CEO])).map((p) => p.id)).toEqual([1]);
  });

  it('respeta `excluir`', async () => {
    const { prisma } = baseEnMemoria([real(1, ROLES.CEO), real(2, ROLES.DIR_ADMIN), real(3, ROLES.DIR_OPERACIONES)]);
    const todos = await personasPorRol(prisma, EMPRESA, [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES]);
    expect(todos.map((p) => p.id)).toEqual([1, 2, 3]);
    const sin = await personasPorRol(prisma, EMPRESA, [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES], { excluir: [1, 3] });
    expect(sin.map((p) => p.id)).toEqual([2]);
    expect(await personasPorRol(prisma, EMPRESA, [ROLES.CEO], { excluir: [1] })).toEqual([]);
  });

  it.each([
    [0],
    [-1],
    [Number.NaN],
    [undefined],
    [null],
    [1.5],
    ['1'],
    [Number.POSITIVE_INFINITY],
    [2147483648],
    [2 ** 40],
    [Number.MAX_SAFE_INTEGER],
  ])(
    'una empresa inválida (%p) da [] y ni siquiera consulta: un filtro vacío traería a todas las empresas',
    async (empresa) => {
      const { prisma, user } = baseEnMemoria([real(1, ROLES.CEO)]);
      expect(await personasPorRol(prisma, empresa as never, [ROLES.CEO])).toEqual([]);
      expect(user.findMany).not.toHaveBeenCalled();
    },
  );

  it('sin roles da [] sin consultar', async () => {
    const { prisma, user } = baseEnMemoria([real(1, ROLES.CEO)]);
    expect(await personasPorRol(prisma, EMPRESA, [])).toEqual([]);
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it('un error de la base se propaga (quien llama decide)', async () => {
    const { prisma, user } = baseEnMemoria([]);
    user.findMany.mockRejectedValueOnce(new Error('base caída'));
    await expect(personasPorRol(prisma, EMPRESA, [ROLES.CEO])).rejects.toThrow('base caída');
  });
});

describe('direccionReal', () => {
  it('son el CEO, el Director Administrativo y el Director de Operaciones', () => {
    expect([...ROLES_DIRECCION]).toEqual(['ceo', 'dir_admin', 'dir_operaciones']);
  });

  it('solo trae a la dirección de la empresa, sin cuentas de prueba, y respeta `excluir`', async () => {
    const { prisma } = baseEnMemoria([
      real(1, ROLES.CEO),
      real(2, ROLES.DIR_ADMIN),
      real(3, ROLES.DIR_OPERACIONES),
      real(4, ROLES.COORD_ADMIN),
      real(5, ROLES.ARQUITECTO),
      real(6, ROLES.CEO, { empresas: [OTRA] }),
      { id: 7, email: 'claudia.bernal@nexara.com.mx', roleKey: ROLES.CEO, empresas: [EMPRESA] },
    ]);
    expect((await direccionReal(prisma, EMPRESA)).map((p) => p.id)).toEqual([1, 2, 3]);
    expect((await direccionReal(prisma, EMPRESA, [3])).map((p) => p.id)).toEqual([1, 2]);
    expect((await direccionReal(prisma, OTRA)).map((p) => p.id)).toEqual([6]);
  });

  it('sin empresa válida da []', async () => {
    const { prisma } = baseEnMemoria([real(1, ROLES.CEO)]);
    expect(await direccionReal(prisma, 0)).toEqual([]);
  });

  it('una empresa que no cabe en el INT4 de la base da [] en vez de lanzar', async () => {
    const { prisma, user } = baseEnMemoria([real(1, ROLES.CEO)]);
    await expect(direccionReal(prisma, 2 ** 40)).resolves.toEqual([]);
    await expect(direccionReal(prisma, 2147483648)).resolves.toEqual([]);
    expect(user.findMany).not.toHaveBeenCalled();
    // El último id que cabe sí consulta (y no lanza).
    await expect(direccionReal(prisma, 2147483647)).resolves.toEqual([]);
    expect(user.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('destinatariosConfigurados', () => {
  const CLAVE = 'piloto.contactos.destinatarios';
  const gente = [
    real(10, ROLES.COORD_VENTAS, { puesto: 'Gerente Comercial' }),
    real(11, ROLES.VENDEDOR),
    real(12, ROLES.ENC_SOPORTE),
    real(13, ROLES.ING_SOPORTE),
    real(14, ROLES.VENDEDOR, { isActive: false }),
    real(15, ROLES.VENDEDOR, { empresas: [OTRA] }),
  ];
  const con = (valor: string, extra: Ajuste[] = []) =>
    baseEnMemoria(gente, [{ key: CLAVE, companyId: EMPRESA, value: valor }, ...extra]);

  it('lee las áreas y devuelve solo la pedida, sin importar mayúsculas', async () => {
    const { prisma } = con('{"VENTAS":[10,11],"SOPORTE":[12,13]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10, 11]);
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'soporte')).map((p) => p.id)).toEqual([12, 13]);
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, ' Soporte ')).map((p) => p.id)).toEqual([12, 13]);
    expect(await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'RH')).toEqual([]);
  });

  it('un área escrita en minúsculas en el JSON también se encuentra', async () => {
    const { prisma } = con('{"ventas":[10]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10]);
  });

  it('dos áreas que solo difieren en mayúsculas se juntan: no gana solo la última', async () => {
    const { prisma } = con('{"ventas":[10],"VENTAS":[11,10]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10, 11]);
  });

  it('sin área, la unión de todas, sin repetidos y en el orden escrito', async () => {
    const { prisma } = con('{"VENTAS":[11,10],"SOPORTE":[13,10,12]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE)).map((p) => p.id)).toEqual([11, 10, 13, 12]);
  });

  it('devuelve a la persona completa (correo, puesto, jefe, rol) para poder avisarle', async () => {
    const { prisma } = con('{"VENTAS":[10]}');
    expect(await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).toEqual([
      { id: 10, email: 'persona10@nexara.com.mx', puesto: 'Gerente Comercial', managerId: null, roleKey: 'coord_ventas' },
    ]);
  });

  it('descarta ids inactivos, de otra empresa o que ya no existen', async () => {
    const { prisma } = con('{"VENTAS":[10,14,15,999]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10]);
  });

  it('la validación es por empresa: el mismo JSON da otra respuesta para otra empresa', async () => {
    const { prisma } = baseEnMemoria(gente, [{ key: CLAVE, companyId: null, value: '{"VENTAS":[10,15]}' }]);
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10]);
    expect((await destinatariosConfigurados(prisma, OTRA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([15]);
  });

  it.each([
    ['vacío', ''],
    ['llave sin cerrar', '{"VENTAS":[10'],
    ['texto suelto', 'ventas'],
    ['null', 'null'],
    ['número', '42'],
    ['texto JSON', '"VENTAS"'],
    ['arreglo en la raíz', '[10,11]'],
    ['área con texto en vez de lista', '{"VENTAS":"10,11"}'],
    ['área con un objeto', '{"VENTAS":{"id":10}}'],
    ['ids que no son ids', '{"VENTAS":[null,"a",-3,0,1.5,{},[10],true]}'],
    ['ids que no caben en el INT4 de la base', '{"VENTAS":[2147483648,99999999999]}'],
    ['ids enormes escritos como texto', '{"VENTAS":["2147483648","99999999999","999999999999999"]}'],
    ['ids al límite de lo seguro en JavaScript', `{"VENTAS":[${Number.MAX_SAFE_INTEGER}]}`],
  ])('JSON roto o de forma inesperada (%s) da [] sin lanzar', async (_nombre, valor) => {
    const { prisma } = con(valor);
    await expect(destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).resolves.toEqual([]);
    await expect(destinatariosConfigurados(prisma, EMPRESA, CLAVE)).resolves.toEqual([]);
  });

  it('un id malo entre ids buenos no tira a los buenos', async () => {
    const { prisma } = con('{"VENTAS":[null,10,"x",11]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10, 11]);
  });

  it('un id que no cabe en el INT4 no tira a los buenos ni llega a la consulta', async () => {
    const { prisma, user } = con('{"VENTAS":[10,2147483648,99999999999,"99999999999",11]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10, 11]);
    expect(user.findMany).toHaveBeenCalledTimes(1);
    expect(user.findMany.mock.calls[0][0].where.id.in).toEqual([10, 11]);
    // Lo mismo sin pedir un área: la unión de todas.
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE)).map((p) => p.id)).toEqual([10, 11]);
  });

  it('el mayor id que cabe en el INT4 (2147483647) sí se consulta', async () => {
    const { prisma, user } = con('{"VENTAS":[2147483647,10]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10]);
    expect(user.findMany.mock.calls[0][0].where.id.in).toEqual([2147483647, 10]);
  });

  it('acepta ids escritos como texto («10»)', async () => {
    const { prisma } = con('{"VENTAS":["10"," 11 "]}');
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10, 11]);
  });

  it('sin fila da [] y no consulta personas', async () => {
    const { prisma, user } = baseEnMemoria(gente, []);
    expect(await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).toEqual([]);
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it('una lista vacía no consulta personas', async () => {
    const { prisma, user } = con('{"VENTAS":[]}');
    expect(await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).toEqual([]);
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it('la fila de la empresa gana a la de plataforma; la de otra empresa no cuenta', async () => {
    const { prisma } = baseEnMemoria(gente, [
      { key: CLAVE, companyId: null, value: '{"VENTAS":[11]}' },
      { key: CLAVE, companyId: EMPRESA, value: '{"VENTAS":[10]}' },
      { key: CLAVE, companyId: OTRA, value: '{"VENTAS":[15]}' },
    ]);
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10]);
    expect((await destinatariosConfigurados(prisma, OTRA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([15]);
  });

  it('la fila de plataforma sirve cuando la empresa no tiene la suya', async () => {
    const { prisma } = baseEnMemoria(gente, [{ key: CLAVE, companyId: null, value: '{"VENTAS":[10]}' }]);
    expect((await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).map((p) => p.id)).toEqual([10]);
  });

  it('si la fila de la empresa está rota NO se cae a la de plataforma: la empresa manda', async () => {
    const { prisma } = baseEnMemoria(gente, [
      { key: CLAVE, companyId: null, value: '{"VENTAS":[11]}' },
      { key: CLAVE, companyId: EMPRESA, value: '{roto' },
    ]);
    expect(await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).toEqual([]);
  });

  it('el valor se acota a la persona de esa empresa en la consulta (no se confía solo en el filtro posterior)', async () => {
    const { prisma, user } = con('{"VENTAS":[10]}');
    await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS');
    expect(user.findMany.mock.calls[0][0].where).toEqual({
      id: { in: [10] },
      isActive: true,
      companyMemberships: { some: { companyId: EMPRESA } },
    });
  });

  it.each([[0], [-3], [Number.NaN], [undefined], ['1'], [2147483648], [2 ** 40]])('una empresa inválida (%p) da [] sin consultar nada', async (empresa) => {
    const { prisma, user, systemSetting } = con('{"VENTAS":[10]}');
    expect(await destinatariosConfigurados(prisma, empresa as never, CLAVE, 'VENTAS')).toEqual([]);
    expect(user.findMany).not.toHaveBeenCalled();
    expect(systemSetting.findMany).not.toHaveBeenCalled();
  });

  it('un error de la base al leer la fila se propaga; el dato mal formado no', async () => {
    const { prisma, systemSetting } = con('{"VENTAS":[10]}');
    systemSetting.findMany.mockRejectedValueOnce(new Error('base caída'));
    await expect(destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS')).rejects.toThrow('base caída');
  });

  it('acota la lista a 100 ids por área', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    const { prisma, user } = con(JSON.stringify({ VENTAS: ids }));
    await destinatariosConfigurados(prisma, EMPRESA, CLAVE, 'VENTAS');
    expect(user.findMany.mock.calls[0][0].where.id.in).toHaveLength(100);
  });
});

/** Contra Postgres de verdad (se salta sin `NEXARA_PRUEBAS_URL`): los filtros los hace la base, no la prueba. */
conBaseDesechable('destinatarios del Piloto contra Postgres', (base) => {
  let n = 0;
  async function sembrar() {
    const [e1, e2] = await Promise.all([
      base.prisma.companyProfile.create({ data: { legalName: 'Empresa uno', rfc: 'AAA010101AAA' } }),
      base.prisma.companyProfile.create({ data: { legalName: 'Empresa dos', rfc: 'BBB020202BBB' } }),
    ]);
    const rol = await base.prisma.role.create({ data: { nombre: `Rol de prueba ${++n}` } });
    const dep = await base.prisma.department.create({ data: { nombre: 'General', companyId: e1.id } });
    /** Crea la cuenta; si la base molde ya la trae sembrada (developer@…), la reutiliza con el rol y la empresa pedidos. */
    const persona = async (
      email: string,
      roleKey: string,
      empresas: number[],
      extra: { isActive?: boolean; puesto?: string; managerId?: number } = {},
    ) => {
      const sembrada = await base.prisma.user.findUnique({ where: { email } });
      if (sembrada) {
        await base.prisma.user.update({
          where: { id: sembrada.id },
          data: { roleKey, isActive: true, ...extra, companyMemberships: { create: empresas.map((companyId) => ({ companyId })) } },
        });
        return sembrada;
      }
      return base.prisma.user.create({
        data: {
          nombre: email.split('@')[0],
          email,
          passwordHash: 'no-es-una-contrasena',
          roleId: rol.id,
          roleKey,
          departmentId: dep.id,
          ...extra,
          companyMemberships: { create: empresas.map((companyId) => ({ companyId })) },
        },
      });
    };
    return { e1, e2, persona };
  }

  it('personasPorRol y direccionReal filtran en la base: activos, de la empresa, sin cuentas de prueba', async () => {
    const { e1, e2, persona } = await sembrar();
    const ceo = await persona('ceo@prueba-piloto.mx', ROLES.CEO, [e1.id]);
    const admin = await persona('admin@prueba-piloto.mx', ROLES.DIR_ADMIN, [e1.id], { managerId: ceo.id });
    const ops = await persona('ops@prueba-piloto.mx', ROLES.DIR_OPERACIONES, [e1.id], { puesto: 'Jefe de Operaciones', managerId: ceo.id });
    await persona('inactivo@prueba-piloto.mx', ROLES.DIR_ADMIN, [e1.id], { isActive: false });
    const deOtra = await persona('otra@prueba-piloto.mx', ROLES.CEO, [e2.id]);
    await persona('claudia.bernal@nexara.com.mx', ROLES.CEO, [e1.id]);
    await persona('developer@nexara.com.mx', ROLES.DIR_ADMIN, [e1.id]);
    await persona('demo@prueba-piloto.mx', ROLES.DIR_OPERACIONES, [e1.id]);
    await persona('vendedor@prueba-piloto.mx', ROLES.VENDEDOR, [e1.id]);
    const ambas = await persona('ambas@prueba-piloto.mx', ROLES.CEO, [e1.id, e2.id]);

    const prisma = base.prisma as never;
    const uno = await direccionReal(prisma, e1.id);
    expect(uno.map((p) => p.id)).toEqual([ceo.id, admin.id, ops.id, ambas.id]);
    expect(uno.find((p) => p.id === ops.id)).toEqual({
      id: ops.id,
      email: 'ops@prueba-piloto.mx',
      puesto: 'Jefe de Operaciones',
      managerId: ceo.id,
      roleKey: 'dir_operaciones',
    });
    expect((await direccionReal(prisma, e2.id)).map((p) => p.id)).toEqual([deOtra.id, ambas.id]);
    expect((await direccionReal(prisma, e1.id, [ceo.id, ambas.id])).map((p) => p.id)).toEqual([admin.id, ops.id]);
    expect((await personasPorRol(prisma, e1.id, [ROLES.VENDEDOR])).map((p) => p.email)).toEqual(['vendedor@prueba-piloto.mx']);
    // Sin empresa válida no se trae a nadie (no «a todas las empresas»).
    expect(await direccionReal(prisma, undefined as never)).toEqual([]);
    expect(await direccionReal(prisma, 0)).toEqual([]);
    // Una empresa que no cabe en el INT4 de la base: Postgres rechazaría la consulta; aquí ni se hace.
    await expect(direccionReal(prisma, 2 ** 40)).resolves.toEqual([]);
    await expect(direccionReal(prisma, 2147483648)).resolves.toEqual([]);
  });

  it('destinatariosConfigurados valida cada id contra la base y no se cae con JSON roto', async () => {
    const { e1, e2, persona } = await sembrar();
    const ventas = await persona('ventas@prueba-piloto.mx', ROLES.COORD_VENTAS, [e1.id]);
    const soporte = await persona('soporte@prueba-piloto.mx', ROLES.ENC_SOPORTE, [e1.id]);
    const baja = await persona('baja@prueba-piloto.mx', ROLES.VENDEDOR, [e1.id], { isActive: false });
    const ajena = await persona('ajena@prueba-piloto.mx', ROLES.VENDEDOR, [e2.id]);
    const prisma = base.prisma as never;
    const clave = 'piloto.contactos.destinatarios';
    await base.prisma.systemSetting.create({
      data: {
        key: clave,
        category: 'piloto',
        companyId: e1.id,
        value: JSON.stringify({ VENTAS: [ventas.id, baja.id, ajena.id, 999999], SOPORTE: [soporte.id] }),
      },
    });
    expect((await destinatariosConfigurados(prisma, e1.id, clave, 'VENTAS')).map((p) => p.id)).toEqual([ventas.id]);
    expect((await destinatariosConfigurados(prisma, e1.id, clave, 'SOPORTE')).map((p) => p.email)).toEqual(['soporte@prueba-piloto.mx']);
    expect((await destinatariosConfigurados(prisma, e1.id, clave)).map((p) => p.id)).toEqual([ventas.id, soporte.id]);
    // La otra empresa no hereda la lista de la primera.
    expect(await destinatariosConfigurados(prisma, e2.id, clave, 'VENTAS')).toEqual([]);

    await base.prisma.systemSetting.updateMany({ where: { key: clave }, data: { value: '{ esto no es json' } });
    await expect(destinatariosConfigurados(prisma, e1.id, clave, 'VENTAS')).resolves.toEqual([]);
  });

  it('un id que no cabe en el INT4 no lanza ni tira a los ids buenos (Postgres rechaza la consulta entera)', async () => {
    const { e1, persona } = await sembrar();
    const ventas = await persona('ventas@prueba-piloto.mx', ROLES.COORD_VENTAS, [e1.id]);
    const soporte = await persona('soporte@prueba-piloto.mx', ROLES.ENC_SOPORTE, [e1.id]);
    const prisma = base.prisma as never;
    const clave = 'piloto.contactos.destinatarios';
    // Lo que se descartaría antes de consultar, por si algún día se cuela a la base: así falla de verdad.
    await expect(
      base.prisma.user.findMany({ where: { id: { in: [ventas.id, 99999999999] } } }),
    ).rejects.toThrow(/INT4|32-bit|out of range|fit integer/i);

    await base.prisma.systemSetting.create({
      data: {
        key: clave,
        category: 'piloto',
        companyId: e1.id,
        value: JSON.stringify({ VENTAS: [ventas.id, 2147483648, 99999999999], SOPORTE: [99999999999, soporte.id] }),
      },
    });
    await expect(destinatariosConfigurados(prisma, e1.id, clave, 'VENTAS')).resolves.toEqual([
      expect.objectContaining({ id: ventas.id }),
    ]);
    expect((await destinatariosConfigurados(prisma, e1.id, clave, 'SOPORTE')).map((p) => p.id)).toEqual([soporte.id]);
    expect((await destinatariosConfigurados(prisma, e1.id, clave)).map((p) => p.id)).toEqual([ventas.id, soporte.id]);

    // Un área con SOLO ids imposibles da [] sin lanzar.
    await base.prisma.systemSetting.updateMany({ where: { key: clave }, data: { value: '{"VENTAS":[99999999999]}' } });
    await expect(destinatariosConfigurados(prisma, e1.id, clave, 'VENTAS')).resolves.toEqual([]);
  });
});
