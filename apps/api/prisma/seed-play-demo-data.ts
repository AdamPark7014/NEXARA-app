/**
 * Contenido de demostración para el tenant de las tiendas (`nexara-demo`).
 *
 * `seed-play-reviewer.ts` crea la cuenta del revisor y su tenant aislado, pero
 * el tenant nace vacío: el revisor de Google entra, ve pantallas en blanco y eso
 * basta para que rechacen la app. Este módulo lo puebla con una operación
 * ficticia completa —clientes, equipo, actividades en los tres estados,
 * evidencia de punta a punta, asistencia del día, un viático y herramienta— para
 * que la revisión vea una app que funciona.
 *
 * Va aparte del seed de credenciales por dos razones. La primera es que son dos
 * trabajos distintos: uno rota una contraseña y la imprime una sola vez, el otro
 * escribe decenas de filas y ficheros en disco; querer refrescar el contenido no
 * debería obligar a rotar la contraseña que ya está pegada en Play Console. La
 * segunda es que aquí no hay ningún secreto que imprimir, así que su salida se
 * puede leer en un log sin cuidados. `seed-play-reviewer.ts` lo invoca al final
 * para que un solo comando deje la cuenta lista.
 *
 * AISLAMIENTO. Todo se escribe con el `companyId` del tenant resuelto **por
 * slug** (`nexara-demo`) y validado por `assertDemoTenant`: si la empresa que
 * sale es la primaria, o el slug no coincide, el proceso aborta antes de la
 * primera escritura. El id nunca se escribe a mano porque en cada base es otro.
 *
 * IDEMPOTENCIA. Cada fila se ancla a una clave natural ya existente en el
 * esquema (`Activity(companyId, anNumber)`, `service_clients.accountCode`,
 * `activity_evidences(activityId, userId)`, `Attendance(companyId, userId,
 * workDate, type)`, …) y se escribe con `upsert`. Correrlo N veces no duplica
 * nada: reescribe. Las fechas se recalculan contra el día de la corrida, así que
 * volver a correrlo también sirve para refrescar la demo — y para devolverla a
 * su estado inicial si el revisor la dejó a medias.
 *
 * DATOS. Todo es inventado: empresas que no existen, personas que no existen,
 * teléfonos del bloque 555 y correos en el TLD reservado `.invalid` (RFC 2606),
 * que no puede entregar correo a nadie. Ninguna foto es de una persona real: las
 * imágenes se generan aquí mismo, y son patrones de color.
 *
 * Run:
 *   cd apps/api && npm run seed:play-demo
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { randomBytes } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

import { DEMO_COMPANY_SLUG, assertDemoTenant } from '../src/common/tenant/demo-tenant';

// ─────────────────────────────────────────────────────────────────────────────
// Fechas — siempre en la zona de la operación, no en la del servidor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zona horaria de la operación. Se fija aquí porque el contenedor corre en UTC:
 * construir «hoy a las 08:00» con la hora del servidor deja las checadas en el
 * día equivocado y la pantalla de asistencias sale vacía.
 */
const TZ = 'America/Mexico_City';

type Ymd = { y: number; m: number; d: number };

function partesEnTz(at: Date): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const parte of fmt.formatToParts(at)) p[parte.type] = parte.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute),
    ss: Number(p.second),
  };
}

/** Desfase de la zona respecto a UTC en el instante dado, en milisegundos. */
function desfaseMs(at: Date): number {
  const p = partesEnTz(at);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - at.getTime();
}

/** Instante UTC correspondiente a una hora de pared de `TZ`. Dos pasadas por los saltos de horario. */
function horaLocal(dia: Ymd, hh: number, mm = 0): Date {
  const comoSiFueraUtc = Date.UTC(dia.y, dia.m - 1, dia.d, hh, mm, 0);
  let ts = comoSiFueraUtc - desfaseMs(new Date(comoSiFueraUtc));
  ts = comoSiFueraUtc - desfaseMs(new Date(ts));
  return new Date(ts);
}

/** El día de calendario local, desplazado. */
function diaRelativo(base: Ymd, dias: number): Ymd {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d) + dias * 86_400_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** `@db.Date` de Prisma: medianoche UTC del día de calendario, sin arrastrar hora. */
function comoFechaSola(dia: Ymd): Date {
  return new Date(Date.UTC(dia.y, dia.m - 1, dia.d));
}

