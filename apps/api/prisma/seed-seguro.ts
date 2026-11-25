/**
 * Motor común de los sembradores de cuentas y estructura.
 *
 * Nace del defecto del 25-11-2026: `prisma db seed` reescribía contraseña, rol, menú, jefe y estado de
 * cuentas reales y, si faltaba la variable con la contraseña, les ponía `'x'`. Las reglas de aquí:
 *
 *   1. Estructura (roles y departamentos), alta de cuentas y cambios a cuentas existentes son tres
 *      operaciones distintas, con su propio comando. Ninguna llama a otra.
 *   2. La estructura y el alta solo AGREGAN lo que falta. Nunca escriben sobre una fila que ya existe.
 *   3. Todo se revisa antes de escribir. Si algo falta o no cumple, no se toca nada.
 *   4. Todo se escribe en una sola transacción, con un candado para que no corran dos a la vez.
 *   5. No hay contraseñas por omisión. Salen del entorno y no se imprimen, ni siquiera en un error.
 *   6. Ante la duda, la base cuenta como producción y hace falta autorización explícita.
 *
 * Vive en `prisma/` y no en `src/` porque la imagen de producción solo lleva `prisma/` y `dist/`.
 */
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

// ── Tipos ────────────────────────────────────────────────────────────────

export type ModuleAccessMap = Record<string, 'off' | 'on'>;

export type CuentaPlantilla = {
  nombre: string;
  email: string;
  roleKey: string;
  departmentName: string;
  employeeNumber?: string | null;
  puesto?: string | null;
  managerEmail?: string | null;
  moduleAccess?: ModuleAccessMap;
};

export type RolRequerido = { orgRoleKey: string; nombre: string };

export type Opciones = {
  /** Enseña lo que haría y no escribe. */
  simular: boolean;
  /** Correos a los que se limita la operación (obligatorio en producción para cambiar cuentas). */
  solo: string[];
};

export type Entorno = Record<string, string | undefined>;
type Salida = (linea: string) => void;

/** La operación se negó a escribir. Distingue «aborté por seguridad» de «se cayó la base». */
export class SeedDetenido extends Error {
  constructor(public readonly motivos: string[]) {
    super(motivos.join('\n'));
    this.name = 'SeedDetenido';
  }
}

/** Número fijo del candado de Postgres: dos sembrados a la vez se forman en fila. */
const CANDADO = 20261125;
const LIMITES_TX = { maxWait: 15_000, timeout: 60_000 };

/**
 * Huellas publicadas en migraciones viejas (20260620120000 y 20260625100000). El repositorio es público: una
 * cuenta con una de estas dos huellas no tiene contraseña propia.
 */
export const HUELLAS_PUBLICAS: readonly string[] = [
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p6ez6kxOEfRkNpDlHlOYIi',
  '$2a$10$nl1ePze.TiLjg1wVeSMPYuVFyqscp8BXrx7r.wuJwUEplqWk3cd8e',
];

// ── Contraseñas ──────────────────────────────────────────────────────────

export function nombreDeVariable(email: string): string {
  return (
    'SEED_PASSWORD_' +
    email
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
  );
}

/**
 * Misma regla que `contrasenaAceptable` de `src/users/user-creation-policy.ts` (la prueba las compara), más dos:
 * sin espacios en los extremos y distinta de las que están publicadas en el repositorio.
 * Devuelve el motivo del rechazo, nunca el valor.
 */
export function problemaDeContrasena(valor: string | undefined): string | null {
  if (valor === undefined || valor.trim() === '') return 'no está definida';
  if (valor !== valor.trim()) return 'empieza o termina con espacios';
  if (valor.length < 8) return 'tiene menos de 8 caracteres';
  if (Buffer.byteLength(valor, 'utf8') > 72) return 'pasa de 72 bytes, el límite de bcrypt';
  if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) return 'necesita al menos una letra y un número';
  if (HUELLAS_PUBLICAS.some((h) => bcryptjs.compareSync(valor, h))) return 'es una contraseña publicada en el repositorio';
  return null;
}

