/**
 * Los sembradores contra un Postgres de verdad, DESECHABLE. Sin `SEED_PRUEBAS_URL` se salta.
 *
 *   SEED_PRUEBAS_URL=postgresql://usuario@127.0.0.1:55471/plantilla npx jest src/common/seeds
 *
 * La URL apunta a una base ya migrada (`prisma migrate deploy`) que solo se usa como molde: cada prueba clona la suya
 * y la borra. Se niega si el anfitrión no es 127.0.0.1 o si en el molde ya entró alguien.
 */
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { DEPARTAMENTOS_REQUERIDOS, leerPlantilla, ROLES_REQUERIDOS } from '../../../prisma/plantilla';
import {
  administrarCuentas,
  avisarSinContrasenaPropia,
  claveDeAutorizacion,
  describirBase,
  HUELLAS_PUBLICAS,
  nombreDeVariable,
  SeedDetenido,
  sembrarCuentas,
  sembrarEstructura,
  type Entorno,
} from '../../../prisma/seed-seguro';

/** Personas inventadas: la plantilla real es local. */
const { cuentas: PLANTILLA_PRUEBA, retiradas: RETIRADAS_PRUEBA } = leerPlantilla({ SEED_PLANTILLA: join(__dirname, 'plantilla-prueba.json') });
const DIRECCION = 'direccion@prueba.example';
const CAMPO = 'campo1@prueba.example';
const MOLDE = process.env.SEED_PRUEBAS_URL;
const NORMAL = { simular: false, solo: [] as string[] };
const SIMULAR = { simular: true, solo: [] as string[] };

const conBase = (url: string, nombre: string) => {
  const u = new URL(url);
  u.pathname = `/${nombre}`;
  return u.toString();
};
const abrir = (url: string) => new PrismaClient({ datasources: { db: { url } }, log: [], errorFormat: 'minimal' });