function isoCorto(dia: Ymd): string {
  return `${dia.y}-${String(dia.m).padStart(2, '0')}-${String(dia.d).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ficheros de relleno — PNG y PDF válidos, sin dependencias
// (mismo enfoque que `scripts/demo-semana/sembrar-semana.js`)
// ─────────────────────────────────────────────────────────────────────────────

const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunkPng(tipo: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

type TipoFoto = 'entrada' | 'evidencia' | 'salida' | 'campo' | 'herramienta';

const COLORES: Record<TipoFoto, [number, number, number]> = {
  entrada: [52, 101, 164],
  evidencia: [46, 125, 90],
  salida: [196, 110, 38],
  campo: [88, 86, 140],
  herramienta: [120, 96, 60],
};

/**
 * Foto de relleno 240×180: fondo por tipo, marco claro y franjas que varían con
 * el índice, para que dos fotos seguidas no salgan idénticas. No hay ninguna
 * persona en estas imágenes: son patrones generados.
 */
function pngRelleno(tipo: TipoFoto, indice: number): Buffer {
  const w = 240;
  const h = 180;
  const [br, bg, bb] = COLORES[tipo];
  const variacion = (indice * 37) % 60;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const fila = y * (w * 3 + 1);
    raw[fila] = 0;
    for (let x = 0; x < w; x += 1) {
      let r = br;
      let g = bg;
      let b = bb;
      const marco = x < 8 || y < 8 || x >= w - 8 || y >= h - 8;
      const franja = ((x + y + variacion) >> 4) % 2 === 0;
      const suelo = y > 120 + (((x * (indice % 5)) >> 5) % 20);
      if (marco) [r, g, b] = [235, 235, 235];
      else if (suelo) [r, g, b] = [r * 0.55, g * 0.55, b * 0.55];
      else if (franja) [r, g, b] = [r * 0.88, g * 0.88, b * 0.88];
      const o = fila + 1 + x * 3;
      raw[o] = Math.round(r);
      raw[o + 1] = Math.round(g);
      raw[o + 2] = Math.round(b);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunkPng('IHDR', ihdr),
    chunkPng('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunkPng('IEND', Buffer.alloc(0)),
  ]);
}

const soloAscii = (s: string): string =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/([()\\])/g, '\\$1');

/** Hoja de servicio en PDF de una página, escrita a mano (PDF 1.4, fuente base). */
function pdfHoja(lineas: string[]): Buffer {
  const texto = ['BT', '/F1 16 Tf', '56 740 Td', `(${soloAscii(lineas[0])}) Tj`, '/F1 11 Tf'];
  for (const l of lineas.slice(1)) texto.push('0 -20 Td', `(${soloAscii(l)}) Tj`);
  texto.push('ET');
  const stream = texto.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Raíz persistente de uploads — mismo orden de candidatos que `src/common/uploads-path.ts`. */
function raizUploads(): string {
  const deEnv = (process.env.UPLOADS_ROOT || process.env.UPLOAD_ROOT || '').trim();
  if (deEnv) return path.resolve(deEnv);
  const cwd = process.cwd();
  const candidatos = [
    path.resolve('/app/uploads'),
    path.resolve(cwd, '..', '..', 'uploads'),
    path.resolve(cwd, '..', 'uploads'),
    path.resolve(cwd, 'uploads'),
  ];
  for (const c of candidatos) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* candidato ilegible */
    }
  }
  return path.resolve(cwd, '..', '..', 'uploads');
}

/** Subcarpeta propia: así `demo-play/` se puede borrar entera sin tocar nada real. */
const CARPETA_MEDIA = 'demo-play';

/** Escribe el fichero (sobrescribiendo) y devuelve la URL pública `/uploads/...`. */
function guardarMedia(nombre: string, contenido: Buffer): string {
  const dir = path.join(raizUploads(), CARPETA_MEDIA);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nombre), contenido);
  return `/uploads/${CARPETA_MEDIA}/${nombre}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// El elenco ficticio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Correos en `.invalid`: el TLD que la RFC 2606 reserva para que nunca resuelva.
 * Ningún envío accidental de la plataforma puede salir hacia una persona real, y
 * a simple vista se distingue de un colaborador de verdad.
 */
const DOMINIO = 'demo.invalid';

const DEPTO_OPERACIONES = 'Operaciones';
const DEPTO_ADMINISTRACION = 'Administración';

type PersonaDemo = {
  clave: 'encargada' | 'tecnico1' | 'tecnico2' | 'tecnico3' | 'admin';
  nombre: string;
  email: string;
  /** Candidatos de rol, de preferido a aceptable. Nunca `super_admin`. */
  roles: string[];
  puesto: string;
  departamento: string;
  numeroEmpleado: string;
};

const EQUIPO: PersonaDemo[] = [
  {
    clave: 'encargada',
    nombre: 'Mariana Estrada Robles',
    email: `mariana.estrada@${DOMINIO}`,
    roles: ['coord_operaciones', 'administrativo'],
    puesto: 'Encargada de Operaciones',
    departamento: DEPTO_OPERACIONES,
    numeroEmpleado: 'DEMO-10',
  },
  {
    clave: 'tecnico1',
    nombre: 'Rubén Ayala Sandoval',
    email: `ruben.ayala@${DOMINIO}`,
    roles: ['ing_campo', 'ing_soporte', 'administrativo'],
    puesto: 'Técnico de Campo',
    departamento: DEPTO_OPERACIONES,
    numeroEmpleado: 'DEMO-11',
  },
  {
    clave: 'tecnico2',
    nombre: 'Noemí Ledesma Prado',
    email: `noemi.ledesma@${DOMINIO}`,
    roles: ['ing_campo', 'ing_soporte', 'administrativo'],
    puesto: 'Técnica de Campo',
    departamento: DEPTO_OPERACIONES,
    numeroEmpleado: 'DEMO-12',
  },
  {
    clave: 'tecnico3',
    nombre: 'Efraín Quiroz Maldonado',
    email: `efrain.quiroz@${DOMINIO}`,
    roles: ['ing_soporte', 'ing_campo', 'administrativo'],
    puesto: 'Técnico de Soporte',
    departamento: DEPTO_OPERACIONES,
    numeroEmpleado: 'DEMO-13',
  },
  {
    clave: 'admin',
    nombre: 'Sofía Narváez Bustos',
    email: `sofia.narvaez@${DOMINIO}`,
    roles: ['administrativo', 'coord_admin'],
    puesto: 'Auxiliar Administrativa',
    departamento: DEPTO_ADMINISTRACION,
    numeroEmpleado: 'DEMO-14',
  },
];

type SucursalDemo = {
  branchNumber: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
};

type ClienteDemo = {
  clave: 'altamar' | 'espiga' | 'vidriera';
  accountCode: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  sucursal: SucursalDemo;
};

/** Teléfonos en el bloque 555, que en México no se asigna a abonados. */
const CLIENTES: ClienteDemo[] = [
  {
    clave: 'altamar',
    accountCode: 'DEMO-CLI-01',
    name: 'Grupo Ferretero Altamar',
    contactName: 'Lorena Vidal Ocampo',
    contactEmail: `compras@altamar.${DOMINIO}`,
    contactPhone: '+52 222 555 0110',
    address: 'Av. Reforma Poniente 1450',
    city: 'Puebla',
    state: 'Puebla',
    sucursal: {
      branchNumber: 'DEMO-SUC-01',
      name: 'Matriz Altamar Centro',
      address: 'Av. Reforma Poniente 1450, Centro',
      city: 'Puebla',
      state: 'Puebla',
      lat: 19.0414,
      lng: -98.2063,
    },
  },
  {
    clave: 'espiga',
    accountCode: 'DEMO-CLI-02',
    name: 'Abarrotes La Espiga Dorada',
    contactName: 'Ismael Fuentes Carrizo',
    contactEmail: `mantenimiento@espiga.${DOMINIO}`,
    contactPhone: '+52 222 555 0120',
    address: 'Boulevard Norte 320',
    city: 'Puebla',
    state: 'Puebla',
    sucursal: {
      branchNumber: 'DEMO-SUC-02',
      name: 'La Espiga Norte',
      address: 'Boulevard Norte 320, San Jerónimo Caleras',
      city: 'Puebla',
      state: 'Puebla',
      lat: 19.076,
      lng: -98.201,
    },
  },
  {
    clave: 'vidriera',
    accountCode: 'DEMO-CLI-03',
    name: 'Corporativo Vidriera Montenegro',
    contactName: 'Adriana Sologuren Paz',
    contactEmail: `servicios@vidriera.${DOMINIO}`,
    contactPhone: '+52 222 555 0130',
    address: 'Carretera Federal Oriente Km 4.5',
    city: 'Amozoc',
    state: 'Puebla',
    sucursal: {
      branchNumber: 'DEMO-SUC-03',
      name: 'Planta Montenegro Oriente',
      address: 'Carretera Federal Oriente Km 4.5, Parque Industrial',
      city: 'Amozoc',
      state: 'Puebla',
      lat: 19.032,
      lng: -98.038,
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Resolución del tenant — ninguna escritura antes de esto
// ─────────────────────────────────────────────────────────────────────────────

/** Mínimo del cliente Prisma que necesita `resolveDemoCompany`, para poder probarlo con un doble. */
type LectorDeEmpresa = {
  companyProfile: {
    findUnique(args: {
      where: { slug: string };
      select: { id: true; slug: true; isPrimary: true; isActive: true };
    }): Promise<{ id: number; slug: string | null; isPrimary: boolean; isActive: boolean } | null>;
  };
};

/**
 * `companyId` del tenant demo, resuelto por slug y pasado por el guardia.
 *
 * Es la única puerta de entrada al sembrado: si lanza, no se ha escrito nada.
 */
export async function resolveDemoCompany(prisma: LectorDeEmpresa): Promise<number> {
  const empresa = await prisma.companyProfile.findUnique({
    where: { slug: DEMO_COMPANY_SLUG },
    select: { id: true, slug: true, isPrimary: true, isActive: true },
  });
  return assertDemoTenant(empresa);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sembrado
// ─────────────────────────────────────────────────────────────────────────────

async function asegurarDepartamento(prisma: PrismaClient, companyId: number, nombre: string): Promise<number> {
  const dep = await prisma.department.upsert({
    where: { companyId_nombre: { companyId, nombre } },
    create: { nombre, companyId },
    update: {},
    select: { id: true },
  });
  return dep.id;
}

/** Primer `Role` cuyo `orgRoleKey` esté en la lista. `super_admin` jamás: cruza tenants. */
async function resolverRol(
  prisma: PrismaClient,
  candidatos: string[],
): Promise<{ id: number; roleKey: string }> {
  for (const key of candidatos) {
    if (key === 'super_admin') continue;
    const hit = await prisma.role.findFirst({ where: { orgRoleKey: key }, select: { id: true } });
    if (hit) return { id: hit.id, roleKey: key };
  }
  const fallback = await prisma.role.findFirst({
    where: { NOT: { orgRoleKey: 'super_admin' } },
    orderBy: { id: 'asc' },
    select: { id: true, orgRoleKey: true },
  });
  if (!fallback) {
    throw new Error('No hay roles en la base de datos — corre el seed principal primero.');
  }
  return { id: fallback.id, roleKey: fallback.orgRoleKey ?? 'administrativo' };
}

type EquipoSembrado = Record<PersonaDemo['clave'], number>;

/**
 * Crea o actualiza el equipo demo.
 *
 * La contraseña se genera aleatoria **y solo al crear**: nadie la conoce, así que
 * estas cuentas no se pueden usar para entrar. Existen para poblar listas,
 * organigrama y asignaciones; la única cuenta que entra es la del revisor. Al
 * actualizar no se toca el hash, para no invalidar una contraseña que Adam
 * hubiera fijado a mano.
 */
async function sembrarEquipo(prisma: PrismaClient, companyId: number): Promise<EquipoSembrado> {
  const ids = {} as EquipoSembrado;

  for (const persona of EQUIPO) {
    const departmentId = await asegurarDepartamento(prisma, companyId, persona.departamento);
    const rol = await resolverRol(prisma, persona.roles);
    const email = persona.email.toLowerCase();

    const comun = {
      nombre: persona.nombre,
      roleId: rol.id,
      roleKey: rol.roleKey,
      departmentId,
      puesto: persona.puesto,
      employeeNumber: persona.numeroEmpleado,
      isActive: true,
      estadoRRHH: 'Activo',
      mfaEnabled: false,
      mfaSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
      // Sin foto: ninguna imagen de persona real entra en la demo.
      avatarUrl: null,
    };

    const usuario = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        // Aleatoria e irrecuperable: la cuenta existe pero no se puede usar para entrar.
        passwordHash: bcryptjs.hashSync(randomBytes(32).toString('hex'), 10),
        ...comun,
      },
      update: comun,
      select: { id: true },
    });

    // La membresía al tenant demo debe ser la ÚNICA de estas cuentas.
    await prisma.userCompany.deleteMany({ where: { userId: usuario.id, NOT: { companyId } } });
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: usuario.id, companyId } },
      create: { userId: usuario.id, companyId, isDefault: true, employeeNumber: persona.numeroEmpleado },
      update: { isDefault: true, employeeNumber: persona.numeroEmpleado },
    });

    ids[persona.clave] = usuario.id;
  }

  return ids;
}

