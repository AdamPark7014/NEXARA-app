/**
 * NEXARA · Vistas de módulo por rol
 * =================================
 * Define qué módulos aparecen en el sidebar de cada panel y cómo se comporta
 * cada sección según el rol (solo ejecutar, solo administrar, o ambos).
 */
import type { ModuleEntry, ModuleId } from '@/lib/access-matrix';
import { ROLES, ROLE_TIER, type RoleKey } from '@/lib/rbac';
import { resolveV2RoleKey, type UserAccessInput } from '@/lib/rbac/role-mapping';

export type SectionViewMode = 'manage' | 'execute' | 'manage_execute';

export type SectionConfig = {
  viewMode: SectionViewMode;
  defaultScope: 'team' | 'self';
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canApprove: boolean;
  title: string;
  subtitle: string;
};

const EXECUTIVE = new Set<RoleKey>([ROLES.CEO, ROLES.SUPER_ADMIN]);
const OPS_MANAGERS = new Set<RoleKey>([
  ROLES.DIR_OPERACIONES,
  ROLES.COORD_OPERACIONES,
  ROLES.ARQUITECTO,
]);
const FIELD = new Set<RoleKey>([ROLES.ING_CAMPO]);
const SUPPORT = new Set<RoleKey>([ROLES.ING_SOPORTE]);
const HR_MANAGERS = new Set<RoleKey>([ROLES.RH, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN]);
const SALES_MANAGERS = new Set<RoleKey>([ROLES.CEO, ROLES.COORD_VENTAS, ROLES.DIR_ADMIN]);
const SALES_REP = new Set<RoleKey>([ROLES.VENDEDOR]);
const ERP_EXECUTIVE = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES]);
const ERP_ADMIN = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.DIR_OPERACIONES]);
const FINANCE_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.CONTABILIDAD, ROLES.DIR_OPERACIONES]);
const HR_ONLY = new Set<RoleKey>([ROLES.RH]);
const WAREHOUSE_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.DIR_OPERACIONES]);

function isOpsManager(role: RoleKey): boolean {
  return EXECUTIVE.has(role) || OPS_MANAGERS.has(role);
}

function isFieldRole(role: RoleKey): boolean {
  return FIELD.has(role);
}

function isSupportRole(role: RoleKey): boolean {
  return SUPPORT.has(role);
}

function tier(role: RoleKey): number {
  return ROLE_TIER[role] ?? 0;
}

/** ¿Mostrar este módulo en el sidebar del panel actual? */
export function shouldShowModuleInSidebar(
  user: UserAccessInput | null | undefined,
  module: ModuleEntry,
): boolean {
  if (user?.isSuperAdmin) return module.visible !== false;

  const v2 = resolveV2RoleKey(user);
  if (!v2) return module.visible !== false;

  switch (module.id as ModuleId) {
    case 'ops-activities':
      return isOpsManager(v2) || isSupportRole(v2);
    case 'ops-my-activities':
      return isFieldRole(v2) || OPS_MANAGERS.has(v2);
    case 'ops-evidences':
      return isOpsManager(v2) || isSupportRole(v2);
    case 'ops-my-evidences':
      return isFieldRole(v2) || OPS_MANAGERS.has(v2);
    case 'ops-viatics':
      return isOpsManager(v2);
    case 'ops-my-viatics':
      return isFieldRole(v2) || OPS_MANAGERS.has(v2);
    case 'ops-vehicles':
      return isOpsManager(v2);
    case 'ops-my-vehicles':
      return isFieldRole(v2) || OPS_MANAGERS.has(v2);
    case 'ops-gps':
      return isOpsManager(v2);
    case 'ops-tools':
      return isFieldRole(v2) || isOpsManager(v2) || isSupportRole(v2);
    case 'ops-projects':
      return isOpsManager(v2);
    case 'ops-dashboard':
      return isOpsManager(v2) || isFieldRole(v2) || isSupportRole(v2);
    case 'ops-noc':
    case 'ops-support-inbox':
    case 'ops-support-sla':
      return EXECUTIVE.has(v2) || OPS_MANAGERS.has(v2) || isSupportRole(v2);
    case 'ops-maintenance':
    case 'ops-maintenance-contracts':
    case 'ops-service-clients':
    case 'ops-assets':
      return EXECUTIVE.has(v2) || OPS_MANAGERS.has(v2) || isSupportRole(v2);
    case 'ops-cvs':
      return EXECUTIVE.has(v2) || OPS_MANAGERS.has(v2) || v2 === ROLES.RH;
    case 'attendance':
      return true;
    case 'viatics-admin':
      return HR_MANAGERS.has(v2) || EXECUTIVE.has(v2) || v2 === ROLES.COORD_ADMIN || v2 === ROLES.DIR_OPERACIONES;
    case 'expenses-admin':
      return tier(v2) >= 45 && v2 !== ROLES.ING_CAMPO && v2 !== ROLES.ING_SOPORTE;
    // ERP — tablero ejecutivo solo dirección
    case 'executive':
      return ERP_EXECUTIVE.has(v2);
    case 'users':
    case 'audit':
    case 'settings':
    case 'architecture':
      return ERP_ADMIN.has(v2);
    case 'accounting':
    case 'invoicing':
    case 'banking':
    case 'employee-payments':
      return FINANCE_ROLES.has(v2);
    case 'hr':
    case 'lunch-breaks':
    case 'fines':
    case 'kpis-hr':
      return HR_ONLY.has(v2) || HR_MANAGERS.has(v2) || EXECUTIVE.has(v2);
    case 'warehouse':
    case 'procurement':
      return WAREHOUSE_ROLES.has(v2) || v2 === ROLES.ADMINISTRATIVO;
    // CRM — gerente vs vendedor
    case 'crm-sales-team':
    case 'crm-targets':
    case 'crm-tenders':
    case 'crm-templates':
      return SALES_MANAGERS.has(v2);
    case 'crm-reports':
      return SALES_MANAGERS.has(v2) || v2 === ROLES.DIR_ADMIN;
    case 'crm-projects':
      return SALES_MANAGERS.has(v2) || SALES_REP.has(v2) || v2 === ROLES.COORD_OPERACIONES;
    default:
      return module.visible !== false;
  }
}