(MOLDE ? describe : describe.skip)('sembradores contra Postgres desechable', () => {
  jest.setTimeout(120_000);
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let url: string;
  let base: string;
  let lineas: string[];
  const decir = (l: string) => void lineas.push(l);

  /** Contraseñas nuevas en cada corrida: no hay ninguna escrita en el repositorio. */
  const entornoCompleto = (extra: Entorno = {}): Entorno => ({
    DATABASE_URL: url,
    ...Object.fromEntries(PLANTILLA_PRUEBA.map((c) => [nombreDeVariable(c.email), `Aa1${randomBytes(9).toString('hex')}`])),
    ...extra,
  });

  /** Foto completa de las tablas que los sembradores podrían tocar. */
  const foto = async () =>
    JSON.stringify(
      await Promise.all([
        prisma.$queryRawUnsafe('select to_jsonb(t) f from "User" t order by id'),
        prisma.$queryRawUnsafe('select to_jsonb(t) f from user_companies t order by id'),
        prisma.$queryRawUnsafe('select to_jsonb(t) f from "Role" t order by id'),
        prisma.$queryRawUnsafe('select to_jsonb(t) f from "Department" t order by id'),
      ]),
    );
  const vaciarCuentas = () => prisma.$executeRawUnsafe('delete from user_companies').then(() => prisma.$executeRawUnsafe('truncate "User" cascade'));
  const estructura = () => sembrarEstructura(prisma, ROLES_REQUERIDOS, DEPARTAMENTOS_REQUERIDOS, NORMAL, decir);

  beforeAll(async () => {
    if (describirBase(MOLDE).host !== '127.0.0.1') throw new Error('SEED_PRUEBAS_URL tiene que ser 127.0.0.1');
    const molde = abrir(MOLDE as string);
    if (await molde.user.count({ where: { lastLoginAt: { not: null } } })) throw new Error('El molde no es desechable');
    await molde.$disconnect();
    admin = abrir(conBase(MOLDE as string, 'postgres'));
  });
  afterAll(async () => admin?.$disconnect());

  beforeEach(async () => {
    lineas = [];
    base = `seed_prueba_${randomBytes(6).toString('hex')}`;
    await admin.$executeRawUnsafe(`create database "${base}" template "${describirBase(MOLDE).nombre}"`);
    url = conBase(MOLDE as string, base);
    prisma = abrir(url);
  });
  afterEach(async () => {
    await prisma.$disconnect();
    await admin.$executeRawUnsafe(`drop database if exists "${base}" with (force)`);
  });

  it('base sin cuentas: crea la plantilla completa, con contraseña, empresa, rol y jefe', async () => {
    await vaciarCuentas();
    await estructura();
    const entorno = entornoCompleto();
    const r = await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entorno, NORMAL, decir);
    expect(r.creadas).toHaveLength(PLANTILLA_PRUEBA.length);
    const filas = await prisma.user.findMany({ include: { companyMemberships: true, manager: true } });
    expect(filas).toHaveLength(PLANTILLA_PRUEBA.length);
    for (const c of PLANTILLA_PRUEBA) {
      const u = filas.find((f) => f.email === c.email);
      expect(bcryptjs.compareSync(entorno[nombreDeVariable(c.email)] as string, u?.passwordHash ?? '')).toBe(true);
      expect(u?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
      expect(u?.companyMemberships).toHaveLength(1);
      expect(u?.roleKey).toBe(c.roleKey);
      expect(u?.manager?.email ?? null).toBe(c.managerEmail ?? null);
    }
    // Ni una contraseña en lo que se imprime.
    for (const c of PLANTILLA_PRUEBA) expect(lineas.join('\n')).not.toContain(entorno[nombreDeVariable(c.email)]);
  });

  it('cuentas existentes: no cambia contraseña, rol, menú, jefe, bloqueo ni estado', async () => {
    await estructura();
    const sinCampo = PLANTILLA_PRUEBA.filter((c) => c.email !== CAMPO);
    await sembrarCuentas(prisma, sinCampo, entornoCompleto(), NORMAL, decir);
    await prisma.user.update({
      where: { email: 'operaciones@prueba.example' },
      data: {
        passwordHash: bcryptjs.hashSync(randomBytes(8).toString('hex'), 4),
        roleKey: 'administrativo',
        isActive: false,
        failedLoginCount: 4,
        lockedUntil: new Date(Date.now() + 86_400_000),
        moduleAccess: { chat: 'off' },
        puesto: 'Puesto puesto a mano',
        managerId: null,
      },
    });
    const correosAntes = (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);
    const antes = await prisma.$queryRawUnsafe(`select to_jsonb(t) f from "User" t where id in (${correosAntes.join(',')}) order by id`);
    const r = await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
    const despues = await prisma.$queryRawUnsafe(`select to_jsonb(t) f from "User" t where id in (${correosAntes.join(',')}) order by id`);
    expect(despues).toEqual(antes);
    expect(r.creadas).toEqual([CAMPO]);
    expect(await prisma.user.count()).toBe(correosAntes.length + 1);
  });

  it('un correo existente con otras mayúsculas no se duplica', async () => {
    await vaciarCuentas();
    await estructura();
    await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
    await prisma.user.update({ where: { email: DIRECCION }, data: { email: 'Direccion@PRUEBA.example' } });
    const antes = await foto();
    const r = await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
    expect(r.creadas).toEqual([]);
    expect(await foto()).toBe(antes);
  });

  it('variables ausentes: se detiene sin escribir nada y las nombra', async () => {
    await vaciarCuentas();
    await estructura();
    const antes = await foto();
    const error = await sembrarCuentas(prisma, PLANTILLA_PRUEBA, { DATABASE_URL: url }, NORMAL, decir).catch((e) => e);
    expect(error).toBeInstanceOf(SeedDetenido);
    expect(error.motivos).toHaveLength(PLANTILLA_PRUEBA.length);
    expect(error.message).toContain('SEED_PASSWORD_DIRECCION_PRUEBA_EXAMPLE');
    expect(await foto()).toBe(antes);
  });

  it('basta UNA contraseña inválida para no crear ninguna cuenta', async () => {
    await vaciarCuentas();
    await estructura();
    const antes = await foto();
    const variable = nombreDeVariable(PLANTILLA_PRUEBA[PLANTILLA_PRUEBA.length - 1].email);
    for (const mala of ['x', 'corta1', 'sololetrasaqui', '123456789', ' ']) {
      await expect(sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto({ [variable]: mala }), NORMAL, decir)).rejects.toThrow(variable);
    }
    expect(await foto()).toBe(antes);
  });

  it('repetido tres veces no duplica ni cambia nada', async () => {
    await vaciarCuentas();
    for (let i = 0; i < 2; i++) await estructura();
    await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
    const antes = await foto();
    for (let i = 0; i < 3; i++) {
      await estructura();
      // Con OTRAS contraseñas en el entorno: las existentes no deben cambiar.
      const r = await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
      expect(r.creadas).toEqual([]);
    }
    expect(await foto()).toBe(antes);
  });

  it('dos corridas a la vez no duplican cuentas', async () => {
    await vaciarCuentas();
    await estructura();
    const otra = abrir(url);
    const resultados = await Promise.allSettled([
      sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir),
      sembrarCuentas(otra, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir),
    ]);
    await otra.$disconnect();
    expect(resultados.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(await prisma.user.count()).toBe(PLANTILLA_PRUEBA.length);
    expect(await prisma.userCompany.count()).toBe(PLANTILLA_PRUEBA.length);
  });

  it('falla a la mitad del alta: no queda ninguna cuenta a medias', async () => {
    await vaciarCuentas();
    await estructura();
    const antes = await foto();
    await prisma.$executeRawUnsafe(`create function truena() returns trigger as $$ begin
      if (select count(*) from user_companies) >= 3 then raise exception 'falla provocada'; end if; return new; end $$ language plpgsql`);
    await prisma.$executeRawUnsafe('create trigger truena before insert on user_companies for each row execute function truena()');
    const error = await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir).catch((e) => e);
    // Tiene que tronar la base a media escritura, no la revisión previa.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SeedDetenido);
    expect(await foto()).toBe(antes);
  });

  it('falla a la mitad de la estructura: tampoco', async () => {
    await prisma.$executeRawUnsafe('truncate "User" cascade');
    await prisma.$executeRawUnsafe('truncate "Department" cascade');
    const antes = await foto();
    await prisma.$executeRawUnsafe(`create function truena() returns trigger as $$ begin
      if (select count(*) from "Department") >= 1 then raise exception 'falla provocada'; end if; return new; end $$ language plpgsql`);
    await prisma.$executeRawUnsafe('create trigger truena before insert on "Department" for each row execute function truena()');
    await expect(estructura()).rejects.toThrow();
    expect(await foto()).toBe(antes);
  });

  it('base en uso sin autorización: no escribe; con la de ESA base, sí', async () => {
    await vaciarCuentas();
    await estructura();
    const antes = await foto();
    const produccion = entornoCompleto({ NODE_ENV: 'production' });
    await expect(sembrarCuentas(prisma, PLANTILLA_PRUEBA, produccion, NORMAL, decir)).rejects.toThrow('cuenta como producción');
    await expect(
      sembrarCuentas(prisma, PLANTILLA_PRUEBA, { ...produccion, SEED_AUTORIZAR_CUENTAS: 'nexara@db' }, NORMAL, decir),
    ).rejects.toThrow('cuenta como producción');
    expect(await foto()).toBe(antes);
    const r = await sembrarCuentas(
      prisma,
      PLANTILLA_PRUEBA,
      { ...produccion, SEED_AUTORIZAR_CUENTAS: claveDeAutorizacion(describirBase(url)) },
      NORMAL,
      decir,
    );
    expect(r.creadas).toHaveLength(PLANTILLA_PRUEBA.length);
  });

  it('un túnel a producción parece local, pero con gente que ya entró pide autorización', async () => {
    await estructura();
    await sembrarCuentas(prisma, PLANTILLA_PRUEBA.filter((c) => c.email !== CAMPO), entornoCompleto(), NORMAL, decir);
    await prisma.user.update({ where: { email: DIRECCION }, data: { lastLoginAt: new Date() } });
    const antes = await foto();
    await expect(sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir)).rejects.toThrow('ya iniciaron sesión');
    expect(await foto()).toBe(antes);
  });

  it('simular enseña el plan y no escribe, tampoco en producción', async () => {
    await vaciarCuentas();
    const antes = await foto();
    const e = await sembrarEstructura(prisma, ROLES_REQUERIDOS, [...DEPARTAMENTOS_REQUERIDOS, 'Departamento de prueba'], SIMULAR, decir);
    expect(e.departamentos).toContain('Departamento de prueba');
    expect(await foto()).toBe(antes);
    await estructura();
    const conEstructura = await foto();
    await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto({ NODE_ENV: 'production' }), SIMULAR, decir);
    expect(lineas.join('\n')).toContain(`Se crearían: ${DIRECCION}`);
    expect(lineas.join('\n')).toContain('haría falta autorización');
    expect(await foto()).toBe(conEstructura);
  });

  it('la estructura no renombra roles ni toca los que ya existen', async () => {
    await estructura();
    await prisma.role.updateMany({ where: { orgRoleKey: 'ing_soporte' }, data: { nombre: 'Nombre puesto a mano', accesoCompras: true } });
    const antes = await foto();
    await estructura();
    expect(await foto()).toBe(antes);
  });

  it('el seed normal avisa de las cuentas con contraseña publicada, sin tocarlas', async () => {
    await estructura();
    const antes = await foto();
    const publicas = await prisma.user.findMany({ where: { passwordHash: { in: [...HUELLAS_PUBLICAS] }, isActive: true } });
    const avisadas = await avisarSinContrasenaPropia(prisma, decir);
    expect(avisadas.length).toBeGreaterThan(0);
    expect(avisadas).toEqual(expect.arrayContaining(publicas.map((u) => u.email)));
    expect(lineas.join('\n')).not.toMatch(/\$2[aby]\$|@nexara/);
    expect(await foto()).toBe(antes);
  });

  describe('cambios explícitos a cuentas existentes', () => {
    const correo = 'operaciones@prueba.example';

    it('alinear no toca contraseña, bloqueo ni estado activo', async () => {
      await estructura();
      await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
      await prisma.user.update({ where: { email: correo }, data: { roleKey: 'ceo', isActive: false, failedLoginCount: 3 } });
      const antes = await prisma.user.findUniqueOrThrow({ where: { email: correo } });
      await administrarCuentas(prisma, 'alinear', PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, { DATABASE_URL: url }, { simular: false, solo: [correo] }, decir);
      const d = await prisma.user.findUniqueOrThrow({ where: { email: correo } });
      expect(d.roleKey).toBe('coord_operaciones');
      expect([d.passwordHash, d.isActive, d.failedLoginCount]).toEqual([antes.passwordHash, false, 3]);
    });

    it('simular no escribe', async () => {
      await estructura();
      await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
      const antes = await foto();
      for (const op of ['alinear', 'retirar', 'contrasena-inicial'] as const) {
        await administrarCuentas(prisma, op, PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, entornoCompleto(), SIMULAR, decir);
      }
      expect(await foto()).toBe(antes);
    });

    it('en producción pide autorización y además la lista de cuentas', async () => {
      const antes = await foto();
      const e = { DATABASE_URL: url, NODE_ENV: 'production' };
      const con = { ...e, SEED_AUTORIZAR_CUENTAS: claveDeAutorizacion(describirBase(url)) };
      await expect(administrarCuentas(prisma, 'alinear', PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, e, { simular: false, solo: [correo] }, decir)).rejects.toThrow(SeedDetenido);
      await expect(administrarCuentas(prisma, 'alinear', PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, con, NORMAL, decir)).rejects.toThrow('--solo');
      expect(await foto()).toBe(antes);
    });

    it('contrasena-inicial solo a quien no tiene una propia y nunca entró; si algo falla, a nadie', async () => {
      await estructura();
      const entorno = entornoCompleto();
      await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
      await prisma.user.updateMany({ where: { email: { not: correo } }, data: { passwordHash: HUELLAS_PUBLICAS[1] } });
      await prisma.user.update({ where: { email: correo }, data: { passwordHash: bcryptjs.hashSync('Propia' + randomBytes(4).toString('hex'), 4) } });
      const propia = await prisma.user.findUniqueOrThrow({ where: { email: correo } });
      const antes = await foto();
      await expect(
        administrarCuentas(prisma, 'contrasena-inicial', PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, { DATABASE_URL: url }, NORMAL, decir),
      ).rejects.toThrow('no está definida');
      expect(await foto()).toBe(antes);

      await administrarCuentas(prisma, 'contrasena-inicial', PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, entorno, NORMAL, decir);
      const g = await prisma.user.findUniqueOrThrow({ where: { email: DIRECCION } });
      expect(bcryptjs.compareSync(entorno[nombreDeVariable(g.email)] as string, g.passwordHash)).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: correo } })).passwordHash).toBe(propia.passwordHash);
    });

    it('contrasena-inicial se niega con una cuenta que ya se usó', async () => {
      await estructura();
      await sembrarCuentas(prisma, PLANTILLA_PRUEBA, entornoCompleto(), NORMAL, decir);
      await prisma.user.update({ where: { email: DIRECCION }, data: { lastLoginAt: new Date(), passwordHash: HUELLAS_PUBLICAS[1] } });
      const antes = await foto();
      const entorno = entornoCompleto({ SEED_AUTORIZAR_CUENTAS: claveDeAutorizacion(describirBase(url)) });
      await expect(
        administrarCuentas(prisma, 'contrasena-inicial', PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, entorno, { simular: false, solo: [DIRECCION] }, decir),
      ).rejects.toThrow('ya se usó');
      expect(await foto()).toBe(antes);
    });

    it('retirar solo acepta las cuentas de la lista', async () => {
      const antes = await foto();
      await expect(
        administrarCuentas(prisma, 'retirar', PLANTILLA_PRUEBA, RETIRADAS_PRUEBA, { DATABASE_URL: url }, { simular: false, solo: [correo] }, decir),
      ).rejects.toThrow('No están en la lista');
      expect(await foto()).toBe(antes);
    });
  });
});
