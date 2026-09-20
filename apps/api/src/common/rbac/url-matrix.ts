/**
 * NEXARA · RBAC v2 — Matriz de URLs por Rol
 * ------------------------------------------
 * Define EXPLÍCITAMENTE qué URLs (rutas web y endpoints API) puede tocar
 * cada rol. Es una whitelist por prefijo + patrón regex.
 *
 *   ✅ Whitelist por defecto (todo lo no listado se NIEGA).
 *   ✅ Un mismo path se puede declarar con scopes: read / write / approve.
 *   ✅ Soporta comodines: ":id", "*", "**".
 *
 * Esta es la única fuente que consulta:
 *   - `UrlAccessGuard` (backend) — para endpoints API
 *   - `middleware.ts` (Next.js)  — para páginas web
 *   - `useCanAccess()` (frontend) — para esconder botones/secciones en UI
 *
 * Convención de paths (canónica, alineada con `apps/web/app/(panels)/*`):
 *   /erp/...     → ERP (CEO, directores, admin, RH, contabilidad)
 *   /crm/...     → CRM (vendedores, coord. ventas)
 *   /ops/...     → Operación (ingenieros campo, soporte, NOC)
 *   /studio/...  → Web/Marketing (diseñadores)
 *   /tickets/... → Cliente externo
 *   /api/...     → Endpoints API (backend)
 *
 * Aliases legacy (`/core`, `/sales`, `/portal`) se normalizan vía
 * `normalizeUrlToCanonical()` para no romper bookmarks viejos.
 */
import { ROLES, type RoleKey } from './roles.v2.js';

export type Scope = 'read' | 'write' | 'approve' | 'admin';

export type UrlRule = {
  /** Prefijo de ruta o patrón. Ej: "/api/activities", "/erp/users", "/erp/users/:id" */
  path: string;
  /** Métodos HTTP permitidos. Omitir = todos. */
  methods?: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  /** Scope semántico (informativo + para UI). */
  scope?: Scope;
};