/** Etiquetas del sidebar según rol. */
export function adaptModulePresentation(
  user: UserAccessInput | null | undefined,
  module: ModuleEntry,
): ModuleEntry {
  const v2 = resolveV2RoleKey(user);
  if (!v2) return module;

  const copy: Partial<Record<ModuleId, { label: string; description: string }>> = {
    'ops-activities': {
      label: EXECUTIVE.has(v2) ? 'Actividades · Asignación' : 'Actividades · Equipo',
      description: EXECUTIVE.has(v2)
        ? 'Asignar y supervisar OT del equipo (sin OT propias)'
        : 'Vista global — asignar, editar y dar seguimiento',
    },
    'ops-my-activities': {
      label: 'Mis actividades',
      description: OPS_MANAGERS.has(v2)
        ? 'Tus OT asignadas — ejecutar y subir evidencias'
        : 'Mis OT del día — iniciar, evidenciar y cerrar',
    },
    'ops-evidences': {
      label: 'Evidencias · Revisión',
      description: 'Aprobar o rechazar evidencias del equipo',
    },
    'ops-my-evidences': {
      label: 'Mis evidencias',
      description: 'Fotos, firmas y hojas de servicio de tus OT',
    },
    'ops-viatics': {
      label: 'Viáticos · Aprobación',
      description: 'Revisar y autorizar viáticos del equipo',
    },
    'ops-my-viatics': {
      label: 'Mis viáticos',
      description: 'Solicitar y comprobar tus viáticos de campo',
    },
    'ops-vehicles': {
      label: 'Flotilla · Gestión',
      description: 'Asignar vehículos y control de flotilla',
    },
    'ops-my-vehicles': {
      label: 'Mis vehículos',
      description: 'Vehículos asignados a ti',
    },
    'ops-gps': {
      label: 'GPS en vivo',
      description: 'Rastreo de cuadrillas en tiempo real',
    },
    attendance: EXECUTIVE.has(v2)
      ? { label: 'Asistencia · Gestión', description: 'Supervisión de jornadas del equipo' }
      : HR_MANAGERS.has(v2)
        ? { label: 'Asistencia · Gestión', description: 'Registrar y gestionar jornadas' }
        : { label: 'Mi asistencia', description: 'Registrar tu entrada y salida' },
    'crm-pipeline': SALES_REP.has(v2)
      ? { label: 'Mi pipeline', description: 'Tus oportunidades activas por etapa' }
      : { label: 'Kanban del pipeline', description: 'Vista visual del equipo por etapa' },
    'crm-leads': SALES_REP.has(v2)
      ? { label: 'Mis leads', description: 'Prospectos asignados a ti' }
      : { label: 'Leads', description: 'Prospectos del equipo comercial' },
  };

  const hit = copy[module.id as ModuleId];
  return hit ? { ...module, ...hit } : module;
}

