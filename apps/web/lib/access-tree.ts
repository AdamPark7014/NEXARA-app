export type AccessMode = 'off' | 'on' | 'supervise' | 'deliver' | 'both';
export type AccessModeKind = 'toggle' | 'pair';

export type AccessTreeModule = {
  key: string;
  label: string;
  modeKind: AccessModeKind;
  /** toggle: ModuleId web */
  moduleId?: string;
  /** pair: ModuleId team / self */
  teamModuleId?: string;
  selfModuleId?: string;
};

export type AccessTreePanel = {
  id: string;
  label: string;
  modules: AccessTreeModule[];
};

export type ModuleAccessMap = Record<string, AccessMode>;

function toggle(key: string, label: string): AccessTreeModule {
  return { key, label, modeKind: 'toggle', moduleId: key };
}

function pair(key: string, label: string, team: string, self: string): AccessTreeModule {
  return { key, label, modeKind: 'pair', teamModuleId: team, selfModuleId: self };
}

/** Árbol editable en Usuarios: subplataforma → módulos → modo. */
export const ACCESS_TREE: AccessTreePanel[] = [
  {
    id: 'core',
    label: 'NEXARA Core',
    modules: [
      toggle('reuniones', 'Reuniones'),
      toggle('approvals', 'Aprobaciones'),
      toggle('warehouse', 'Inventario'),
      toggle('procurement', 'Compras'),
      toggle('documents', 'Documentos'),
    ],
  },
  {
    id: 'finance',
    label: 'Contabilidad',
    modules: [
      toggle('accounting', 'Contabilidad'),
      toggle('invoicing', 'Facturación CFDI'),
      toggle('banking', 'Bancos'),
      toggle('viatics-admin', 'Viáticos (admin)'),
      toggle('expenses-admin', 'Gastos (admin)'),
      toggle('employee-payments', 'Pagos a personal'),
    ],
  },
  {
    id: 'hr',
    label: 'RRHH',
    modules: [
      toggle('hr', 'Plantilla RRHH'),
      toggle('fines', 'Incidencias / multas'),
      toggle('orgchart', 'Organigrama'),
    ],
  },
  {
    id: 'ops',
    label: 'Operaciones corporativas',
    modules: [
      pair('ops-activities', 'Actividades (OT)', 'ops-activities', 'ops-my-activities'),
      pair('ops-viatics', 'Viáticos de campo', 'ops-viatics', 'ops-my-viatics'),
      pair('ops-vehicles', 'Vehículos', 'ops-vehicles', 'ops-my-vehicles'),
      toggle('attendance', 'Asistencia / comidas'),
      toggle('ops-dispatch', 'Despacho'),
      toggle('ops-tools', 'Herramientas'),
      toggle('ops-maintenance', 'Mantenimiento'),
      toggle('ops-noc', 'NOC'),
      toggle('ops-support-inbox', 'Soporte'),
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    modules: [
      toggle('crm-leads', 'Leads'),
      toggle('crm-opportunities', 'Pipeline'),
      toggle('crm-clients', 'Clientes'),
      toggle('crm-products', 'Catálogo'),
      toggle('crm-quotes', 'Cotizaciones'),
      toggle('crm-agenda', 'Agenda comercial'),
    ],
  },
  {
    id: 'integra',
    label: 'Integra',
    modules: [
      toggle('integra-access', 'Accesos'),
      toggle('integra-video', 'Video'),
      toggle('integra-people', 'Personas ACS'),
      toggle('integra-events', 'Eventos'),
    ],
  },
  {
    id: 'studio',
    label: 'Studio',
    modules: [
      toggle('studio-pages', 'Páginas'),
      toggle('studio-news', 'Blog / noticias'),
      toggle('studio-leads', 'Leads del sitio'),
    ],
  },
];

const MODE_SET = new Set<AccessMode>(['off', 'on', 'supervise', 'deliver', 'both']);

export function isAccessMode(v: unknown): v is AccessMode {
  return typeof v === 'string' && MODE_SET.has(v as AccessMode);
}

export function normalizeModuleAccess(raw: unknown): ModuleAccessMap | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const map: ModuleAccessMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isAccessMode(value)) map[key] = value;
  }
  return Object.keys(map).length ? map : null;
}

/** Inferir modos visibles a partir de webModuleIds del rol (preview). */
export function defaultModesFromWebModuleIds(ids: string[]): ModuleAccessMap {
  const set = new Set(ids);
  const map: ModuleAccessMap = {};
  for (const mod of ACCESS_TREE.flatMap((p) => p.modules)) {
    if (mod.modeKind === 'pair' && mod.teamModuleId && mod.selfModuleId) {
      const team = set.has(mod.teamModuleId);
      const self = set.has(mod.selfModuleId);
      if (team && self) map[mod.key] = 'both';
      else if (team) map[mod.key] = 'supervise';
      else if (self) map[mod.key] = 'deliver';
      else map[mod.key] = 'off';
    } else {
      const id = mod.moduleId ?? mod.key;
      map[mod.key] = set.has(id) ? 'on' : 'off';
    }
  }
  return map;
}

const MODE_LABEL: Record<AccessMode, string> = {
  off: 'off',
  on: 'on',
  supervise: 'supervisa',
  deliver: 'entrega',
  both: 'ambas',
};

export function summarizeModuleAccess(map: ModuleAccessMap | null): string {
  if (!map) return 'Según plantilla del rol (sin ajustes)';
  const bits: string[] = [];
  for (const panel of ACCESS_TREE) {
    for (const mod of panel.modules) {
      const mode = map[mod.key];
      if (!mode || mode === 'off') continue;
      bits.push(`${mod.label}: ${MODE_LABEL[mode]}`);
    }
  }
  if (!bits.length) return 'Todos los módulos del árbol en off (dentro del techo del rol)';
  return bits.slice(0, 8).join(' · ') + (bits.length > 8 ? '…' : '');
}

/** ¿El panel tiene al menos un módulo no-off? */
export function panelHasAccess(map: ModuleAccessMap, panelId: string): boolean {
  const panel = ACCESS_TREE.find((p) => p.id === panelId);
  if (!panel) return false;
  return panel.modules.some((m) => {
    const mode = map[m.key];
    return mode && mode !== 'off';
  });
}