/** Mismo mecanismo que `UsersService.create`: bcrypt de costo 10. */
export function huellaDe(contrasena: string): string {
  return bcryptjs.hashSync(contrasena, 10);
}

/** La cuenta no tiene una contraseña propia: vacía, publicada en una migración, o la `'x'` del seed viejo. */
export function sinContrasenaPropia(huella: string): boolean {
  if (!huella || HUELLAS_PUBLICAS.includes(huella)) return true;
  return bcryptjs.compareSync('x', huella);
}

// ── Opciones, entorno y errores ──────────────────────────────────────────

export function leerOpciones(argumentos: string[], entorno: Entorno): Opciones {
  const opciones: Opciones = { simular: entorno.SEED_SIMULAR === '1', solo: [] };
  for (const a of argumentos) {
    if (a === '--simular' || a === '--dry-run') opciones.simular = true;
    else if (a.startsWith('--solo=')) {
      opciones.solo = a
        .slice('--solo='.length)
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    } else throw new SeedDetenido([`Opción desconocida: ${a}`]);
  }
  return opciones;
}

export type Base = { host: string; nombre: string };

export function describirBase(url: string | undefined): Base {
  let u: URL;
  try {
    u = new URL(url ?? '');
  } catch {
    throw new SeedDetenido(['DATABASE_URL falta o no se entiende.']);
  }
  const nombre = decodeURIComponent(u.pathname.replace(/^\//, ''));
  // `?host=` gana en Postgres sobre el de la URL: si viene, es el que manda.
  const host = u.searchParams.get('host') || u.hostname;
  if (!nombre || !host) throw new SeedDetenido(['DATABASE_URL no dice a qué base se conecta.']);
  return { host, nombre };
}

const ANFITRIONES_LOCALES = ['localhost', '127.0.0.1', '::1', '[::1]'];

/** Razones por las que la base cuenta como producción. Vacío = base local sin uso. */
export function razonesDeProduccion(entorno: Entorno, base: Base, cuentasConInicioDeSesion: number): string[] {
  const razones: string[] = [];
  if (entorno.NODE_ENV === 'production') razones.push('NODE_ENV es production');
  if (!ANFITRIONES_LOCALES.includes(base.host)) razones.push(`la base no es local (${base.host})`);
  if (cuentasConInicioDeSesion > 0) {
    // Un túnel hace que producción parezca local: si alguien ya entró con su cuenta, la base está en uso.
    razones.push(`${cuentasConInicioDeSesion} cuenta(s) ya iniciaron sesión en esta base`);
  }
  return razones;
}

export function claveDeAutorizacion(base: Base): string {
  return `${base.nombre}@${base.host}`;
}

/** Detiene la operación si la base cuenta como producción y no hay autorización para ESA base. */
export async function exigirAutorizacion(
  prisma: PrismaClient,
  entorno: Entorno,
  opciones: Opciones,
  decir: Salida,
): Promise<{ produccion: boolean }> {
  const base = describirBase(entorno.DATABASE_URL);
  const razones = razonesDeProduccion(
    entorno,
    base,
    await prisma.user.count({ where: { lastLoginAt: { not: null } } }),
  );
  if (razones.length === 0) return { produccion: false };
  if (opciones.simular) {
    decir(`   🔎 Base en uso (${razones.join('; ')}): para aplicar haría falta autorización.`);
    return { produccion: true };
  }
  const clave = claveDeAutorizacion(base);
  if (entorno.SEED_AUTORIZAR_CUENTAS !== clave) {
    throw new SeedDetenido([
      `Esta base cuenta como producción: ${razones.join('; ')}.`,
      `Prueba primero con --simular. Para aplicar, define SEED_AUTORIZAR_CUENTAS=${clave}`,
    ]);
  }
  return { produccion: true };
}

/** Texto de un error sin huellas, URL con credenciales ni los datos que Prisma mete en sus mensajes. */
export function mensajeSeguro(error: unknown): string {
  if (error instanceof SeedDetenido) return error.motivos.map((m) => `   • ${m}`).join('\n');
  const e = error as { name?: string; code?: string; errorCode?: string; meta?: { target?: unknown }; message?: string };
  if (e?.name?.startsWith('PrismaClient')) {
    const donde = Array.isArray(e.meta?.target) ? ` en ${e.meta.target.join(', ')}` : '';
    const codigo = e.code ?? e.errorCode;
    return `   • Error de la base: ${e.name}${codigo ? ` ${codigo}` : ''}${donde}`;
  }
  return `   • ${String(e?.message ?? error)
    .replace(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/g, '[huella]')
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[credenciales]@')}`;
}

// ── Lecturas comunes ─────────────────────────────────────────────────────

/** Cliente normal o el de una transacción. */
type Cliente = Pick<PrismaClient, 'user' | 'role' | 'department' | 'companyProfile' | 'userCompany'>;

const normal = (email: string) => email.trim().toLowerCase();

const ORG_ROLE_KEY_BY_V2: Record<string, string> = {
  ceo: 'ceo',
  arquitecto: 'arquitecto',
  coord_admin: 'director_admin',
  administrativo: 'admin_staff',
  lider_diseno: 'designer',
  coord_operaciones: 'project_manager',
  ing_campo: 'field_engineer',
  ing_soporte: 'senior_engineer',
};

async function rolDe(db: Cliente, roleKey: string): Promise<number | null> {
  for (const clave of [roleKey, ORG_ROLE_KEY_BY_V2[roleKey]]) {
    if (!clave) continue;
    const rol = await db.role.findFirst({ where: { orgRoleKey: clave }, select: { id: true }, orderBy: { id: 'asc' } });
    if (rol) return rol.id;
  }
  return null;
}

async function empresaPrincipal(db: Cliente): Promise<number> {
  const empresas = await db.companyProfile.findMany({ where: { isPrimary: true }, select: { id: true }, take: 2 });
  if (empresas.length !== 1) {
    throw new SeedDetenido([
      empresas.length ? 'Hay más de una empresa marcada como principal.' : 'No hay empresa principal (company_profile.isPrimary).',
    ]);
  }
  return empresas[0].id;
}

async function cuentasPorCorreo(db: Cliente, correos: string[]) {
  const filas = await db.user.findMany({
    where: { OR: correos.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })) },
    select: { id: true, email: true },
  });
  return new Map(filas.map((f) => [normal(f.email), f]));
}

