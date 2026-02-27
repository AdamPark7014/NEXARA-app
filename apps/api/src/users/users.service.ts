import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../common/permissions.js';

@Injectable()
export class UsersService {
  // Obtener un rol por ID
  async getRoleById(roleId: unknown) {
    const resolvedRoleId = await this.resolveRoleId(roleId);
    return this.prisma['role'].findUnique({ where: { id: resolvedRoleId } });
  }
  private canManageUsers(currentUser: { permissions?: string[]; isSuperAdmin?: boolean }) {
    if (currentUser.isSuperAdmin) return true;
    return Boolean(currentUser.permissions?.includes(PERMISSIONS.USERS_MANAGE));
  }

  findAllVisible(currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean }) {
    const excludeSuperAdmins = {
      NOT: { email: { in: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'] } },
    };

    // SuperAdmin ve todos excepto superadmins
    if (currentUser.isSuperAdmin) {
      return this.prisma['user'].findMany({
        where: excludeSuperAdmins,
        include: { role: true, department: true },
      });
    }

    // Admin ve todos los usuarios normales (sin accesoConsoleAdmin), sin restricción de departamento
    if (this.canManageUsers(currentUser)) {
      return this.prisma['user'].findMany({
        where: {
          AND: [
            { role: { accesoConsoleAdmin: false } }, // Solo usuarios normales
            excludeSuperAdmins,
          ],
        },
        include: { role: true, department: true },
      });
    }

    // Usuario normal solo ve a sí mismo
    return this.prisma['user'].findMany({
      where: { id: currentUser.id, ...excludeSuperAdmins },
      include: { role: true, department: true },
    });
  }
  constructor(private readonly prisma: PrismaService) {}

  private async resolveRoleId(value: unknown) {
    if (value === undefined || value === null) {
      throw new BadRequestException('Rol requerido');
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    throw new BadRequestException('Rol inválido');
  }

  private async resolveDepartmentId(value: unknown) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) return parsed;
      const department = await this.prisma['department'].upsert({
        where: { nombre: trimmed },
        update: {},
        create: { nombre: trimmed },
        select: { id: true },
      });
      if (department?.id) return department.id;
    }
    throw new BadRequestException('Departamento inválido');
  }

  async create(createUserDto: CreateUserDto) {
    const hash = await bcrypt.hash(createUserDto.password, 10);
    const roleId = await this.resolveRoleId(createUserDto.roleId);
    const departmentId = await this.resolveDepartmentId(createUserDto.departmentId);
    if (!departmentId) throw new BadRequestException('Departamento requerido');
    return this.prisma['user'].create({
      data: {
        nombre: createUserDto.nombre,
        email: createUserDto.email,
        roleId,
        departmentId,
        avatarUrl: createUserDto.avatarUrl,
        passwordHash: hash,
      },
    });
  }


  findAll() {
    return this.prisma['user'].findMany({
      include: { role: true, department: true },
    });
  }

  async findAssignableUsers(currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean; role?: any }) {
    try {
      // SuperAdmin emails (siempre excluir)
      const superAdminEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];

      // Cargar usuario actual de la BD para obtener rol actual
      const userInDb = await this.prisma['user'].findUnique({
        where: { id: currentUser.id },
        include: { role: true },
      });

      if (!userInDb) return [];

      // Si el usuario actual es SuperAdmin (email o bandera)
      const isSuperAdmin = currentUser.isSuperAdmin || superAdminEmails.includes(userInDb.email);
      
      if (isSuperAdmin) {
        // SuperAdmin puede asignar a TODOS excepto a sí mismo y otros superadmins
        return this.prisma['user'].findMany({
          where: {
            AND: [
              { id: { not: currentUser.id } },
              { email: { notIn: superAdminEmails } },
            ],
          },
          select: { id: true, nombre: true, email: true, role: true, avatarUrl: true },
          orderBy: { nombre: 'asc' },
        });
      }

      // Si el usuario actual es Admin de consola (accesoConsoleAdmin = true)
      const isConsoleAdmin = userInDb.role?.accesoConsoleAdmin === true;
      
      if (isConsoleAdmin) {
        // Admin puede asignar a usuarios normales (sin accesoConsoleAdmin) de cualquier departamento
        return this.prisma['user'].findMany({
          where: {
            AND: [
              { id: { not: currentUser.id } },
              { email: { notIn: superAdminEmails } },
              { role: { accesoConsoleAdmin: false } }, // Solo usuarios normales
            ],
          },
          select: { id: true, nombre: true, email: true, role: true, avatarUrl: true },
          orderBy: { nombre: 'asc' },
        });
      }

      // Usuario normal sin permisos: retorna vacío
      return [];
    } catch (error) {
      console.error('Error finding assignable users:', error);
      return [];
    }
  }

  findByDepartment(departmentId: number) {
    return this.prisma['user'].findMany({
      where: { departmentId },
      include: { role: true, department: true },
    });
  }

  findOne(id: number) {
    return this.prisma['user'].findUnique({
      where: { id },
      include: { role: true, department: true },
    });
  }

  async getProfile(userId: number) {
    return this.prisma['user'].findUnique({
      where: { id: userId },
      include: {
        perfil: true,
        documentos: { orderBy: { createdAt: 'desc' } },
        role: true,
        department: true,
      },
    });
  }

  async upsertProfile(userId: number, data: any) {
    return this.prisma['userProfile'].upsert({
      where: { userId },
      update: {
        ...data,
        estatus: 'Pendiente',
        observaciones: null,
        aprobadoPorId: null,
        revisadoEn: null,
      },
      create: { ...data, userId, estatus: 'Pendiente' },
    });
  }

  async addDocuments(userId: number, documents: { tipo: string; archivoUrl: string }[]) {
    const created: any[] = [];
    for (const doc of documents) {
      created.push(
        await this.prisma['userDocument'].create({
          data: { userId, tipo: doc.tipo, archivoUrl: doc.archivoUrl },
        }),
      );
    }
    return created;
  }

  async updateProfileReview(userId: number, data: any) {
    return this.prisma['userProfile'].update({
      where: { userId },
      data,
    });
  }

  async updateDocumentReview(id: number, data: any) {
    return this.prisma['userDocument'].update({
      where: { id },
      data,
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const data: any = { ...updateUserDto };
    if (data.password) {
      data.passwordHash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    if (data.roleId !== undefined) {
      data.roleId = await this.resolveRoleId(data.roleId);
    }
    if (data.departmentId !== undefined) {
      data.departmentId = await this.resolveDepartmentId(data.departmentId);
    }
    return this.prisma['user'].update({
      where: { id },
      data,
    });
  }

  remove(id: number) {
    return this.prisma['user'].delete({ where: { id } });
  }
}
