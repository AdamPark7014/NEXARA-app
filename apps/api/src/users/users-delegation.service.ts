import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PLATFORM_OWNER_EMAIL, isDeveloperSuperAdminEmail, isPlatformOwnerEmail } from '../common/platform-accounts.js';
import { UsersService } from './users.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import { ROLE_LABELS, type RoleKey } from '../common/rbac/roles.v2.js';
import {
  USER_CREATION_GRANTS_SETTING_KEY,
  contrasenaAceptable,
  esDireccion,
  parsearConcesiones,
  puedeCrearRol,
  rolesQuePuedeCrear,
  telefonoAceptable,
  tiposParaMostrar,
  type ConcesionesAlta,
  type FormularioAlta,
  type TipoUsuario,
} from './user-creation-policy.js';

const TTL_MS = 30_000;

export type AltaDelegada = {
  nombre: string;
  email: string;
  password: string;
  roleKey?: string;
  departmentId?: number | string | null;
  employeeNumber?: string | null;
  /** Solo dirección puede elegir a quién le reporta; para los demás siempre es quien da de alta. */
  managerId?: number | null;
  /** Contacto. Obligatorio en el formulario básico. */
  telefono?: string | null;
  /** La pone el controlador a partir del archivo ya recortado. No llega del JSON. */
  avatarUrl?: string | null;
};

export type ContextoAlta = {
  formulario: FormularioAlta;
  tipos: TipoUsuario[];
  /** Un solo tipo: el formulario no pregunta el rol. */
  rolAutomatico: boolean;
  /** El jefe es quien da de alta. En el completo se puede elegir otro. */
  jefeAutomatico: boolean;
  telefonoObligatorio: boolean;
  /** Sin subordinados directos, o sin tipos concedidos, el módulo no se ofrece. */
  puede: boolean;
  departamentos: { id: number; nombre: string }[];
  jefes: { id: number; nombre: string }[];
  equipo: { id: number; nombre: string; avatarUrl: string | null; telefono: string | null }[];
};

const CONTEXTO_VACIO: ContextoAlta = {
  formulario: 'basico',
  tipos: [],
  rolAutomatico: false,
  jefeAutomatico: true,
  telefonoObligatorio: true,
  puede: false,
  departamentos: [],
  jefes: [],
  equipo: [],
};

const sinAcentos = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

type UsuarioSesion = { id?: number | string | null; isClient?: boolean; isBranchUser?: boolean };

/**
 * Alta de usuarios delegada: cada persona da de alta solo los tipos que dirección le concedió
 * (Antonio y Luis: soporte; David: instaladores) y dirección da de alta todos los tipos por debajo.
 *
 * Reusa `UsersService.create` (asientos, número de empleado, chat, control de acceso): esto solo decide
 * QUIÉN puede y de QUÉ tipo, y deja el rastro en la auditoría. La contraseña nunca se devuelve ni se
 * escribe en registros: llega en la petición, se guarda como hash y la ve solo quien la escribió.
 */
@Injectable()
export class UsersDelegationService {
  private readonly cache = new Map<number, { at: number; concesiones: ConcesionesAlta }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async concesiones(companyId: number): Promise<ConcesionesAlta> {
    const previo = this.cache.get(companyId);
    if (previo && Date.now() - previo.at < TTL_MS) return previo.concesiones;
    const filas = await this.prisma.systemSetting.findMany({
      where: { key: USER_CREATION_GRANTS_SETTING_KEY, OR: [{ companyId: null }, { companyId }] },
      select: { companyId: true, value: true },
    });
    const propia = filas.find((f) => f.companyId === companyId) ?? filas.find((f) => f.companyId == null);
    const concesiones = parsearConcesiones(propia?.value);
    this.cache.set(companyId, { at: Date.now(), concesiones });
    return concesiones;
  }

  invalidar(companyId?: number): void {
    if (companyId == null) this.cache.clear();
    else this.cache.delete(companyId);
  }

