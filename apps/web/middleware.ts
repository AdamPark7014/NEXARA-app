import { NextRequest, NextResponse } from 'next/server';

/**
 * Traduce segmentos legacy en español a sus equivalentes canónicos del
 * access-matrix (Fase 2.3 — consolidación a 5 paneles).
 *
 * Ejemplos:
 *   /crm/cotizaciones  →  /crm/quotes
 *   /crm/clientes      →  /crm/clients
 *   /ops/viaticos      →  /ops/viatics
 *   /erp/multas        →  /erp/hr/fines
 *   /erp/cvs           →  /ops/recruiting
 *
 * Esto evita romper enlaces externos viejos en correos, redes y bookmarks.
 */
function remapLegacySlugs(pathname: string): string {
  const SEGMENT_ALIASES: Record<string, string> = {
    // CRM (español → inglés canónico)
    cotizaciones: 'quotes',
    plantillas: 'templates',
    proyectos: 'projects',
    licitaciones: 'tenders',
    productos: 'products',
    clientes: 'clients',
    oportunidades: 'opportunities',
    cuotas: 'targets',
    reportes: 'reports',
    'sales-team': 'team',
    // OPS
    viaticos: 'viatics',
    'mis-viaticos': 'my-viatics',
    'mis-actividades': 'my-activities',
    'mis-evidencias': 'my-evidences',
    'mis-vehiculos': 'my-vehicles',
    vehiculos: 'vehicles',
    actividades: 'activities',
    evidencias: 'evidences',
    herramientas: 'tools',
    mantenimiento: 'maintenance',
    monitoreo: 'noc',
    soporte: 'support',
    reclutamiento: 'recruiting',
    'service-clients': 'service-clients',
    // ERP / People
    asistencia: 'attendance',
    'mis-vacaciones': 'my-vacation',
    multas: 'fines',
    organigrama: 'orgchart',
    'kpis-rh': 'kpis',
    nomina: 'employee-payments',
    gastos: 'expenses',
    bancos: 'banking',
    contabilidad: 'accounting',
    facturacion: 'invoicing',
    almacen: 'warehouse',
    compras: 'procurement',
    auditoria: 'audit',
    documentos: 'documents',
    exportaciones: 'exports',
    notificaciones: 'notifications-center',
    calendario: 'calendar',
    'mi-perfil': 'my-profile',
    'mi-equipo': 'team',
    'mi-area': 'orgchart',
    // Studio
    paginas: 'pages',
    casos: 'cases',
    noticias: 'news',
    redes: 'social',
    contactos: 'contacts',
    boletin: 'newsletter',
    // Re-mapeos especiales: páginas que ya no existen en su carpeta antigua
    cvs: 'recruiting', // gestión de CVs → reclutamiento técnico en OPS
  };

  // Re-mapeos cross-panel (cuando el path entero cambia de hogar)
  const CROSS_PANEL_REMAPS: Array<[RegExp, string]> = [
    // CVs (gestión de hojas de vida) ahora vive en OPS · Reclutamiento
    [/^\/erp\/cvs(\/.*)?$/, '/ops/recruiting'],
    [/^\/erp\/recruiting(\/.*)?$/, '/ops/recruiting'],
    // Cotizaciones bajo ERP → CRM (es una vista comercial, no admin)
    [/^\/erp\/cotizaciones(\/.*)?$/, '/crm/quotes'],
    [/^\/erp\/quotes(\/.*)?$/, '/crm/quotes'],
    // Multas en /erp/multas (legacy) → /erp/hr/fines
    [/^\/erp\/multas(\/?.*)$/, '/erp/hr/fines'],
    [/^\/erp\/fines(\/?.*)$/, '/erp/hr/fines'],
    // Asistencia / vacaciones / kpis-rh sueltos → submódulo de hr
    [/^\/erp\/asistencia(\/?.*)$/, '/erp/hr/attendance'],
    [/^\/erp\/attendance(\/?.*)$/, '/erp/hr/attendance'],
    [/^\/erp\/lunch-breaks(\/?.*)$/, '/erp/hr/lunch-breaks'],
    [/^\/erp\/my-lunch-breaks(\/?.*)$/, '/erp/hr/lunch-breaks'],
    [/^\/erp\/my-vacation(\/?.*)$/, '/erp/hr/attendance'],
    [/^\/erp\/team(\/?.*)$/, '/erp/hr/orgchart'],
    [/^\/erp\/my-area(\/?.*)$/, '/erp/hr/orgchart'],
    // /erp/viaticos → /erp/finance/viatics
    [/^\/erp\/viaticos(\/?.*)$/, '/erp/finance/viatics'],
    [/^\/erp\/viatics(\/?.*)$/, '/erp/finance/viatics'],
    // /erp/gastos → /erp/finance/expenses
    [/^\/erp\/expenses(\/?.*)$/, '/erp/finance/expenses'],
    [/^\/erp\/employee-payments(\/?.*)$/, '/erp/finance/employee-payments'],
    // contact-messages legacy → studio/contacts
    [/^\/erp\/contact-messages(\/?.*)$/, '/studio/contacts'],
    // accounting/reports → solo /erp/accounting
    [/^\/erp\/accounting\/reports(\/?.*)$/, '/erp/accounting'],
    [/^\/erp\/procurement\/dashboard(\/?.*)$/, '/erp/procurement'],
    // operacion/work-projects → ops/projects
    [/^\/ops\/work-projects(\/?.*)$/, '/ops/projects'],
    [/^\/ops\/assets\/depreciation(\/?.*)$/, '/ops/assets'],
    // financial-dashboard → executive
    [/^\/erp\/financial-dashboard(\/?.*)$/, '/erp/executive'],
    // dashboard duplicados
    [/^\/erp\/dashboard\/dashboard(\/?.*)$/, '/erp/dashboard'],
    // Newsletter consolidada con comunicados en /erp/news (tabs)
    [/^\/erp\/newsletter(\/?.*)$/, '/erp/news'],
    // Stock visto dentro de Almacén (sin pestaña separada)
    [/^\/erp\/warehouse\/stock(\/?.*)$/, '/erp/warehouse'],
  ];

  for (const [pattern, target] of CROSS_PANEL_REMAPS) {
    const match = pathname.match(pattern);
    if (match) {
      const rest = match[1] || '';
      return `${target}${rest && rest !== '/' ? rest : ''}`;
    }
  }

  // Reemplazos de segmentos individuales
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return pathname;
  const panel = segments[0];
  if (!['erp', 'crm', 'ops', 'studio', 'lab'].includes(panel)) return pathname;

  const remapped = segments.map((seg, idx) => {
    if (idx === 0) return seg;
    return SEGMENT_ALIASES[seg] || seg;
  });
  return '/' + remapped.join('/');
}

