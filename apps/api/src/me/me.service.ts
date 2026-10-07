import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { ALMACEN_POR_CORREO_URL_RULES, listAllowedUrls, type UrlRule } from '../common/rbac/url-matrix.js';
import { canManageAlmacen } from '../warehouse/almacen-access.js';
import { ALL_ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { deriveModuleKeysFromPaths } from './navigation-module-map.js';
import { applyModuleAccessOverrides, parseModuleAccess } from './module-access-merge.js';
import { ModulePolicyService } from '../common/tenant/module-policy.service.js';
import { aplicarPoliticaANavegacion } from '../common/tenant/module-policy.js';

/** Prefijo de panel web → PanelId móvil / hub. */
const PANEL_PREFIXES: Array<{ prefix: string; panel: string }> = [
  { prefix: '/erp', panel: 'erp' },
  { prefix: '/crm', panel: 'crm' },
  { prefix: '/ops', panel: 'ops' },
  { prefix: '/studio', panel: 'studio' },
  { prefix: '/integra', panel: 'integra' },
  { prefix: '/tickets', panel: 'portal' },
  { prefix: '/lab', panel: 'lab' },
];

@Injectable()
export class MeService {
  constructor(
    private readonly auth: AuthService,
    private readonly policy: ModulePolicyService,
  ) {}

  async navigation(userId: number, companyId?: number | null) {
    const profile = await this.auth.getProfile(userId);
    const roleKeyRaw = profile?.roleKey as string | null | undefined;
    const roleKey: RoleKey | null =
      roleKeyRaw && (ALL_ROLES as string[]).includes(roleKeyRaw)
        ? (roleKeyRaw as RoleKey)
        : null;

    // Almacén concedido por persona (Iván): también le abre el módulo en el menú de la web y las apps.
    const rules: UrlRule[] = roleKey
      ? [...listAllowedUrls(roleKey), ...(canManageAlmacen(profile?.email) ? ALMACEN_POR_CORREO_URL_RULES : [])]
      : [];
    const paths = rules.map((r) => r.path);
    const panels = this.derivePanels(paths);
    const derived = deriveModuleKeysFromPaths(paths);
    const moduleAccess = parseModuleAccess((profile as any)?.moduleAccess);
    // Política por empresa: quita los módulos que esta empresa reservó a otros roles. Los comodines
    // de panel (`/erp/**`) los abrirían todos, por eso se resta aquí y no en las rutas.
    const ocultos = await this.policy.ocultosPara(
      { roleKey: roleKeyRaw ?? null, isSuperAdmin: roleKey === 'super_admin' },
      companyId ?? null,
    );
    const recortada = aplicarPoliticaANavegacion(
      {
        webModuleIds: applyModuleAccessOverrides(derived.webModuleIds, moduleAccess),
        moduleKeys: derived.moduleKeys,
      },
      ocultos,
    );
    const webModuleIds = recortada.webModuleIds;
    const moduleKeys = recortada.moduleKeys;

    return {
      roleKey: roleKeyRaw ?? null,
      orgRoleKey: profile?.orgRoleKey ?? null,
      moduleAccess,
      panels,
      paths,
      /** Claves Android ModuleCatalog — fuente para menú nativo. */
      moduleKeys,
      /** ModuleId web access-matrix — fuente para AppShell / CommandPalette. */
      webModuleIds,
      /**
       * Módulos que la empresa le esconde a este rol aunque una ruta comodín los abra. La web los
       * descarta después del filtro por rutas; las apps ya los reciben recortados de `moduleKeys`.
       */
      hiddenModuleIds: recortada.hiddenModuleIds,
      rules: rules.map((r) => ({
        path: r.path,
        methods: r.methods ?? null,
        scope: r.scope ?? null,
      })),
    };
  }

  private derivePanels(paths: string[]): string[] {
    const set = new Set<string>();
    for (const path of paths) {
      for (const { prefix, panel } of PANEL_PREFIXES) {
        if (
          path === prefix ||
          path.startsWith(`${prefix}/`) ||
          path.startsWith(`${prefix}/**`) ||
          path.startsWith(prefix)
        ) {
          set.add(panel);
        }
      }
      if (path.startsWith('/api/integra')) set.add('integra');
      if (
        path.startsWith('/api/chat') ||
        path.startsWith('/api/viatic') ||
        path.startsWith('/api/attendance') ||
        path.startsWith('/api/documents') ||
        path.startsWith('/api/accounting')
      ) {
        set.add('erp');
      }
      if (
        path.startsWith('/api/activities') ||
        path.startsWith('/api/evidences') ||
        path.startsWith('/api/gps') ||
        path.startsWith('/api/vehicles')
      ) {
        set.add('ops');
      }
      if (
        path.startsWith('/api/cotizaciones') ||
        path.startsWith('/api/ventas') ||
        path.startsWith('/api/clients')
      ) {
        set.add('crm');
      }
    }
    return [...set].sort();
  }
}