export function getActivitiesSectionConfig(user: UserAccessInput | null | undefined): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: true,
      canApprove: true,
      title: 'Actividades · Asignación',
      subtitle: 'Asigna OT al equipo y supervisa el avance.',
    };
  }
  if (EXECUTIVE.has(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canAssign: true,
      canApprove: true,
      title: 'Actividades · Asignación',
      subtitle: 'Supervisa y asigna órdenes de trabajo. No tienes OT personales en campo.',
    };
  }
  if (OPS_MANAGERS.has(v2)) {
    return {
      viewMode: 'manage_execute',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: tier(v2) >= 85,
      canAssign: true,
      canApprove: true,
      title: 'Actividades · Equipo',
      subtitle: 'Asigna OT a tu equipo o cambia a "Mis actividades" para ejecutar las tuyas.',
    };
  }
  if (isSupportRole(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: false,
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: true,
      title: 'Actividades · Soporte',
      subtitle: 'OT vinculadas a tickets — seguimiento y cierre.',
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: 'Mis actividades',
    subtitle: 'Tus OT asignadas — ejecuta, evidencia y cierra en sitio.',
  };
}

export function getEvidencesSectionConfig(user: UserAccessInput | null | undefined): SectionConfig {
  const activities = getActivitiesSectionConfig(user);
  if (activities.viewMode === 'execute') {
    return {
      ...activities,
      title: 'Mis evidencias',
      subtitle: 'Sube fotos, videos y firmas de tus OT en campo.',
    };
  }
  return {
    viewMode: activities.viewMode === 'manage_execute' ? 'manage_execute' : 'manage',
    defaultScope: 'team',
    canCreate: false,
    canEdit: false,
    canDelete: activities.canDelete,
    canAssign: false,
    canApprove: activities.canApprove,
    title: 'Evidencias · Revisión',
    subtitle: 'Aprueba o rechaza evidencias capturadas por el equipo de campo.',
  };
}

export function getViaticsSectionConfig(user: UserAccessInput | null | undefined): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  if (!v2 || isOpsManager(v2) || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: false,
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: true,
      title: 'Viáticos · Aprobación',
      subtitle: 'Revisa y autoriza solicitudes de viáticos del equipo.',
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: 'Mis viáticos',
    subtitle: 'Solicita y comprueba tus viáticos de campo.',
  };
}

export function getAttendanceViewMode(
  user: UserAccessInput | null | undefined,
): 'manage' | 'register' | 'manage_register' {
  const v2 = resolveV2RoleKey(user);
  if (!user || user.isSuperAdmin) return 'manage';
  if (!v2) return 'register';
  if (EXECUTIVE.has(v2)) return 'manage';
  if (HR_MANAGERS.has(v2)) return 'manage_register';
  return 'register';
}

export function getActivitiesCanonicalPath(user: UserAccessInput | null | undefined): string {
  const cfg = getActivitiesSectionConfig(user);
  return cfg.viewMode === 'execute' ? '/ops/my-activities' : '/ops/activities';
}

export function getEvidencesCanonicalPath(user: UserAccessInput | null | undefined): string {
  const cfg = getEvidencesSectionConfig(user);
  return cfg.viewMode === 'execute' ? '/ops/my-evidences' : '/ops/evidences';
}

export function getViaticsCanonicalPath(user: UserAccessInput | null | undefined): string {
  const cfg = getViaticsSectionConfig(user);
  return cfg.viewMode === 'execute' ? '/ops/my-viatics' : '/ops/viatics';
}

// ─── CRM ───────────────────────────────────────────────────────────────────

function isSalesManager(role: RoleKey): boolean {
  return SALES_MANAGERS.has(role);
}

function isSalesRep(role: RoleKey): boolean {
  return SALES_REP.has(role);
}

export function canAccessCrmManagerPages(user: UserAccessInput | null | undefined): boolean {
  if (!user || user.isSuperAdmin) return true;
  const v2 = resolveV2RoleKey(user);
  if (!v2) return false;
  return isSalesManager(v2);
}

