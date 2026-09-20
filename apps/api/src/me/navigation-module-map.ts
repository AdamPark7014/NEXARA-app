/**
 * Mapa canónico path (url-matrix) → claves de módulo.
 * Emite AMBOS namespaces: Android ModuleCatalog.key y web access-matrix ModuleId.
 * Así /me/navigation integra clientes sin que uno clippee al otro.
 */
export type PathModuleHint = {
  match: RegExp;
  /** Claves Android (ModuleCatalog) */
  android: string[];
  /** ModuleId web (access-matrix) — opcional */
  web?: string[];
};

/**
 * Módulos de Core que la web registra en `CORE_OLA1_MODULE_IDS` y que las apps listan en «Más».
 * Misma clave en los dos espacios de nombres. `url` es la página canónica: un comodín de panel
 * (`/erp/**` de CEO y Dir. Administrativa, `/**` del super admin) los abre todos, porque esas
 * reglas no nombran cada página y sin esto la app no les mostraba ninguno.
 */
export const CORE_EXTRA_MODULES: ReadonlyArray<{ key: string; url: string }> = [
  { key: 'erp-cotizaciones', url: '/erp/cotizaciones' },
  { key: 'erp-proyectos', url: '/erp/proyectos' },
  { key: 'kpis-equipo', url: '/erp/asistencias/indicadores' },
  { key: 'erp-almacen', url: '/erp/almacen' },
  { key: 'erp-herramientas', url: '/erp/almacen/herramientas' },
  { key: 'erp-vehiculos', url: '/erp/vehiculos' },
  { key: 'erp-organigrama', url: '/erp/organigrama' },
];

/** Comodines que abren un panel entero: devuelve su base (`''` = todo). */
function panelWildcardBase(path: string): string | null {
  if (path === '/**') return '';
  if (path === '/erp/**') return '/erp';
  return null;
}

