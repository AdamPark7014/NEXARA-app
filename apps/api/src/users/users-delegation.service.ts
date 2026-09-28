import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';
import { UsersService } from './users.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import {
  USER_CREATION_GRANTS_SETTING_KEY,
  contrasenaAceptable,
  esDireccion,
  parsearConcesiones,
  puedeCrearRol,
  rolesQuePuedeCrear,
  tiposParaMostrar,
  type ConcesionesAlta,
  type TipoUsuario,
} from './user-creation-policy.js';

const TTL_MS = 30_000;

export type AltaDelegada = {
  nombre: string;
  email: string;
  password: string;
  roleKey: string;
  departmentId?: number | string | null;
  employeeNumber?: string | null;
  /** Solo dirección puede elegir a quién le reporta; para los demás siempre es quien da de alta. */
  managerId?: number | null;
};

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

  /** Los tipos que esta persona puede dar de alta (para armar el formulario). */
  async tiposCreables(sesion: UsuarioSesion, companyId: number): Promise<TipoUsuario[]> {
    const actor = await this.actor(sesion);
    return tiposParaMostrar(rolesQuePuedeCrear(actor, await this.concesiones(companyId), PLATFORM_OWNER_EMAIL));
  }

  async crear(sesion: UsuarioSesion, dto: AltaDelegada, companyId: number) {
    const actor = await this.actor(sesion);
    const concesiones = await this.concesiones(companyId);

    if (!puedeCrearRol(actor, dto.roleKey, concesiones, PLATFORM_OWNER_EMAIL)) {
      throw new ForbiddenException('No tienes permiso para dar de alta usuarios de ese tipo.');
    }
    if (!contrasenaAceptable(dto.password)) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres, con letras y números.');
    }
    const nombre = String(dto.nombre ?? '').trim();
    const email = String(dto.email ?? '').trim().toLowerCase();
    if (nombre.length < 3) throw new BadRequestException('Escribe el nombre completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Escribe un correo válido.');

    // El tipo de usuario es el rol del sistema con esa clave. Quien no es dirección jamás da de alta un
    // rol con permisos de administración, aunque la clave figure en su concesión.
    const rol = await this.prisma.role.findFirst({
      where: { orgRoleKey: dto.roleKey },
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
    const direccion = esDireccion(actor, PLATFORM_OWNER_EMAIL);
    const conPoderes = Boolean(
      rol.accesoConsoleAdmin || rol.accesoGestionUsuarios || rol.accesoGestionTienda || rol.accesoGestionWeb || rol.accesoContabilidad,
    );
    if (conPoderes && !direccion) {
      throw new ForbiddenException('Ese tipo de usuario solo lo da de alta dirección.');
    }

    const departmentId = dto.departmentId ?? actor.departmentId;
    if (departmentId == null) throw new BadRequestException('Elige el departamento.');

    // La persona nueva queda «debajo» de quien la da de alta (organigrama). Dirección puede elegir otro jefe.
    const managerId = direccion && dto.managerId ? Number(dto.managerId) : actor.id;

    const creado: any = await this.users.create(
      {
        nombre,
        email,
        password: dto.password,
        roleId: rol.id,
        departmentId,
        employeeNumber: dto.employeeNumber?.trim() || undefined,
        managerId,
      } as CreateUserDto,
      companyId,
    );

    await this.audit
      .log(
        {
          entityType: 'User',
          entityId: creado.id,
          action: 'CREATE_DELEGATED',
          // Sin la contraseña, jamás.
          changes: { roleKey: dto.roleKey, email, managerId, creadoPor: actor.id },
          companyId,
        },
        actor.id,
      )
      .catch(() => undefined);

    return {
      id: creado.id as number,
      nombre: creado.nombre as string,
      email: creado.email as string,
      roleKey: dto.roleKey,
      departmentId: creado.departmentId ?? null,
      employeeNumber: creado.employeeNumber ?? null,
      managerId,
    };
  }
}
