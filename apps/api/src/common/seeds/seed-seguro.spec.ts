/**
 * El código vive en `prisma/` porque la imagen de producción no lleva `src/`; la prueba se queda aquí porque el
 * `rootDir` de Jest es `src` (igual que `demo-tenant.spec.ts`).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcryptjs from 'bcryptjs';
import { contrasenaAceptable } from '../../users/user-creation-policy';
import {
  claveDeAutorizacion,
  describirBase,
  exigirAutorizacion,
  HUELLAS_PUBLICAS,
  huellaDe,
  leerOpciones,
  mensajeSeguro,
  nombreDeVariable,
  problemaDeContrasena,
  razonesDeProduccion,
  SeedDetenido,
  sinContrasenaPropia,
} from '../../../prisma/seed-seguro';
import { DEPARTAMENTOS_REQUERIDOS, leerPlantilla } from '../../../prisma/plantilla';

/** Personas inventadas: la plantilla real es local. */
const { cuentas: PLANTILLA_PRUEBA, retiradas: RETIRADAS_PRUEBA } = leerPlantilla({ SEED_PLANTILLA: join(__dirname, 'plantilla-prueba.json') });
const PRISMA = join(__dirname, '../../../prisma');
const leer = (archivo: string) => readFileSync(join(PRISMA, archivo), 'utf8');
/** Lo que se ejecuta, sin comentarios. */
const codigo = (archivo: string) => leer(archivo).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const callada = () => undefined;

describe('contraseñas del seed', () => {
  it('rechaza la vacía, la ausente y la «x» del seed viejo', () => {
    for (const mala of [undefined, '', '   ', 'x']) expect(problemaDeContrasena(mala)).not.toBeNull();
  });

  it.each(['Corta12', 'solo-letras-largas', '1234567890', ' Espacio123', 'Espacio123 ', `Aa1${'b'.repeat(80)}`, `Ñ1${'ñ'.repeat(40)}`])(
    'rechaza %p',
    (mala) => expect(problemaDeContrasena(mala)).not.toBeNull(),
  );

  it('acepta una que cumple y nunca acepta lo que el alta del Core rechaza', () => {
    for (const v of ['Valida12345', 'x', 'Corta12', 'solo-letras-largas', '1234567890', 'otraBuena99']) {
      if (problemaDeContrasena(v) === null) expect(contrasenaAceptable(v)).toBe(true);
    }
    expect(problemaDeContrasena('Valida12345')).toBeNull();
  });

  it('el motivo del rechazo no repite el valor', () => {
    expect(problemaDeContrasena('Secreta')).not.toContain('Secreta');
  });

  it('usa el mismo mecanismo que el alta del Core: bcrypt de costo 10', () => {
    const huella = huellaDe('Valida12345');
    expect(huella).toMatch(/^\$2[aby]\$10\$/);
    expect(bcryptjs.compareSync('Valida12345', huella)).toBe(true);
  });

  it('reconoce las cuentas sin contraseña propia', () => {
    for (const h of ['', ...HUELLAS_PUBLICAS, bcryptjs.hashSync('x', 4)]) expect(sinContrasenaPropia(h)).toBe(true);
    expect(sinContrasenaPropia(huellaDe('Valida12345'))).toBe(false);
  });

  it('las huellas publicadas son las que traen las migraciones', () => {
    const migraciones =
      leer('migrations/20260620120000_seed_nexara_team/migration.sql') +
      leer('migrations/20260625100000_fix_demo_placeholder_passwords/migration.sql');
    const enMigraciones = new Set(migraciones.match(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/g));
    expect(new Set(HUELLAS_PUBLICAS)).toEqual(enMigraciones);
  });

  it('el nombre de la variable sale del correo', () => {
    expect(nombreDeVariable('persona.uno@empresa.com.mx')).toBe('SEED_PASSWORD_PERSONA_UNO_EMPRESA_COM_MX');
  });
});

describe('qué base cuenta como producción', () => {
  const local = { host: '127.0.0.1', nombre: 'nexara' };

  it('solo una base local, sin uso y fuera de production queda libre', () => {
    expect(razonesDeProduccion({}, local, 0)).toEqual([]);
    expect(razonesDeProduccion({ NODE_ENV: 'production' }, local, 0)).toHaveLength(1);
    expect(razonesDeProduccion({}, { host: 'db', nombre: 'nexara' }, 0)).toHaveLength(1);
    // Un túnel a producción se ve local, pero ya hay gente que entró.
    expect(razonesDeProduccion({}, local, 3)).toHaveLength(1);
  });

  it('sin una URL clara se detiene', () => {
    for (const url of [undefined, '', 'no-es-url', 'postgresql://u@h/']) expect(() => describirBase(url)).toThrow(SeedDetenido);
  });

  it('el anfitrión de `?host=` manda, para que no pase por local', () => {
    expect(describirBase('postgresql://u:p@localhost/nexara?host=10.0.0.5').host).toBe('10.0.0.5');
  });

  const prismaConUso = { user: { count: async () => 2 } } as never;
  const url = 'postgresql://u@127.0.0.1:5432/nexara';

  it('sin autorización se detiene; con la de otra base, también', async () => {
    const opciones = { simular: false, solo: [] };
    await expect(exigirAutorizacion(prismaConUso, { DATABASE_URL: url }, opciones, callada)).rejects.toThrow(SeedDetenido);
    for (const mala of ['si', 'true', '1', 'otra@127.0.0.1']) {
      await expect(
        exigirAutorizacion(prismaConUso, { DATABASE_URL: url, SEED_AUTORIZAR_CUENTAS: mala }, opciones, callada),
      ).rejects.toThrow(SeedDetenido);
    }
    const clave = claveDeAutorizacion(describirBase(url));
    await expect(
      exigirAutorizacion(prismaConUso, { DATABASE_URL: url, SEED_AUTORIZAR_CUENTAS: clave }, opciones, callada),
    ).resolves.toEqual({ produccion: true });
  });

  it('simular no pide autorización', async () => {
    await expect(
      exigirAutorizacion(prismaConUso, { DATABASE_URL: url }, { simular: true, solo: [] }, callada),
    ).resolves.toEqual({ produccion: true });
  });
});