/** Páginas solo gerente: equipo, cuotas, licitaciones, plantillas, reportes globales. */
export function getCrmManagerSectionConfig(user: UserAccessInput | null | undefined): SectionConfig & { canAccess: boolean } {
  const v2 = resolveV2RoleKey(user);
  const canAccess = canAccessCrmManagerPages(user);
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: true,
      canApprove: true,
      canAccess: true,
      title: 'Gestión comercial',
      subtitle: 'Vista del equipo — métricas, cuotas y desempeño.',
    };
  }
  if (!canAccess) {
    return {
      viewMode: 'execute',
      defaultScope: 'self',
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      canAccess: false,
      title: 'Acceso restringido',
      subtitle: 'Esta sección es solo para coordinadores y dirección comercial.',
    };
  }
  return {
    viewMode: 'manage',
    defaultScope: 'team',
    canCreate: true,
    canEdit: true,
    canDelete: tier(v2) >= 70,
    canAssign: true,
    canApprove: true,
    canAccess: true,
    title: 'Gestión comercial · Equipo',
    subtitle: 'Supervisa ejecutivos, cuotas y cumplimiento del mes.',
  };
}

type CrmSalesModule = 'leads' | 'pipeline' | 'opportunities' | 'agenda' | 'clients' | 'quotes' | 'projects';

const CRM_SALES_COPY: Record<CrmSalesModule, { manager: { title: string; subtitle: string }; rep: { title: string; subtitle: string } }> = {
  leads: {
    manager: { title: 'Leads · Equipo', subtitle: 'Prospectos de todos los ejecutivos — califica y asigna.' },
    rep: { title: 'Mis leads', subtitle: 'Tus prospectos asignados — califica y convierte en oportunidades.' },
  },
  pipeline: {
    manager: { title: 'Pipeline · Equipo', subtitle: 'Kanban global — arrastra oportunidades y supervisa el cierre.' },
    rep: { title: 'Mi pipeline', subtitle: 'Tus oportunidades activas por etapa — avanza cada negocio.' },
  },
  opportunities: {
    manager: { title: 'Oportunidades · Equipo', subtitle: 'Listado completo del pipeline comercial.' },
    rep: { title: 'Mis oportunidades', subtitle: 'Negocios en proceso que tienes asignados.' },
  },
  agenda: {
    manager: { title: 'Agenda comercial · Equipo', subtitle: 'Llamadas, visitas y demos de todo el equipo.' },
    rep: { title: 'Mi agenda', subtitle: 'Tus llamadas, visitas y seguimientos pendientes.' },
  },
  clients: {
    manager: { title: 'Clientes', subtitle: 'Cartera de cuentas y contactos del equipo.' },
    rep: { title: 'Mis clientes', subtitle: 'Cuentas y contactos que gestionas.' },
  },
    quotes: {
      manager: { title: 'Cotizaciones', subtitle: 'Documentos comerciales del equipo.' },
      rep: { title: 'Mis cotizaciones', subtitle: 'Tus propuestas y cotizaciones en curso.' },
    },
    projects: {
      manager: { title: 'Proyectos de venta', subtitle: 'Negocios ganados y handoff a operaciones.' },
      rep: { title: 'Mis proyectos', subtitle: 'Proyectos comerciales que tienes asignados.' },
    },
  };

/** Leads, pipeline, oportunidades, agenda — vendedor ejecuta; gerente administra. */
export function getCrmSalesSectionConfig(
  user: UserAccessInput | null | undefined,
  module: CrmSalesModule = 'leads',
): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  const copy = CRM_SALES_COPY[module];
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: true,
      canApprove: true,
      title: copy.manager.title,
      subtitle: copy.manager.subtitle,
    };
  }
  if (EXECUTIVE.has(v2) || isSalesManager(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: tier(v2) >= 85,
      canAssign: true,
      canApprove: false,
      title: copy.manager.title,
      subtitle: copy.manager.subtitle,
    };
  }
  if (module === 'projects' && v2 === ROLES.COORD_OPERACIONES) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: false,
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      title: 'Proyectos de venta',
      subtitle: 'Seguimiento de proyectos comerciales en ejecución.',
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: copy.rep.title,
    subtitle: copy.rep.subtitle,
  };
}

