import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto.js';
import * as bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../common/permissions.js';
import { NotificationType } from '@prisma/client';
import { detectDeviceFromUserAgent } from '../common/device-detector.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private isSuperAdmin(email: string) {
    return ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'].includes(email.trim().toLowerCase());
  }

  private buildPermissions(role: any, isSuperAdmin = false) {
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
        PERMISSIONS.CVS_ADMIN_REVIEW,
        PERMISSIONS.FINES_VIEW,
        PERMISSIONS.FINES_MANAGE,
        PERMISSIONS.CLIENTS_VIEW,
        PERMISSIONS.CLIENTS_MANAGE,
        PERMISSIONS.LUNCH_BREAKS_VIEW,
        PERMISSIONS.LUNCH_BREAKS_MANAGE,
        PERMISSIONS.COTIZACIONES_ACCESS,
      );
    }

    if (role?.accesoGestionUsuarios) {
      permissions.push(PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_REVIEW);
    }
    if (role?.accesoGestionTienda) permissions.push(PERMISSIONS.PANEL_TIENDA);
    if (role?.accesoGestionWeb) permissions.push(PERMISSIONS.PANEL_WEB);
    if (role?.accesoGestionCvs) permissions.push(PERMISSIONS.CVS_MANAGE);
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
      permissions.push(PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MANAGE);
    }
    if (role?.accesoActividades) {
      permissions.push(
        PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE,
        PERMISSIONS.ACTIVITIES_EXPORT, PERMISSIONS.ACTIVITIES_IMPORT,
      );
    }
    if (role?.accesoEvidencias) {
      permissions.push(
        PERMISSIONS.EVIDENCES_VIEW, PERMISSIONS.EVIDENCES_CREATE,
        PERMISSIONS.EVIDENCES_REVIEW, PERMISSIONS.EVIDENCES_EXPORT,
        PERMISSIONS.EVIDENCES_IMPORT,
      );
    }
    if (role?.accesoViaticos) {
      permissions.push(
        PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_CREATE,
        PERMISSIONS.VIATICS_MANAGE, PERMISSIONS.VIATICS_EXPORT,
        PERMISSIONS.VIATICS_IMPORT,
      );
    }
    if (role?.accesoVehiculos) {
      permissions.push(
        PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST,
        PERMISSIONS.VEHICLES_REVIEW, PERMISSIONS.VEHICLES_INVENTORY,
        PERMISSIONS.VEHICLES_EXPORT, PERMISSIONS.VEHICLES_IMPORT,
      );
    }
    if (role?.accesoGps) {
      permissions.push(PERMISSIONS.GPS_VIEW, PERMISSIONS.GPS_MANAGE);
    }

    // ── ERP Industrial Permissions ──────────────────────────────
    if (role?.accesoInventario) {
      permissions.push(
        PERMISSIONS.WAREHOUSE_VIEW, PERMISSIONS.WAREHOUSE_MANAGE,
        PERMISSIONS.STOCK_VIEW, PERMISSIONS.STOCK_MANAGE,
      );
    }
    if (role?.accesoCompras) {
      permissions.push(
        PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_REQUEST,
        PERMISSIONS.PROCUREMENT_APPROVE, PERMISSIONS.PROCUREMENT_MANAGE,
      );
    }
    if (role?.accesoManufactura) {
      permissions.push(
        PERMISSIONS.MANUFACTURING_VIEW, PERMISSIONS.MANUFACTURING_MANAGE,
        PERMISSIONS.BOM_MANAGE, PERMISSIONS.PRODUCTION_MANAGE,
      );
    }
    if (role?.accesoCalidad) {
      permissions.push(
        PERMISSIONS.QUALITY_VIEW, PERMISSIONS.QUALITY_MANAGE,
        PERMISSIONS.QUALITY_INSPECT,
      );
    }
    if (role?.accesoMantenimiento) {
      permissions.push(
        PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_MANAGE,
        PERMISSIONS.ASSETS_VIEW, PERMISSIONS.ASSETS_MANAGE,
      );
    }
    if (role?.accesoSeguridad) {
      permissions.push(
        PERMISSIONS.SAFETY_VIEW, PERMISSIONS.SAFETY_MANAGE,
        PERMISSIONS.SAFETY_PERMITS,
      );
    }
    if (role?.accesoDocumentos) {
      permissions.push(
        PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_MANAGE,
        PERMISSIONS.DOCUMENTS_APPROVE,
      );
    }
    if (role?.accesoWorkflow) {
      permissions.push(
        PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_MANAGE,
      );
    }
    if (role?.accesoAuditoria) {
      permissions.push(PERMISSIONS.AUDIT_VIEW);
    }
    if (role?.accesoBI) {
      permissions.push(PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE);
    }
    if (role?.accesoBanca) {
      permissions.push(
        PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE,
        PERMISSIONS.ACCOUNTING_POST, PERMISSIONS.ACCOUNTING_CLOSE_PERIOD,
        PERMISSIONS.INVOICING_VIEW, PERMISSIONS.INVOICING_MANAGE,
        PERMISSIONS.BANKING_VIEW, PERMISSIONS.BANKING_MANAGE,
        PERMISSIONS.BANKING_RECONCILE,
      );
    }
    if (role?.accesoMultas) {
      permissions.push(PERMISSIONS.FINES_VIEW, PERMISSIONS.FINES_MANAGE);
    }
    if (role?.accesoClientes) {
      permissions.push(PERMISSIONS.CLIENTS_VIEW, PERMISSIONS.CLIENTS_MANAGE);
    }
    if (role?.accesoLunchBreaks) {
      permissions.push(PERMISSIONS.LUNCH_BREAKS_VIEW, PERMISSIONS.LUNCH_BREAKS_MANAGE);
    }

    if (isSuperAdmin) {
      permissions.push(PERMISSIONS.CVS_SUPERADMIN_REVIEW, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CVS_MANAGE);
    }

    return Array.from(new Set(permissions));
  }

  private async createLoginNotification(userId: number, detectedDevice: string) {
    const baseData = {
      userId,
      category: 'security',
      title: 'Nuevo acceso detectado',
      message: `Se inició sesión desde ${detectedDevice}.`,
      entityType: 'auth',
      priority: 'normal' as const,
    };

    try {
      await this.prisma.notification.create({
        data: {
          ...baseData,
          type: NotificationType.ATTENDANCE_CHECKIN,
        },
      });
      return;
    } catch (error) {
      // Fallback para entornos donde el enum de NotificationType no está migrado.
      this.logger.warn(
        `Fallo ATTENDANCE_CHECKIN para login userId=${userId}. Reintentando con tipo legacy.`,
      );
      this.logger.debug(error instanceof Error ? error.message : String(error));
    }

    try {
      await this.prisma.notification.create({
        data: {
          ...baseData,
          type: NotificationType.QUOTE_EXPIRING,
        },
      });
    } catch (fallbackError) {
      this.logger.warn(
        `No se pudo crear notificación de login para userId=${userId} ni con fallback. Continuando login.`,
      );
      this.logger.debug(fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
    }
  }

  async validateUser(email: string, password: string) {
    const normalizedEmail = email.trim();
    const user = await this.prisma.user.findFirst({
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

  async login(loginDto: LoginDto, req?: any) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const isSuperAdmin = this.isSuperAdmin(user.email);
    const permissions = this.buildPermissions(user.role, isSuperAdmin);
    const userAgent = req?.headers?.['user-agent'] || req?.headers?.['User-Agent'];
    const detectedDevice = detectDeviceFromUserAgent(userAgent, req?.headers);

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

    await this.createLoginNotification(user.id, detectedDevice);

    return {
      access_token: this.jwtService.sign(payload),
      loginDevice: detectedDevice,
      loginGreeting: `Hola ${user.nombre}, bienvenido de nuevo. Accediste desde ${detectedDevice}.`,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        role: user.role?.nombre ?? '',
        roleId: user.roleId,
        department: user.department?.nombre ?? '',
        departmentId: user.departmentId,
        permissions,
        isSuperAdmin,
        avatarUrl: user.avatarUrl,
        loginDevice: detectedDevice,
      },
    };
  }
}
