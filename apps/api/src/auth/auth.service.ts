import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto.js';
import * as bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../common/permissions.js';
import { NotificationType } from '@prisma/client';
import { detectDeviceDetails } from '../common/device-detector.js';
import {
  isPlatformOwnerEmail,
  isSuperAdminEmail,
} from '../common/platform-accounts.js';
import { LEGACY_TO_V2, ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';

type UserWithRole = {
  roleKey?: string | null;
  role?: {
    orgRoleKey?: string | null;
    accesoConsole?: boolean;
    accesoConsoleAdmin?: boolean;
    accesoActividades?: boolean;
    accesoEvidencias?: boolean;
    accesoViaticos?: boolean;
    accesoVehiculos?: boolean;
    accesoAsistencia?: boolean;
    accesoGps?: boolean;
    accesoGestionUsuarios?: boolean;
    accesoGestionWeb?: boolean;
    accesoGestionCvs?: boolean;
    accesoPanelVentas?: boolean;
    accesoContabilidad?: boolean;
    accesoCotizaciones?: boolean;
    accesoInventario?: boolean;
    accesoCompras?: boolean;
    accesoMantenimiento?: boolean;
    accesoDocumentos?: boolean;
    accesoAuditoria?: boolean;
    accesoBI?: boolean;
    accesoBanca?: boolean;
    accesoMultas?: boolean;
    accesoClientes?: boolean;
    accesoLunchBreaks?: boolean;
    accesoRRHH?: boolean;
    accesoCatalogo?: boolean;
    accesoGestionTienda?: boolean;
  } | null;
  email?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Optional() private readonly webhooks?: WebhooksService,
  ) {}

  private isSuperAdmin(email: string) {
    return isSuperAdminEmail(email);
  }

  private isPlatformOwner(email: string) {
    return isPlatformOwnerEmail(email);
  }

  /** roleKey del usuario o inferido desde Role.orgRoleKey (v2). */
  resolveEffectiveRoleKey(user: UserWithRole): RoleKey | null {
    if (user.email && this.isPlatformOwner(user.email)) return ROLES.CEO;
    const validKeys = new Set<string>(Object.values(ROLES));
    if (user.roleKey && validKeys.has(user.roleKey)) {
      return user.roleKey as RoleKey;
    }
    const orgKey = user.role?.orgRoleKey;
    if (orgKey && validKeys.has(orgKey)) {
      return orgKey as RoleKey;
    }
    if (orgKey && LEGACY_TO_V2[orgKey]) {
      return LEGACY_TO_V2[orgKey];
    }
    return null;
  }

  /**
   * Permisos efectivos.
   * Con `roleKey` v2 válido: se ignoran flags `acceso*` (fuente = roleKey + url-matrix).
   * Sin roleKey: modelo legacy por flags de Role.
   */
  resolveUserPermissions(user: UserWithRole, isSuperAdmin = false): string[] {
    const roleKey = this.resolveEffectiveRoleKey(user);
    if (roleKey) {
      return this.addV2RolePermissions(
        this.buildBaseAuthenticatedPermissions(isSuperAdmin),
        roleKey,
      );
    }
    return this.buildPermissions(user.role, isSuperAdmin);
  }

  /** Permisos mínimos de cualquier empleado autenticado (sin flags acceso*). */
  private buildBaseAuthenticatedPermissions(isSuperAdmin = false): string[] {
    const permissions: string[] = [
      PERMISSIONS.KB_VIEW,
      PERMISSIONS.WORKFLOW_VIEW,
      PERMISSIONS.PANEL_SUPPORT,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.PANEL_PEOPLE,
      PERMISSIONS.PEOPLE_VIEW,
    ];
    if (isSuperAdmin) {
      permissions.push(
        PERMISSIONS.CVS_SUPERADMIN_REVIEW,
        PERMISSIONS.CVS_ADMIN_REVIEW,
        PERMISSIONS.CVS_MANAGE,
        PERMISSIONS.KB_MANAGE,
        PERMISSIONS.SALES_TARGETS_MANAGE,
        PERMISSIONS.SALES_TARGETS_VIEW,
        PERMISSIONS.COMPANY_SETTINGS_VIEW,
        PERMISSIONS.COMPANY_SETTINGS_MANAGE,
        PERMISSIONS.WORKFLOW_MANAGE,
        PERMISSIONS.EXECUTIVE_DASHBOARD,
        PERMISSIONS.PANEL_NOC,
        PERMISSIONS.PANEL_LAB,
        PERMISSIONS.NOC_VIEW,
        PERMISSIONS.NOC_MANAGE,
        PERMISSIONS.SUPPORT_MANAGE,
        PERMISSIONS.PEOPLE_MANAGE,
        PERMISSIONS.LAB_ACCESS,
      );
    }
    return permissions;
  }

  private buildPermissions(role: UserWithRole['role'], isSuperAdmin = false) {
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
        PERMISSIONS.HR_VIEW,
        PERMISSIONS.HR_MANAGE,
        PERMISSIONS.HR_APPROVE_LEAVE,
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
        PERMISSIONS.TENDERS_VIEW,
        PERMISSIONS.TENDERS_MANAGE,
        PERMISSIONS.CRM_ACTIVITIES_VIEW,
        PERMISSIONS.CRM_ACTIVITIES_MANAGE,
        PERMISSIONS.SALES_TARGETS_VIEW,
        PERMISSIONS.KB_VIEW,
      );
    }
    if (role?.accesoContabilidad) {
      permissions.push(
        PERMISSIONS.CONTABILIDAD_VIEW,
        PERMISSIONS.CONTABILIDAD_MANAGE,
        PERMISSIONS.ATTENDANCE_VIEW,
        PERMISSIONS.ATTENDANCE_MANAGE,
        PERMISSIONS.VIATICS_VIEW,
        PERMISSIONS.VIATICS_MANAGE,
        PERMISSIONS.VIATICS_EXPORT,
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
    if (role?.accesoMantenimiento) {
      permissions.push(
        PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_MANAGE,
        PERMISSIONS.ASSETS_VIEW, PERMISSIONS.ASSETS_MANAGE,
      );
    }
    if (role?.accesoDocumentos) {
      permissions.push(
        PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_MANAGE,
        PERMISSIONS.DOCUMENTS_APPROVE,
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
    if (role?.accesoRRHH) {
      permissions.push(
        PERMISSIONS.HR_VIEW,
        PERMISSIONS.HR_MANAGE,
        PERMISSIONS.HR_APPROVE_LEAVE,
        PERMISSIONS.USERS_MANAGE,
        PERMISSIONS.USERS_REVIEW,
      );
    }
    if (role?.accesoCatalogo || role?.accesoPanelVentas || role?.accesoCotizaciones) {
      permissions.push(PERMISSIONS.CATALOG_VIEW);
    }
    if (role?.accesoCatalogo && role?.accesoInventario) {
      permissions.push(PERMISSIONS.CATALOG_MANAGE);
    }

    if (isSuperAdmin) {
      permissions.push(PERMISSIONS.CVS_SUPERADMIN_REVIEW, PERMISSIONS.CVS_ADMIN_REVIEW, PERMISSIONS.CVS_MANAGE);
    }

    // Acceso a Knowledge Base — todos los usuarios autenticados pueden leer; admin gestiona
    permissions.push(PERMISSIONS.KB_VIEW);
    if (isConsoleAdmin || isSuperAdmin) {
      permissions.push(
        PERMISSIONS.KB_MANAGE,
        PERMISSIONS.SALES_TARGETS_MANAGE,
        PERMISSIONS.SALES_TARGETS_VIEW,
        PERMISSIONS.COMPANY_SETTINGS_VIEW,
        PERMISSIONS.COMPANY_SETTINGS_MANAGE,
        PERMISSIONS.WORKFLOW_VIEW,
        PERMISSIONS.WORKFLOW_MANAGE,
        PERMISSIONS.EXECUTIVE_DASHBOARD,
        PERMISSIONS.PANEL_SUPPORT,
        PERMISSIONS.PANEL_NOC,
        PERMISSIONS.PANEL_PEOPLE,
        PERMISSIONS.PANEL_LAB,
        PERMISSIONS.NOC_VIEW,
        PERMISSIONS.NOC_MANAGE,
        PERMISSIONS.SUPPORT_MANAGE,
        PERMISSIONS.SUPPORT_VIEW,
        PERMISSIONS.PEOPLE_VIEW,
        PERMISSIONS.PEOPLE_MANAGE,
        PERMISSIONS.LAB_ACCESS,
      );
    }
    // Workflow: cualquier usuario que pueda aprobar (managers) ve sus pendientes
    permissions.push(PERMISSIONS.WORKFLOW_VIEW);
    // Support: cualquier usuario puede levantar tickets internos para sí mismo
    permissions.push(PERMISSIONS.PANEL_SUPPORT, PERMISSIONS.SUPPORT_VIEW);
    // People: todos los empleados ven su propia info de RH
    permissions.push(PERMISSIONS.PANEL_PEOPLE, PERMISSIONS.PEOPLE_VIEW);

    return Array.from(new Set(permissions));
  }

  /**
   * Enriquece la lista de permisos legacy con los que corresponden al
   * `roleKey` v2 del usuario. Permite que v2 users sin flags de BD
   * (accesoBI, accesoRRHH, etc.) accedan correctamente a los endpoints
   * protegidos por `RbacGuard`.
   */
  private addV2RolePermissions(permissions: string[], roleKey: string | null | undefined): string[] {
    if (!roleKey) return permissions;
    const set = new Set(permissions);

    // ── BI / Analytics ─────────────────────────────────────────────
    const V2_BI_ROLES = new Set(['ceo', 'dir_admin', 'dir_operaciones', 'coord_ventas', 'coord_operaciones', 'coord_admin', 'arquitecto']);
    if (V2_BI_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.BI_VIEW);
      set.add(PERMISSIONS.BI_MANAGE);
      set.add(PERMISSIONS.EXECUTIVE_DASHBOARD);
    }

    // ── RH / HR ────────────────────────────────────────────────────
    const V2_HR_ROLES = new Set(['ceo', 'dir_admin', 'coord_admin']);
    if (V2_HR_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.HR_VIEW);
      set.add(PERMISSIONS.HR_MANAGE);
      set.add(PERMISSIONS.HR_APPROVE_LEAVE);
      set.add(PERMISSIONS.CVS_ADMIN_REVIEW);
    }
    // RH role: recruiter access (technical screening + CV management)
    if (roleKey === 'rh') {
      set.add(PERMISSIONS.HR_VIEW);
      set.add(PERMISSIONS.HR_MANAGE);
      set.add(PERMISSIONS.CVS_MANAGE);
      set.add(PERMISSIONS.DOCUMENTS_VIEW);
    }

    // ── Ventas / CRM ────────────────────────────────────────────────
    if (roleKey === 'vendedor' || roleKey === 'coord_ventas') {
      set.add(PERMISSIONS.SALES_VIEW);
      set.add(PERMISSIONS.SALES_MANAGE);
      set.add(PERMISSIONS.PANEL_VENTAS);
      set.add(PERMISSIONS.COTIZACIONES_ACCESS);
      set.add(PERMISSIONS.CLIENTS_VIEW);
      set.add(PERMISSIONS.CLIENTS_MANAGE);
      set.add(PERMISSIONS.CATALOG_VIEW);
    }

    // Dirección: CEO y directores consultan cotizaciones (detalle + PDF)
    if (roleKey === 'ceo' || roleKey === 'dir_admin' || roleKey === 'dir_operaciones') {
      set.add(PERMISSIONS.COTIZACIONES_ACCESS);
      set.add(PERMISSIONS.SALES_VIEW);
      set.add(PERMISSIONS.CATALOG_VIEW);
    }
    if (roleKey === 'coord_ventas') {
      set.add(PERMISSIONS.SALES_REPORTS_VIEW);
      set.add(PERMISSIONS.SALES_TARGETS_VIEW);
    }

    // Contabilidad: lectura de cotizaciones vinculadas a facturación
    if (roleKey === 'contabilidad') {
      set.add(PERMISSIONS.COTIZACIONES_ACCESS);
      set.add(PERMISSIONS.DOCUMENTS_VIEW);
    }

    // ── Contabilidad / Finanzas ─────────────────────────────────────
    const V2_ACCOUNTING_ROLES = new Set(['ceo', 'dir_admin', 'coord_admin', 'contabilidad']);
    if (V2_ACCOUNTING_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.CONTABILIDAD_VIEW);
      set.add(PERMISSIONS.CONTABILIDAD_MANAGE);
      set.add(PERMISSIONS.ACCOUNTING_VIEW);
      set.add(PERMISSIONS.ACCOUNTING_MANAGE);
      set.add(PERMISSIONS.INVOICING_VIEW);
      set.add(PERMISSIONS.INVOICING_MANAGE);
      set.add(PERMISSIONS.BANKING_VIEW);
      set.add(PERMISSIONS.BANKING_MANAGE);
    }

    // ── Compras, almacen y documentos corporativos ─────────────────
    // Roles administrativos que gestionan compras, inventario y control documental
    const V2_ERP_ADMIN_ROLES = new Set(['ceo', 'dir_admin', 'coord_admin', 'dir_operaciones']);
    if (V2_ERP_ADMIN_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.PROCUREMENT_VIEW);
      set.add(PERMISSIONS.PROCUREMENT_REQUEST);
      set.add(PERMISSIONS.PROCUREMENT_APPROVE);
      set.add(PERMISSIONS.PROCUREMENT_MANAGE);
      set.add(PERMISSIONS.WAREHOUSE_VIEW);
      set.add(PERMISSIONS.WAREHOUSE_MANAGE);
      set.add(PERMISSIONS.STOCK_VIEW);
      set.add(PERMISSIONS.STOCK_MANAGE);
      set.add(PERMISSIONS.DOCUMENTS_VIEW);
      set.add(PERMISSIONS.DOCUMENTS_MANAGE);
      set.add(PERMISSIONS.DOCUMENTS_APPROVE);
    }

    // ── Gobierno ERP (usuarios y roles) ─────────────────────────────
    const V2_GOV_ROLES = new Set(['ceo', 'dir_admin', 'coord_admin']);
    if (V2_GOV_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.USERS_MANAGE);
      set.add(PERMISSIONS.USERS_REVIEW);
      set.add(PERMISSIONS.ROLES_MANAGE);
      // Sustituye accesoConsoleAdmin legacy para endpoints @RBAC(CONSOLE_ADMIN)
      set.add(PERMISSIONS.CONSOLE_ADMIN);
      set.add(PERMISSIONS.WORKFLOW_MANAGE);
      set.add(PERMISSIONS.AUDIT_VIEW);
    }
    if (roleKey === 'dir_operaciones' || roleKey === 'arquitecto') {
      set.add(PERMISSIONS.CONSOLE_ADMIN);
      set.add(PERMISSIONS.WORKFLOW_MANAGE);
    }

    // ── Gobierno ERP (empresas del grupo) ───────────────────────────
    const V2_COMPANY_GOV_ROLES = new Set(['ceo', 'dir_admin', 'coord_admin', 'administrativo']);
    if (V2_COMPANY_GOV_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.COMPANY_SETTINGS_VIEW);
      set.add(PERMISSIONS.COMPANY_SETTINGS_MANAGE);
    }

    // ── Actividades y evidencias (scope de equipo) ──────────────────
    // Solo permisos específicos — no se otorga CONSOLE_ADMIN completo para evitar
    // conceder USERS_MANAGE, ROLES_MANAGE, PANEL_VENTAS, etc.
    const V2_OPS_MANAGER_ROLES = new Set(['ceo', 'dir_admin', 'dir_operaciones', 'arquitecto', 'coord_operaciones', 'coord_admin']);
    if (V2_OPS_MANAGER_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.CONSOLE_ACCESS);
      set.add(PERMISSIONS.ACTIVITIES_MANAGE);
      set.add(PERMISSIONS.ACTIVITIES_VIEW);
      set.add(PERMISSIONS.ACTIVITIES_EXPORT);
      set.add(PERMISSIONS.EVIDENCES_REVIEW);
      set.add(PERMISSIONS.EVIDENCES_VIEW);
      set.add(PERMISSIONS.EVIDENCES_CREATE);
      set.add(PERMISSIONS.VEHICLES_REVIEW);
      set.add(PERMISSIONS.VEHICLES_INVENTORY);
      set.add(PERMISSIONS.TOOLS_MANAGE);
      set.add(PERMISSIONS.TOOLS_INVENTORY);
      set.add(PERMISSIONS.VIATICS_MANAGE);
      set.add(PERMISSIONS.VIATICS_VIEW);
      set.add(PERMISSIONS.ATTENDANCE_MANAGE);
      set.add(PERMISSIONS.ATTENDANCE_VIEW);
      set.add(PERMISSIONS.GPS_MANAGE);
      set.add(PERMISSIONS.MAINTENANCE_VIEW);
      set.add(PERMISSIONS.MAINTENANCE_MANAGE);
      set.add(PERMISSIONS.ASSETS_VIEW);
      set.add(PERMISSIONS.ASSETS_MANAGE);
      set.add(PERMISSIONS.NOC_VIEW);
    }

    // ── Personal administrativo (operación día a día ERP) ─────────────
    if (roleKey === 'administrativo') {
      set.add(PERMISSIONS.ATTENDANCE_VIEW);
      set.add(PERMISSIONS.LUNCH_BREAKS_VIEW);
      set.add(PERMISSIONS.DOCUMENTS_VIEW);
      set.add(PERMISSIONS.DOCUMENTS_MANAGE);
      set.add(PERMISSIONS.VIATICS_VIEW);
      set.add(PERMISSIONS.VIATICS_CREATE);
      set.add(PERMISSIONS.CONTABILIDAD_VIEW);
    }

    // ── Asistencia personal (ventas, studio y otros con check-in propio) ─
    const V2_SELF_ATTENDANCE_ROLES = new Set([
      'vendedor',
      'coord_ventas',
      'lider_diseno',
      'disenador',
    ]);
    if (V2_SELF_ATTENDANCE_ROLES.has(roleKey)) {
      set.add(PERMISSIONS.ATTENDANCE_VIEW);
      set.add(PERMISSIONS.LUNCH_BREAKS_VIEW);
    }

    // ── Studio / diseño web ──────────────────────────────────────────
    if (roleKey === 'lider_diseno' || roleKey === 'disenador') {
      set.add(PERMISSIONS.PANEL_WEB);
      set.add(PERMISSIONS.STUDIO_CONTENT_VIEW);
      set.add(PERMISSIONS.STUDIO_CONTENT_MANAGE);
    }

    // ── Ingeniero de campo ───────────────────────────────────────────
    if (roleKey === 'ing_campo') {
      set.add(PERMISSIONS.CONSOLE_ACCESS);
      set.add(PERMISSIONS.ACTIVITIES_VIEW);
      set.add(PERMISSIONS.EVIDENCES_VIEW);
      set.add(PERMISSIONS.EVIDENCES_CREATE);
      set.add(PERMISSIONS.VIATICS_VIEW);
      set.add(PERMISSIONS.VIATICS_CREATE);
      set.add(PERMISSIONS.VEHICLES_VIEW);
      set.add(PERMISSIONS.VEHICLES_REQUEST);
      set.add(PERMISSIONS.TOOLS_VIEW);
      set.add(PERMISSIONS.TOOLS_REQUEST);
      set.add(PERMISSIONS.ATTENDANCE_VIEW);
      set.add(PERMISSIONS.GPS_VIEW);
    }

    // ── Ingeniero de soporte — ejecuta OT asignadas (no asigna ni administra) ──
    if (roleKey === 'ing_soporte') {
      set.add(PERMISSIONS.CONSOLE_ACCESS);
      set.add(PERMISSIONS.ACTIVITIES_VIEW);
      set.add(PERMISSIONS.EVIDENCES_VIEW);
      set.add(PERMISSIONS.EVIDENCES_CREATE);
      set.add(PERMISSIONS.TOOLS_VIEW);
      set.add(PERMISSIONS.TOOLS_REQUEST);
      set.add(PERMISSIONS.VEHICLES_VIEW);
      set.add(PERMISSIONS.VEHICLES_REQUEST);
      set.add(PERMISSIONS.SUPPORT_VIEW);
      set.add(PERMISSIONS.ATTENDANCE_VIEW);
      set.add(PERMISSIONS.GPS_VIEW);
      set.add(PERMISSIONS.KB_VIEW);
      set.add(PERMISSIONS.DOCUMENTS_VIEW);
      // Viáticos propios — el soporte también viaja y necesita reportar gastos
      set.add(PERMISSIONS.VIATICS_VIEW);
      set.add(PERMISSIONS.VIATICS_CREATE);
    }


    // Acceso CRM per diagrama org chart
    // Coordinador Administrativo (Administracion): Cotizaciones + Seguimiento clientes
    if (roleKey === 'coord_admin') {
      set.add(PERMISSIONS.SALES_VIEW);
      set.add(PERMISSIONS.PANEL_VENTAS);
      set.add(PERMISSIONS.COTIZACIONES_ACCESS);
      set.add(PERMISSIONS.CLIENTS_VIEW);
      set.add(PERMISSIONS.CLIENTS_MANAGE);
      set.add(PERMISSIONS.CATALOG_VIEW);
    }

    // Arquitecto: diseno y planeacion de proyectos CRM - necesita ver proyectos comerciales
    // Coordinador de Operaciones: ve proyectos CRM para coordinar ejecucion
    if (roleKey === 'arquitecto' || roleKey === 'coord_operaciones') {
      set.add(PERMISSIONS.SALES_VIEW);
      set.add(PERMISSIONS.PANEL_VENTAS);
    }

        return Array.from(set);
  }

  private pickRoleFlags(role: any) {
    if (!role) {
      return {
        accesoConsole: false,
        accesoConsoleAdmin: false,
        accesoActividades: false,
        accesoEvidencias: false,
        accesoViaticos: false,
        accesoVehiculos: false,
        accesoAsistencia: false,
        accesoGps: false,
        accesoGestionUsuarios: false,
        accesoGestionWeb: false,
        accesoGestionCvs: false,
        accesoPanelVentas: false,
        accesoContabilidad: false,
        accesoCotizaciones: false,
        accesoInventario: false,
        accesoCompras: false,
        accesoMantenimiento: false,
        accesoDocumentos: false,
        accesoAuditoria: false,
        accesoBI: false,
        accesoBanca: false,
        accesoMultas: false,
        accesoClientes: false,
        accesoLunchBreaks: false,
        accesoRRHH: false,
        accesoCatalogo: false,
      };
    }
    return {
      accesoConsole: Boolean(role.accesoConsole),
      accesoConsoleAdmin: Boolean(role.accesoConsoleAdmin),
      accesoActividades: Boolean(role.accesoActividades),
      accesoEvidencias: Boolean(role.accesoEvidencias),
      accesoViaticos: Boolean(role.accesoViaticos),
      accesoVehiculos: Boolean(role.accesoVehiculos),
      accesoAsistencia: Boolean(role.accesoAsistencia),
      accesoGps: Boolean(role.accesoGps),
      accesoGestionUsuarios: Boolean(role.accesoGestionUsuarios),
      accesoGestionWeb: Boolean(role.accesoGestionWeb),
      accesoGestionCvs: Boolean(role.accesoGestionCvs),
      accesoPanelVentas: Boolean(role.accesoPanelVentas),
      accesoContabilidad: Boolean(role.accesoContabilidad),
      accesoCotizaciones: Boolean(role.accesoCotizaciones),
      accesoInventario: Boolean(role.accesoInventario),
      accesoCompras: Boolean(role.accesoCompras),
      accesoMantenimiento: Boolean(role.accesoMantenimiento),
      accesoDocumentos: Boolean(role.accesoDocumentos),
      accesoAuditoria: Boolean(role.accesoAuditoria),
      accesoBI: Boolean(role.accesoBI),
      accesoBanca: Boolean(role.accesoBanca),
      accesoMultas: Boolean(role.accesoMultas),
      accesoClientes: Boolean(role.accesoClientes),
      accesoLunchBreaks: Boolean(role.accesoLunchBreaks),
      accesoRRHH: Boolean(role.accesoRRHH),
      accesoCatalogo: Boolean(role.accesoCatalogo),
    };
  }

  private mapSessionUser(user: any, permissions: string[], isSuperAdmin: boolean, loginDevice?: string) {
    const roleKey = this.resolveEffectiveRoleKey(user) ?? user.roleKey ?? null;
    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role?.nombre ?? '',
      roleId: user.roleId,
      // RBAC v2: clave canónica de rol (roles.v2.ts). Coexiste con roleId
      // legacy hasta que terminemos la migración de toda la base de usuarios.
      roleKey,
      orgRoleKey: user.role?.orgRoleKey ?? null,
      nivelAutoridad: user.role?.nivelAutoridad ?? 0,
      // Con roleKey v2 los flags acceso* ya no otorgan permisos — se reportan apagados.
      roleFlags: roleKey ? this.pickRoleFlags(null) : this.pickRoleFlags(user.role),
      department: user.department?.nombre ?? '',
      departmentId: user.departmentId,
      permissions,
      isSuperAdmin,
      isPlatformOwner: this.isPlatformOwner(user.email),
      avatarUrl: user.avatarUrl,
      ...(loginDevice ? { loginDevice } : {}),
    };
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
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('Usuario inactivo');
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(`Cuenta bloqueada temporalmente. Reintenta en ${mins} min.`);
    }
    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
      const failures = (user.failedLoginCount ?? 0) + 1;
      const lockThreshold = 5;
      const lockMinutes = 15;
      const lockedNow = failures >= lockThreshold;
      const lockedUntil = lockedNow ? new Date(Date.now() + lockMinutes * 60_000) : undefined;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failures,
          ...(lockedUntil ? { lockedUntil } : {}),
        },
      });
      if (lockedNow) {
        const memberships = await this.prisma.userCompany.findMany({
          where: { userId: user.id },
          select: { companyId: true },
          take: 20,
        });
        const companyIds: number[] = memberships.map((m) => m.companyId);
        if (!companyIds.length) {
          const primary = await this.prisma.companyProfile.findFirst({
            where: { isPrimary: true },
            select: { id: true },
          });
          if (primary) companyIds.push(primary.id);
        }
        for (const companyId of companyIds) {
          void this.webhooks
            ?.emit(
              'user.locked',
              {
                userId: user.id,
                email: user.email,
                failures,
                lockedUntil: lockedUntil?.toISOString(),
                companyId,
              },
              companyId,
            )
            .catch(() => undefined);
        }
      }
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return user;
  }

  async login(loginDto: LoginDto, req?: any) {
    const userAgent = req?.headers?.['user-agent'] || req?.headers?.['User-Agent'];
    const ipAddress = String(req?.headers?.['x-forwarded-for'] || req?.ip || '')
      .split(',')[0]
      ?.trim();
    let user;
    try {
      user = await this.validateUser(loginDto.email, loginDto.password);
    } catch (err) {
      try {
        await this.prisma.auditLog.create({
          data: {
            entityType: 'Auth',
            entityId: 0,
            action: 'LOGIN_FAILED',
            changes: { email: String(loginDto.email || '').trim().toLowerCase() },
            ipAddress: ipAddress || null,
            userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
          },
        });
      } catch {
        // no bloquear
      }
      throw err;
    }

    const isSuperAdmin = this.isSuperAdmin(user.email);
    const permissions = this.resolveUserPermissions(user, isSuperAdmin);

    if (loginDto.panel === 'ventas' && !isSuperAdmin && !permissions.includes(PERMISSIONS.PANEL_VENTAS)) {
      throw new UnauthorizedException('Tu usuario no tiene acceso al panel de ventas');
    }

    if (user.mfaEnabled && user.mfaSecret) {
      const { verifyTotp } = await import('../users/mfa.util.js');
      if (!loginDto.mfaCode) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'MFA_REQUIRED',
          error: 'Se requiere código MFA',
        });
      }
      if (!verifyTotp(user.mfaSecret, loginDto.mfaCode)) {
        throw new UnauthorizedException('Código MFA inválido');
      }
    }

    return this.issueSession(user, req, { authMethod: 'password' });
  }

  /** Login vía OIDC (SSO). El IdP ya autenticó; no exige MFA local. */
  async loginWithOidcUser(user: any, req?: any) {
    return this.issueSession(user, req, { authMethod: 'oidc' });
  }

  private async issueSession(user: any, req: any, opts: { authMethod: string }) {
    const userAgent = req?.headers?.['user-agent'] || req?.headers?.['User-Agent'];
    const ipAddress = String(req?.headers?.['x-forwarded-for'] || req?.ip || '')
      .split(',')[0]
      ?.trim();
    const device = detectDeviceDetails(userAgent, req?.headers);
    const detectedDevice = (device.label || device.summary || 'Este dispositivo').slice(0, 255);
    const isSuperAdmin = this.isSuperAdmin(user.email);
    const permissions = this.resolveUserPermissions(user, isSuperAdmin);

    const { randomUUID } = await import('node:crypto');
    const jti = randomUUID().replace(/-/g, '');
    const expiresInRaw = process.env.JWT_EXPIRES_IN || '4h';
    const expiresMs = this.parseExpiresToMs(expiresInRaw);
    const expiresAt = new Date(Date.now() + expiresMs);

    const payload = {
      sub: user.id,
      roleId: user.roleId,
      roleKey: this.resolveEffectiveRoleKey(user) ?? user.roleKey ?? null,
      orgRoleKey: user.role?.orgRoleKey ?? null,
      departmentId: user.departmentId,
      permissions,
      isSuperAdmin,
      isPlatformOwner: this.isPlatformOwner(user.email),
      jti,
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress ? String(ipAddress).slice(0, 45) : null,
        lastLoginDevice: detectedDevice,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    try {
      await this.prisma.userSession.create({
        data: {
          userId: user.id,
          jti,
          device: detectedDevice,
          ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
          userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
          expiresAt,
        },
      });
    } catch (sessionErr) {
      this.logger.warn(`No se pudo registrar UserSession para userId=${user.id}`);
      this.logger.debug(sessionErr instanceof Error ? sessionErr.message : String(sessionErr));
    }

    await this.createLoginNotification(user.id, detectedDevice);

    try {
      await this.prisma.auditLog.create({
        data: {
          entityType: 'Auth',
          entityId: user.id,
          action: 'LOGIN_SUCCESS',
          source: opts.authMethod === 'oidc' ? 'oidc' : 'http',
          changes: {
            email: user.email,
            roleKey: payload.roleKey,
            device: detectedDevice,
            jti,
            authMethod: opts.authMethod,
          },
          userId: user.id,
          ipAddress: ipAddress || null,
          userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
        },
      });
    } catch {
      // no bloquear login
    }

    const firstName = String(user.nombre || '')
      .trim()
      .split(/\s+/)[0] || 'equipo';

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: expiresInRaw as any }),
      // Caducidad explícita: el cliente ya no puede leer el JWT para deducirla
      // cuando la sesión viaja en una cookie HttpOnly.
      expiresAt: expiresAt.toISOString(),
      loginDevice: detectedDevice,
      loginGreeting: `Hola, ${firstName}`,
      loginDeviceLabel: detectedDevice,
      user: this.mapSessionUser(user, permissions, isSuperAdmin, detectedDevice),
    };
  }

  /** Parsea JWT_EXPIRES_IN estilo "4h" / "30m" / "7d" a milisegundos. */
  private parseExpiresToMs(raw: string): number {
    const m = String(raw).trim().match(/^(\d+)([smhd])$/i);
    if (!m) return 4 * 60 * 60 * 1000;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 's') return n * 1000;
    if (unit === 'm') return n * 60_000;
    if (unit === 'h') return n * 3_600_000;
    return n * 86_400_000;
  }

  async assertSessionActive(jti: string | undefined, userId: number): Promise<void> {
    // Tokens legacy sin jti siguen válidos hasta expirar (compat).
    if (!jti) return;
    const session = await this.prisma.userSession.findUnique({ where: { jti } });
    if (!session || session.userId !== userId) {
      throw new UnauthorizedException('Sesión inválida');
    }
    if (session.revokedAt) {
      throw new UnauthorizedException('Sesión revocada. Vuelve a iniciar sesión.');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sesión expirada');
    }
    // Touch lastSeen (fire-and-forget)
    void this.prisma.userSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, department: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const isSuperAdmin = this.isSuperAdmin(user.email);
    const permissions = this.resolveUserPermissions(user, isSuperAdmin);
    return this.mapSessionUser(user, permissions, isSuperAdmin);
  }
}