function comprobarPlantilla(plantilla: CuentaPlantilla[]): void {
  const vistos = new Set<string>();
  const repetidos: string[] = [];
  for (const c of plantilla) {
    for (const clave of [normal(c.email), c.employeeNumber ? `número ${c.employeeNumber}` : '']) {
      if (!clave) continue;
      if (vistos.has(clave)) repetidos.push(clave);
      vistos.add(clave);
    }
  }
  if (repetidos.length) throw new SeedDetenido([`La plantilla repite: ${repetidos.join(', ')}`]);
}

async function formarse(tx: { $executeRaw: PrismaClient['$executeRaw'] }): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CANDADO})`;
}

// ── 1. Estructura ────────────────────────────────────────────────────────

export type ResultadoEstructura = { roles: string[]; departamentos: string[]; avisos: string[] };

/** Agrega los roles y departamentos que falten. No renombra, no cambia permisos y no toca cuentas. */
export async function sembrarEstructura(
  prisma: PrismaClient,
  roles: RolRequerido[],
  departamentos: string[],
  opciones: Opciones,
  decir: Salida = console.log,
): Promise<ResultadoEstructura> {
  return prisma.$transaction(async (tx) => {
    await formarse(tx);
    const companyId = await empresaPrincipal(tx as Cliente);
    const r: ResultadoEstructura = { roles: [], departamentos: [], avisos: [] };

    for (const rol of roles) {
      if (await tx.role.findFirst({ where: { orgRoleKey: rol.orgRoleKey }, select: { id: true } })) continue;
      const mismoNombre = await tx.role.findFirst({
        where: { nombre: { equals: rol.nombre, mode: 'insensitive' } },
        select: { orgRoleKey: true },
      });
      if (mismoNombre) {
        r.avisos.push(`El rol «${rol.nombre}» ya existe con otra clave (${mismoNombre.orgRoleKey ?? 'sin clave'}); no se toca.`);
        continue;
      }
      r.roles.push(rol.nombre);
      if (!opciones.simular) await tx.role.create({ data: { nombre: rol.nombre, orgRoleKey: rol.orgRoleKey } });
    }

    for (const nombre of [...new Set(departamentos)]) {
      const ya = await tx.department.findUnique({ where: { companyId_nombre: { companyId, nombre } }, select: { id: true } });
      if (ya) continue;
      r.departamentos.push(nombre);
      if (!opciones.simular) await tx.department.create({ data: { nombre, companyId } });
    }

    const verbo = opciones.simular ? 'se crearían' : 'creados';
    decir(`   Roles ${verbo}: ${r.roles.length ? r.roles.join(', ') : 'ninguno'}`);
    decir(`   Departamentos ${verbo}: ${r.departamentos.length ? r.departamentos.join(', ') : 'ninguno'}`);
    for (const a of r.avisos) decir(`   ⚠️  ${a}`);
    return r;
  }, LIMITES_TX);
}

// ── 2. Alta de cuentas ───────────────────────────────────────────────────

export type PlanDeAlta = { porCrear: CuentaPlantilla[]; existentes: string[]; problemas: string[] };

/** Qué cuentas faltan y qué impide crearlas. Solo lee. */
export async function planearAlta(
  db: Cliente,
  plantilla: CuentaPlantilla[],
  entorno: Entorno,
  solo: string[] = [],
): Promise<PlanDeAlta> {
  comprobarPlantilla(plantilla);
  const desconocidos = solo.filter((s) => !plantilla.some((c) => normal(c.email) === s));
  const elegidas = solo.length ? plantilla.filter((c) => solo.includes(normal(c.email))) : plantilla;
  const companyId = await empresaPrincipal(db);
  const ya = await cuentasPorCorreo(db, plantilla.map((c) => c.email));

  const plan: PlanDeAlta = { porCrear: [], existentes: [], problemas: desconocidos.map((s) => `${s} no está en la plantilla`) };
  for (const c of elegidas) {
    if (ya.has(normal(c.email))) {
      plan.existentes.push(normal(c.email));
      continue;
    }
    plan.porCrear.push(c);
    const variable = nombreDeVariable(c.email);
    const malo = problemaDeContrasena(entorno[variable]);
    if (malo) plan.problemas.push(`${variable} ${malo}`);
    if ((await rolDe(db, c.roleKey)) === null) plan.problemas.push(`${c.email}: no existe el rol ${c.roleKey}`);
    const depto = await db.department.findUnique({
      where: { companyId_nombre: { companyId, nombre: c.departmentName } },
      select: { id: true },
    });
    if (!depto) plan.problemas.push(`${c.email}: no existe el departamento «${c.departmentName}» (corre primero prisma db seed)`);
    if (c.employeeNumber) {
      const ocupado = await db.userCompany.findFirst({
        where: { companyId, employeeNumber: c.employeeNumber },
        select: { user: { select: { email: true } } },
      });
      if (ocupado) plan.problemas.push(`${c.email}: el número ${c.employeeNumber} ya es de ${ocupado.user.email}`);
    }
    const jefe = c.managerEmail ? normal(c.managerEmail) : '';
    if (jefe && !ya.has(jefe) && !elegidas.some((x) => normal(x.email) === jefe)) {
      plan.problemas.push(`${c.email}: su jefe ${jefe} no existe ni se va a crear`);
    }
  }
  return plan;
}

export type ResultadoAlta = { creadas: string[]; existentes: string[] };

/** Crea las cuentas que faltan. Una cuenta que ya existe no se lee más allá de su correo ni se escribe. */
export async function sembrarCuentas(
  prisma: PrismaClient,
  plantilla: CuentaPlantilla[],
  entorno: Entorno,
  opciones: Opciones,
  decir: Salida = console.log,
): Promise<ResultadoAlta> {
  const plan = await planearAlta(prisma, plantilla, entorno, opciones.solo);
  decir(`   Ya existen y no se tocan: ${plan.existentes.length}`);
  decir(`   ${opciones.simular ? 'Se crearían' : 'Por crear'}: ${plan.porCrear.map((c) => c.email).join(', ') || 'ninguna'}`);
  if (plan.problemas.length) throw new SeedDetenido(plan.problemas);
  if (plan.porCrear.length === 0) return { creadas: [], existentes: plan.existentes };
  await exigirAutorizacion(prisma, entorno, opciones, decir);
  if (opciones.simular) return { creadas: [], existentes: plan.existentes };

  // bcrypt es lento a propósito: se calcula antes de abrir la transacción.
  const huellas = new Map(plan.porCrear.map((c) => [normal(c.email), huellaDe(entorno[nombreDeVariable(c.email)] as string)]));

  const creadas = await prisma.$transaction(async (tx) => {
    const db = tx as Cliente;
    await formarse(tx);
    // Otra corrida pudo crear alguna entre el plan y el candado: se vuelve a mirar ya dentro.
    const dentro = await planearAlta(db, plantilla, entorno, opciones.solo);
    if (dentro.problemas.length) throw new SeedDetenido(dentro.problemas);
    const companyId = await empresaPrincipal(db);
    const nuevas = new Map<string, number>();
    for (const c of dentro.porCrear) {
      const email = normal(c.email);
      const passwordHash = huellas.get(email);
      if (!passwordHash) throw new SeedDetenido([`${email} apareció como faltante a media corrida; vuelve a correrlo.`]);
      const depto = await db.department.findUniqueOrThrow({
        where: { companyId_nombre: { companyId, nombre: c.departmentName } },
        select: { id: true },
      });
      const creada = await db.user.create({
        data: {
          nombre: c.nombre,
          email,
          passwordHash,
          passwordChangedAt: new Date(),
          roleId: (await rolDe(db, c.roleKey)) as number,
          roleKey: c.roleKey,
          departmentId: depto.id,
          employeeNumber: c.employeeNumber ?? undefined,
          puesto: c.puesto ?? undefined,
          isActive: true,
          moduleAccess: c.moduleAccess ?? undefined,
        },
        select: { id: true },
      });
      await db.userCompany.create({
        data: { userId: creada.id, companyId, isDefault: true, employeeNumber: c.employeeNumber ?? undefined },
        select: { id: true },
      });
      nuevas.set(email, creada.id);
    }
    // El jefe se pone solo a las recién creadas; el de las demás lo lleva el Core.
    const todas = await cuentasPorCorreo(db, plantilla.map((c) => c.email));
    for (const c of dentro.porCrear) {
      const managerId = c.managerEmail ? todas.get(normal(c.managerEmail))?.id : undefined;
      if (managerId) await db.user.update({ where: { id: nuevas.get(normal(c.email)) }, data: { managerId }, select: { id: true } });
    }
    return [...nuevas.keys()];
  }, LIMITES_TX);

  decir(`   ✅ Creadas: ${creadas.length}`);
  return { creadas, existentes: plan.existentes };
}

// ── 3. Cambios explícitos a cuentas existentes ───────────────────────────

export type Operacion = 'alinear' | 'retirar' | 'contrasena-inicial';
export type Cambio = { id: number; email: string; campos: Record<string, { antes: unknown; despues: unknown }> };

const SELECCION = {
  id: true,
  email: true,
  nombre: true,
  roleId: true,
  roleKey: true,
  departmentId: true,
  puesto: true,
  managerId: true,
  moduleAccess: true,
  isActive: true,
  lastLoginAt: true,
  passwordHash: true,
} as const;

const igual = (a: unknown, b: unknown) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
function ordenado(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v ?? null;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Cambia cuentas que YA existen. No es un sembrado: se pide por nombre, enseña campo por campo y nunca se ejecuta
 * desde `prisma db seed` ni desde el despliegue.
 *
 *   alinear             → rol, puesto, departamento, jefe y menú según la plantilla. Nunca la contraseña, el bloqueo
 *                         ni el estado activo.
 *   retirar             → desactiva las cuentas pedidas.
 *   contrasena-inicial  → pone contraseña a una cuenta que nunca ha tenido una propia y en la que nadie ha entrado.
 *                         Para las demás está «Acceso a cuentas» del Core, que además cierra sus sesiones.
 */
export async function administrarCuentas(
  prisma: PrismaClient,
  operacion: Operacion,
  plantilla: CuentaPlantilla[],
  retirables: string[],
  entorno: Entorno,
  opciones: Opciones,
  decir: Salida = console.log,
): Promise<Cambio[]> {
  comprobarPlantilla(plantilla);
  const { produccion } = await exigirAutorizacion(prisma, entorno, opciones, decir);
  if (produccion && !opciones.simular && !opciones.solo.length) {
    throw new SeedDetenido(['En una base en uso hay que decir qué cuentas: --solo=correo1,correo2']);
  }
  const permitidos = operacion === 'retirar' ? retirables.map(normal) : plantilla.map((c) => normal(c.email));
  const fuera = opciones.solo.filter((s) => !permitidos.includes(s));
  if (fuera.length) throw new SeedDetenido([`No están en la lista de «${operacion}»: ${fuera.join(', ')}`]);
  const objetivo = opciones.solo.length ? opciones.solo : permitidos;

  return prisma.$transaction(async (tx) => {
    const db = tx as Cliente;
    await formarse(tx);
    const companyId = await empresaPrincipal(db);
    const correos = await cuentasPorCorreo(db, [...permitidos, ...plantilla.map((c) => c.email)]);
    const problemas: string[] = [];
    const cambios: Cambio[] = [];

    for (const email of objetivo) {
      const ref = correos.get(email);
      if (!ref) {
        if (opciones.solo.length) problemas.push(`${email} no existe`);
        continue;
      }
      const u = await db.user.findUniqueOrThrow({ where: { id: ref.id }, select: SELECCION });
      const c = plantilla.find((x) => normal(x.email) === email);
      const deseado: Record<string, unknown> = {};

      if (operacion === 'retirar') deseado.isActive = false;
      else if (operacion === 'alinear' && c) {
        const roleId = await rolDe(db, c.roleKey);
        const depto = await db.department.findUnique({
          where: { companyId_nombre: { companyId, nombre: c.departmentName } },
          select: { id: true },
        });
        if (roleId === null) problemas.push(`${email}: no existe el rol ${c.roleKey}`);
        if (!depto) problemas.push(`${email}: no existe el departamento «${c.departmentName}»`);
        Object.assign(deseado, { roleId, roleKey: c.roleKey, departmentId: depto?.id, puesto: c.puesto ?? null });
        if (c.moduleAccess) deseado.moduleAccess = c.moduleAccess;
        const jefe = c.managerEmail ? correos.get(normal(c.managerEmail)) : null;
        if (c.managerEmail && !jefe) problemas.push(`${email}: su jefe ${c.managerEmail} no existe`);
        deseado.managerId = jefe?.id ?? null;
      } else if (operacion === 'contrasena-inicial' && sinContrasenaPropia(u.passwordHash)) {
        if (u.lastLoginAt) {
          problemas.push(`${email}: ya se usó; restablécela desde «Acceso a cuentas» del Core`);
          continue;
        }
        const malo = problemaDeContrasena(entorno[nombreDeVariable(email)]);
        if (malo) problemas.push(`${nombreDeVariable(email)} ${malo}`);
        else deseado.passwordHash = huellaDe(entorno[nombreDeVariable(email)] as string);
      }

      const campos: Cambio['campos'] = {};
      for (const [campo, despues] of Object.entries(deseado)) {
        const antes = (u as Record<string, unknown>)[campo];
        if (!igual(antes, despues)) campos[campo] = { antes, despues };
      }
      if (Object.keys(campos).length) cambios.push({ id: u.id, email, campos });
    }

    if (problemas.length) throw new SeedDetenido(problemas);
    for (const cambio of cambios) {
      const detalle = Object.entries(cambio.campos).map(([campo, v]) =>
        campo === 'passwordHash' ? 'contraseña: sin propia → nueva' : `${campo}: ${JSON.stringify(v.antes)} → ${JSON.stringify(v.despues)}`,
      );
      decir(`   ${opciones.simular ? 'Cambiaría' : 'Cambia'} ${cambio.email} · ${detalle.join(' · ')}`);
      if (opciones.simular) continue;
      const data: Record<string, unknown> = {};
      for (const [campo, v] of Object.entries(cambio.campos)) data[campo] = v.despues;
      if (data.passwordHash) data.passwordChangedAt = new Date();
      await db.user.update({ where: { id: cambio.id }, data, select: { id: true } });
    }
    if (!cambios.length) decir('   Nada que cambiar.');
    return cambios;
  }, LIMITES_TX);
}

/** Cuentas sin contraseña propia (vacía, publicada o `'x'`). Solo cuenta y avisa. */
export async function avisarSinContrasenaPropia(prisma: PrismaClient, decir: Salida = console.log) {
  const filas = await prisma.user.findMany({ where: { isActive: true }, select: { email: true, passwordHash: true } });
  const sin = filas.filter((f) => sinContrasenaPropia(f.passwordHash)).map((f) => f.email);
  if (sin.length) {
    decir(`   ⚠️  ${sin.length} cuenta(s) activas sin contraseña propia (la traen de una migración vieja). No se tocan.`);
    decir('      Cuáles: npm run cuentas:administrar -- contrasena-inicial --simular');
  }
  return sin;
}

// ── Arranque ─────────────────────────────────────────────────────────────

/** Corre un comando: conecta, reporta sin filtrar secretos y sale con 1 si se detuvo o falló. */
export async function correr(
  titulo: string,
  tarea: (prisma: PrismaClient, opciones: Opciones) => Promise<unknown>,
  argumentos: string[] = process.argv.slice(2),
): Promise<void> {
  let prisma: PrismaClient | undefined;
  try {
    const opciones = leerOpciones(argumentos, process.env);
    const base = describirBase(process.env.DATABASE_URL);
    console.log(`🌱 ${titulo} · ${base.nombre}@${base.host}${opciones.simular ? ' · SIMULACIÓN, no escribe' : ''}`);
    prisma = new PrismaClient({ log: [], errorFormat: 'minimal' });
    await tarea(prisma, opciones);
    console.log(opciones.simular ? '✨ Simulación terminada: no se escribió nada.' : '✨ Terminado.');
  } catch (error) {
    console.error(
      error instanceof SeedDetenido
        ? `❌ ${titulo}: detenido antes de escribir.`
        : `❌ ${titulo}: falló. Cada operación es una sola transacción: no queda nada a medias.`,
    );
    console.error(mensajeSeguro(error));
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}