describe('opciones y errores', () => {
  it('una opción mal escrita detiene en vez de aplicar', () => {
    expect(() => leerOpciones(['--simulr'], {})).toThrow(SeedDetenido);
    expect(leerOpciones(['--simular'], {}).simular).toBe(true);
    expect(leerOpciones([], { SEED_SIMULAR: '1' }).simular).toBe(true);
    expect(leerOpciones(['--solo=A@x.mx, b@x.mx'], {}).solo).toEqual(['a@x.mx', 'b@x.mx']);
  });

  it('los errores no enseñan huellas, credenciales ni los datos que Prisma pone en su mensaje', () => {
    const huella = huellaDe('Valida12345');
    expect(mensajeSeguro(new Error(`dato ${huella} postgresql://u:clave@h/b`))).not.toMatch(/\$2[aby]\$|clave/);
    const dePrisma = Object.assign(new Error(`create({ passwordHash: "${huella}" })`), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
    });
    expect(mensajeSeguro(dePrisma)).toBe('   • Error de la base: PrismaClientKnownRequestError P2002 en email');
  });
});

describe('separación de operaciones', () => {
  const SEMBRADORES = ['seed.ts', 'seed-estructura.ts', 'seed-core-roster.ts'];

  it('`prisma db seed` solo siembra estructura', () => {
    const paquete = JSON.parse(readFileSync(join(PRISMA, '../package.json'), 'utf8'));
    expect(paquete.prisma.seed).toContain('seed-estructura.ts');
    expect(codigo('seed-estructura.ts')).not.toMatch(/sembrarCuentas|administrarCuentas/);
    expect(codigo('seed.ts').trim()).toBe("import './seed-estructura';");
  });

  it('ningún sembrador cambia cuentas existentes ni trae contraseñas', () => {
    for (const archivo of [...SEMBRADORES, 'plantilla.ts']) {
      expect(codigo(archivo)).not.toMatch(/administrarCuentas|\.update\(|\.updateMany\(|\.upsert\(|password|hashSync|['"]x['"]/i);
    }
  });

  it('el despliegue solo llama a la estructura y no a una imagen con el seed viejo', () => {
    const sh = readFileSync(join(PRISMA, '../../../deploy/nexara.sh'), 'utf8');
    expect(sh).not.toMatch(/seed-core-roster|seed-demo-users|administrar-cuentas|seed:cuentas|cuentas:administrar/);
    expect(sh).toContain('test -f prisma/seed-estructura.ts');
    for (const otro of ['update.sh', 'reiniciar-sin-corte.sh']) {
      expect(readFileSync(join(PRISMA, '../../../deploy', otro), 'utf8')).not.toMatch(/db seed|prisma:seed/);
    }
  });

  it('el repositorio no trae personas: ni correos en los sembradores ni una plantilla versionable', () => {
    for (const archivo of [...SEMBRADORES, 'plantilla.ts', 'administrar-cuentas.ts', 'seed-seguro.ts']) {
      expect(leer(archivo)).not.toMatch(/[\w.]+@nexara\.com\.mx/);
    }
    expect(readdirSync(PRISMA).filter((a) => /^plantilla.*\.json$|^seed-demo-users/.test(a))).toEqual([]);
    expect(DEPARTAMENTOS_REQUERIDOS.length).toBeGreaterThan(0);
  });
});

describe('plantilla local', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'plantilla-'));
  const ruta = join(carpeta, 'p.json');
  const con = (datos: unknown) => {
    writeFileSync(ruta, typeof datos === 'string' ? datos : JSON.stringify(datos));
    return () => leerPlantilla({ SEED_PLANTILLA: ruta });
  };
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  it('lee una correcta', () => {
    expect(con({ cuentas: PLANTILLA_PRUEBA, retiradas: RETIRADAS_PRUEBA })()).toEqual({
      cuentas: PLANTILLA_PRUEBA,
      retiradas: RETIRADAS_PRUEBA,
    });
  });

  it('se detiene si falta, no existe, no es JSON o viene vacía', () => {
    expect(() => leerPlantilla({})).toThrow('SEED_PLANTILLA');
    expect(existsSync(join(carpeta, 'no.json'))).toBe(false);
    expect(() => leerPlantilla({ SEED_PLANTILLA: join(carpeta, 'no.json') })).toThrow(SeedDetenido);
    for (const mala of ['{', {}, { cuentas: [] }, { cuentas: 'x' }]) expect(con(mala)).toThrow(SeedDetenido);
  });

  it('rechaza campos que no van, para que no entre una contraseña por descuido', () => {
    const conClave = { ...PLANTILLA_PRUEBA[0], password: 'x' };
    expect(con({ cuentas: [conClave] })).toThrow('el campo password no va en la plantilla');
    expect(con({ cuentas: [{ ...PLANTILLA_PRUEBA[0], email: 'sin-arroba' }] })).toThrow('no es un correo');
    expect(con({ cuentas: [{ ...PLANTILLA_PRUEBA[0], roleKey: '' }] })).toThrow('falta roleKey');
  });
});