type ClienteSembrado = { clienteId: number; sucursalId: number; datos: ClienteDemo };

/**
 * Clientes de servicio con su sucursal.
 *
 * `service_clients` no tiene clave natural única más allá de `portalEmail` —que
 * se deja nulo a propósito, para no abrir una superficie de login de portal en
 * el tenant demo—, así que la idempotencia se ancla en `accountCode` buscado
 * dentro del tenant. La sucursal sí tiene `(clientId, branchNumber)` único.
 */
async function sembrarClientes(
  prisma: PrismaClient,
  companyId: number,
): Promise<Record<ClienteDemo['clave'], ClienteSembrado>> {
  const salida = {} as Record<ClienteDemo['clave'], ClienteSembrado>;

  for (const c of CLIENTES) {
    const campos = {
      name: c.name,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      address: c.address,
      city: c.city,
      state: c.state,
      country: 'México',
      accountCode: c.accountCode,
      isActive: true,
    };

    const existente = await prisma.serviceClient.findFirst({
      where: { companyId, accountCode: c.accountCode },
      select: { id: true },
    });

    const cliente = existente
      ? await prisma.serviceClient.update({ where: { id: existente.id }, data: campos, select: { id: true } })
      : await prisma.serviceClient.create({ data: { ...campos, companyId }, select: { id: true } });

    const s = c.sucursal;
    const sucursal = await prisma.serviceClientBranch.upsert({
      where: { clientId_branchNumber: { clientId: cliente.id, branchNumber: s.branchNumber } },
      create: {
        clientId: cliente.id,
        companyId,
        branchNumber: s.branchNumber,
        name: s.name,
        address: s.address,
        city: s.city,
        state: s.state,
        country: 'México',
        latitud: s.lat,
        longitud: s.lng,
        isActive: true,
      },
      update: {
        name: s.name,
        address: s.address,
        city: s.city,
        state: s.state,
        country: 'México',
        latitud: s.lat,
        longitud: s.lng,
        isActive: true,
      },
      select: { id: true },
    });

    salida[c.clave] = { clienteId: cliente.id, sucursalId: sucursal.id, datos: c };
  }

  return salida;
}

