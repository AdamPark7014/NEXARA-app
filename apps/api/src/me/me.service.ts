import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import {
  ALMACEN_POR_CORREO_URL_RULES,
  MESA_CONTABLE_POR_CORREO_URL_RULES,
  listAllowedUrls,
  type UrlRule,
} from '../common/rbac/url-matrix.js';
import { canManageAlmacen } from '../warehouse/almacen-access.js';
import { canUsarMesaContable } from '../accounting/mesa-contable/mesa-por-correo.js';
import { ALL_ROLES, ROLES_ENCARGADOS_DE_AREA, type RoleKey } from '../common/rbac/roles.v2.js';
import { deriveModuleKeysFromPaths } from './navigation-module-map.js';
import { applyModuleAccessOverrides, parseModuleAccess } from './module-access-merge.js';
import { ModulePolicyService } from '../common/tenant/module-policy.service.js';
import { aplicarPoliticaANavegacion } from '../common/tenant/module-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TeamBoardService } from './team-board.service.js';
import { puedeDisenarCctvSegunGente } from '../cctv-disenos/acceso-cctv.js';

/** Diseñador de videovigilancia: la matriz se lo abre a soporte, RH, contabilidad y diseño, pero solo entra quien lleva gente. */
const MODULO_CCTV = 'erp-videovigilancia';
/** Desempeño del equipo: solo quien ve a alguien más; quien solo se ve a sí mismo lo tiene en su inicio (Adam, 11-11). */
const MODULO_DESEMPENO = 'kpis-equipo';

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
    private readonly prisma: PrismaService,
    private readonly teamBoard: TeamBoardService,
  ) {}

  async navigation(userId: number, companyId?: number | null) {
    const profile = await this.auth.getProfile(userId);
    const roleKeyRaw = profile?.roleKey as string | null | undefined;
    const roleKey: RoleKey | null =
      roleKeyRaw && (ALL_ROLES as string[]).includes(roleKeyRaw)
        ? (roleKeyRaw as RoleKey)
        : null;

    // Almacén (Iván) y Mesa contable (Contadora General) concedidos por persona: también le abren el
    // módulo en el menú de la web y las apps.
    const rules: UrlRule[] = roleKey
      ? [
          ...listAllowedUrls(roleKey),
          ...(canManageAlmacen(profile?.email) ? ALMACEN_POR_CORREO_URL_RULES : []),
          ...(canUsarMesaContable(profile?.email) ? MESA_CONTABLE_POR_CORREO_URL_RULES : []),
        ]
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
    // Sin gente a cargo, soporte (Carolina, Alejandro) no ve el diseñador aunque su rol lo abra.
    if (
      (recortada.webModuleIds.includes(MODULO_CCTV) || recortada.moduleKeys.includes(MODULO_CCTV)) &&
      !(await puedeDisenarCctvSegunGente(this.prisma, {
        id: userId,
        roleKey: roleKeyRaw ?? null,
        isSuperAdmin: roleKey === 'super_admin',
        email: profile?.email ?? null,
      }))
    ) {
      recortada.webModuleIds = recortada.webModuleIds.filter((m) => m !== MODULO_CCTV);
      recortada.moduleKeys = recortada.moduleKeys.filter((m) => m !== MODULO_CCTV);
      recortada.hiddenModuleIds = [...new Set([...recortada.hiddenModuleIds, MODULO_CCTV])].sort();
    }
    if (recortada.webModuleIds.includes(MODULO_DESEMPENO) || recortada.moduleKeys.includes(MODULO_DESEMPENO)) {
      const { companyWide, scoped } = await this.teamBoard.resolveScope(
        { id: userId, roleKey: roleKeyRaw ?? null, email: profile?.email ?? null, isSuperAdmin: roleKey === 'super_admin' },
        companyId ?? null,
      );
      if (!companyWide && !scoped.some((u) => u.id !== userId)) {
        recortada.webModuleIds = recortada.webModuleIds.filter((m) => m !== MODULO_DESEMPENO);
        recortada.moduleKeys = recortada.moduleKeys.filter((m) => m !== MODULO_DESEMPENO);
        recortada.hiddenModuleIds = [...new Set([...recortada.hiddenModuleIds, MODULO_DESEMPENO])].sort();
      }
    }
    if (companyId && recortada.webModuleIds.includes('supervision')) {
      const esEncargado = roleKey && ROLES_ENCARGADOS_DE_AREA.includes(roleKey);
      const tieneGente = await this.prisma.user.findFirst({
        where: { managerId: userId, isActive: true, companyMemberships: { some: { companyId } } },
        select: { id: true },
      });
      if (!esEncargado && !tieneGente && !['ceo', 'dir_operaciones'].includes(roleKeyRaw ?? '')) {
        recortada.webModuleIds = recortada.webModuleIds.filter((m) => m !== 'supervision');
        recortada.moduleKeys = recortada.moduleKeys.filter((m) => m !== 'supervision');
        recortada.hiddenModuleIds = [...new Set([...recortada.hiddenModuleIds, 'supervision'])];
      }
    }
    const webModuleIds = recortada.webModuleIds;
    const moduleKeys = recortada.moduleKeys;
    const porEstrenar = (await this.modulosPorEstrenar(companyId ?? null)).filter((m) => webModuleIds.includes(m));

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
      porEstrenar,
      rules: rules.map((r) => ({
        path: r.path,
        methods: r.methods ?? null,
        scope: r.scope ?? null,
      })),
    };
  }

  /**
   * Módulos que la empresa no ha estrenado: ni un registro. El menú los deja al final, plegados, para que
   * no estorben y sigan a la mano el día que alguien los use (Adam, 15-11).
   */
  private async modulosPorEstrenar(companyId: number | null): Promise<string[]> {
    if (!companyId) return [];
    try {
      const donde = { companyId };
      const [stock, movimientos, documentos, requisiciones, ordenes] = await Promise.all([
        this.prisma.stockLevel.count({ where: donde }),
        this.prisma.stockMovement.count({ where: donde }),
        this.prisma.managedDocument.count({ where: donde }),
        this.prisma.purchaseRequisition.count({ where: donde }),
        this.prisma.purchaseOrder.count({ where: donde }),
      ]);
      const ids: string[] = [];
      if (stock + movimientos === 0) ids.push('erp-almacen', 'warehouse');
      if (documentos === 0) ids.push('documents');
      if (requisiciones + ordenes === 0) ids.push('procurement');
      return ids;
    } catch {
      return [];
    }
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
