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

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host');
  
  if (!hostname) {
    return NextResponse.next();
  }

  // Remover puerto para obtener host limpio
  const hostWithoutPort = hostname.split(':')[0];
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
    
    // Reescribir a /<slug><pathname>
    // Ejemplo: consola.localhost/ → /console/
    //          consola.localhost/dashboard → /console/dashboard
    const rewritePath = `/${internalSlug}${pathname}`;
    
    const url = request.nextUrl.clone();
    url.pathname = rewritePath;
    
    console.log('[MIDDLEWARE] Subdomain:', subdomain, '→ Rewrite:', pathname, '→', rewritePath);
    
    return NextResponse.rewrite(url);
  }

  // Dominio principal o www: mantener como está, Next.js maneja normalmente
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Ejecutar middleware en todas las rutas EXCEPTO:
     * - Archivos estáticos: _next/static
     * - Favicon e íconos: favicon.ico, icon.png, etc.
     * - Archivos públicos: robots.txt, sitemap.xml
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.png|robots.txt|sitemap.xml).*)',
  ],
};
