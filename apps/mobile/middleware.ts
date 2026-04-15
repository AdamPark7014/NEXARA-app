import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware para manejar subdominios dinámicos
 * Mapea subdominios a carpetas internas en Next.js
 * 
 * Ejemplos:
 * - consola.nexara.com.mx → carpeta [subdomain] con slug=console
 * - ventas.nexara.com.mx → carpeta [subdomain] con slug=ventas
 * - localhost:3000/console → carpeta [subdomain] con slug=console (para desarrollo)
 */

// Mapeo de subdominios públicos a carpetas internas
const SUBDOMAIN_MAP: Record<string, string> = {
  'consola': 'console',
  'console': 'console',
  'ventas': 'ventas',
  'web': 'web',
  'contabilidad': 'contabilidad',
  'tickets': 'tickets',
};

const KNOWN_PANEL_SLUGS = new Set(Object.values(SUBDOMAIN_MAP));
const PANEL_LOGIN_PATH_PATTERN = /^\/(console|ventas|contabilidad|tickets|web)\/login\/?$/i;

const DEFAULT_ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SUSPICIOUS_PATH_PATTERN = /\.\.|%2e%2e|%00|<|>|\\/i;
const SUSPICIOUS_QUERY_PATTERN = /<script|javascript:|union\s+select|or\s+1\s*=\s*1|drop\s+table|information_schema|%00|\$\{jndi:/i;
const MALICIOUS_USER_AGENT_PATTERN = /sqlmap|nikto|acunetix|dirbuster|wpscan|masscan|nmap|burpsuite|gobuster/i;
const SENSITIVE_PATH_PATTERN = /\/(auth|login|signin|reset-password|api\/auth)\b/i;
const HONEYPOT_PATH_PATTERN = /\/(wp-admin|wp-login|phpmyadmin|\.git|\.env|\.aws|server-status|\.well-known\/acme-challenge(?!\/))/i;
const STATIC_FILE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js|json)$/i;
const DEFAULT_ALLOWED_IP_HOSTS = [
  '138.197.42.104',
  '10.17.0.5',
];

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
  const allowedIpHosts = DEFAULT_ALLOWED_IP_HOSTS.map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return [
    /^localhost(?::\d+)?$/i,
    /^127\.0\.0\.1(?::\d+)?$/i,
    /^nexara\.com\.mx(?::\d+)?$/i,
    /^www\.nexara\.com\.mx(?::\d+)?$/i,
    ...allowedIpHosts.map((host) => new RegExp(`^${host}(?::\\d+)?$`, 'i')),
    new RegExp(`^(${subdomainAlternation})\\.localhost(?::\\d+)?$`, 'i'),
    new RegExp(`^(${subdomainAlternation})\\.nexara\\.com\\.mx(?::\\d+)?$`, 'i'),
    new RegExp(`^(${subdomainAlternation})\\.nexara\\.local(?::\\d+)?$`, 'i'),
  ];
};

const DIRECT_IP_HOST_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const isDirectIpHost = (host: string) => {
  return DIRECT_IP_HOST_PATTERN.test(host) || DEFAULT_ALLOWED_IP_HOSTS.includes(host);
};

const buildCsp = (hostname?: string) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const hostWithoutPort = (hostname || '').split(':')[0].trim().toLowerCase();
  const shouldAllowHttpHost = hostWithoutPort !== '' && isDirectIpHost(hostWithoutPort);
  
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

  const directHostConnectSources = shouldAllowHttpHost
    ? `http://${hostWithoutPort}:* ws://${hostWithoutPort}:*`
    : '';

  const directHostAssetSources = shouldAllowHttpHost
    ? `http://${hostWithoutPort}:*`
    : '';

  const devLocalAssetSources = "http://localhost:* http://127.0.0.1:* http://*.localhost:*";
  const imgSrc = isDev
    ? `'self' data: blob: https: ${devLocalAssetSources} ${directHostAssetSources}`
    : "'self' data: blob: https:";
  const frameSrc = isDev
    ? `'self' https: ${devLocalAssetSources} ${directHostAssetSources}`
    : "'self' https:";

  const cspDirectives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https:",
    `img-src ${imgSrc}`,
    `frame-src ${frameSrc}`,
    "font-src 'self' data: https:",
    `connect-src 'self' https: wss: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* http://*.localhost:* ws://*.localhost:* wss://*.localhost:* ${directHostConnectSources} ${externalConnectSources}`,
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ];

  if (!isDev && !shouldAllowHttpHost) {
    cspDirectives.push('upgrade-insecure-requests');
  }

  return cspDirectives.join('; ');
};