/**
 * Middleware para manejar subdominios dinámicos
 * Mapea subdominios a carpetas internas en Next.js
 * 
 * Ejemplos:
 * - consola.nexara.com.mx → carpeta [subdomain] con slug=console
 * - ventas.nexara.com.mx → carpeta [subdomain] con slug=ventas
 * - localhost:3000/console → carpeta [subdomain] con slug=console (para desarrollo)
 */

// Mapeo de subdominios públicos al panel CANÓNICO del nuevo modelo de 5
// paneles consolidados (single source of truth: access-matrix.ts).
// La clave es el subdominio del host (parte antes del primer punto).
// El valor es el prefijo de path interno donde vive ese panel:
//   erp.nexara.com.mx           → /erp
//   crm.nexara.com.mx           → /crm
//   ops.nexara.com.mx           → /ops
//   studio.nexara.com.mx        → /studio
//   lab.nexara.com.mx           → /lab
//   portal.nexara.com.mx        → /tickets (portal cliente externo)
//
// Aliases legacy (consola, ventas, operacion, contabilidad…) también
// existen para no romper bookmarks; apuntan al panel consolidado correcto.
const SUBDOMAIN_MAP: Record<string, string> = {
  // ── ERP (núcleo administrativo) ──
  'erp': '/erp',
  'core': '/erp',
  'app': '/erp',
  'console': '/erp',
  'consola': '/erp',
  'contabilidad': '/erp',
  'finance': '/erp',
  'admin': '/erp',
  'people': '/erp/hr',
  'rh': '/erp/hr',
  'hr': '/erp/hr',
  // ── CRM (comercial) ──
  'crm': '/crm',
  'sales': '/crm',
  'ventas': '/crm',
  // ── OPS (campo, NOC, soporte) ──
  'ops': '/ops',
  'operacion': '/ops',
  'noc': '/ops/noc',
  'monitor': '/ops/noc',
  'support': '/ops/support',
  'help': '/ops/support',
  // ── STUDIO (sitio público, marketing) ──
  'studio': '/studio',
  'web': '/studio',
  'media': '/studio',
  // ── LAB (sandbox técnico) ──
  'lab': '/lab',
  'dev': '/lab',
  // ── Portal cliente externo (sigue siendo subdomain dedicado) ──
  'portal': '/tickets',
  'tickets': '/tickets',
};

