export const PERMISSIONS = {
  CONSOLE_ACCESS: 'console.access',
  CONSOLE_ADMIN: 'console.admin',
  PANEL_TIENDA: 'panel.tienda',
  PANEL_WEB: 'panel.web',
  PANEL_VENTAS: 'panel.ventas',
  SALES_VIEW: 'sales.view',
  SALES_MANAGE: 'sales.manage',
  SALES_REPORTS_VIEW: 'sales.reports.view',
  SALES_REPORTS_EXPORT: 'sales.reports.export',
  SALES_TEMPLATES_MANAGE: 'sales.templates.manage',
  SALES_AUDIT_VIEW: 'sales.audit.view',
  TENDERS_VIEW: 'tenders.view',
  TENDERS_MANAGE: 'tenders.manage',
  CRM_ACTIVITIES_VIEW: 'crm.activities.view',
  CRM_ACTIVITIES_MANAGE: 'crm.activities.manage',
  SALES_TARGETS_VIEW: 'sales.targets.view',
  SALES_TARGETS_MANAGE: 'sales.targets.manage',
  KB_VIEW: 'kb.view',
  KB_MANAGE: 'kb.manage',
  COMPANY_SETTINGS_VIEW: 'company.settings.view',
  COMPANY_SETTINGS_MANAGE: 'company.settings.manage',
  WORKFLOW_VIEW: 'workflow.view',
  WORKFLOW_MANAGE: 'workflow.manage',
  EXECUTIVE_DASHBOARD: 'executive.dashboard',
  // Paneles satélite
  PANEL_SUPPORT: 'panel.support',
  PANEL_NOC: 'panel.noc',
  PANEL_PEOPLE: 'panel.people',
  PANEL_LAB: 'panel.lab',
  NOC_VIEW: 'noc.view',
  NOC_MANAGE: 'noc.manage',
  SUPPORT_VIEW: 'support.view',
  SUPPORT_MANAGE: 'support.manage',
  PEOPLE_VIEW: 'people.view',
  PEOPLE_MANAGE: 'people.manage',
  LAB_ACCESS: 'lab.access',
  ACTIVITIES_VIEW: 'activities.view',
  ACTIVITIES_MANAGE: 'activities.manage',
  ACTIVITIES_EXPORT: 'activities.export',
  ACTIVITIES_IMPORT: 'activities.import',
  EVIDENCES_VIEW: 'evidences.view',
  EVIDENCES_CREATE: 'evidences.create',
  EVIDENCES_REVIEW: 'evidences.review',
  EVIDENCES_EXPORT: 'evidences.export',
  EVIDENCES_IMPORT: 'evidences.import',
  VIATICS_VIEW: 'viatics.view',
  VIATICS_CREATE: 'viatics.create',
  VIATICS_MANAGE: 'viatics.manage',
  VIATICS_EXPORT: 'viatics.export',
  VIATICS_IMPORT: 'viatics.import',
  VEHICLES_VIEW: 'vehicles.view',
  VEHICLES_REQUEST: 'vehicles.request',
  VEHICLES_REVIEW: 'vehicles.review',
  VEHICLES_INVENTORY: 'vehicles.inventory',
  VEHICLES_EXPORT: 'vehicles.export',
  VEHICLES_IMPORT: 'vehicles.import',
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MANAGE: 'attendance.manage',
  GPS_VIEW: 'gps.view',
  GPS_MANAGE: 'gps.manage',
  USERS_MANAGE: 'users.manage',
  USERS_REVIEW: 'users.review',
  ROLES_MANAGE: 'roles.manage',
  CONTABILIDAD_VIEW: 'contabilidad.view',
  CONTABILIDAD_MANAGE: 'contabilidad.manage',
  COTIZACIONES_ACCESS: 'cotizaciones.access',
  CVS_MANAGE: 'cvs.manage',
  CVS_ADMIN_REVIEW: 'cvs.admin.review',
  CVS_SUPERADMIN_REVIEW: 'cvs.superadmin.review',
  TOOLS_VIEW: 'tools.view',
  TOOLS_REQUEST: 'tools.request',
  TOOLS_MANAGE: 'tools.manage',
  TOOLS_INVENTORY: 'tools.inventory',
  FINES_VIEW: 'fines.view',
  FINES_MANAGE: 'fines.manage',
  LUNCH_BREAKS_VIEW: 'lunch_breaks.view',
  LUNCH_BREAKS_MANAGE: 'lunch_breaks.manage',
  CLIENTS_VIEW: 'clients.view',
  CLIENTS_MANAGE: 'clients.manage',

  // === ERP Industrial Permissions ===
  // Accounting
  ACCOUNTING_VIEW: 'accounting.view',
  ACCOUNTING_MANAGE: 'accounting.manage',
  ACCOUNTING_POST: 'accounting.post',
  ACCOUNTING_CLOSE_PERIOD: 'accounting.close_period',

  // Invoicing
  INVOICING_VIEW: 'invoicing.view',
  INVOICING_MANAGE: 'invoicing.manage',

  // Banking
  BANKING_VIEW: 'banking.view',
  BANKING_MANAGE: 'banking.manage',
  BANKING_RECONCILE: 'banking.reconcile',

  // Advanced Inventory
  WAREHOUSE_VIEW: 'warehouse.view',
  WAREHOUSE_MANAGE: 'warehouse.manage',
  STOCK_VIEW: 'stock.view',
  STOCK_MANAGE: 'stock.manage',

  // Procurement
  PROCUREMENT_VIEW: 'procurement.view',
  PROCUREMENT_REQUEST: 'procurement.request',
  PROCUREMENT_APPROVE: 'procurement.approve',
  PROCUREMENT_MANAGE: 'procurement.manage',

  // Maintenance (contratos de mantenimiento a clientes)
  MAINTENANCE_VIEW: 'maintenance.view',
  MAINTENANCE_MANAGE: 'maintenance.manage',
  ASSETS_VIEW: 'assets.view',
  ASSETS_MANAGE: 'assets.manage',

  // Document Management
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_MANAGE: 'documents.manage',
  DOCUMENTS_APPROVE: 'documents.approve',

  // Audit
  AUDIT_VIEW: 'audit.view',

  // BI / Analytics
  BI_VIEW: 'bi.view',
  BI_MANAGE: 'bi.manage',

  // HR
  HR_VIEW: 'hr.view',
  HR_MANAGE: 'hr.manage',
  HR_APPROVE_LEAVE: 'hr.approve.leave',

  // Global Search
  SEARCH_VIEW: 'search.view',

  // Product catalog (IT/CCTV)
  CATALOG_VIEW: 'catalog.view',
  CATALOG_MANAGE: 'catalog.manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