const applySecurityHeaders = (response: NextResponse, request?: NextRequest) => {
  const hostname = request?.headers.get('host')?.trim().toLowerCase();
  const hostWithoutPort = (hostname || '').split(':')[0];
  const shouldAllowHttpHost = hostWithoutPort !== '' && isDirectIpHost(hostWithoutPort);
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
  if (!shouldAllowHttpHost) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  response.headers.set('Content-Security-Policy', buildCsp(hostname));
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

const rejectWithSecurityHeaders = (message: string, status: number, request?: NextRequest) => {
  return applySecurityHeaders(new NextResponse(message, { status }), request);
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
    return rejectWithSecurityHeaders('Método no permitido', 405, request);
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (MALICIOUS_USER_AGENT_PATTERN.test(userAgent)) {
    return rejectWithSecurityHeaders('Cliente no permitido', 403, request);
  }

  const pathnameWithQuery = `${request.nextUrl.pathname}${request.nextUrl.search || ''}`;
  if (HONEYPOT_PATH_PATTERN.test(request.nextUrl.pathname)) {
    return rejectWithSecurityHeaders('Not found', 404, request);
  }

  if (SUSPICIOUS_PATH_PATTERN.test(pathnameWithQuery)) {
    return rejectWithSecurityHeaders('Ruta inválida', 400, request);
  }

  const queryString = request.nextUrl.searchParams.toString();
  if (SUSPICIOUS_QUERY_PATTERN.test(queryString)) {
    return rejectWithSecurityHeaders('Query inválida', 400, request);
  }

  const mutatingMethod = request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE';
  if (mutatingMethod) {
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite.toLowerCase())) {
      return rejectWithSecurityHeaders('Cross-site request bloqueada', 403, request);
    }
  }

  const hostname = request.headers.get('host')?.trim().toLowerCase();
  
  if (!hostname) {
    return applySecurityHeaders(NextResponse.next(), request);
  }

  if (!isAllowedHost(hostname)) {
    return rejectWithSecurityHeaders('Host no permitido', 400, request);
  }

  const hostWithoutPort = hostname.split(':')[0];
  const pathname = request.nextUrl.pathname;

  if (PANEL_LOGIN_PATH_PATTERN.test(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    const response = applySecurityHeaders(NextResponse.redirect(loginUrl), request);
    return applyNoStoreForHtml(request, response);
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
    // En producción: extraer subdominio (primera parte antes de nexara.com.mx)
    if (hostParts.length >= 3) {
      // Si tiene 3+ partes: consola.nexara.com.mx
      const potential = hostParts[0];
      if (potential && potential !== 'www') {
        subdomain = potential;
      }
    }
  }

  // Si detectamos un subdominio conocido, reescribir a ruta específica
  if (subdomain && SUBDOMAIN_MAP[subdomain]) {
    const internalSlug = SUBDOMAIN_MAP[subdomain];
    const pathname = request.nextUrl.pathname;

    if (
      pathname.startsWith('/_next/') ||
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      pathname === '/socket.io' ||
      pathname.startsWith('/socket.io/')
    ) {
      const response = applySecurityHeaders(NextResponse.next(), request);
      return applyNoStoreForHtml(request, response);
    }
    
    // NO reescribir archivos estáticos (imágenes, fuentes, etc.)
    // Permitir que Next.js los sirva directamente desde /public
    if (STATIC_FILE_EXTENSIONS.test(pathname)) {
      const response = applySecurityHeaders(NextResponse.next(), request);
      return applyNoStoreForHtml(request, response);
    }

    if (pathname === "/paneles" || pathname === "/paneles/") {
      const response = applySecurityHeaders(NextResponse.next(), request);
      return applyNoStoreForHtml(request, response);
    }
    
    // Reescribir a /<slug><pathname>
    // Ejemplo: consola.localhost/ → /console/
    //          consola.localhost/dashboard → /console/dashboard
    const rewritePath = `/${internalSlug}${pathname}`;
    
    const url = request.nextUrl.clone();
    url.pathname = rewritePath;
    
    const response = applySecurityHeaders(NextResponse.rewrite(url), request);
    return applyNoStoreForHtml(request, response);
  }

  // Flujo app movil unificada: usar cookie de panel activo para mantener rutas cortas (/dashboard, /users, etc.)
  const activePanelCookie = request.cookies.get('nexara_mobile_panel')?.value?.toLowerCase();
  const hasKnownActivePanel = Boolean(activePanelCookie && KNOWN_PANEL_SLUGS.has(activePanelCookie));
  const isAlreadyPanelPath = /^\/(console|ventas|contabilidad|tickets|web)(\/|$)/i.test(pathname);
  const isMobileHubPath = pathname === '/login' || pathname === '/paneles';
  const isStaticAssetPath = STATIC_FILE_EXTENSIONS.test(pathname) || pathname.startsWith('/uploads/');

  const isApiOrSocket = pathname === '/api' || pathname.startsWith('/api/') || pathname === '/socket.io' || pathname.startsWith('/socket.io/');
  if (hasKnownActivePanel && !isAlreadyPanelPath && !isMobileHubPath && !isStaticAssetPath && !isApiOrSocket) {
    const panelSlug = activePanelCookie as string;
    const targetPath =
      panelSlug === 'tickets' && (pathname === '/' || pathname === '/dashboard')
        ? '/tickets'
        : `/${panelSlug}${pathname}`;

    const rewritten = request.nextUrl.clone();
    rewritten.pathname = targetPath;
    const response = applySecurityHeaders(NextResponse.rewrite(rewritten), request);
    return applyNoStoreForHtml(request, response);
  }

  // Dominio principal o www: mantener como está, Next.js maneja normalmente
  const response = applyNoStoreForHtml(request, applySecurityHeaders(NextResponse.next(), request));
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