  private async actor(sesion: UsuarioSesion) {
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0 || sesion?.isClient || sesion?.isBranchUser) {
      throw new ForbiddenException('Solo el personal interno puede dar de alta usuarios.');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, roleKey: true, departmentId: true, isActive: true },
    });
    if (!actor || actor.isActive === false) throw new ForbiddenException('Tu usuario no está activo.');
    return actor;
  }

  /** Personas activas que le reportan en esta empresa. El lateral del organigrama no cuenta. */
  private async tieneSubordinados(actorId: number, companyId: number): Promise<boolean> {
    const n = await this.prisma.user.count({
      where: {
        managerId: actorId,
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
    });
    return n > 0;
  }

  private async equipoDirecto(actorId: number, companyId: number) {
    const filas = await this.prisma.user.findMany({
      where: {
        managerId: actorId,
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, nombre: true, avatarUrl: true, perfil: { select: { telefono: true } } },
      orderBy: { nombre: 'asc' },
    });
    return filas.map((f: { id: number; nombre: string; avatarUrl: string | null; perfil?: { telefono: string | null } | null }) => ({
      id: f.id,
      nombre: f.nombre,
      avatarUrl: f.avatarUrl ?? null,
      telefono: f.perfil?.telefono ?? null,
    }));
  }

  /** «Perfiles»: para dirección, toda la empresa (menos el dueño, developer y quien lo pide). */
  private async equipoCompania(actorId: number, companyId: number) {
    const filas = await this.prisma.user.findMany({
      where: {
        id: { not: actorId },
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, nombre: true, email: true, avatarUrl: true, perfil: { select: { telefono: true } } },
      orderBy: { nombre: 'asc' },
    });
    return filas
      .filter((f: { email: string }) => !isPlatformOwnerEmail(f.email) && !isDeveloperSuperAdminEmail(f.email))
      .map((f: { id: number; nombre: string; avatarUrl: string | null; perfil?: { telefono: string | null } | null }) => ({
        id: f.id,
        nombre: f.nombre,
        avatarUrl: f.avatarUrl ?? null,
        telefono: f.perfil?.telefono ?? null,
      }));
  }

  /**
   * Departamento del alta. Dirección puede elegirlo. Si no, el que se llama como el área del rol
   * («Soporte», «Operaciones»); si no existe, el de quien da de alta.
   */
  private async departmentIdDe(
    roleKey: string,
    actorDepartmentId: number | null,
    companyId: number,
    pedido: number | string | null | undefined,
    direccion: boolean,
  ): Promise<number | null> {
    if (direccion && pedido != null && pedido !== '') {
      const id = Number(pedido);
      if (Number.isFinite(id) && id > 0) {
        const ok = await this.prisma.department.findFirst({
          where: { id, companyId },
          select: { id: true },
        });
        if (ok) return ok.id;
      }
    }
    const etiqueta = ROLE_LABELS[roleKey as RoleKey]?.departamento;
    if (etiqueta) {
      const deps = await this.prisma.department.findMany({
        where: { companyId },
        select: { id: true, nombre: true },
        orderBy: { id: 'asc' },
      });
      const buscado = sinAcentos(etiqueta);
      const hit = deps.find((d: { id: number; nombre: string }) => sinAcentos(d.nombre) === buscado);
      if (hit) return hit.id;
    }
    return actorDepartmentId;
  }

  /**
   * Lo que ve el formulario. Vacío si no tiene subordinados o si dirección no le concedió ningún tipo:
   * la pantalla no muestra el módulo y el alta responde 403.
   */
  async contexto(sesion: UsuarioSesion, companyId: number): Promise<ContextoAlta> {
    const actor = await this.actor(sesion);
    const concesiones = await this.concesiones(companyId);
    const direccion = esDireccion(actor, PLATFORM_OWNER_EMAIL);
    const roles = rolesQuePuedeCrear(actor, concesiones, PLATFORM_OWNER_EMAIL);
    const conGente = await this.tieneSubordinados(actor.id, companyId);
    if (!conGente || roles.length === 0) {
      return { ...CONTEXTO_VACIO, formulario: direccion ? 'completo' : 'basico' };
    }
    const tipos = tiposParaMostrar(roles);
    // Dirección ve «Perfiles» de toda la empresa (puede cambiar la foto de cualquiera); los demás,
    // solo de quien les reporta directo.
    const equipo = direccion ? await this.equipoCompania(actor.id, companyId) : await this.equipoDirecto(actor.id, companyId);
    if (!direccion) {
      return {
        formulario: 'basico',
        tipos,
        rolAutomatico: tipos.length === 1,
        jefeAutomatico: true,
        telefonoObligatorio: true,
        puede: true,
        departamentos: [],
        jefes: [],
        equipo,
      };
    }
    const [departamentos, jefes] = await Promise.all([
      this.prisma.department.findMany({
        where: { companyId },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { isActive: true, companyMemberships: { some: { companyId } } },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);
    return {
      formulario: 'completo',
      tipos,
      rolAutomatico: false,
      jefeAutomatico: false,
      telefonoObligatorio: false,
      puede: true,
      departamentos,
      jefes,
      equipo,
    };
  }

  /** Los tipos que esta persona puede dar de alta (para armar el formulario). */
  async tiposCreables(sesion: UsuarioSesion, companyId: number): Promise<TipoUsuario[]> {
    return (await this.contexto(sesion, companyId)).tipos;
  }

  async crear(sesion: UsuarioSesion, dto: AltaDelegada, companyId: number) {
    const actor = await this.actor(sesion);
    if (!(await this.tieneSubordinados(actor.id, companyId))) {
      throw new ForbiddenException('Solo quien tiene personal a su cargo puede dar de alta usuarios.');
    }
    const concesiones = await this.concesiones(companyId);
    const direccion = esDireccion(actor, PLATFORM_OWNER_EMAIL);
    const permitidos = rolesQuePuedeCrear(actor, concesiones, PLATFORM_OWNER_EMAIL);
    let roleKey = String(dto.roleKey ?? '').trim();
    if (!roleKey && permitidos.length === 1) roleKey = permitidos[0];
    if (!roleKey) throw new BadRequestException('Elige el tipo de usuario.');

    if (!puedeCrearRol(actor, roleKey, concesiones, PLATFORM_OWNER_EMAIL)) {
      throw new ForbiddenException('No tienes permiso para dar de alta usuarios de ese tipo.');
    }
    if (!contrasenaAceptable(dto.password)) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres, con letras y números.');
    }
    const telefono = String(dto.telefono ?? '').trim();
    if (!telefonoAceptable(telefono, !direccion)) {
      throw new BadRequestException('Escribe un teléfono de 10 dígitos.');
    }
    const nombre = String(dto.nombre ?? '').trim();
    const email = String(dto.email ?? '').trim().toLowerCase();
    if (nombre.length < 3) throw new BadRequestException('Escribe el nombre completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Escribe un correo válido.');

    // El tipo de usuario es el rol del sistema con esa clave. Quien no es dirección jamás da de alta un
    // rol con permisos de administración, aunque la clave figure en su concesión.
    const rol = await this.prisma.role.findFirst({
      where: { orgRoleKey: roleKey },
      select: {
        id: true,
        accesoConsoleAdmin: true,
        accesoGestionUsuarios: true,
        accesoGestionTienda: true,
        accesoGestionWeb: true,
        accesoContabilidad: true,
      },
    });
    if (!rol) throw new BadRequestException('Ese tipo de usuario no está configurado. Avisa a dirección.');
    const conPoderes = Boolean(
      rol.accesoConsoleAdmin || rol.accesoGestionUsuarios || rol.accesoGestionTienda || rol.accesoGestionWeb || rol.accesoContabilidad,
    );
    if (conPoderes && !direccion) {
      throw new ForbiddenException('Ese tipo de usuario solo lo da de alta dirección.');
    }

    const departmentId = await this.departmentIdDe(roleKey, actor.departmentId, companyId, dto.departmentId, direccion);
    if (departmentId == null) throw new BadRequestException('Elige el departamento.');

    // La persona nueva queda «debajo» de quien la da de alta (organigrama). Dirección puede elegir otro jefe.
    const managerId = direccion && dto.managerId ? Number(dto.managerId) : actor.id;
    const avatarUrl = String(dto.avatarUrl ?? '').trim() || undefined;

    const creado: any = await this.users.create(
      {
        nombre,
        email,
        password: dto.password,
        roleId: rol.id,
        departmentId,
        employeeNumber: dto.employeeNumber?.trim() || undefined,
        managerId,
        avatarUrl,
      } as CreateUserDto,
      companyId,
    );

    if (telefono) {
      await this.prisma.userProfile.upsert({
        where: { userId: creado.id },
        update: { telefono },
        create: { userId: creado.id, telefono },
      });
    }

    await this.audit
      .log(
        {
          entityType: 'User',
          entityId: creado.id,
          action: 'CREATE_DELEGATED',
          // Sin la contraseña, jamás.
          changes: { roleKey, email, managerId, creadoPor: actor.id, conFoto: Boolean(avatarUrl) },
          companyId,
        },
        actor.id,
      )
      .catch(() => undefined);

    return {
      id: creado.id as number,
      nombre: creado.nombre as string,
      email: creado.email as string,
      roleKey,
      departmentId: creado.departmentId ?? null,
      employeeNumber: creado.employeeNumber ?? null,
      managerId,
      avatarUrl: (creado.avatarUrl as string | null | undefined) ?? avatarUrl ?? null,
      telefono: telefono || null,
    };
  }

  /**
   * Cambia la foto fija (o el teléfono) de alguien que ya existe.
   * Dirección puede con cualquiera de la empresa. Un jefe, solo con quien le reporta.
   * La foto de checada no entra por aquí: esto escribe `User.avatarUrl`.
   */
  async actualizarFoto(
    sesion: UsuarioSesion,
    userId: number,
    cambio: { avatarUrl?: string | null; telefono?: string },
    companyId: number,
  ) {
    const actor = await this.actor(sesion);
    if (!(await this.tieneSubordinados(actor.id, companyId))) {
      throw new ForbiddenException('Solo quien tiene personal a su cargo puede cambiar estas fotos.');
    }
    const concesiones = await this.concesiones(companyId);
    const direccion = esDireccion(actor, PLATFORM_OWNER_EMAIL);
    if (!direccion && rolesQuePuedeCrear(actor, concesiones, PLATFORM_OWNER_EMAIL).length === 0) {
      throw new ForbiddenException('No tienes permiso para dar de alta usuarios.');
    }
    const destino = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: { id: true, nombre: true, managerId: true, avatarUrl: true, isActive: true },
    });
    if (!destino || destino.isActive === false) throw new BadRequestException('No encontramos a esa persona.');
    if (!direccion && destino.managerId !== actor.id) {
      throw new ForbiddenException('Solo puedes cambiar la foto de quien te reporta.');
    }
    const telefono = cambio.telefono !== undefined ? String(cambio.telefono).trim() : undefined;
    if (telefono !== undefined && !telefonoAceptable(telefono, true)) {
      throw new BadRequestException('Escribe un teléfono de 10 dígitos.');
    }
    const avatarUrl = String(cambio.avatarUrl ?? '').trim();
    if (!avatarUrl && telefono === undefined) throw new BadRequestException('No hay nada que cambiar.');

    if (avatarUrl) {
      await this.prisma.user.update({ where: { id: destino.id }, data: { avatarUrl } });
    }
    if (telefono !== undefined) {
      await this.prisma.userProfile.upsert({
        where: { userId: destino.id },
        update: { telefono },
        create: { userId: destino.id, telefono },
      });
    }

    await this.audit
      .log(
        {
          entityType: 'User',
          entityId: destino.id,
          action: 'AVATAR_DELEGATED',
          changes: { creadoPor: actor.id, conFoto: Boolean(avatarUrl) },
          companyId,
        },
        actor.id,
      )
      .catch(() => undefined);

    return {
      id: destino.id as number,
      nombre: destino.nombre as string,
      avatarUrl: avatarUrl || destino.avatarUrl || null,
      previousAvatar: (destino.avatarUrl as string | null) ?? null,
      telefono: telefono ?? null,
    };
  }
}