type PlanActividad = {
  anNumber: string;
  titulo: string;
  descripcion: string;
  estatus: string;
  prioridad: string;
  ticketType: 'PREVENTIVO' | 'CORRECTIVO' | 'EMERGENCIA' | 'INSTALACION' | 'OTRO';
  cliente: ClienteDemo['clave'];
  responsable: number;
  apoyo?: number[];
  fechaAsignacion: Date;
  fechaInicio: Date | null;
  fechaMaxima: Date;
  fechaFinalizacion: Date | null;
  tiempoEstimadoMin: number;
  fotosRequeridas: number;
};

/**
 * Actividades repartidas por estado, con folio, cliente y fechas coherentes.
 *
 * `(companyId, anNumber)` es único en el esquema, así que el `upsert` por esa
 * clave es lo que hace idempotente todo el bloque. El `update` reescribe fechas
 * y estado a propósito: volver a correr el seed devuelve la demo a su punto de
 * partida aunque el revisor haya movido algo.
 */
async function sembrarActividades(
  prisma: PrismaClient,
  companyId: number,
  planes: PlanActividad[],
  clientes: Record<ClienteDemo['clave'], ClienteSembrado>,
  creadorId: number,
): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};

  for (const p of planes) {
    const c = clientes[p.cliente];
    const s = c.datos.sucursal;

    const campos = {
      titulo: p.titulo,
      descripcion: p.descripcion,
      estatus: p.estatus,
      prioridad: p.prioridad,
      activityType: 'CLIENT' as const,
      ticketType: p.ticketType,
      workType: 'ISSUE' as const,
      coreKind: 'servicio',
      clientId: c.clienteId,
      branchName: s.name,
      branchNumber: s.branchNumber,
      branchCity: s.city,
      branchState: s.state,
      branchAddress: s.address,
      creadoPorId: creadorId,
      responsableId: p.responsable,
      assignmentCharge: 'ejecucion',
      evidencePhotoRequired: p.fotosRequeridas,
      tiempoEstimadoMin: p.tiempoEstimadoMin,
      fechaAsignacion: p.fechaAsignacion,
      fechaInicio: p.fechaInicio,
      fechaMaxima: p.fechaMaxima,
      fechaEntregaEsperada: p.fechaMaxima,
      fechaFinalizacion: p.fechaFinalizacion,
      deletedAt: null,
      cancelledAt: null,
      cancelReason: null,
    };

    const actividad = await prisma.activity.upsert({
      where: { companyId_anNumber: { companyId, anNumber: p.anNumber } },
      create: { anNumber: p.anNumber, companyId, ...campos },
      update: campos,
      select: { id: true },
    });

    ids[p.anNumber] = actividad.id;

    const equipo: Array<{ userId: number; rol: 'LEAD' | 'APOYO' }> = [
      { userId: p.responsable, rol: 'LEAD' },
      ...(p.apoyo ?? []).map((userId) => ({ userId, rol: 'APOYO' as const })),
    ];

    for (const miembro of equipo) {
      const datosMiembro = {
        rol: miembro.rol,
        companyId,
        asignadoPorId: creadorId,
        asignadoAt: p.fechaAsignacion,
        aceptadaAt: p.fechaInicio,
        inicioRealAt: p.fechaInicio,
        finRealAt: p.fechaFinalizacion,
        retiradoAt: null,
        rechazadaAt: null,
        motivoRechazo: null,
      };
      await prisma.activityAssignee.upsert({
        where: { activityId_userId: { activityId: actividad.id, userId: miembro.userId } },
        create: { activityId: actividad.id, userId: miembro.userId, ...datosMiembro },
        update: datosMiembro,
      });
    }
  }

  return ids;
}

type FlujoEvidencia = {
  activityId: number;
  userId: number;
  folio: string;
  entrada: Date;
  salida: Date | null;
  lat: number;
  lng: number;
  fotos: number;
  /** COMPLETED deja el flujo entero; EVIDENCE_PHOTOS lo deja a medias, como una OT en curso. */
  status: 'COMPLETED' | 'EVIDENCE_PHOTOS';
  reviewStatus: 'PENDING' | 'APPROVED';
  revisorId: number | null;
  hojaDeServicio: string[] | null;
};

/**
 * Flujo de evidencia de los 5 pasos: foto de entrada, fotos, hoja de servicio,
 * formulario y foto de salida. `(activityId, userId)` es único, así que el
 * `upsert` reescribe en lugar de duplicar; las imágenes se regeneran con el
 * mismo nombre de fichero, de modo que tampoco se acumulan en disco.
 */
