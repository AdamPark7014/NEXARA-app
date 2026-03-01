import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto.js';
import * as bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../common/permissions.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private isSuperAdmin(email: string) {
    return ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'].includes(email.trim().toLowerCase());
  }

  private buildPermissions(role: any) {
    const permissions: string[] = [];
    const isConsoleUser = Boolean(role?.accesoConsole);
    const isConsoleAdmin = Boolean(role?.accesoConsoleAdmin);

    if (isConsoleUser) {
      permissions.push(
        PERMISSIONS.CONSOLE_ACCESS,
        PERMISSIONS.ACTIVITIES_VIEW,
        PERMISSIONS.EVIDENCES_VIEW,
        PERMISSIONS.EVIDENCES_CREATE,
        PERMISSIONS.VIATICS_VIEW,
        PERMISSIONS.VIATICS_CREATE,
        PERMISSIONS.VEHICLES_VIEW,
        PERMISSIONS.VEHICLES_REQUEST,
        PERMISSIONS.ATTENDANCE_VIEW,
        PERMISSIONS.GPS_VIEW,
        PERMISSIONS.TOOLS_VIEW,
        PERMISSIONS.TOOLS_REQUEST,
      );
    }

    if (isConsoleAdmin) {
      permissions.push(
        PERMISSIONS.CONSOLE_ADMIN,
        PERMISSIONS.ACTIVITIES_VIEW,
        PERMISSIONS.ACTIVITIES_MANAGE,
        PERMISSIONS.ACTIVITIES_EXPORT,
        PERMISSIONS.ACTIVITIES_IMPORT,
        PERMISSIONS.EVIDENCES_VIEW,
        PERMISSIONS.EVIDENCES_REVIEW,
        PERMISSIONS.EVIDENCES_EXPORT,
        PERMISSIONS.EVIDENCES_IMPORT,
        PERMISSIONS.VIATICS_VIEW,
        PERMISSIONS.VIATICS_MANAGE,
        PERMISSIONS.VIATICS_EXPORT,
        PERMISSIONS.VIATICS_IMPORT,
        PERMISSIONS.VEHICLES_VIEW,
        PERMISSIONS.VEHICLES_REVIEW,
        PERMISSIONS.VEHICLES_INVENTORY,
        PERMISSIONS.VEHICLES_EXPORT,
        PERMISSIONS.VEHICLES_IMPORT,
        PERMISSIONS.ATTENDANCE_VIEW,
        PERMISSIONS.ATTENDANCE_MANAGE,
        PERMISSIONS.GPS_VIEW,
        PERMISSIONS.GPS_MANAGE,
        PERMISSIONS.USERS_MANAGE,
        PERMISSIONS.USERS_REVIEW,
        PERMISSIONS.ROLES_MANAGE,
        PERMISSIONS.TOOLS_VIEW,
        PERMISSIONS.TOOLS_REQUEST,
        PERMISSIONS.TOOLS_MANAGE,
        PERMISSIONS.TOOLS_INVENTORY,
        PERMISSIONS.PANEL_VENTAS,
        PERMISSIONS.SALES_VIEW,
        PERMISSIONS.SALES_MANAGE,
        PERMISSIONS.SALES_REPORTS_VIEW,
        PERMISSIONS.SALES_REPORTS_EXPORT,
        PERMISSIONS.SALES_TEMPLATES_MANAGE,
        PERMISSIONS.SALES_AUDIT_VIEW,
      );
    }

    if (role?.accesoGestionUsuarios) {
      permissions.push(PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_REVIEW);
    }
    if (role?.accesoGestionTienda) permissions.push(PERMISSIONS.PANEL_TIENDA);
    if (role?.accesoGestionWeb) permissions.push(PERMISSIONS.PANEL_WEB);
    if (role?.accesoPanelVentas) {
      permissions.push(
        PERMISSIONS.PANEL_VENTAS,
        PERMISSIONS.SALES_VIEW,
        PERMISSIONS.SALES_MANAGE,
        PERMISSIONS.SALES_REPORTS_VIEW,
        PERMISSIONS.SALES_REPORTS_EXPORT,
        PERMISSIONS.SALES_TEMPLATES_MANAGE,
        PERMISSIONS.SALES_AUDIT_VIEW,
      );
    }
    if (role?.accesoContabilidad) {
      permissions.push(
        PERMISSIONS.CONTABILIDAD_VIEW,
        PERMISSIONS.CONTABILIDAD_MANAGE,
        PERMISSIONS.ATTENDANCE_VIEW,
        PERMISSIONS.ATTENDANCE_MANAGE,
        PERMISSIONS.VIATICS_VIEW,
        PERMISSIONS.VEHICLES_VIEW,
      );
    }
    if (role?.accesoCotizaciones) {
      permissions.push(PERMISSIONS.COTIZACIONES_ACCESS);
    }
    if (role?.accesoAsistencia) {
      permissions.push(PERMISSIONS.ATTENDANCE_VIEW);
    }

    return Array.from(new Set(permissions));
  }

  async validateUser(email: string, password: string) {
    const normalizedEmail = email.trim();
    const user = await this.prisma['user'].findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      include: { role: true, department: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return user;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const permissions = this.buildPermissions(user.role);
    const isSuperAdmin = this.isSuperAdmin(user.email);

    if (loginDto.panel === 'ventas' && !isSuperAdmin && !permissions.includes(PERMISSIONS.PANEL_VENTAS)) {
      throw new UnauthorizedException('Tu usuario no tiene acceso al panel de ventas');
    }
    const payload = {
      sub: user.id,
      roleId: user.roleId,
      departmentId: user.departmentId,
      permissions,
      isSuperAdmin,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        role: user.role.nombre,
        roleId: user.roleId,
        department: user.department.nombre,
        departmentId: user.departmentId,
        permissions,
        isSuperAdmin,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