// Subdominio canónico por panel interno (la URL "bonita" en producción).
// El resto de aliases se redirige 308 al canónico cuando estás en .nexara.com.mx.
//   /erp        → core.nexara.com.mx
//   /crm        → sales.nexara.com.mx
//   /ops        → ops.nexara.com.mx
//   /studio     → studio.nexara.com.mx
//   /lab        → lab.nexara.com.mx
//   /tickets    → portal.nexara.com.mx
const CANONICAL_BY_INTERNAL_PREFIX: Record<string, string> = {
  '/erp': 'core',
  '/crm': 'sales',
  '/ops': 'ops',
  '/studio': 'studio',
  '/lab': 'lab',
  '/tickets': 'portal',
};

const DEFAULT_ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SUSPICIOUS_PATH_PATTERN = /\.\.|%2e%2e|%00|<|>|\\/i;
const SUSPICIOUS_QUERY_PATTERN = /<script|javascript:|union\s+select|or\s+1\s*=\s*1|drop\s+table|information_schema|%00|\$\{jndi:/i;
const MALICIOUS_USER_AGENT_PATTERN = /sqlmap|nikto|acunetix|dirbuster|wpscan|masscan|nmap|burpsuite|gobuster/i;
const SENSITIVE_PATH_PATTERN = /\/(auth|login|signin|reset-password|api\/auth)\b/i;
const HONEYPOT_PATH_PATTERN = /\/(wp-admin|wp-login|phpmyadmin|\.git|\.env|\.aws|server-status|\.well-known\/acme-challenge(?!\/))/i;

const getAllowedSubdomains = (): string[] => {
  const envSubdomains = process.env.ALLOWED_SUBDOMAINS;
  if (!envSubdomains) {
    return Object.keys(SUBDOMAIN_MAP);
  }

  const configured = envSubdomains
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : Object.keys(SUBDOMAIN_MAP);
};

const buildDefaultAllowedHostPatterns = (): RegExp[] => {
  const allowedSubdomains = getAllowedSubdomains().map((subdomain) => subdomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const subdomainAlternation = allowedSubdomains.join('|');

  return [
    /^localhost(?::\d+)?$/i,
    /^127\.0\.0\.1(?::\d+)?$/i,
    /^nexara\.com\.mx(?::\d+)?$/i,
    /^www\.nexara\.com\.mx(?::\d+)?$/i,
    new RegExp(`^(${subdomainAlternation})\\.localhost(?::\\d+)?$`, 'i'),
    new RegExp(`^(${subdomainAlternation})\\.nexara\\.com\\.mx(?::\\d+)?$`, 'i'),
    new RegExp(`^(${subdomainAlternation})\\.nexara\\.local(?::\\d+)?$`, 'i'),
  ];
};

const buildCsp = () => {
  const isDev = process.env.NODE_ENV !== 'production';
  
  // Permitir scripts de servicios externos con API keys
  const externalScriptSources = [
    'https://maps.googleapis.com',
    'https://maps.google.com',
    'https://www.google.com',
    'https://api.brevo.com',
    'https://sibautomation.com',
    'https://js.stripe.com',
  ].join(' ');
  
  const scriptSrc = isDev 
    ? `'self' 'unsafe-inline' 'unsafe-eval' ${externalScriptSources}` 
    : `'self' 'unsafe-inline' ${externalScriptSources}`;

  // Permitir conexiones a APIs externas
  const externalConnectSources = [
    'https://maps.googleapis.com',
    'https://api.brevo.com',
    'https://api.sendinblue.com',
    'https://in-automate.brevo.com',
    'https://api.stripe.com',
  ].join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https:",
    isDev
      ? "img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:* http://*.localhost:*"
      : "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    `connect-src 'self' https: wss: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* http://*.localhost:* ws://*.localhost:* wss://*.localhost:* ${externalConnectSources}`,
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
};

const applySecurityHeaders = (response: NextResponse) => {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self), payment=(self)');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site');
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('Content-Security-Policy', buildCsp());
  return response;
};