async function sembrarEvidencia(prisma: PrismaClient, companyId: number, f: FlujoEvidencia): Promise<void> {
  const completo = f.status === 'COMPLETED';

  const entryPhotoUrl = guardarMedia(`${f.folio}-entrada.png`, pngRelleno('entrada', 1));
  const evidencePhotos: string[] = [];
  for (let i = 1; i <= f.fotos; i += 1) {
    evidencePhotos.push(guardarMedia(`${f.folio}-evidencia-${i}.png`, pngRelleno('evidencia', i)));
  }
  const exitPhotoUrl = completo && f.salida ? guardarMedia(`${f.folio}-salida.png`, pngRelleno('salida', 2)) : null;
  const serviceSheetPdfUrl =
    completo && f.hojaDeServicio ? guardarMedia(`${f.folio}-hoja-servicio.pdf`, pdfHoja(f.hojaDeServicio)) : null;

  const minutoDespues = (min: number): Date => new Date(f.entrada.getTime() + min * 60_000);

  const datos = {
    companyId,
    entryPhotoUrl,
    entryLatitude: f.lat,
    entryLongitude: f.lng,
    entryPhotoUploadedAt: f.entrada,
    entryMockLocation: false,
    evidencePhotos,
    evidencePhotosUploadedAt: evidencePhotos.length > 0 ? minutoDespues(35) : null,
    evidencePhotosGeo:
      evidencePhotos.length > 0
        ? evidencePhotos.map((_, i) => ({
            latitude: f.lat,
            longitude: f.lng,
            capturedAt: minutoDespues(30 + i * 3).toISOString(),
          }))
        : Prisma.DbNull,
    serviceSheetPdfUrl,
    serviceSheetUploadedAt: serviceSheetPdfUrl ? minutoDespues(50) : null,
    serviceSheetData: completo
      ? {
          equipoRevisado: 'Sistema de videovigilancia y control de acceso',
          hallazgos: 'Sin observaciones. Equipo operando dentro de parámetros.',
          refaccionesUsadas: 'Ninguna',
          firmaCliente: 'Demostración — sin firma real',
        }
      : Prisma.DbNull,
    serviceSheetCompletedAt: completo ? minutoDespues(55) : null,
    exitPhotoUrl,
    exitLatitude: exitPhotoUrl ? f.lat : null,
    exitLongitude: exitPhotoUrl ? f.lng : null,
    exitPhotoUploadedAt: exitPhotoUrl ? f.salida : null,
    exitMockLocation: exitPhotoUrl ? false : null,
    status: f.status,
    completedAt: completo ? f.salida : null,
    reviewStatus: f.reviewStatus,
    rejectedStep: null,
    rejectedSteps: Prisma.DbNull,
    reviewNotes: f.reviewStatus === 'APPROVED' ? 'Evidencia completa y legible. Aprobada.' : null,
    reviewedAt: f.reviewStatus === 'APPROVED' ? f.salida : null,
    reviewedById: f.reviewStatus === 'APPROVED' ? f.revisorId : null,
    eficienciaScore: f.reviewStatus === 'APPROVED' ? 5 : null,
    correctionSubmittedAt: null,
  };

  await prisma.activityEvidence.upsert({
    where: { activityId_userId: { activityId: f.activityId, userId: f.userId } },
    create: { activityId: f.activityId, userId: f.userId, ...datos },
    update: datos,
  });

  // Espejo en la tabla histórica `Evidence`: de ahí salen los contadores del
  // panel y el anexo del reporte de asistencia, que si no muestran cero.
  const historicas: Array<{ tipo: string; url: string }> = [
    { tipo: 'Entrada', url: entryPhotoUrl },
    ...evidencePhotos.map((url, i) => ({ tipo: `Evidencia ${i + 1}`, url })),
    ...(exitPhotoUrl ? [{ tipo: 'Salida', url: exitPhotoUrl }] : []),
  ];
  for (const h of historicas) {
    const yaEsta = await prisma.evidence.findFirst({
      where: { actividadId: f.activityId, archivoUrl: h.url },
      select: { id: true },
    });
    const campos = {
      tipoEvidencia: h.tipo,
      aprobada: f.reviewStatus === 'APPROVED',
      estatus: f.reviewStatus === 'APPROVED' ? 'Aprobada' : 'Pendiente',
      latitud: f.lat,
      longitud: f.lng,
      userId: f.userId,
      aprobadoPorId: f.reviewStatus === 'APPROVED' ? f.revisorId : null,
      revisadoEn: f.reviewStatus === 'APPROVED' ? f.salida : null,
      subidoEn: f.entrada,
    };
    if (yaEsta) {
      await prisma.evidence.update({ where: { id: yaEsta.id }, data: campos });
    } else {
      await prisma.evidence.create({
        data: { actividadId: f.activityId, archivoUrl: h.url, companyId, ...campos },
      });
    }
  }
}

/**
 * Campos a documentar de una OT («Cámara de acceso», «Rack de video») con su
 * foto por momento. `(activityId, nombre)` y `(fieldId, momento)` son únicos.
 */
async function sembrarCamposEvidencia(
  prisma: PrismaClient,
  companyId: number,
  activityId: number,
  userId: number,
  folio: string,
  campos: Array<{ nombre: string; notas: string }>,
): Promise<void> {
  const momentos = ['ANTES', 'DESPUES'];

  for (let i = 0; i < campos.length; i += 1) {
    const c = campos[i];
    const campo = await prisma.activityEvidenceField.upsert({
      where: { activityId_nombre: { activityId, nombre: c.nombre } },
      create: { activityId, companyId, nombre: c.nombre, momentos, orden: i, notas: c.notas },
      update: { momentos, orden: i, notas: c.notas },
      select: { id: true },
    });

    for (const momento of momentos) {
      const nombreArchivo = `${folio}-campo-${i + 1}-${momento.toLowerCase()}.png`;
      const photoUrl = guardarMedia(nombreArchivo, pngRelleno('campo', i * 2 + momentos.indexOf(momento) + 1));
      await prisma.activityEvidenceFieldPhoto.upsert({
        where: { fieldId_momento: { fieldId: campo.id, momento } },
        create: { fieldId: campo.id, activityId, userId, companyId, momento, photoUrl },
        update: { activityId, userId, photoUrl },
      });
    }
  }
}

/**
 * Checadas del día. `(companyId, userId, workDate, type)` es único —la columna
 * existe justamente para impedir dobles—, así que el `upsert` es seguro y
 * volver a correr el seed el mismo día no genera una segunda entrada.
 */
async function sembrarChecada(
  prisma: PrismaClient,
  companyId: number,
  userId: number,
  dia: Ymd,
  tipo: 'entrada' | 'salida',
  at: Date,
  sitio: { nombre: string; lat: number; lng: number },
): Promise<void> {
  const workDate = comoFechaSola(dia);
  const photoUrl = guardarMedia(
    `asistencia-${userId}-${isoCorto(dia)}-${tipo}.png`,
    pngRelleno(tipo === 'entrada' ? 'entrada' : 'salida', dia.d + userId),
  );

  const esEntrada = tipo === 'entrada';
  const datos = {
    timestamp: at,
    photoUrl,
    entryLatitude: esEntrada ? sitio.lat : null,
    entryLongitude: esEntrada ? sitio.lng : null,
    exitLatitude: esEntrada ? null : sitio.lat,
    exitLongitude: esEntrada ? null : sitio.lng,
    clientCapturedAt: at,
    accuracyM: 12,
    fixAgeMs: 800,
    mockDetected: false,
    offline: false,
    validacion: 'OK',
    fueraDeSitio: false,
    distanciaSitioM: 24,
    sitioNombre: sitio.nombre,
    cierreAutomatico: false,
    origen: 'ANDROID',
    deviceInfo: 'Demostración de tiendas',
  };

  await prisma.attendance.upsert({
    where: { companyId_userId_workDate_type: { companyId, userId, workDate, type: tipo } },
    create: { companyId, userId, workDate, type: tipo, ...datos },
    update: datos,
  });
}