/** Filtra filas al scope del usuario (vendedor = solo lo suyo). */
export function filterRowsByScope<T extends {
  asignadoA?: string | null;
  owner?: { nombre?: string | null; email?: string | null } | null;
  creadoPor?: { nombre?: string | null } | null;
  createdBy?: { nombre?: string | null; email?: string | null } | null;
  responsable?: { nombre?: string | null } | null;
  usuario?: { nombre?: string | null; email?: string | null } | null;
}>(
  items: T[],
  user: { nombre?: string | null; email?: string | null } | null | undefined,
  scope: 'team' | 'self',
): T[] {
  if (scope === 'team' || !user) return items;
  const fullName = (user.nombre ?? '').toLowerCase().trim();
  const firstName = fullName.split(/\s+/)[0] ?? '';
  const email = (user.email ?? '').toLowerCase();
  const emailUser = email.split('@')[0] ?? '';

  return items.filter((row) => {
    const who =
      row.asignadoA ??
      row.owner?.nombre ??
      row.owner?.email ??
      row.creadoPor?.nombre ??
      row.createdBy?.nombre ??
      row.createdBy?.email ??
      row.responsable?.nombre ??
      row.usuario?.nombre ??
      row.usuario?.email ??
      '';
    const w = String(who).toLowerCase();
    if (!w) return false;
    if (email && w === email) return true;
    if (emailUser && w.includes(emailUser)) return true;
    if (firstName && w.includes(firstName)) return true;
    if (fullName && w.includes(fullName)) return true;
    return false;
  });
}

// ─── ERP finanzas / RH ─────────────────────────────────────────────────────

const ERP_VIATICS_APPROVERS = new Set<RoleKey>([
  ROLES.CEO,
  ROLES.DIR_ADMIN,
  ROLES.COORD_ADMIN,
  ROLES.CONTABILIDAD,
  ROLES.RH,
  ROLES.DIR_OPERACIONES,
]);

/** Viáticos administrativos (ERP) — solicitar vs aprobar. */
export function getErpViaticsAdminSectionConfig(user: UserAccessInput | null | undefined): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: false,
      canApprove: true,
      title: 'Viáticos · Gestión',
      subtitle: 'Revisa y autoriza solicitudes de viáticos del equipo.',
    };
  }
  if (ERP_VIATICS_APPROVERS.has(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: v2 === ROLES.ADMINISTRATIVO,
      canEdit: true,
      canDelete: tier(v2) >= 70,
      canAssign: false,
      canApprove: true,
      title: 'Viáticos · Aprobación',
      subtitle: 'Gestión y autorización de viáticos — flujo coordinador → administración → banca.',
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: 'Mis viáticos',
    subtitle: 'Solicita viáticos y adjunta comprobante — espera aprobación de tu coordinador.',
  };
}

const ERP_EXPENSE_MANAGERS = new Set<RoleKey>([
  ROLES.CEO,
  ROLES.DIR_ADMIN,
  ROLES.COORD_ADMIN,
  ROLES.CONTABILIDAD,
  ROLES.DIR_OPERACIONES,
]);

/** Gastos administrativos — registrar vs gestionar y aprobar. */
export function getErpExpensesSectionConfig(user: UserAccessInput | null | undefined): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: false,
      canApprove: true,
      title: 'Gastos · Administración',
      subtitle: 'Captura y autorización de gastos no operativos.',
    };
  }
  if (ERP_EXPENSE_MANAGERS.has(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: tier(v2) >= 60,
      canAssign: false,
      canApprove: true,
      title: 'Gastos · Gestión',
      subtitle: 'Autoriza gastos del equipo: renta, servicios, suscripciones y recurrentes.',
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: 'Mis gastos',
    subtitle: 'Registra tus gastos administrativos y da seguimiento a su aprobación.',
  };
}

const HR_PAGE_ROLES = new Set<RoleKey>([ROLES.RH, ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN]);

export function canAccessHrManagement(user: UserAccessInput | null | undefined): boolean {
  if (!user || user.isSuperAdmin) return true;
  const v2 = resolveV2RoleKey(user);
  if (!v2) return false;
  return HR_PAGE_ROLES.has(v2);
}

/** RRHH plantilla — solo RH y dirección; el resto va a asistencia. */
export function getHrSectionConfig(user: UserAccessInput | null | undefined): SectionConfig & { canAccess: boolean } {
  const canAccess = canAccessHrManagement(user);
  const v2 = resolveV2RoleKey(user);
  if (!canAccess) {
    return {
      viewMode: 'execute',
      defaultScope: 'self',
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      canAccess: false,
      title: 'Recursos Humanos',
      subtitle: 'No tienes acceso a la gestión de plantilla.',
    };
  }
  if (!v2 || user?.isSuperAdmin || v2 === ROLES.CEO) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canAssign: true,
      canApprove: true,
      canAccess: true,
      title: 'Recursos Humanos · Gestión',
      subtitle: 'Supervisión de plantilla, altas y organigrama corporativo.',
    };
  }
  if (v2 === ROLES.RH) {
    return {
      viewMode: 'manage_execute',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canAssign: true,
      canApprove: true,
      canAccess: true,
      title: 'Recursos Humanos',
      subtitle: 'Plantilla, vacaciones, incidencias y onboarding — fuente de verdad del personal.',
    };
  }
  return {
    viewMode: 'manage',
    defaultScope: 'team',
    canCreate: false,
    canEdit: true,
    canDelete: false,
    canAssign: false,
    canApprove: true,
    canAccess: true,
    title: 'Recursos Humanos · Supervisión',
    subtitle: 'Vista de dirección sobre la plantilla y el estado del equipo.',
  };
}

