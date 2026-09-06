import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { listAllowedUrls, type UrlRule } from '../common/rbac/url-matrix.js';
import { ALL_ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { deriveModuleKeysFromPaths } from './navigation-module-map.js';

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
  constructor(private readonly auth: AuthService) {}

  async navigation(userId: number) {
    const profile = await this.auth.getProfile(userId);
    const roleKeyRaw = profile?.roleKey as string | null | undefined;
    const roleKey: RoleKey | null =
      roleKeyRaw && (ALL_ROLES as string[]).includes(roleKeyRaw)
        ? (roleKeyRaw as RoleKey)
        : null;

    const rules: UrlRule[] = roleKey ? listAllowedUrls(roleKey) : [];
    const paths = rules.map((r) => r.path);
    const panels = this.derivePanels(paths);
    const { moduleKeys, webModuleIds } = deriveModuleKeysFromPaths(paths);

    return {
      roleKey: roleKeyRaw ?? null,
      orgRoleKey: profile?.orgRoleKey ?? null,
      panels,
      paths,
      /** Claves Android ModuleCatalog — fuente para menú nativo. */
      moduleKeys,
      /** ModuleId web access-matrix — fuente para AppShell / CommandPalette. */
      webModuleIds,
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
