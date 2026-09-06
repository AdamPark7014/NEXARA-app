import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { listAllowedUrls, type UrlRule } from '../common/rbac/url-matrix.js';
import { ALL_ROLES, type RoleKey } from '../common/rbac/roles.v2.js';

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

/**
 * Mapa path URL → claves de módulo del catálogo nativo (ModuleCatalog).
 * Suficiente para que Android deje de clippear por substring de rol.
 */
const PATH_MODULE_HINTS: Array<{ match: RegExp; keys: string[] }> = [
  { match: /\/my-profile|\/users\/profile/, keys: ['my-profile'] },
  { match: /user-preferences|my-preferences/, keys: ['my-preferences'] },
  { match: /\/calendar/, keys: ['calendar'] },
  { match: /\/dashboard/, keys: ['dashboard'] },
  { match: /\/chat/, keys: ['chat'] },
  { match: /\/attendance|\/lunch-breaks/, keys: ['attendance', 'lunch-breaks', 'my-lunch-breaks'] },
  { match: /\/activities|\/my-activities/, keys: ['activities', 'my-activities'] },
  { match: /\/evidences|\/my-evidences/, keys: ['evidences', 'my-evidences'] },
  { match: /\/viatic|\/expenses/, keys: ['viatics', 'my-viatics', 'expenses'] },
  { match: /\/vehicles/, keys: ['vehicles', 'my-vehicles'] },
  { match: /\/gps/, keys: ['gps'] },
  { match: /\/tool/, keys: ['tools'] },
  { match: /\/dispatch/, keys: ['dispatch'] },
  { match: /\/recruiting/, keys: ['recruiting'] },
  { match: /\/support|\/noc|\/client-tickets/, keys: ['support', 'noc', 'client-tickets'] },
  { match: /\/service-sheets/, keys: ['service-sheets'] },
  { match: /\/documents/, keys: ['documents'] },
  { match: /\/invoicing|\/accounting\/invoices/, keys: ['invoicing', 'accounting'] },
  { match: /\/procurement/, keys: ['procurement'] },
  { match: /\/warehouse|\/stock|\/inventor|\/catalog/, keys: ['warehouse', 'stock'] },
  { match: /\/clients|\/cotizacion|\/quotes|\/ventas|\/smart-quote/, keys: ['clients', 'cotizaciones', 'ventas'] },
  { match: /\/users/, keys: ['users', 'hr'] },
  { match: /\/companies|\/company/, keys: ['companies'] },
  { match: /\/approvals|\/workflow/, keys: ['approvals'] },
  { match: /\/notifications/, keys: ['notifications-center'] },
  { match: /\/integra/, keys: ['integra-access', 'integra-events', 'integra-people', 'integra-acs', 'integra-visitors'] },
  { match: /\/fines/, keys: ['fines'] },
  { match: /\/hr|\/leaves|\/cvs/, keys: ['hr', 'cvs', 'fines'] },
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
    const moduleKeys = this.deriveModuleKeys(paths);

    return {
      roleKey: roleKeyRaw ?? null,
      orgRoleKey: profile?.orgRoleKey ?? null,
      panels,
      paths,
      moduleKeys,
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
        if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}/**`) || path.startsWith(prefix)) {
          set.add(panel);
        }
      }
      if (path.startsWith('/api/integra')) set.add('integra');
      if (path.startsWith('/api/chat') || path.startsWith('/api/viatic') || path.startsWith('/api/attendance')) {
        set.add('erp');
      }
      if (path.startsWith('/api/activities') || path.startsWith('/api/evidences') || path.startsWith('/api/gps')) {
        set.add('ops');
      }
      if (path.startsWith('/api/cotizaciones') || path.startsWith('/api/ventas') || path.startsWith('/api/clients')) {
        set.add('crm');
      }
    }
    return [...set].sort();
  }

  private deriveModuleKeys(paths: string[]): string[] {
    const set = new Set<string>(['my-profile', 'my-preferences', 'dashboard']);
    for (const path of paths) {
      for (const hint of PATH_MODULE_HINTS) {
        if (hint.match.test(path)) {
          for (const k of hint.keys) set.add(k);
        }
      }
    }
    return [...set].sort();
  }
}