export const PATH_MODULE_HINTS: PathModuleHint[] = [
  // Core «Más». Anclados a /erp: `/erp/actividades/proyectos` no es Proyectos, y
  // `/erp/almacen/herramientas` (todo el personal) no abre el Almacén.
  { match: /^\/erp\/cotizaciones(\/|$)/, android: ['erp-cotizaciones'], web: ['erp-cotizaciones'] },
  { match: /^\/erp\/proyectos(\/|$)/, android: ['erp-proyectos'], web: ['erp-proyectos'] },
  { match: /^\/erp\/asistencias\/indicadores(\/|$)/, android: ['kpis-equipo'], web: ['kpis-equipo'] },
  { match: /^\/erp\/almacen(\/\*\*)?$/, android: ['erp-almacen'], web: ['erp-almacen'] },
  { match: /^\/erp\/almacen\/herramientas(\/|$)/, android: ['erp-herramientas'], web: ['erp-herramientas'] },
  { match: /^\/erp\/vehiculos(\/|$)/, android: ['erp-vehiculos'], web: ['erp-vehiculos'] },
  { match: /^\/erp\/organigrama(\/|$)/, android: ['erp-organigrama'], web: ['erp-organigrama'] },
  { match: /\/my-profile|\/users\/profile/, android: ['my-profile'], web: ['my-profile'] },
  { match: /user-preferences|my-preferences/, android: ['my-preferences'], web: ['my-preferences'] },
  { match: /\/calendar/, android: ['calendar'], web: ['calendar'] },
  { match: /\/mis-actividades/, android: ['mis-actividades'], web: ['mis-actividades'] },
  { match: /\/pizarra/, android: ['pizarra'], web: ['pizarra'] },
  { match: /\/asistencias/, android: ['asistencias'], web: ['asistencias'] },
  { match: /\/clientes/, android: ['erp-clients'], web: ['erp-clients'] },
  { match: /\/actividades\/diarias/, android: ['activities-daily'], web: ['activities-daily'] },
  { match: /\/actividades\/proyectos/, android: ['activities-projects'], web: ['activities-projects'] },
  { match: /\/actividades\/servicios/, android: ['activities-services'], web: ['activities-services'] },
  {
    match: /\/dashboard/,
    android: ['dashboard'],
    web: ['dashboard', 'crm-dashboard', 'ops-dashboard', 'studio-dashboard'],
  },
  { match: /\/chat/, android: ['chat'], web: ['chat', 'ops-chat'] },
  {
    match: /\/attendance|\/lunch-breaks/,
    android: ['attendance', 'lunch-breaks', 'my-lunch-breaks'],
    web: ['attendance', 'lunch-breaks'],
  },
  {
    match: /\/activities|\/my-activities/,
    android: ['activities', 'my-activities'],
    web: ['ops-activities', 'ops-my-activities'],
  },
  {
    match: /\/evidences|\/my-evidences/,
    android: ['evidences', 'my-evidences'],
    web: ['ops-evidences', 'ops-my-evidences'],
  },
  {
    match: /\/finance\/viatics|\/viatic/,
    android: ['viatics', 'my-viatics'],
    web: ['ops-viatics', 'ops-my-viatics', 'viatics-admin'],
  },
  {
    match: /\/finance\/expenses|\/expenses/,
    android: ['expenses'],
    web: ['expenses-admin'],
  },
  {
    match: /\/vehicles/,
    android: ['vehicles', 'my-vehicles'],
    web: ['ops-vehicles', 'ops-my-vehicles'],
  },
  { match: /\/gps/, android: ['gps'], web: ['ops-gps'] },
  { match: /\/tool/, android: ['tools'], web: ['ops-tools'] },
  { match: /\/dispatch/, android: ['dispatch'], web: ['ops-dispatch'] },
  { match: /\/recruiting/, android: ['recruiting'], web: ['ops-recruiting'] },
  {
    match: /\/support|\/noc|\/client-tickets/,
    android: ['support', 'noc', 'client-tickets', 'support-sla'],
    web: ['ops-support-inbox', 'ops-noc', 'ops-client-tickets'],
  },
  { match: /\/service-sheets/, android: ['service-sheets'], web: ['ops-service-sheets'] },
  { match: /\/service-clients/, android: ['service-clients'], web: ['ops-service-clients'] },
  { match: /\/maintenance/, android: ['maintenance', 'maintenance-contracts', 'assets'], web: ['ops-maintenance', 'ops-assets'] },
  { match: /\/documents/, android: ['documents'], web: ['documents'] },
  {
    match: /\/contabilidad|\/invoicing|\/accounting/,
    android: ['invoicing', 'accounting', 'banking'],
    web: ['erp-contabilidad', 'invoicing', 'accounting', 'banking'],
  },
  { match: /\/procurement/, android: ['procurement'], web: ['procurement'] },
  {
    match: /\/warehouse|\/stock|\/inventor|\/catalog/,
    android: ['warehouse', 'stock'],
    web: ['warehouse'],
  },
  {
    match: /\/clients|\/cotizacion|\/quotes|\/ventas|\/smart-quote|\/leads|\/opportunities|\/pipeline/,
    android: ['clients', 'cotizaciones', 'ventas', 'gestion-vendedores'],
    web: ['crm-clients', 'crm-quotes', 'crm-leads', 'crm-opportunities', 'crm-pipeline'],
  },
  { match: /\/users/, android: ['users', 'hr'], web: ['users', 'hr'] },
  { match: /\/companies|\/company/, android: ['companies'], web: ['companies'] },
  { match: /\/approvals|\/workflow/, android: ['approvals'], web: ['approvals'] },
  { match: /\/notifications/, android: ['notifications-center'], web: ['notifications-center'] },
  { match: /\/executive|\/analytics|\/bi/, android: ['executive', 'analytics', 'bi'], web: ['executive', 'bi'] },
  { match: /\/audit/, android: ['audit'], web: ['audit'] },
  { match: /\/exports/, android: ['exports'], web: ['exports'] },
  { match: /\/architecture/, android: ['architecture'], web: ['architecture'] },
  { match: /\/kb|\/knowledge/, android: ['kb'], web: ['kb'] },
  { match: /\/settings/, android: ['settings'], web: ['settings'] },
  { match: /\/employee-payments/, android: ['employee-payments'], web: ['employee-payments'] },
  { match: /\/work-projects/, android: ['work-projects'], web: ['work-projects'] },
  { match: /\/contact-messages/, android: ['contact-messages'], web: ['contact-messages'] },
  { match: /\/news/, android: ['news'], web: ['news'] },
  { match: /\/newsletter/, android: ['newsletter'], web: ['newsletter'] },
  { match: /\/orgchart|\/kpis-hr/, android: ['orgchart', 'kpis-hr'], web: ['orgchart', 'kpis-hr'] },
  { match: /\/reuniones|\/meetings/, android: ['reuniones'], web: ['reuniones'] },
  { match: /\/fines/, android: ['fines'], web: ['fines'] },
  { match: /\/hr|\/leaves|\/cvs/, android: ['hr', 'cvs', 'fines'], web: ['hr', 'cvs'] },
  // INTEGRA — claves específicas (no ghost integra-acs)
  { match: /\/integra\/alarms/, android: ['integra-alarms'], web: ['integra-alarms'] },
  { match: /\/integra\/access/, android: ['integra-access'], web: ['integra-access'] },
  { match: /\/integra\/events/, android: ['integra-events'], web: ['integra-events'] },
  { match: /\/integra\/people/, android: ['integra-people'], web: ['integra-people'] },
  { match: /\/integra\/visitors/, android: ['integra-visitors'], web: ['integra-visitors'] },
  { match: /\/integra\/attendance/, android: ['integra-attendance'], web: ['integra-attendance'] },
  { match: /\/integra\/(settings|sites)/, android: ['integra-sites'], web: ['integra-sites'] },
  { match: /\/api\/integra\/occupancy/, android: ['integra-occupancy'], web: ['integra-access'] },
  { match: /\/api\/integra\/devices/, android: ['integra-devices'], web: ['integra-access'] },
  { match: /\/api\/integra\/alarms/, android: ['integra-alarms'], web: ['integra-alarms'] },
  { match: /\/integra(\/|$|\*\*)/, android: ['integra-home', 'integra-access', 'integra-events', 'integra-people', 'integra-visitors', 'integra-attendance', 'integra-alarms', 'integra-occupancy', 'integra-devices', 'integra-sites'], web: ['integra-home', 'integra-access', 'integra-events', 'integra-people', 'integra-visitors', 'integra-attendance', 'integra-alarms'] },
];

export function deriveModuleKeysFromPaths(paths: string[]): {
  moduleKeys: string[];
  webModuleIds: string[];
} {
  const android = new Set<string>(['my-profile', 'my-preferences', 'dashboard']);
  const web = new Set<string>(['my-profile', 'my-preferences', 'dashboard']);
  for (const path of paths) {
    const wildcard = panelWildcardBase(path);
    if (wildcard !== null) {
      for (const m of CORE_EXTRA_MODULES) {
        if (m.url === wildcard || m.url.startsWith(`${wildcard}/`)) {
          android.add(m.key);
          web.add(m.key);
        }
      }
    }
    for (const hint of PATH_MODULE_HINTS) {
      if (hint.match.test(path)) {
        for (const k of hint.android) android.add(k);
        for (const k of hint.web ?? []) web.add(k);
      }
    }
  }
  return {
    moduleKeys: [...android].sort(),
    webModuleIds: [...web].sort(),
  };
}