/** API + páginas de asistencia personal (check-in propio). Alineado con `SELF_ATTENDANCE_PATHS` web. */
export const SELF_ATTENDANCE_URL_RULES: UrlRule[] = [
  { path: '/erp/hr/attendance', scope: 'write' },
  { path: '/erp/hr/lunch-breaks', scope: 'write' },
  { path: '/api/attendance/**', methods: ['GET', 'POST'], scope: 'write' },
  { path: '/api/lunch-breaks/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
  // Tras checada: consent + punto GPS propio (campo / self-attendance).
  { path: '/api/gps', methods: ['POST'], scope: 'write' },
  { path: '/api/gps/consent', methods: ['PATCH'], scope: 'write' },
  { path: '/api/gps/me', methods: ['GET'], scope: 'read' },
  { path: '/api/gps/trajectory', methods: ['GET'], scope: 'read' },
  { path: '/api/gps/heartbeat', methods: ['POST'], scope: 'write' },
];

/**
 * Ritmo operativo — reuniones, acuerdos y lecciones aprendidas.
 *
 * Todo el personal interno ve las reuniones a las que se le convoca y mueve sus
 * propios acuerdos; convocar, cerrar la junta y registrar acuerdos ajenos es de
 * quien la conduce. `cliente` NO recibe ninguna de las dos: son reuniones
 * internas, y por eso esto no vive en `SHARED_SESSION_URL_RULES`.
 */
export const MEETINGS_STAFF_URL_RULES: UrlRule[] = [
  { path: '/api/reuniones/mis-acuerdos/**', methods: ['GET', 'PATCH'], scope: 'write' },
  { path: '/api/reuniones/mis-acuerdos', methods: ['GET'], scope: 'read' },
  { path: '/api/reuniones/lecciones', methods: ['GET'], scope: 'read' },
  { path: '/api/reuniones/**', methods: ['GET'], scope: 'read' },
  { path: '/api/reuniones', methods: ['GET'], scope: 'read' },
];

/** Quien conduce la reunión: convoca, cierra y deja los acuerdos por escrito. */
export const MEETINGS_LEAD_URL_RULES: UrlRule[] = [
  { path: '/api/reuniones/**', scope: 'write' },
  { path: '/api/reuniones', scope: 'write' },
];

/**
 * Cotizaciones en Core (contrato del viernes, D).
 *
 * Quien cotiza necesita escribir, no solo leer: sin esto, un director podía abrir la lista pero no
 * crear ni enviar, porque su única regla sobre `/api/**` es de lectura.
 */
export const COTIZACIONES_CORE_URL_RULES: UrlRule[] = [
  { path: '/erp/cotizaciones', scope: 'write' },
  { path: '/erp/cotizaciones/**', scope: 'write' },
  { path: '/api/cotizaciones/**', methods: ['GET', 'POST', 'PUT', 'PATCH'], scope: 'write' },
  // Catálogo de productos para armar las partidas.
  { path: '/api/smart-quote/search', methods: ['GET'], scope: 'read' },
];

/**
 * Vista previa en vivo del PDF de una cotización (`POST /api/cotizaciones/:id/pdf/vista-previa`).
 *
 * Es un POST, pero solo lee: arma el PDF del borrador en memoria y no guarda nada. Va donde ya se
 * permite descargar el PDF (`GET /api/cotizaciones/**`) aunque el puesto no pueda escribir; quien
 * escribe ya la tiene por `COTIZACIONES_CORE_URL_RULES`.
 */
export const VISTA_PREVIA_COTIZACION_URL_RULE: UrlRule = {
  path: '/api/cotizaciones/:id/pdf/vista-previa',
  methods: ['POST'],
  scope: 'read',
};

/**
 * Proyectos en Core (`/erp/proyectos`): mismo público que las cotizaciones de Core.
 *
 * Las páginas van aquí para que `/me/navigation` no recorte el módulo del menú. La escritura en
 * `/api/proyectos` hace falta porque, para varios de estos puestos, su única regla sobre `/api/**`
 * es de lectura y el alta respondía 403. Quién puede de verdad crear o editar lo sigue decidiendo
 * el controlador (`ACTIVITIES_MANAGE`) y el alcance de equipo del servicio.
 */
export const PROYECTOS_CORE_URL_RULES: UrlRule[] = [
  { path: '/erp/proyectos', scope: 'write' },
  { path: '/erp/proyectos/**', scope: 'write' },
  { path: '/api/proyectos/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
];

/**
 * Revisar el uniforme en la foto de entrada (KPI del equipo). Se abre a quien revisa checadas
 * ajenas; quién puede de verdad (sus jefes, dirección y RH, nunca él mismo) lo decide el servicio.
 */
export const ATTENDANCE_UNIFORME_URL_RULES: UrlRule[] = [
  { path: '/api/attendance/*/uniforme', methods: ['PATCH'], scope: 'approve' },
];

/**
 * Recursos de Core para todo el personal interno: herramientas (pedir y ver su kit), vehículos
 * (pedir, entregar y recibir) y el organigrama de solo lectura.
 *
 * Son páginas: están aquí para que `/me/navigation` no recorte los módulos del menú ni de «Más»
 * en las apps. Quién aprueba lo siguen decidiendo los permisos de cada controlador
 * (`TOOLS_MANAGE`, `VEHICLES_REVIEW`, `USERS_MANAGE` para mover a alguien en el organigrama).
 * `/erp/vehiculos/gps` cae dentro de `/erp/vehiculos/**`: la página solo se la muestra a
 * Dirección General (`puedeVerGpsDireccion`).
 */
export const CORE_RECURSOS_URL_RULES: UrlRule[] = [
  { path: '/erp/almacen/herramientas', scope: 'write' },
  { path: '/erp/almacen/herramientas/**', scope: 'write' },
  { path: '/erp/vehiculos', scope: 'write' },
  { path: '/erp/vehiculos/**', scope: 'write' },
  { path: '/erp/organigrama', methods: ['GET'], scope: 'read' },
];

/**
 * Almacén en Core (`/erp/almacen`) para quien lo opera: almacén y administración. Sus API de
 * stock, almacenes y catálogo ya estaban en sus reglas; mover existencias lo sigue decidiendo
 * `RbacGuard` (`STOCK_MANAGE`).
 */
export const ALMACEN_CORE_URL_RULES: UrlRule[] = [
  { path: '/erp/almacen', scope: 'write' },
  { path: '/erp/almacen/**', scope: 'write' },
];

/**
 * Almacén de consulta: dirección de operaciones y coordinadores de campo revisan existencias
 * para planear la OT. Sin las GET de stock, almacenes y catálogo, `UrlAccessGuard` les
 * respondía 403 al abrir la página.
 */
export const ALMACEN_CORE_READ_URL_RULES: UrlRule[] = [
  { path: '/erp/almacen', methods: ['GET'], scope: 'read' },
  { path: '/erp/almacen/**', methods: ['GET'], scope: 'read' },
  { path: '/api/stock/**', methods: ['GET'], scope: 'read' },
  { path: '/api/warehouse/**', methods: ['GET'], scope: 'read' },
  { path: '/api/catalog/**', methods: ['GET'], scope: 'read' },
];

/**
 * KPIs del equipo (`/erp/asistencias/indicadores`). La página ya la abre `/erp/asistencias/**`;
 * esta regla existe para que `/me/navigation` emita `kpis-equipo` solo a quien ve al equipo en
 * Asistencias (los mismos que `getAttendanceViewMode` en la web). CEO y Dir. Administrativa lo
 * reciben por su comodín `/erp/**`.
 */
export const KPIS_EQUIPO_URL_RULES: UrlRule[] = [
  { path: '/erp/asistencias/indicadores', methods: ['GET'], scope: 'read' },
  { path: '/erp/asistencias/indicadores/**', methods: ['GET'], scope: 'read' },
];

/** Core ola1 — páginas shell (Pizarra / Asistencias / Chat / Actividades). */
export const CORE_OLA1_URL_RULES: UrlRule[] = [
  { path: '/erp/mis-actividades', scope: 'write' },
  { path: '/erp/mis-actividades/**', scope: 'write' },
  { path: '/erp/actividades', scope: 'write' },
  { path: '/erp/actividades/**', scope: 'write' },
  { path: '/erp/pizarra', scope: 'write' },
  { path: '/erp/pizarra/**', scope: 'write' },
  { path: '/erp/asistencias', scope: 'write' },
  { path: '/erp/asistencias/**', scope: 'write' },
  { path: '/erp/chat', scope: 'write' },
  { path: '/erp/chat/**', scope: 'write' },
  { path: '/erp/clientes', scope: 'write' },
  { path: '/erp/clientes/**', scope: 'write' },
  { path: '/api/ventas/clientes', scope: 'write' },
  { path: '/api/ventas/clientes/**', scope: 'write' },
  { path: '/erp/actividades/tareas', scope: 'write' },
  { path: '/erp/actividades/tareas/**', scope: 'write' },
  { path: '/erp/actividades/diarias', scope: 'write' },
  { path: '/erp/actividades/diarias/**', scope: 'write' },
  { path: '/erp/activities/diarias', scope: 'write' },
  { path: '/erp/activities/diarias/**', scope: 'write' },
  { path: '/erp/actividades/proyectos', scope: 'write' },
  { path: '/erp/actividades/proyectos/**', scope: 'write' },
  { path: '/erp/actividades/servicios', scope: 'write' },
  { path: '/erp/actividades/servicios/**', scope: 'write' },
  { path: '/api/chat/**', scope: 'write' },
  { path: '/api/me/**', methods: ['GET'], scope: 'read' },
  // APIs que usan las apps y la web Core para cualquier persona del equipo. Lo fino (solo lo
  // propio, solo jefes aprueban, solo quien ejecuta sube evidencia) lo decide cada servicio.
  ...SELF_ATTENDANCE_URL_RULES,
  ...ATTENDANCE_UNIFORME_URL_RULES,
  // Aprobar/rechazar comida a destiempo: el servicio solo deja a los jefes de esa persona.
  { path: '/api/lunch-breaks/**', methods: ['PATCH'], scope: 'approve' },
  { path: '/api/integra/identity/me', methods: ['GET'], scope: 'read' },
  { path: '/api/activities/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  { path: '/api/activity-evidence/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  { path: '/api/operational-projects/**', methods: ['GET'], scope: 'read' },
  { path: '/api/proyectos/**', methods: ['GET'], scope: 'read' },
];

/**
 * Alta y edición de clientes para roles administrativos sin panel de ventas (RH, contabilidad).
 * Quién puede de verdad (jefes con personal a cargo, administración, dirección) y qué clientes ve
 * cada quien lo deciden `client-permissions.ts` y las reglas de sector del servicio.
 */
export const CLIENT_ADMIN_WRITE_URL_RULES: UrlRule[] = [
  { path: '/api/ventas/clientes/permisos', methods: ['GET'], scope: 'read' },
  { path: '/api/ventas/clientes', methods: ['POST'], scope: 'write' },
  { path: '/api/ventas/clientes/*', methods: ['PATCH'], scope: 'write' },
];

/**
 * Cancelar una actividad o pasarla a otro compañero, para roles de dirección y administración que
 * no tienen escritura general sobre actividades. El servicio exige ser superior de quien la ejecuta.
 */
export const ACTIVITY_SUPERIOR_URL_RULES: UrlRule[] = [
  { path: '/api/activities/*/acciones', methods: ['GET'], scope: 'read' },
  { path: '/api/activities/*/cancelar', methods: ['POST'], scope: 'approve' },
  { path: '/api/activities/*/reasignar', methods: ['POST'], scope: 'approve' },
];

/** Proyectos operativos OPS (`/ops/projects`). Distinto de `/api/projects` (Studio). */
export const OPS_OPERATIONAL_PROJECTS_URL_RULES: UrlRule[] = [
  { path: '/api/operational-projects/**', scope: 'write' },
  { path: '/api/proyectos/**', scope: 'write' },
];

/** APIs de sesión propias — todo rol autenticado (deny-by-default no las bloquea). */
export const SHARED_SESSION_URL_RULES: UrlRule[] = [
  { path: '/api/notifications/**', scope: 'write' },
  { path: '/api/user-preferences/**', scope: 'write' },
  { path: '/api/users/me', methods: ['GET', 'PATCH'], scope: 'write' },
  { path: '/api/users/profile/**', scope: 'write' },
  { path: '/api/me/**', methods: ['GET'], scope: 'read' },
  { path: '/api/devices/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
  { path: '/api/company/mine', methods: ['GET'], scope: 'read' },
  // Los comunicados internos son PARA el personal: todos leen, solo
  // Administracion y Direccion publican.
  { path: '/api/internal-comunicados/**', methods: ['GET'], scope: 'read' },
];

/**
 * Matriz Rol → reglas de URL.
 */
export const URL_MATRIX: Record<RoleKey, UrlRule[]> = {
  // ─────────────────────────────────────────────────────────────────
  // SUPER ADMIN — bypass total (la guard cortocircuita antes de leer esto)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.SUPER_ADMIN]: [
    { path: '/**', scope: 'admin' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // CEO — ve TODO (lectura) + aprobaciones de tope
  // ─────────────────────────────────────────────────────────────────
  [ROLES.CEO]: [
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...ACTIVITY_SUPERIOR_URL_RULES,
    // Faltas justificadas: solo Christian (el servicio lo vuelve a exigir por correo).
    { path: '/api/attendance/justificaciones', methods: ['GET', 'POST'], scope: 'approve' },
    { path: '/api/attendance/justificaciones/*', methods: ['DELETE'], scope: 'approve' },
    // Corregir la hora de una checada: dirección y RH (el servicio lo vuelve a exigir).
    { path: '/api/attendance/*/correccion', methods: ['PATCH'], scope: 'approve' },
    ...ATTENDANCE_UNIFORME_URL_RULES,
    // Rutas específicas primero (first-match-wins)
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/api/workflow/**', methods: ['POST'], scope: 'approve' },
    { path: '/api/executive/**', scope: 'read' },
    // Wildcards amplios al final
    { path: '/erp/**', scope: 'read' },
    { path: '/crm/**', scope: 'read' },
    { path: '/ops/**', scope: 'read' },
    { path: '/studio/**', scope: 'read' },
    { path: '/lab/**', scope: 'write' },
    { path: '/integra/**', scope: 'read' },
    // Direccion: gestion de contenido y comunicados internos.
    { path: '/api/hero-slides/**', scope: 'write' },
    { path: '/api/hero-video/**', scope: 'write' },
    { path: '/api/social-posts/**', scope: 'write' },
    { path: '/api/internal-comunicados/**', scope: 'write' },
    { path: '/api/access-control/**', scope: 'write' },
    { path: '/api/integra/**', scope: 'write' },
    { path: '/api/lab/**', scope: 'write' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // ARQUITECTO / DIRECTOR TÉCNICO — Josué
  // Supervisa OPS, valida trabajos antes de reportar a Admin + Dirección
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ARQUITECTO]: [
    ...CORE_RECURSOS_URL_RULES, ...ALMACEN_CORE_READ_URL_RULES, ...KPIS_EQUIPO_URL_RULES,
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...CORE_OLA1_URL_RULES,
    // OPS — lectura total + aprobación de actividades y evidencias
    { path: '/ops/**',                      scope: 'approve' },
    { path: '/api/activities/**',           scope: 'approve' },
    { path: '/api/activity-evidence/**',    scope: 'approve' },
    { path: '/api/evidences/**',            scope: 'approve' },
    { path: '/api/projects/**',             scope: 'write'   },
    { path: '/api/service-sheets/**',       scope: 'write'   },
    { path: '/api/maintenance/**',          scope: 'write'   },
    { path: '/api/maintenance-contracts/**', scope: 'write'   },
    { path: '/api/gps/**',    methods: ['GET'], scope: 'read' },
    { path: '/api/vehicles/**', methods: ['GET'], scope: 'read' },
    // ERP parcial — ve lo operacional, no finanzas ni usuarios
    { path: '/erp',                         scope: 'read' },
    { path: '/erp/dashboard',               scope: 'read' },
    { path: '/erp/architecture',            scope: 'write' },
    { path: '/erp/calendar',                scope: 'read'  },
    { path: '/erp/chat',                    scope: 'write' },
    { path: '/erp/documents/**',            scope: 'read'  },
    { path: '/api/chat/**',                 scope: 'write' },
    { path: '/api/documents/**',            methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center',    scope: 'read'  },
    { path: '/erp/my-profile',              scope: 'write' },
    { path: '/erp/kb/**',                   scope: 'read'  },
    { path: '/erp/hr/orgchart', methods: ['GET'], scope: 'read' },
    // INTEGRA — el director técnico supervisa CCTV/ACS. `PAGE_MATRIX` ya se lo
    // daba; sin la regla aquí, `/me/navigation` le borraba los 18 módulos.
    { path: '/integra/**',                  scope: 'read'  },
    { path: '/api/integra/**', methods: ['GET'], scope: 'read' },
    // CRM parcial — ve proyectos y cotizaciones (aprueba técnicamente)
    { path: '/crm/projects/**',             scope: 'write' },
    { path: '/crm/quotes/**', methods: ['GET'], scope: 'read' },
    // API lectura general para reportes
    { path: '/api/users',   methods: ['GET'], scope: 'read' },
    { path: '/api/clients', methods: ['GET'], scope: 'read' },
    { path: '/api/ventas/proyectos/**', methods: ['GET'], scope: 'read' },
    ...SELF_ATTENDANCE_URL_RULES,
    ...OPS_OPERATIONAL_PROJECTS_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // DIRECTOR DE OPERACIONES — aprueba viáticos/proyectos nivel alto
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DIR_OPERACIONES]: [
    ...CORE_RECURSOS_URL_RULES, ...ALMACEN_CORE_READ_URL_RULES,
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...ACTIVITY_SUPERIOR_URL_RULES,
    // Revisa el uniforme en la entrada de su gente (el servicio decide a quién).
    ...ATTENDANCE_UNIFORME_URL_RULES,
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/executive', scope: 'read' },
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/architecture', scope: 'read' },
    { path: '/erp/companies/**', scope: 'write' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/documents/**', scope: 'read' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/finance/**', scope: 'approve' },
    { path: '/erp/procurement/**', scope: 'approve' },
    { path: '/erp/warehouse/**', scope: 'read' },
    { path: '/erp/analytics/**', scope: 'read' },
    { path: '/erp/exports', scope: 'read' },
    { path: '/erp/kb/**', scope: 'read' },
    { path: '/erp/news', scope: 'read' },
    { path: '/erp/hr/orgchart', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/ops/**', scope: 'read' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/quotes/**', scope: 'approve' },
    { path: '/crm/projects/**', scope: 'read' },
    { path: '/crm/tenders/**', scope: 'read' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/crm/reports', scope: 'read' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
    { path: '/api/workflow/**', scope: 'approve' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/viaticos/**', scope: 'approve' },
    { path: '/api/viatics/**', scope: 'approve' },
    { path: '/api/cotizaciones/**', scope: 'approve' },
    { path: '/api/smart-quote/**', scope: 'approve' },
    { path: '/erp/facilities/**', scope: 'write' },
    { path: '/integra/**', scope: 'write' },
    { path: '/api/access-control/**', scope: 'write' },
    { path: '/api/integra/**', scope: 'write' },
    ...SELF_ATTENDANCE_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // DIRECTOR ADMINISTRATIVO — finanzas, compras, RH (alto nivel)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DIR_ADMIN]: [
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...ACTIVITY_SUPERIOR_URL_RULES,
    // Revisa el uniforme en la entrada de su gente (el servicio decide a quién).
    ...ATTENDANCE_UNIFORME_URL_RULES,
    { path: '/erp/**', scope: 'admin' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/quotes/**', scope: 'approve' },
    { path: '/crm/reports', scope: 'read' },
    // Seguimiento comercial completo: `PAGE_MATRIX` y `section-views` ya la
    // tratan como gerencia de ventas; esta capa la dejaba en dashboard+quotes.
    { path: '/crm/leads/**', scope: 'read' },
    { path: '/crm/opportunities/**', scope: 'read' },
    { path: '/crm/clients/**', scope: 'read' },
    { path: '/crm/products/**', scope: 'read' },
    { path: '/crm/projects/**', scope: 'read' },
    { path: '/crm/templates/**', scope: 'read' },
    { path: '/crm/tenders/**', scope: 'read' },
    { path: '/crm/team', scope: 'read' },
    { path: '/crm/targets', scope: 'read' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/crm/agenda', scope: 'read' },
    // Reportes de campo → facturación y seguimiento a cliente.
    { path: '/ops/activities/**', methods: ['GET'], scope: 'read' },
    { path: '/ops/projects/**', methods: ['GET'], scope: 'read' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
    { path: '/api/accounting/**', scope: 'approve' },
    { path: '/api/procurement/**', scope: 'approve' },
    { path: '/api/smart-quote/**', scope: 'approve' },
    { path: '/api/hr/**', scope: 'approve' },
    { path: '/api/users/**', scope: 'admin' },
    { path: '/api/workflow/**', scope: 'approve' },
    { path: '/api/access-control/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD ADMINISTRATIVO — segundo nivel de aprobación
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_ADMIN]: [
    ...CORE_RECURSOS_URL_RULES, ...ALMACEN_CORE_URL_RULES,
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...ACTIVITY_SUPERIOR_URL_RULES,
    // Revisa el uniforme en la entrada de su gente (el servicio decide a quién).
    ...ATTENDANCE_UNIFORME_URL_RULES,
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/companies/**', scope: 'write' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/documents/**', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/erp/accounting/**', scope: 'write' },
    { path: '/erp/banking/**', scope: 'write' },
    { path: '/erp/contabilidad/**', scope: 'write' },
    { path: '/erp/contabilidad', scope: 'write' },
    { path: '/erp/invoicing/**', scope: 'write' },
    { path: '/erp/finance/**', scope: 'approve' },
    { path: '/erp/procurement/**', scope: 'approve' },
    { path: '/erp/warehouse/**', scope: 'write' },
    { path: '/erp/users', methods: ['GET'], scope: 'read' },
    { path: '/erp/exports', scope: 'read' },
    // HR_MANAGERS en `section-views`: plantilla, incidencias, KPIs y organigrama.
    { path: '/erp/hr', methods: ['GET'], scope: 'read' },
    { path: '/erp/hr/fines', scope: 'write' },
    { path: '/erp/hr/kpis', methods: ['GET'], scope: 'read' },
    { path: '/erp/hr/orgchart', methods: ['GET'], scope: 'read' },
    { path: '/erp/kb/**', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/erp/news', scope: 'read' },
    { path: '/api/users', methods: ['GET'], scope: 'read' },
    { path: '/api/users/profile/**', scope: 'write' },
    { path: '/api/company/**', scope: 'write' },
    { path: '/api/accounting/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/procurement/**', scope: 'approve' },
    { path: '/api/viaticos/**', scope: 'approve' },
    { path: '/api/viatics/**', scope: 'approve' },
    { path: '/api/expenses/**', scope: 'write' },
    { path: '/api/clients/**', scope: 'write' },
    { path: '/api/inventories/**', scope: 'write' },
    { path: '/api/warehouse/**', scope: 'write' },
    { path: '/api/stock/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/catalog/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/documents/**', scope: 'write' },
    { path: '/api/internal-comunicados/**', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/workflow/**', scope: 'approve' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/leads/**', scope: 'write' },
    { path: '/crm/clients/**', scope: 'write' },
    { path: '/crm/opportunities/**', scope: 'write' },
    { path: '/crm/quotes/**', scope: 'write' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/crm/products/**', scope: 'write' },
    { path: '/crm/projects/**', scope: 'read' },
    { path: '/crm/agenda', scope: 'read' },
    { path: '/ops/tools/**', scope: 'read' },
    // Reportes de campo → facturación y seguimiento a cliente.
    { path: '/ops/activities/**', methods: ['GET'], scope: 'read' },
    { path: '/ops/projects/**', methods: ['GET'], scope: 'read' },
    { path: '/api/tool-requests/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/ventas/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/cotizaciones/**', methods: ['GET', 'POST', 'PATCH', 'PUT'], scope: 'write' },
    { path: '/api/smart-quote/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    { path: '/api/accounting/invoices/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    ...SELF_ATTENDANCE_URL_RULES,
    ...OPS_OPERATIONAL_PROJECTS_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // ADMINISTRATIVO — primer nivel (operación día a día)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ADMINISTRATIVO]: [
    ...CORE_RECURSOS_URL_RULES, ...ALMACEN_CORE_URL_RULES,
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_STAFF_URL_RULES,
    ...CORE_OLA1_URL_RULES,
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/approvals', methods: ['GET'], scope: 'read' },
    { path: '/erp/companies/**', scope: 'write' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/documents/**', scope: 'write' },
    { path: '/erp/finance/viatics/**', scope: 'write' },
    { path: '/erp/finance/expenses/**', scope: 'write' },
    { path: '/erp/invoicing/**', scope: 'write' },
    { path: '/erp/procurement/**', scope: 'write' },
    { path: '/erp/warehouse/**', scope: 'write' },
    { path: '/erp/hr/attendance', scope: 'write' },
    { path: '/erp/hr/lunch-breaks', scope: 'write' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/erp/news', scope: 'read' },
    { path: '/crm/quotes/**', scope: 'write' },
    { path: '/crm/clients/**', scope: 'write' },
    // Seguimiento a clientes (organigrama §2): leads, kanban y agenda comercial.
    { path: '/crm/leads/**', scope: 'write' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/crm/agenda', scope: 'write' },
    // Flotilla: `resolveOpsPairNav(vehicles)` le da vista de equipo.
    { path: '/ops/vehicles/**', scope: 'read' },
    { path: '/api/vehicles/**', methods: ['GET'], scope: 'read' },
    { path: '/api/attendance/**', methods: ['GET', 'POST'], scope: 'write' },
    { path: '/api/lunch-breaks/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    { path: '/api/expenses/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/workflow/**', methods: ['GET', 'POST'], scope: 'read' },
    { path: '/api/viaticos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viatics/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/documents/**', scope: 'write' },
    { path: '/api/internal-comunicados/**', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/clients/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/cotizaciones/**', methods: ['GET', 'POST', 'PATCH', 'PUT'], scope: 'write' },
    { path: '/api/smart-quote/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    { path: '/api/ventas/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/accounting/invoices/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/procurement/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/inventories/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/warehouse/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/stock/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/catalog/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/company/**', methods: ['GET'], scope: 'read' },
    { path: '/api/users', methods: ['GET'], scope: 'read' },
    { path: '/api/users/profile/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD OPERACIONES — supervisa ing. de campo, project manager
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_OPERACIONES]: [
    ...CORE_RECURSOS_URL_RULES, ...ALMACEN_CORE_READ_URL_RULES, ...KPIS_EQUIPO_URL_RULES,
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...CORE_OLA1_URL_RULES,
    { path: '/ops', scope: 'read' },
    { path: '/ops/dashboard', scope: 'read' },
    { path: '/ops/activities/**', scope: 'approve' },
    { path: '/ops/evidences/**', scope: 'approve' },
    { path: '/ops/projects/**', scope: 'write' },
    { path: '/ops/vehicles/**', scope: 'approve' },
    { path: '/ops/maintenance/**', scope: 'write' },
    { path: '/ops/support/**', scope: 'write' },
    { path: '/ops/noc/**', scope: 'read' },
    { path: '/ops/gps/**', scope: 'read' },
    { path: '/ops/assets/**', scope: 'write' },
    { path: '/ops/service-clients/**', scope: 'write' },
    { path: '/ops/tools/**', scope: 'read' },
    { path: '/ops/recruiting/**', scope: 'read' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/ops/chat', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/erp/dashboard', scope: 'read' },
    // Aprueba viáticos y cierres de OT; consulta expedientes y procedimientos.
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/kb/**', scope: 'read' },
    { path: '/erp/hr/orgchart', methods: ['GET'], scope: 'read' },
    { path: '/api/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/crm/quotes/**', methods: ['GET'], scope: 'read' },
    { path: '/api/activities/**', scope: 'approve' },
    { path: '/api/evidences/**', scope: 'approve' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/maintenance/**', scope: 'write' },
    { path: '/api/maintenance-contracts/**', scope: 'write' },
    { path: '/api/vehicles/**', scope: 'approve' },
    // Sin /api/gps/** amplio: live team es GPS_MANAGE (dirección). Self vía SELF_ATTENDANCE.
    { path: '/api/service-sheets/**', scope: 'write' },
    { path: '/api/tool-requests/**', methods: ['GET', 'POST', 'PUT', 'PATCH'], scope: 'write' },
    // PAGE_MATRIX ya da `/ops/**` (incl. viáticos de equipo). Sin estas reglas
    // la web/app abrían el dashboard y reventaban en GET /api/viatics (403).
    { path: '/ops/viatics/**', scope: 'approve' },
    { path: '/api/viaticos/**', scope: 'approve' },
    { path: '/api/viatics/**', scope: 'approve' },
    { path: '/integra/**', scope: 'write' },
    { path: '/api/integra/**', scope: 'write' },
    ...SELF_ATTENDANCE_URL_RULES,
    ...OPS_OPERATIONAL_PROJECTS_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // INGENIERO DE CAMPO — solo lo suyo
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ING_CAMPO]: [
    ...CORE_RECURSOS_URL_RULES,
    ...MEETINGS_STAFF_URL_RULES,
    ...CORE_OLA1_URL_RULES,
    // Páginas frontend
    { path: '/ops', scope: 'read' },
    { path: '/ops/dashboard', scope: 'read' },
    { path: '/ops/chat', scope: 'write' },
    { path: '/ops/activities/**', scope: 'read' },
    { path: '/ops/evidences/**', scope: 'write' },
    { path: '/ops/viatics/**', scope: 'write' },
    { path: '/ops/vehicles', scope: 'read' },
    { path: '/ops/tools', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    // El técnico consulta manuales y su calendario de servicios: `PAGE_MATRIX`
    // y `section-views` ya se los daban, esta capa los borraba.
    { path: '/erp/calendar', methods: ['GET'], scope: 'read' },
    { path: '/erp/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/api/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/erp/hr/attendance', scope: 'write' },
    { path: '/erp/hr/lunch-breaks', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/activities/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/activity-evidence/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/evidences/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
    { path: '/api/viaticos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viatics/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/attendance/**', methods: ['GET', 'POST'], scope: 'write' },
    { path: '/api/lunch-breaks/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    { path: '/api/gps/heartbeat', methods: ['POST'], scope: 'write' },
    { path: '/api/vehicles/**', methods: ['GET'], scope: 'read' },
    { path: '/api/tool-requests/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/service-sheets/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    ...OPS_OPERATIONAL_PROJECTS_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // INGENIERO DE SOPORTE — tickets, NOC, mantenimiento
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ING_SOPORTE]: [
    ...CORE_RECURSOS_URL_RULES, ...KPIS_EQUIPO_URL_RULES,
    ...MEETINGS_STAFF_URL_RULES,
    ...CORE_OLA1_URL_RULES,
    ...SELF_ATTENDANCE_URL_RULES,
    { path: '/ops', scope: 'read' },
    { path: '/ops/dashboard', scope: 'read' },
    { path: '/ops/chat', scope: 'write' },
    { path: '/ops/support/**', scope: 'write' },
    { path: '/ops/noc/**', scope: 'write' },
    { path: '/ops/maintenance/**', scope: 'write' },
    { path: '/ops/assets/**', scope: 'read' },
    { path: '/ops/service-clients/**', scope: 'read' },
    { path: '/ops/activities/**', scope: 'read' },
    { path: '/ops/evidences/**', scope: 'read' },
    { path: '/ops/my-viatics/**', scope: 'write' },
    { path: '/ops/tools/**', scope: 'read' },
    { path: '/erp/hr/attendance', scope: 'write' },
    { path: '/erp/hr/lunch-breaks', scope: 'write' },
    { path: '/erp/kb/**', scope: 'write' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/calendar', methods: ['GET'], scope: 'read' },
    { path: '/erp/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/api/documents/**', methods: ['GET'], scope: 'read' },
    // Cotiza refacciones y renovaciones de contrato.
    { path: '/crm/quotes/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/activities/**', scope: 'write' },
    { path: '/api/activities', scope: 'write' },
    { path: '/api/activity-evidence/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/evidences/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
    { path: '/api/client-ticket-requests/**', scope: 'write' },
    { path: '/api/sla/**', scope: 'read' },
    { path: '/api/sla-tracker/**', scope: 'write' },
    { path: '/api/maintenance/**', scope: 'write' },
    { path: '/api/maintenance-contracts/**', scope: 'read' },
    { path: '/api/devices/**', scope: 'read' },
    { path: '/api/noc/**', scope: 'write' },
    { path: '/api/inventories/**', methods: ['GET', 'POST', 'PATCH'], scope: 'read' },
    { path: '/api/service-clients/**', methods: ['GET', 'POST', 'PUT', 'PATCH'], scope: 'write' },
    { path: '/api/assets/**', scope: 'read' },
    { path: '/api/tool-requests/**', methods: ['GET'], scope: 'read' },
    { path: '/api/kb/**', scope: 'write' },
    { path: '/api/attendance/**', methods: ['GET', 'POST'], scope: 'write' },
    { path: '/api/lunch-breaks/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    // GPS propio al fichar (SELF_ATTENDANCE); sin /api/gps/** amplio → no live team.
    { path: '/api/viaticos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viatics/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/integra/**', scope: 'write' },
    { path: '/api/integra/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD VENTAS — gerente comercial
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_VENTAS]: [
    ...CORE_RECURSOS_URL_RULES,
    ...COTIZACIONES_CORE_URL_RULES,
    ...PROYECTOS_CORE_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...ACTIVITY_SUPERIOR_URL_RULES,
    { path: '/crm/**', scope: 'approve' },
    { path: '/crm/chat', scope: 'write' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    // Le faltaba hasta su propio calendario. Aprobaciones (descuentos, cierres)
    // y KB corresponden a su nivel; los leads del sitio son materia de ventas.
    { path: '/erp/calendar', methods: ['GET'], scope: 'read' },
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/kb/**', scope: 'read' },
    { path: '/erp/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/hr/orgchart', methods: ['GET'], scope: 'read' },
    { path: '/studio/contacts', methods: ['GET'], scope: 'read' },
    { path: '/studio/leads', methods: ['GET'], scope: 'read' },
    { path: '/api/documents/**', methods: ['GET'], scope: 'read' },
    { path: '/api/contact-messages/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/ventas/**', scope: 'approve' },
    { path: '/api/cotizaciones/**', scope: 'approve' },
    { path: '/api/smart-quote/**', scope: 'approve' },
    { path: '/api/tenders/**', scope: 'write' },
    { path: '/api/sales-targets/**', scope: 'write' },
    { path: '/api/clients/**', scope: 'write' },
    { path: '/api/crm-activities/**', scope: 'write' },
    ...SELF_ATTENDANCE_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // VENDEDOR — CRM (sus leads, clientes, cotizaciones)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.VENDEDOR]: [
    ...CORE_RECURSOS_URL_RULES,
    ...MEETINGS_STAFF_URL_RULES,
    { path: '/crm', scope: 'read' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/chat', scope: 'write' },
    { path: '/crm/leads/**', scope: 'write' },
    { path: '/crm/clients/**', scope: 'write' },
    { path: '/crm/opportunities/**', scope: 'write' },
    { path: '/crm/quotes/**', scope: 'write' },
    { path: '/crm/quotes/builder', scope: 'write' },
    { path: '/crm/templates/**', scope: 'read' },
    { path: '/crm/agenda', scope: 'write' },
    { path: '/crm/products', scope: 'read' },
    { path: '/crm/targets', scope: 'read' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/calendar', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/ventas/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/cotizaciones/**', methods: ['GET', 'POST', 'PATCH', 'PUT'], scope: 'write' },
    { path: '/api/smart-quote/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    { path: '/api/clients/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/catalog/**', methods: ['GET'], scope: 'read' },
    { path: '/api/crm-activities/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
    ...SELF_ATTENDANCE_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // LÍDER DISEÑO — Studio completo
  // ─────────────────────────────────────────────────────────────────
  [ROLES.LIDER_DISENO]: [
    ...CORE_RECURSOS_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    // Daniela (diseño) también es personal Core: actividades, asistencia, comida y chat.
    ...CORE_OLA1_URL_RULES,
    { path: '/studio/**', scope: 'admin' },
    { path: '/erp/dashboard', scope: 'read' },
    // Material comercial: cotiza y mantiene catálogo y plantillas de marca.
    { path: '/crm/quotes/**', methods: ['GET'], scope: 'read' },
    { path: '/crm/products/**', scope: 'write' },
    { path: '/crm/templates/**', scope: 'write' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/calendar', methods: ['GET'], scope: 'read' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/cotizaciones/**', methods: ['GET'], scope: 'read' },
    VISTA_PREVIA_COTIZACION_URL_RULE,
    { path: '/api/catalog/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/hero-slides/**', scope: 'write' },
    { path: '/api/hero-video/**', scope: 'write' },
    { path: '/api/social-posts/**', scope: 'write' },
    { path: '/api/case-studies/**', scope: 'write' },
    { path: '/api/studio/page-content/**', scope: 'write' },
    { path: '/api/news/**', scope: 'write' },
    { path: '/api/newsletter/**', scope: 'write' },
    { path: '/api/contact-messages/**', scope: 'read' },
    { path: '/api/company/**', scope: 'write' },
    ...SELF_ATTENDANCE_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // DISEÑADOR — solo sus tareas en Studio
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DISENADOR]: [
    ...CORE_RECURSOS_URL_RULES,
    ...MEETINGS_STAFF_URL_RULES,
    { path: '/studio', scope: 'read' },
    { path: '/studio/dashboard', scope: 'read' },
    { path: '/studio/pages/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/news/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/social/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/cases/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/contacts', methods: ['GET'], scope: 'read' },
    { path: '/studio/leads', methods: ['GET'], scope: 'read' },
    // Apoya en cotizaciones y catálogo (`PAGE_MATRIX` ya se los concede).
    { path: '/crm/quotes/**', methods: ['GET'], scope: 'read' },
    { path: '/crm/products/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/calendar', methods: ['GET'], scope: 'read' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/cotizaciones/**', methods: ['GET'], scope: 'read' },
    VISTA_PREVIA_COTIZACION_URL_RULE,
    { path: '/api/catalog/**', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/projects/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/hero-slides/**', methods: ['GET', 'POST', 'PUT', 'PATCH'], scope: 'write' },
    { path: '/api/hero-video/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/social-posts/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/case-studies/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
    { path: '/api/studio/page-content/**', methods: ['GET', 'PUT', 'POST'], scope: 'write' },
    { path: '/api/news/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    ...SELF_ATTENDANCE_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // RH
  // ─────────────────────────────────────────────────────────────────
  [ROLES.RH]: [
    ...CORE_RECURSOS_URL_RULES,
    ...MEETINGS_LEAD_URL_RULES,
    ...ACTIVITY_SUPERIOR_URL_RULES,
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/hr/**', scope: 'write' },
    { path: '/erp/finance/employee-payments/**', scope: 'write' },
    { path: '/erp/finance/prenomina/**', scope: 'write' },
    { path: '/erp/finance/prenomina', methods: ['GET'], scope: 'write' },
    // `resolveViaticsSidebarHome` manda a RH al home de viáticos en finanzas ERP.
    { path: '/erp/finance/viatics/**', scope: 'read' },
    // Autoriza permisos, vacaciones e incidencias del personal.
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/kb/**', scope: 'read' },
    { path: '/api/workflow/**', methods: ['GET', 'POST'], scope: 'approve' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/documents/**', scope: 'write' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/ops/recruiting/**', scope: 'write' },
    { path: '/api/hr/**', scope: 'write' },
    { path: '/api/employee-payments/**', scope: 'write' },
    { path: '/api/overtime-approvals/**', scope: 'write' },
    { path: '/api/attendance-rejections/**', methods: ['GET'], scope: 'read' },
    { path: '/api/attendance/**', scope: 'write' },
    { path: '/api/cvs/**', scope: 'write' },
    { path: '/api/fines/**', scope: 'write' },
    { path: '/api/lunch-breaks/**', scope: 'write' },
    { path: '/api/users', methods: ['GET'], scope: 'read' },
    { path: '/api/documents/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    ...CLIENT_ADMIN_WRITE_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // CONTABILIDAD
  // ─────────────────────────────────────────────────────────────────
  [ROLES.CONTABILIDAD]: [
    ...CORE_RECURSOS_URL_RULES,
    ...MEETINGS_STAFF_URL_RULES,
    ...ACTIVITY_SUPERIOR_URL_RULES,
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/contabilidad/**', scope: 'write' },
    { path: '/erp/contabilidad', scope: 'write' },
    { path: '/erp/accounting/**', scope: 'write' },
    { path: '/erp/banking/**', scope: 'write' },
    { path: '/erp/invoicing/**', scope: 'write' },
    { path: '/erp/finance/**', scope: 'write' },
    { path: '/erp/exports', scope: 'read' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/chat', scope: 'write' },
    { path: '/erp/documents/**', scope: 'read' },
    { path: '/api/chat/**', scope: 'write' },
    { path: '/api/documents/**', methods: ['GET'], scope: 'read' },
    // Autoriza gastos y comprobaciones (tier 60, ya previsto en `section-views`).
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/kb/**', scope: 'read' },
    { path: '/api/workflow/**', methods: ['GET', 'POST'], scope: 'approve' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    // Hacía falta abrir la cotización, no solo verla en el listado.
    { path: '/crm/quotes/**', methods: ['GET'], scope: 'read' },
    { path: '/crm/projects/**', methods: ['GET'], scope: 'read' },
    { path: '/api/cotizaciones/**', methods: ['GET'], scope: 'read' },
    VISTA_PREVIA_COTIZACION_URL_RULE,
    { path: '/api/accounting/**', scope: 'write' },
    { path: '/api/ventas/proyectos/**', methods: ['GET'], scope: 'read' },
    { path: '/api/expenses/**', scope: 'write' },
    { path: '/api/employee-payments/**', methods: ['GET', 'POST'], scope: 'write' },
    { path: '/api/overtime-approvals/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    ...CLIENT_ADMIN_WRITE_URL_RULES,
    ...SELF_ATTENDANCE_URL_RULES,
  ],

  // ─────────────────────────────────────────────────────────────────
  // CLIENTE EXTERNO — portal
  // ─────────────────────────────────────────────────────────────────
  [ROLES.CLIENTE]: [
    { path: '/tickets/**', scope: 'write' },
    { path: '/api/client-portal/**', scope: 'write' },
    { path: '/api/client-ticket-requests/**', scope: 'write' },
    { path: '/api/branch-portal/**', scope: 'read' },
    // Integra: solo su company (TenantInterceptor). Sin settings/sites write.
    { path: '/integra', scope: 'read' },
    { path: '/integra/**', scope: 'read' },
    { path: '/api/integra/health', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/dashboard', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/portfolio', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/capabilities', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/regions', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/sites', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/cameras', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/cameras/**', methods: ['GET', 'POST'], scope: 'read' },
    { path: '/api/integra/doors', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/doors/*/open', methods: ['POST'], scope: 'write' },
    { path: '/api/integra/devices', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/events', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/events/**', methods: ['POST'], scope: 'read' },
    { path: '/api/integra/push/events', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/push/events/**', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/push/stream', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/attendance', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/occupancy', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/presence/**', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/orgs', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/people', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/people/*/access', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/access-schedules', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/access-schedules/**', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/spaces', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/spaces/**', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/privilege-groups', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/vehicles', methods: ['GET'], scope: 'read' },
    { path: '/api/integra/alarms/**', methods: ['GET', 'POST'], scope: 'read' },
    { path: '/api/integra/event-router/**', methods: ['GET', 'POST'], scope: 'read' },
    { path: '/api/integra/visitors/**', methods: ['POST'], scope: 'write' },
    { path: '/api/integra/anpr/**', methods: ['POST'], scope: 'read' },
    { path: '/api/integra/sync/last', methods: ['GET'], scope: 'read' },
  ],
};

/* ──────────────────────────────────────────────────────────────────
 *  Normalización de paths legacy → canónicos
 * ────────────────────────────────────────────────────────────────── */

const LEGACY_PANEL_PREFIX_MAP: Record<string, string> = {
  '/core': '/erp',
  '/sales': '/crm',
  '/portal': '/tickets',
};

/** Normaliza un pathname/url al prefijo de panel canónico. */
export function normalizeUrlToCanonical(url: string): string {
  const clean = url.split('?')[0].replace(/\/+$/, '') || '/';
  for (const [legacy, canonical] of Object.entries(LEGACY_PANEL_PREFIX_MAP)) {
    if (clean === legacy) return canonical;
    if (clean.startsWith(`${legacy}/`)) return `${canonical}${clean.slice(legacy.length)}`;
  }
  return clean;
}

/* ──────────────────────────────────────────────────────────────────
 *  Matcher
 * ────────────────────────────────────────────────────────────────── */

function compilePattern(path: string): RegExp {
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*/g, '(/.*)?')
    .replace(/\/\*/g, '/[^/]+')
    .replace(/:[a-zA-Z_]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

const compiledCache = new Map<string, RegExp>();

function regexFor(path: string): RegExp {
  let r = compiledCache.get(path);
  if (!r) {
    r = compilePattern(path);
    compiledCache.set(path, r);
  }
  return r;
}

/**
 * Verifica si un rol puede acceder a una URL+método.
 *
 * @returns objeto con `allowed`, `scope` y la regla que matcheó (para auditoría).
 */
export function checkUrlAccess(
  role: RoleKey,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
): { allowed: boolean; scope?: Scope; matchedRule?: string } {
  if (role === ROLES.SUPER_ADMIN) return { allowed: true, scope: 'admin' };

  // Normaliza: quita query, trailing slash, y mapea paths legacy → canónicos.
  const path = normalizeUrlToCanonical(url);

  const rules = [...(URL_MATRIX[role] ?? []), ...SHARED_SESSION_URL_RULES];
  for (const rule of rules) {
    if (rule.methods && !rule.methods.includes(method)) continue;
    if (regexFor(rule.path).test(path)) {
      return { allowed: true, scope: rule.scope, matchedRule: rule.path };
    }
  }
  return { allowed: false };
}

/** Devuelve todas las URLs permitidas para un rol (útil para introspección/UI). */
export function listAllowedUrls(role: RoleKey): UrlRule[] {
  return URL_MATRIX[role] ?? [];
}