export function getCrmManagerCanonicalPath(): string {
  return '/crm/dashboard';
}

/** Dashboard OPS — equipo vs vista personal. */
export function getOpsDashboardSectionConfig(user: UserAccessInput | null | undefined): SectionConfig {
  const activities = getActivitiesSectionConfig(user);
  if (activities.viewMode === 'execute') {
    return {
      ...activities,
      title: 'Mi día en campo',
      subtitle: 'Resumen de tus OT y alertas relevantes para hoy.',
    };
  }
  if (activities.viewMode === 'manage_execute') {
    return {
      ...activities,
      title: 'Centro de operaciones',
      subtitle: 'OT del equipo, alertas NOC y estado del día.',
    };
  }
  return {
    viewMode: 'manage',
    defaultScope: 'team',
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canAssign: true,
    canApprove: true,
    title: 'Centro de operaciones',
    subtitle: 'Supervisión global de OT, alertas y desempeño del equipo.',
  };
}

// ─── OPS · gestión de equipo ───────────────────────────────────────────────

type OpsTeamModule =
  | 'vehicles'
  | 'tools'
  | 'projects'
  | 'maintenance'
  | 'maintenance-contracts'
  | 'service-clients'
  | 'support'
  | 'gps'
  | 'recruiting';

const OPS_TEAM_COPY: Record<OpsTeamModule, { title: string; subtitle: string }> = {
  vehicles: { title: 'Flotilla · Gestión', subtitle: 'Asignación y control de vehículos del equipo.' },
  tools: { title: 'Herramientas', subtitle: 'Inventario de herramientas y equipos de campo.' },
  projects: { title: 'Proyectos OPS', subtitle: 'Proyectos de implementación y entrega en sitio.' },
  maintenance: { title: 'Mantenimiento', subtitle: 'Órdenes de mantenimiento preventivo y correctivo.' },
  'maintenance-contracts': { title: 'Contratos de mantenimiento', subtitle: 'Acuerdos de servicio y SLA con clientes.' },
  'service-clients': { title: 'Clientes de servicio', subtitle: 'Cuentas con contrato de soporte o mantenimiento.' },
  support: { title: 'Tickets de soporte', subtitle: 'Bandeja de solicitudes y escalaciones del equipo.' },
  gps: { title: 'GPS en vivo', subtitle: 'Rastreo de cuadrillas y unidades en tiempo real.' },
  recruiting: { title: 'Reclutamiento', subtitle: 'Pipeline de candidatos y vacantes operativas.' },
};

/** Módulos OPS de gestión de equipo — permisos derivados de actividades. */
export function getOpsTeamSectionConfig(
  user: UserAccessInput | null | undefined,
  module: OpsTeamModule = 'vehicles',
): SectionConfig {
  const base = getActivitiesSectionConfig(user);
  const copy = OPS_TEAM_COPY[module];
  const v2 = resolveV2RoleKey(user);

  if (module === 'gps') {
    const teamView = base.viewMode !== 'execute';
    return {
      ...base,
      defaultScope: teamView ? 'team' : 'self',
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      title: copy.title,
      subtitle: teamView
        ? 'Ubicación de todas las cuadrillas activas en el mapa.'
        : 'Tu última ubicación reportada desde la app móvil.',
    };
  }

  if (module === 'recruiting' && v2 === ROLES.RH) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canAssign: true,
      canApprove: true,
      title: copy.title,
      subtitle: 'Gestión de candidatos y etapas del proceso de selección.',
    };
  }

  if (module === 'tools' && v2 && isFieldRole(v2)) {
    return {
      viewMode: 'execute',
      defaultScope: 'self',
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      title: 'Mis herramientas',
      subtitle: 'Solicita y da seguimiento a herramientas asignadas.',
    };
  }

  if (module === 'maintenance-contracts') {
    return {
      ...base,
      canCreate: false,
      canDelete: false,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }

  return { ...base, title: copy.title, subtitle: copy.subtitle };
}