const applyNoStoreForHtml = (request: NextRequest, response: NextResponse) => {
  const accept = (request.headers.get('accept') || '').toLowerCase();
  const isHtmlRequest = accept.includes('text/html');
  const pathname = request.nextUrl.pathname;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');

  if (isHtmlRequest && !isApi) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
};

const rejectWithSecurityHeaders = (message: string, status: number) => {
  return applySecurityHeaders(new NextResponse(message, { status }));
};

const getAllowedHostPatterns = (): RegExp[] => {
  const defaultPatterns = buildDefaultAllowedHostPatterns();
  const envHosts = process.env.ALLOWED_HOSTS;
  if (!envHosts) {
    return defaultPatterns;
  }

  const exactHosts = envHosts
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return [...defaultPatterns, ...exactHosts.map((host) => new RegExp(`^${host}(?::\\d+)?$`, 'i'))];
};

const ALLOWED_HOST_PATTERNS = getAllowedHostPatterns();

const isAllowedHost = (host: string) => {
  return ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host));
};

export function middleware(request: NextRequest) {
  if (!DEFAULT_ALLOWED_METHODS.has(request.method.toUpperCase())) {
    return rejectWithSecurityHeaders('Método no permitido', 405);
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (MALICIOUS_USER_AGENT_PATTERN.test(userAgent)) {
    return rejectWithSecurityHeaders('Cliente no permitido', 403);
  }

  const pathnameWithQuery = `${request.nextUrl.pathname}${request.nextUrl.search || ''}`;
  if (HONEYPOT_PATH_PATTERN.test(request.nextUrl.pathname)) {
    return rejectWithSecurityHeaders('Not found', 404);
  }

  if (SUSPICIOUS_PATH_PATTERN.test(pathnameWithQuery)) {
    return rejectWithSecurityHeaders('Ruta inválida', 400);
  }

  const queryString = request.nextUrl.searchParams.toString();
  if (SUSPICIOUS_QUERY_PATTERN.test(queryString)) {
    return rejectWithSecurityHeaders('Query inválida', 400);
  }

  const mutatingMethod = request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE';
  if (mutatingMethod) {
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite.toLowerCase())) {
      return rejectWithSecurityHeaders('Cross-site request bloqueada', 403);
    }
  }

  const hostname = request.headers.get('host')?.trim().toLowerCase();
  
  if (!hostname) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (!isAllowedHost(hostname)) {
    return rejectWithSecurityHeaders('Host no permitido', 400);
  }

  const hostWithoutPort = hostname.split(':')[0];
  const requestPathname = request.nextUrl.pathname;

  // ════════════════════════════════════════════════════════════════════
  //  Auth gate de panel (server-side, antes del render)
  // ════════════════════════════════════════════════════════════════════
  // Cualquier path que viva dentro de un panel privado (/erp, /crm, /ops,
  // /studio, /lab y sus alias legacy/subdominios) requiere que el usuario
  // haya iniciado sesión. La autenticación cliente vive en `sessionStorage`,
  // pero el AuthService también setea la cookie no-HTTPOnly `nx_session=1`
  // (ver `apps/web/components/UserContext.tsx` → `safePersistUser`). Sin
  // esa cookie, redirigimos a `/login` ANTES de renderizar nada para
  // eliminar el flash de UI que se mostraba al público sin sidebar.
  //
  // El portal cliente (`/tickets`) tiene su propio gate dentro del layout
  // porque permite registro/login desde la misma URL.
  if (request.method === 'GET' || request.method === 'HEAD') {
    const isPanelPath = /^\/(erp|crm|ops|studio|lab|console|consola|contabilidad|people|operacion|noc|support|ventas|web)(\/.*)?$/.test(requestPathname);
    const accept = (request.headers.get('accept') || '').toLowerCase();
    const isHtmlNav = accept.includes('text/html');
    if (isPanelPath && isHtmlNav) {
      const sessionCookie = request.cookies.get('nx_session');
      if (!sessionCookie || sessionCookie.value !== '1') {
        const url = request.nextUrl.clone();
        const nextPath = `${requestPathname}${request.nextUrl.search || ''}`;
        url.pathname = '/login';
        url.search = `?next=${encodeURIComponent(nextPath)}`;
        return applySecurityHeaders(NextResponse.redirect(url, 302));
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  Migración a la arquitectura de 5 paneles consolidados (Fase 2.3)
  // ════════════════════════════════════════════════════════════════════
  //  Cuando alguien intenta un path legacy (/console/*, /operacion/*,
  //  /ventas/*, /contabilidad/*, /web/*, /people/*, /noc/*, /support/*,
  //  /lab/* sin el prefijo nuevo), lo redirigimos 308 al equivalente en
  //  la nueva arquitectura. La fuente de verdad es access-matrix.ts.
  //
  //  Reglas:
  //   - console        → erp
  //   - contabilidad   → erp  (todo "/contabilidad/X" → "/erp/X")
  //   - people         → erp/hr  (RH bajo ERP)
  //   - operacion      → ops
  //   - noc            → ops/noc/<resto>
  //   - support        → ops/support/<resto>
  //   - ventas         → crm
  //   - web            → studio
  //   - lab            → lab  (mismo nombre, sin cambio)
  //   - tickets        → tickets  (portal externo, NO se toca)
  if (request.method === 'GET' || request.method === 'HEAD') {
    const LEGACY_PREFIX_MAP: Array<[RegExp, string]> = [
      // console y contabilidad → ambos viven dentro de /erp
      [/^\/console(\/.*)?$/, '/erp'],
      [/^\/contabilidad(\/.*)?$/, '/erp'],
      // people → /erp/hr (RH consolidado bajo ERP)
      [/^\/people\/?$/, '/erp/hr'],
      [/^\/people(\/.*)$/, '/erp/hr'],
      // operacion → /ops
      [/^\/operacion(\/.*)?$/, '/ops'],
      // noc legacy → /ops/noc (NOC ya es submódulo de OPS)
      [/^\/noc\/?$/, '/ops/noc'],
      [/^\/noc(\/.*)$/, '/ops/noc'],
      // support legacy → /ops/support
      [/^\/support\/?$/, '/ops/support'],
      [/^\/support(\/.*)$/, '/ops/support'],
      // ventas → /crm
      [/^\/ventas(\/.*)?$/, '/crm'],
      // web → /studio
      [/^\/web(\/.*)?$/, '/studio'],
    ];

    for (const [pattern, newPrefix] of LEGACY_PREFIX_MAP) {
      const match = requestPathname.match(pattern);
      if (!match) continue;
      const rest = match[1] || '';
      // No redirigir cuando entramos por subdominio (rewrite interno);
      // esos casos los maneja el bloque de subdominio más abajo.
      const url = request.nextUrl.clone();
      url.pathname = `${newPrefix}${rest}`;
      // Mapeos de slug específicos legacy → canónico nuevo
      url.pathname = remapLegacySlugs(url.pathname);
      return applySecurityHeaders(NextResponse.redirect(url, 308));
    }

    // ── Path ya nuevo pero con segmentos en español (p.ej. /crm/cotizaciones) ──
    // Si después del remap el path cambia, hacemos redirect 308 al canónico.
    if (/^\/(erp|crm|ops|studio|lab)\//.test(requestPathname)) {
      const remapped = remapLegacySlugs(requestPathname);
      if (remapped !== requestPathname) {
        const url = request.nextUrl.clone();
        url.pathname = remapped;
        return applySecurityHeaders(NextResponse.redirect(url, 308));
      }
    }
  }

  // Remover puerto para obtener host limpio
  const hostParts = hostWithoutPort.split('.');

  // Detectar tipo de entorno y subdominio
  const isLocalhost = hostWithoutPort.includes('localhost') || hostWithoutPort === '127.0.0.1';
  const isWildcard = hostWithoutPort.includes('nexara.com.mx') || hostWithoutPort.includes('nexara.local');
  
  let subdomain: string | null = null;

  if (isLocalhost) {
    // En desarrollo: detectar subdominios como consola.localhost, ventas.localhost
    if (hostParts.length > 1 && hostParts[0] !== 'localhost') {
      // Si es algo.localhost, extraer "algo"
      subdomain = hostParts[0];
    }
  } else if (isWildcard) {
    // *.nexara.com.mx tiene al menos 4 etiquetas (ej. consola.nexara.com.mx).
    // nexara.com.mx (3) es el dominio raíz, no un subdominio llamado "nexara".
    const isComMx =
      hostParts.length >= 2 &&
      hostParts[hostParts.length - 2] === "com" &&
      hostParts[hostParts.length - 1] === "mx";
    const minPartsForSubdomain = isComMx ? 4 : 3;
    if (hostParts.length >= minPartsForSubdomain) {
      const potential = hostParts[0];
      if (potential && potential !== 'www') {
        subdomain = potential;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Sitio público para dominio base (nexara.com.mx)
  // ════════════════════════════════════════════════════════════════════
  // El sitio público vive en `apps/web/app/(public)/*`. Las rutas como `/`,
  // `/servicios`, `/contacto`, `/cotizaciones/firmar/[token]`, etc. ya
  // resuelven directamente desde ese route-group, así que NO necesitamos
  // reescribir aquí. La home `/` se reescribe a `/nexara` más abajo (línea
  // ~657) para servir `(public)/nexara/page.tsx` sin cambiar la URL.
  //
  // ⚠️ NO reescribir `nexara.com.mx/*` → `/studio/*`: `/studio` es un panel
  // privado (AppShell + auth gate) y el guard server-side acabaría en un
  // bucle hacia `/login` y un 404 final. El sitio público de marketing es
  // independiente del CMS Studio (que sólo usan los diseñadores logueados).

  const isMappedPanelSubdomain = Boolean(subdomain && SUBDOMAIN_MAP[subdomain]);

  // Si detectamos un subdominio conocido, reescribir a la ruta interna del
  // panel consolidado correspondiente (single source of truth: access-matrix).
  if (isMappedPanelSubdomain && subdomain) {
    const internalPrefix = SUBDOMAIN_MAP[subdomain]; // p.ej. "/erp", "/ops", "/erp/hr"
    const pathname = request.nextUrl.pathname;

    // ── Canonical redirect (solo producción) ──
    // Si el host actual es un alias legacy (consola.X, ventas.X, etc.), redirigir
    // 308 al subdominio canónico del panel:
    //   consola.nexara.com.mx     → erp.nexara.com.mx
    //   contabilidad.nexara.com.mx → erp.nexara.com.mx
    //   ventas.nexara.com.mx      → crm.nexara.com.mx
    //   operacion.nexara.com.mx   → ops.nexara.com.mx
    //   web.nexara.com.mx         → studio.nexara.com.mx
    //   noc.nexara.com.mx         → ops.nexara.com.mx (con path /noc preservado)
    const canonicalSub = CANONICAL_BY_INTERNAL_PREFIX[internalPrefix.split('/').slice(0, 2).join('/')];
    const enableCanonicalRedirect =
      !isLocalhost &&
      hostWithoutPort.endsWith('.nexara.com.mx') &&
      canonicalSub &&
      subdomain !== canonicalSub &&
      (request.method === 'GET' || request.method === 'HEAD');

    if (enableCanonicalRedirect) {
      const url = request.nextUrl.clone();
      url.hostname = `${canonicalSub}.nexara.com.mx`;
      // `nextUrl` may preserve the internal service port (3000) behind Traefik.
      // Force default HTTPS port for external canonical redirects.
      url.port = '';
      // Si el alias mapea a un sub-path (p.ej. people → /erp/hr, noc → /ops/noc),
      // preservar ese sub-path. P.ej. people.X.com/calendar → erp.X.com/hr/calendar.
      const extraPath = internalPrefix.split('/').slice(2).join('/');
      if (extraPath && pathname !== '/') {
        url.pathname = `/${extraPath}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
      } else if (extraPath) {
        url.pathname = `/${extraPath}`;
      }
      return applySecurityHeaders(NextResponse.redirect(url, 308));
    }

    // Cuando entramos por subdominio: redirigir paths legacy (/console/X, /ventas/Y…)
    // al nuevo modelo antes de hacer el rewrite (también cubre el caso console → ops).
    if (request.method === 'GET' || request.method === 'HEAD') {
      const legacyPrefixHit = /^\/(console|contabilidad|people|operacion|ventas|web|noc|support)(\/.*)?$/.exec(pathname);
      if (legacyPrefixHit) {
        const url = request.nextUrl.clone();
        // Forzar pathname canónico, descartando el alias legacy
        url.pathname = '/';
        // El bloque legacy global ya cubrió esto, pero lo dejamos aquí como red de seguridad.
        return applySecurityHeaders(NextResponse.redirect(url, 308));
      }
    }

    if (
      pathname.startsWith('/_next/') ||
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/uploads/') ||
      pathname === '/socket.io' ||
      pathname.startsWith('/socket.io/')
    ) {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }

    // Si la ruta YA está prefijada con el panel canónico (p.ej. /erp/dashboard
    // en erp.localhost), no reescribir para evitar /erp/erp/dashboard.
    const firstSegment = '/' + (pathname.split('/').filter(Boolean)[0] || '');
    const prefixRoot = '/' + internalPrefix.split('/').filter(Boolean)[0];
    if (firstSegment === prefixRoot) {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }

    // No reescribir archivos estáticos
    const staticFileExtensions = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js|json)$/i;
    if (staticFileExtensions.test(pathname)) {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }

    // Hub de selección de paneles vive en /paneles, no bajo el subdominio
    if (pathname === '/paneles' || pathname === '/paneles/') {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }

    // Login vive en /(auth)/login, no bajo el subdominio
    if (pathname === '/login' || pathname === '/login/') {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }

    // Reescribir a <internalPrefix><pathname>
    //   erp.localhost/          → /erp
    //   erp.localhost/dashboard → /erp/dashboard
    //   crm.localhost/leads     → /crm/leads
    //   ops.localhost/my-activities → /ops/my-activities
    //   people.localhost/orgchart   → /erp/hr/orgchart
    const trimmedPath = pathname === '/' ? '' : pathname;
    const rewritePath = `${internalPrefix}${trimmedPath}`;

    const url = request.nextUrl.clone();
    url.pathname = remapLegacySlugs(rewritePath); // por si el path tiene segmentos en español

    const response = applySecurityHeaders(NextResponse.rewrite(url));
    return applyNoStoreForHtml(request, response);
  }

  // URL legacy: consolidar en / (canonical del sitio público)
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    request.nextUrl.pathname === '/nexara' &&
    !isMappedPanelSubdomain
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return applySecurityHeaders(NextResponse.redirect(url, 308));
  }

  // Dominio principal: reescribir / para servir /nexara/page.tsx sin cambiar URL
  if ((request.method === 'GET' || request.method === 'HEAD') && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/nexara';
    const rewriteResponse = applySecurityHeaders(NextResponse.rewrite(url));
    return applyNoStoreForHtml(request, rewriteResponse);
  }

  const response = applyNoStoreForHtml(request, applySecurityHeaders(NextResponse.next()));
  if (SENSITIVE_PATH_PATTERN.test(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Ejecutar middleware en todas las rutas EXCEPTO:
     * - Archivos estáticos: _next/static
     * - Favicon e íconos: favicon.ico, icon.png, etc.
     * - Archivos públicos: robots.txt, sitemap.xml
     */
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|icon.png|robots.txt|sitemap.xml).*)',
  ],
};
