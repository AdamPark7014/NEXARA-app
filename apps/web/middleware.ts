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

  const isMappedPanelSubdomain = Boolean(subdomain && SUBDOMAIN_MAP[subdomain]);

  // Si detectamos un subdominio conocido, reescribir a ruta específica
  if (isMappedPanelSubdomain && subdomain) {
    const internalSlug = SUBDOMAIN_MAP[subdomain];
    const pathname = request.nextUrl.pathname;
    const isAlreadyScopedPath = (() => {
      const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
      return firstSegment === internalSlug;
    })();

    if (
      pathname.startsWith('/_next/') ||
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      pathname === '/socket.io' ||
      pathname.startsWith('/socket.io/')
    ) {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }

    // Si la ruta ya está prefijada con el slug del subdominio actual,
    // no la reescribimos para evitar /console/console/dashboard.
    if (isAlreadyScopedPath) {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }
    
    // NO reescribir archivos estáticos (imágenes, fuentes, etc.)
    // Permitir que Next.js los sirva directamente desde /public
    const staticFileExtensions = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js|json)$/i;
    if (staticFileExtensions.test(pathname)) {
      const response = applySecurityHeaders(NextResponse.next());
      return applyNoStoreForHtml(request, response);
    }
    
    // Reescribir a /<slug><pathname>
    // Ejemplo: consola.localhost/ → /console/
    //          consola.localhost/dashboard → /console/dashboard
    const rewritePath = `/${internalSlug}${pathname}`;
    
    const url = request.nextUrl.clone();
    url.pathname = rewritePath;
    
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