// ─── ERP · inventario / compras ────────────────────────────────────────────

type ErpInventoryModule = 'warehouse' | 'procurement';

const ERP_INVENTORY_COPY: Record<ErpInventoryModule, { title: string; subtitle: string }> = {
  warehouse: { title: 'Almacén', subtitle: 'Stock, ubicaciones y mínimos de inventario.' },
  procurement: { title: 'Compras', subtitle: 'Órdenes de compra y aprobación de adquisiciones.' },
};

export function getErpInventorySectionConfig(
  user: UserAccessInput | null | undefined,
  module: ErpInventoryModule = 'warehouse',
): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  const copy = ERP_INVENTORY_COPY[module];
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: false,
      canApprove: module === 'procurement',
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (WAREHOUSE_ROLES.has(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: tier(v2) >= 70,
      canAssign: false,
      canApprove: module === 'procurement' && tier(v2) >= 60,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (v2 === ROLES.ADMINISTRATIVO) {
    return {
      viewMode: 'manage_execute',
      defaultScope: 'team',
      canCreate: module === 'procurement',
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      title: module === 'procurement' ? 'Compras · Solicitudes' : 'Almacén · Consulta',
      subtitle: module === 'procurement'
        ? 'Solicita órdenes de compra — requieren aprobación de dirección.'
        : 'Consulta existencias y ubicaciones de inventario.',
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: copy.title,
    subtitle: copy.subtitle,
  };
}

// ─── ERP · finanzas ────────────────────────────────────────────────────────

type ErpFinanceModule = 'accounting' | 'banking' | 'invoicing' | 'employee-payments' | 'exports';

const ERP_FINANCE_COPY: Record<ErpFinanceModule, { title: string; subtitle: string }> = {
  accounting: { title: 'Contabilidad', subtitle: 'Pólizas, catálogo de cuentas y cierre mensual.' },
  banking: { title: 'Banca y conciliación', subtitle: 'Cuentas bancarias, movimientos y conciliación.' },
  invoicing: { title: 'Facturación CFDI', subtitle: 'Emisión, timbrado y cancelación de facturas.' },
  'employee-payments': { title: 'Pagos a empleados', subtitle: 'Dispersiones, anticipos y complementos de nómina.' },
  exports: { title: 'Exportaciones contables', subtitle: 'Descarga de layouts para SAT y sistemas externos.' },
};

export function getErpFinanceSectionConfig(
  user: UserAccessInput | null | undefined,
  module: ErpFinanceModule = 'accounting',
): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  const copy = ERP_FINANCE_COPY[module];
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: module !== 'exports',
      canEdit: true,
      canDelete: module !== 'exports',
      canAssign: false,
      canApprove: true,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (!FINANCE_ROLES.has(v2)) {
    return {
      viewMode: 'execute',
      defaultScope: 'self',
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (v2 === ROLES.CONTABILIDAD) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: module !== 'exports',
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: module === 'accounting' || module === 'banking' || module === 'invoicing',
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (EXECUTIVE.has(v2) || v2 === ROLES.DIR_ADMIN) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: module !== 'exports',
      canEdit: true,
      canDelete: true,
      canAssign: false,
      canApprove: true,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (v2 === ROLES.COORD_ADMIN) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: module === 'accounting' || module === 'employee-payments',
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: module === 'accounting',
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  return {
    viewMode: 'manage',
    defaultScope: 'team',
    canCreate: false,
    canEdit: true,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: copy.title,
    subtitle: copy.subtitle,
  };
}

// ─── ERP · gobierno / comunicación interna ─────────────────────────────────

type ErpGovernanceModule = 'users' | 'companies' | 'settings' | 'documents' | 'kb' | 'news';

const ERP_GOV_COPY: Record<ErpGovernanceModule, { title: string; subtitle: string }> = {
  users: { title: 'Usuarios y roles', subtitle: 'Alta, permisos y organigrama de acceso.' },
  companies: { title: 'Empresas del grupo', subtitle: 'Razones sociales, RFC y configuración fiscal.' },
  settings: { title: 'Configuración global', subtitle: 'Parámetros del sistema — solo dirección.' },
  documents: { title: 'Documentos corporativos', subtitle: 'Políticas, contratos y flujo de aprobación.' },
  kb: { title: 'Base de conocimiento', subtitle: 'Artículos internos para el equipo NEXARA.' },
  news: { title: 'Comunicados internos', subtitle: 'Boletines y anuncios para toda la organización.' },
};

export function getErpGovernanceSectionConfig(
  user: UserAccessInput | null | undefined,
  module: ErpGovernanceModule = 'users',
): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  const copy = ERP_GOV_COPY[module];
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: true,
      canApprove: true,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (module === 'settings') {
    const isCeo = EXECUTIVE.has(v2);
    return {
      viewMode: isCeo ? 'manage' : 'execute',
      defaultScope: 'team',
      canCreate: isCeo,
      canEdit: isCeo,
      canDelete: isCeo,
      canAssign: false,
      canApprove: false,
      title: copy.title,
      subtitle: isCeo ? copy.subtitle : 'Consulta de parámetros — la edición es solo para CEO.',
    };
  }
  if (module === 'users' || module === 'companies') {
    const canManage = EXECUTIVE.has(v2) || v2 === ROLES.DIR_ADMIN || v2 === ROLES.RH;
    return {
      viewMode: canManage ? 'manage' : 'execute',
      defaultScope: 'team',
      canCreate: canManage,
      canEdit: canManage,
      canDelete: EXECUTIVE.has(v2) || v2 === ROLES.DIR_ADMIN,
      canAssign: canManage,
      canApprove: EXECUTIVE.has(v2) || v2 === ROLES.DIR_ADMIN,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  if (ERP_ADMIN.has(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: tier(v2) >= 70,
      canAssign: false,
      canApprove: true,
      title: copy.title,
      subtitle: copy.subtitle,
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: copy.title,
    subtitle: copy.subtitle,
  };
}

// ─── Studio · marketing ────────────────────────────────────────────────────

type StudioModule = 'social' | 'news' | 'cases' | 'contacts';

const STUDIO_MANAGERS = new Set<RoleKey>([ROLES.LIDER_DISENO, ROLES.CEO, ROLES.DIR_ADMIN]);
const STUDIO_COPY: Record<StudioModule, { manager: { title: string; subtitle: string }; creator: { title: string; subtitle: string } }> = {
  social: {
    manager: { title: 'Redes sociales', subtitle: 'Calendario editorial y publicaciones del equipo.' },
    creator: { title: 'Mis publicaciones', subtitle: 'Borradores y posts programados por ti.' },
  },
  news: {
    manager: { title: 'Noticias del sitio', subtitle: 'Artículos públicos y comunicados en nexara.com.mx.' },
    creator: { title: 'Mis borradores', subtitle: 'Publicaciones que estás preparando.' },
  },
  cases: {
    manager: { title: 'Casos de éxito', subtitle: 'Portafolio de proyectos destacados en el sitio.' },
    creator: { title: 'Mis casos', subtitle: 'Casos que estás documentando para el portafolio.' },
  },
  contacts: {
    manager: { title: 'Contactos del sitio', subtitle: 'Leads y mensajes del formulario web.' },
    creator: { title: 'Contactos', subtitle: 'Consulta mensajes recibidos — sin eliminar.' },
  },
};

export function getStudioSectionConfig(
  user: UserAccessInput | null | undefined,
  module: StudioModule = 'social',
): SectionConfig {
  const v2 = resolveV2RoleKey(user);
  const copy = STUDIO_COPY[module];
  if (!v2 || user?.isSuperAdmin) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canAssign: true,
      canApprove: true,
      title: copy.manager.title,
      subtitle: copy.manager.subtitle,
    };
  }
  if (STUDIO_MANAGERS.has(v2)) {
    return {
      viewMode: 'manage',
      defaultScope: 'team',
      canCreate: true,
      canEdit: true,
      canDelete: tier(v2) >= 70,
      canAssign: true,
      canApprove: true,
      title: copy.manager.title,
      subtitle: copy.manager.subtitle,
    };
  }
  if (v2 === ROLES.DISENADOR) {
    return {
      viewMode: 'execute',
      defaultScope: 'self',
      canCreate: module !== 'contacts',
      canEdit: true,
      canDelete: false,
      canAssign: false,
      canApprove: false,
      title: copy.creator.title,
      subtitle: copy.creator.subtitle,
    };
  }
  return {
    viewMode: 'execute',
    defaultScope: 'self',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canAssign: false,
    canApprove: false,
    title: copy.manager.title,
    subtitle: copy.manager.subtitle,
  };
}