/** Jornada consolidada del día: la pantalla de asistencias la usa para las horas. */
async function sembrarJornada(
  prisma: PrismaClient,
  companyId: number,
  userId: number,
  dia: Ymd,
  minutos: number,
  abierta: boolean,
  ultimaEntrada: Date,
): Promise<void> {
  const date = comoFechaSola(dia);
  const datos = { totalMinutes: minutos, isOpen: abierta, lastEntryAt: ultimaEntrada };
  await prisma.attendanceDay.upsert({
    where: { companyId_userId_date: { companyId, userId, date } },
    create: { companyId, userId, date, ...datos },
    update: datos,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Orquestación
// ─────────────────────────────────────────────────────────────────────────────

export type ResumenSembrado = {
  companyId: number;
  clientes: number;
  personas: number;
  actividades: number;
  evidencias: number;
  checadas: number;
  viaticos: number;
  herramientas: number;
};

/**
 * Siembra el contenido demo completo. Idempotente.
 *
 * `revisorId` es el usuario de la tienda: se le asigna una actividad del día
 * para que «Mis actividades» no salga vacío y pueda recorrer el flujo de
 * evidencia de principio a fin con su propia cuenta.
 */
export async function seedPlayDemoData(
  prisma: PrismaClient,
  opciones: { revisorEmail?: string } = {},
): Promise<ResumenSembrado> {
  const companyId = await resolveDemoCompany(prisma);
  console.log(`🌱 [play-demo] Tenant ${DEMO_COMPANY_SLUG} (id=${companyId}) — sembrando contenido de demostración…`);

  const ahora = new Date();
  const hoy: Ymd = (() => {
    const p = partesEnTz(ahora);
    return { y: p.y, m: p.m, d: p.d };
  })();
  const ayer = diaRelativo(hoy, -1);
  const anteayer = diaRelativo(hoy, -2);
  const laSemanaPasada = diaRelativo(hoy, -6);

  const equipo = await sembrarEquipo(prisma, companyId);
  console.log(`   👷 Equipo demo: ${EQUIPO.length} personas`);

  const clientes = await sembrarClientes(prisma, companyId);
  console.log(`   🏬 Clientes de servicio: ${CLIENTES.length} (con sucursal)`);

  const revisorEmail = (opciones.revisorEmail || 'play.review@nexara.com.mx').trim().toLowerCase();
  const revisor = await prisma.user.findUnique({ where: { email: revisorEmail }, select: { id: true } });

  const planes: PlanActividad[] = [
    {
      anNumber: 'AN-DEMO-0001',
      titulo: 'Mantenimiento preventivo de CCTV — Matriz Altamar',
      descripcion:
        'Limpieza de domos, revisión de enfoque, prueba de grabación y respaldo de configuración del NVR.',
      estatus: 'Finalizada',
      prioridad: 'Media',
      ticketType: 'PREVENTIVO',
      cliente: 'altamar',
      responsable: equipo.tecnico1,
      fechaAsignacion: horaLocal(anteayer, 8, 0),
      fechaInicio: horaLocal(anteayer, 9, 5),
      fechaMaxima: horaLocal(anteayer, 18, 0),
      fechaFinalizacion: horaLocal(anteayer, 13, 40),
      tiempoEstimadoMin: 240,
      fotosRequeridas: 3,
    },
    {
      anNumber: 'AN-DEMO-0002',
      titulo: 'Reemplazo de controladora de acceso — Planta Montenegro',
      descripcion:
        'La controladora del acceso peatonal dejó de responder. Sustitución de la tarjeta y alta nueva de los usuarios.',
      estatus: 'En Proceso',
      prioridad: 'Alta',
      ticketType: 'CORRECTIVO',
      cliente: 'vidriera',
      responsable: equipo.tecnico2,
      apoyo: [equipo.tecnico3],
      fechaAsignacion: horaLocal(hoy, 7, 30),
      fechaInicio: horaLocal(hoy, 8, 40),
      fechaMaxima: horaLocal(hoy, 19, 0),
      fechaFinalizacion: null,
      tiempoEstimadoMin: 300,
      fotosRequeridas: 3,
    },
    {
      anNumber: 'AN-DEMO-0003',
      titulo: 'Instalación de alarma perimetral — La Espiga Norte',
      descripcion: 'Montaje de sensores en patio de maniobras, cableado y alta en la central de monitoreo.',
      estatus: 'Asignada',
      prioridad: 'Media',
      ticketType: 'INSTALACION',
      cliente: 'espiga',
      responsable: equipo.tecnico3,
      fechaAsignacion: horaLocal(hoy, 7, 0),
      fechaInicio: null,
      fechaMaxima: horaLocal(hoy, 18, 0),
      fechaFinalizacion: null,
      tiempoEstimadoMin: 360,
      fotosRequeridas: 4,
    },
    {
      anNumber: 'AN-DEMO-0004',
      titulo: 'Revisión de red y cableado estructurado — Matriz Altamar',
      descripcion: 'Certificación de 12 nodos, etiquetado de patch panel y reemplazo de dos jacks dañados.',
      estatus: 'Por Validar',
      prioridad: 'Media',
      ticketType: 'CORRECTIVO',
      cliente: 'altamar',
      responsable: equipo.tecnico1,
      fechaAsignacion: horaLocal(ayer, 8, 0),
      fechaInicio: horaLocal(ayer, 9, 15),
      fechaMaxima: horaLocal(ayer, 18, 0),
      fechaFinalizacion: null,
      tiempoEstimadoMin: 300,
      fotosRequeridas: 3,
    },
    {
      anNumber: 'AN-DEMO-0005',
      titulo: 'Levantamiento para propuesta de videovigilancia — La Espiga Norte',
      descripcion: 'Recorrido con el cliente, medición de distancias y conteo de puntos para la propuesta.',
      estatus: 'Finalizada',
      prioridad: 'Baja',
      ticketType: 'OTRO',
      cliente: 'espiga',
      responsable: equipo.tecnico2,
      fechaAsignacion: horaLocal(laSemanaPasada, 9, 0),
      fechaInicio: horaLocal(laSemanaPasada, 10, 0),
      fechaMaxima: horaLocal(laSemanaPasada, 17, 0),
      fechaFinalizacion: horaLocal(laSemanaPasada, 12, 20),
      tiempoEstimadoMin: 150,
      fotosRequeridas: 2,
    },
  ];

  if (revisor) {
    planes.push({
      anNumber: 'AN-DEMO-0006',
      titulo: 'Ronda de verificación de cámaras — Planta Montenegro',
      descripcion:
        'Actividad de práctica para la revisión de la tienda: recórrela completa desde la app (iniciar, foto de entrada, evidencias y foto de salida).',
      estatus: 'Asignada',
      prioridad: 'Media',
      ticketType: 'PREVENTIVO',
      cliente: 'vidriera',
      responsable: revisor.id,
      fechaAsignacion: horaLocal(hoy, 7, 15),
      fechaInicio: null,
      fechaMaxima: horaLocal(hoy, 20, 0),
      fechaFinalizacion: null,
      tiempoEstimadoMin: 120,
      fotosRequeridas: 2,
    });
  }

  const actividades = await sembrarActividades(prisma, companyId, planes, clientes, equipo.encargada);
  console.log(`   📋 Actividades: ${planes.length} (Finalizada · En Proceso · Por Validar · Asignada de hoy)`);

  // Evidencia completa en la actividad finalizada: entrada, fotos, hoja de
  // servicio, formulario y salida, ya aprobada.
  const altamar = clientes.altamar.datos.sucursal;
  await sembrarEvidencia(prisma, companyId, {
    activityId: actividades['AN-DEMO-0001'],
    userId: equipo.tecnico1,
    folio: 'an-demo-0001',
    entrada: horaLocal(anteayer, 9, 5),
    salida: horaLocal(anteayer, 13, 40),
    lat: altamar.lat,
    lng: altamar.lng,
    fotos: 3,
    status: 'COMPLETED',
    reviewStatus: 'APPROVED',
    revisorId: equipo.encargada,
    hojaDeServicio: [
      'HOJA DE SERVICIO - NEXARA (DEMOSTRACION)',
      'Folio: AN-DEMO-0001',
      'Cliente: Grupo Ferretero Altamar',
      'Sucursal: Matriz Altamar Centro',
      'Servicio: Mantenimiento preventivo de CCTV',
      `Fecha: ${isoCorto(anteayer)}`,
      'Tecnico: Ruben Ayala Sandoval',
      '',
      'Trabajos realizados:',
      '- Limpieza de 8 domos y ajuste de enfoque',
      '- Prueba de grabacion continua y por movimiento',
      '- Respaldo de configuracion del NVR',
      '',
      'Hallazgos: sin observaciones.',
      'Recibe: Lorena Vidal Ocampo (contacto de demostracion)',
      '',
      'Documento generado para la revision de tiendas. Datos ficticios.',
    ],
  });
  await sembrarCamposEvidencia(prisma, companyId, actividades['AN-DEMO-0001'], equipo.tecnico1, 'an-demo-0001', [
    { nombre: 'Cámara de acceso principal', notas: 'La del portón, no la de caja.' },
    { nombre: 'Rack de video', notas: 'Foto del frente con etiquetas visibles.' },
  ]);

  // Evidencia completa pero SIN revisar: da contenido a la bandeja de revisión.
  await sembrarEvidencia(prisma, companyId, {
    activityId: actividades['AN-DEMO-0004'],
    userId: equipo.tecnico1,
    folio: 'an-demo-0004',
    entrada: horaLocal(ayer, 9, 15),
    salida: horaLocal(ayer, 14, 5),
    lat: altamar.lat,
    lng: altamar.lng,
    fotos: 3,
    status: 'COMPLETED',
    reviewStatus: 'PENDING',
    revisorId: null,
    hojaDeServicio: [
      'HOJA DE SERVICIO - NEXARA (DEMOSTRACION)',
      'Folio: AN-DEMO-0004',
      'Cliente: Grupo Ferretero Altamar',
      'Servicio: Revision de red y cableado estructurado',
      `Fecha: ${isoCorto(ayer)}`,
      'Tecnico: Ruben Ayala Sandoval',
      '',
      'Trabajos realizados:',
      '- Certificacion de 12 nodos',
      '- Etiquetado de patch panel',
      '- Reemplazo de 2 jacks danados',
      '',
      'Pendiente de validacion.',
      '',
      'Documento generado para la revision de tiendas. Datos ficticios.',
    ],
  });

  // Actividad en curso: solo la foto de entrada, como una OT que empezó hoy.
  const vidriera = clientes.vidriera.datos.sucursal;
  await sembrarEvidencia(prisma, companyId, {
    activityId: actividades['AN-DEMO-0002'],
    userId: equipo.tecnico2,
    folio: 'an-demo-0002',
    entrada: horaLocal(hoy, 8, 40),
    salida: null,
    lat: vidriera.lat,
    lng: vidriera.lng,
    fotos: 0,
    status: 'EVIDENCE_PHOTOS',
    reviewStatus: 'PENDING',
    revisorId: null,
    hojaDeServicio: null,
  });
  console.log('   📸 Evidencia: 1 flujo completo aprobado · 1 completo por revisar · 1 en curso');

  // Hoja de servicio firmada y encuesta del cliente sobre la actividad cerrada.
  const hojaDatos = {
    companyId,
    managerName: 'Lorena Vidal Ocampo',
    managerRole: 'Jefa de Mantenimiento (contacto de demostración)',
    workSummary:
      'Mantenimiento preventivo de 8 cámaras, prueba de grabación y respaldo de configuración del NVR.',
    equipmentList: [
      { equipo: 'NVR 16 canales', marca: 'Genérica', serie: 'DEMO-NVR-0001' },
      { equipo: 'Domo IP 4MP', marca: 'Genérica', cantidad: 8 },
    ],
    observations: 'Sin observaciones. Se recomienda repetir el preventivo en 6 meses.',
    signedName: 'Lorena Vidal Ocampo',
    pdfUrl: `/uploads/${CARPETA_MEDIA}/an-demo-0001-hoja-servicio.pdf`,
    survey: { atencion: 5, puntualidad: 5, limpieza: 5, comentario: 'Todo en orden (demostración).' },
  };
  await prisma.serviceSheet.upsert({
    where: { activityId: actividades['AN-DEMO-0001'] },
    create: { activityId: actividades['AN-DEMO-0001'], ...hojaDatos },
    update: hojaDatos,
  });

  const encuesta = {
    clientId: clientes.altamar.clienteId,
    rating: 5,
    wasOnTime: true,
    wasFriendly: true,
    wasSolved: true,
    comments: 'Servicio puntual y bien documentado. (Encuesta de demostración.)',
  };
  await prisma.clientActivityFeedback.upsert({
    where: { activityId: actividades['AN-DEMO-0001'] },
    create: { activityId: actividades['AN-DEMO-0001'], ...encuesta },
    update: encuesta,
  });

  // ── Asistencia ─────────────────────────────────────────────────────────────
  // Ayer, jornada cerrada para todo el equipo; hoy, entrada para todos y salida
  // solo para quien ya terminó. Al revisor NO se le siembra checada: la pantalla
  // le deja probar su propio registro de entrada.
  const oficina = { nombre: 'Oficina NEXARA Demo', lat: 19.0414, lng: -98.2063 };
  const plantilla: Array<{ id: number; salioHoy: boolean }> = [
    { id: equipo.encargada, salioHoy: false },
    { id: equipo.tecnico1, salioHoy: true },
    { id: equipo.tecnico2, salioHoy: false },
    { id: equipo.tecnico3, salioHoy: false },
    { id: equipo.admin, salioHoy: true },
  ];

  let checadas = 0;
  for (const persona of plantilla) {
    await sembrarChecada(prisma, companyId, persona.id, ayer, 'entrada', horaLocal(ayer, 8, 5), oficina);
    await sembrarChecada(prisma, companyId, persona.id, ayer, 'salida', horaLocal(ayer, 18, 10), oficina);
    await sembrarJornada(prisma, companyId, persona.id, ayer, 605, false, horaLocal(ayer, 8, 5));
    checadas += 2;

    await sembrarChecada(prisma, companyId, persona.id, hoy, 'entrada', horaLocal(hoy, 8, 2), oficina);
    checadas += 1;
    if (persona.salioHoy) {
      await sembrarChecada(prisma, companyId, persona.id, hoy, 'salida', horaLocal(hoy, 17, 45), oficina);
      checadas += 1;
      await sembrarJornada(prisma, companyId, persona.id, hoy, 583, false, horaLocal(hoy, 8, 2));
    } else {
      await sembrarJornada(prisma, companyId, persona.id, hoy, 0, true, horaLocal(hoy, 8, 2));
    }
  }
  console.log(`   🕗 Asistencia: ${checadas} checadas (ayer completo · hoy en curso)`);

  // ── Viático ────────────────────────────────────────────────────────────────
  // Sin clave natural en el esquema: se ancla en `contabilidadRef`, que es el
  // campo pensado para referencias externas y no lo usa nada más en el tenant.
  const refViatico = 'DEMO-VIA-0001';
  const viaticoDatos = {
    usuarioId: equipo.tecnico2,
    actividadId: actividades['AN-DEMO-0002'],
    categoria: 'COMBUSTIBLE',
    origen: 'SOLICITUD',
    montoSolicitado: '850.00',
    montoAprobado: '850.00',
    motivo: 'Combustible Puebla → Amozoc, servicio en Planta Montenegro (demostración)',
    estatus: 'Aprobado',
    approvalStep: 1,
    asignadoPorId: equipo.encargada,
    fechaSolicitud: horaLocal(hoy, 7, 40),
    deletedAt: null,
  };
  const viaticoExistente = await prisma.viatico.findFirst({
    where: { companyId, contabilidadRef: refViatico },
    select: { id: true },
  });
  if (viaticoExistente) {
    await prisma.viatico.update({ where: { id: viaticoExistente.id }, data: viaticoDatos });
  } else {
    await prisma.viatico.create({ data: { companyId, contabilidadRef: refViatico, ...viaticoDatos } });
  }
  console.log('   🧾 Viáticos: 1 solicitud aprobada');

  // ── Herramienta ────────────────────────────────────────────────────────────
  const herramientas = [
    {
      serialNumber: 'DEMO-SER-0001',
      toolName: 'Multímetro digital',
      model: 'DM-250',
      codigoInterno: 'MUL-00001',
      barcode: 'DEMO0000001',
      status: 'ASSIGNED' as const,
    },
    {
      serialNumber: 'DEMO-SER-0002',
      toolName: 'Taladro rotomartillo',
      model: 'RT-800',
      codigoInterno: 'TAL-00002',
      barcode: 'DEMO0000002',
      status: 'AVAILABLE' as const,
    },
  ];
  for (let i = 0; i < herramientas.length; i += 1) {
    const h = herramientas[i];
    const datos = {
      toolName: h.toolName,
      model: h.model,
      codigoInterno: h.codigoInterno,
      barcode: h.barcode,
      status: h.status,
      panoramicPhotoUrl: guardarMedia(
        `herramienta-${h.serialNumber.toLowerCase()}-panoramica.png`,
        pngRelleno('herramienta', i * 2 + 1),
      ),
      serialPhotoUrl: guardarMedia(
        `herramienta-${h.serialNumber.toLowerCase()}-serie.png`,
        pngRelleno('herramienta', i * 2 + 2),
      ),
      retiredReason: null,
    };
    await prisma.toolInventoryItem.upsert({
      where: { companyId_serialNumber: { companyId, serialNumber: h.serialNumber } },
      create: { companyId, serialNumber: h.serialNumber, ...datos },
      update: datos,
    });
  }
  console.log(`   🔧 Herramienta: ${herramientas.length} equipos en inventario`);

  return {
    companyId,
    clientes: CLIENTES.length,
    personas: EQUIPO.length,
    actividades: planes.length,
    evidencias: 3,
    checadas,
    viaticos: 1,
    herramientas: herramientas.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada directa: `npm run seed:play-demo`
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const prisma = new PrismaClient();
  seedPlayDemoData(prisma)
    .then((r) => {
      console.log(
        `\n✨ seed-play-demo-data completado (companyId=${r.companyId}). ` +
          'Correrlo otra vez reescribe lo mismo y refresca las fechas.\n',
      );
    })
    .catch((e) => {
      console.error('❌ seed-play-demo-data falló:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
