const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_TYPE_ERRORS === '1',
  },
  
  // Habilitar SWC para compilación más rápida
  swcMinify: true,
  
  // Permitir subdominios en desarrollo
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '*.localhost',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'consola.localhost',
    'console.localhost',
    'ventas.localhost',
    'web.localhost',
    'contabilidad.localhost',
    'operacion.localhost',
    'tickets.localhost',
    'ingenieros.localhost',
    'http://consola.localhost:3000',
    'http://console.localhost:3000',
    'http://ventas.localhost:3000',
    'http://web.localhost:3000',
    'http://contabilidad.localhost:3000',
    'http://operacion.localhost:3000',
    'http://tickets.localhost:3000',
    'http://ingenieros.localhost:3000',
  ],
  
  // Configuración experimental para mejor performance
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
  
  // Optimización de imports de MUI
  modularizeImports: {
    '@mui/material': {
      transform: '@mui/material/{{member}}',
    },
    '@mui/icons-material': {
      transform: '@mui/icons-material/{{member}}',
    },
  },
  
  images: {
    unoptimized: true, // Disable Image Optimization since we serve local files from /uploads
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
      {
        protocol: 'https',
        hostname: 'static.ctonline.mx',
      },
      {
        protocol: 'https',
        hostname: 'nexara.com.mx',
      },
      {
        protocol: 'https',
        hostname: 'web.nexara.com.mx',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: 'localhost:3001',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1:3001',
      },
    ],
  },
  
  webpack: (config, { isServer, dev }) => {
    config.resolve.alias['@'] = path.resolve(__dirname);
    
    // Fallback para canvas (usado por pdfjs)
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
      path: false,
      crypto: false,
    };
    
    // Ignorar canvas en build de servidor
    if (isServer) {
      config.externals = [...(config.externals || []), 'canvas'];
    }
    
    // Optimizaciones de webpack
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    
    return config;
  },
  
  // Support para subdominios
  // El middleware se encarga de la reescritura de URLs
  
  async redirects() {
    return [
      // Studio / copy histórico decía /noticias; canónica SEO = /blog
      { source: "/noticias", destination: "/blog", permanent: true },
      { source: "/noticias/:slug", destination: "/blog/:slug", permanent: true },
      // Aliases de búsqueda local → landings geo×servicio
      { source: "/cctv-puebla", destination: "/cobertura/puebla/camaras-cctv", permanent: true },
      { source: "/cctv-cdmx", destination: "/cobertura/cdmx/camaras-cctv", permanent: true },
      { source: "/camaras-seguridad-puebla", destination: "/cobertura/puebla/camaras-cctv", permanent: true },
      { source: "/camaras-seguridad-cdmx", destination: "/cobertura/cdmx/camaras-cctv", permanent: true },
      { source: "/redes-puebla", destination: "/cobertura/puebla/redes-y-conectividad", permanent: true },
      { source: "/redes-cdmx", destination: "/cobertura/cdmx/redes-y-conectividad", permanent: true },
      { source: "/wifi-empresarial-puebla", destination: "/cobertura/puebla/redes-y-conectividad", permanent: true },
      { source: "/soporte-ti-puebla", destination: "/cobertura/puebla/soporte-ti-pyme", permanent: true },
      { source: "/soporte-ti-cdmx", destination: "/cobertura/cdmx/soporte-ti-pyme", permanent: true },
      { source: "/cctv-cholula", destination: "/cobertura/cholula/camaras-cctv", permanent: true },
      { source: "/cctv-queretaro", destination: "/cobertura/queretaro/camaras-cctv", permanent: true },
      { source: "/cctv-monterrey", destination: "/cobertura/monterrey/camaras-cctv", permanent: true },
    ];
  },

  async rewrites() {
    // API_INTERNAL_URL puede venir como:
    //   - http://nexara-api:3001        (sin /api)
    //   - http://nexara-api:3001/api    (con /api, según docker-compose.nexara.yml)
    // Tenemos que normalizarlo a un ORIGIN sin /api para que los rewrites no
    // dupliquen el prefijo y terminen golpeando /api/api/... en el backend.
    // En local (turbo/dev) no existe el host Docker `nexara-api`.
    // Preferir API_INTERNAL_URL; si no, localhost en development y nexara-api en prod.
    const defaultApiOrigin =
      process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : 'http://nexara-api:3001';
    const rawApiUrl = (process.env.API_INTERNAL_URL || defaultApiOrigin).trim();
    const apiOrigin = rawApiUrl
      .replace(/\/+$/, '')        // sin trailing slash
      .replace(/\/api\/?$/, '');  // sin /api final
    const apiRewrite = `${apiOrigin}/api/:path*`;
    const uploadsRewrite = `${apiOrigin}/uploads/:path*`;

    // Log diagnostico al arrancar Next.js. Se ve en `docker logs nexara-web` y
    // ayuda a confirmar que el proxy interno apunta a donde debe.
    if (process.env.NODE_ENV === 'production' || process.env.DEBUG_API_REWRITES === '1') {
      // eslint-disable-next-line no-console
      console.log('[nexara-web] API_INTERNAL_URL =', rawApiUrl);
      // eslint-disable-next-line no-console
      console.log('[nexara-web] rewrite /api/:path*    ->', apiRewrite);
      // eslint-disable-next-line no-console
      console.log('[nexara-web] rewrite /uploads/:path* ->', uploadsRewrite);
    }

    return {
      fallback: [
        { source: '/api/:path*', destination: apiRewrite },
        // Proxy de uploads: el navegador no accede al puerto 3001 directamente.
        { source: '/uploads/:path*', destination: uploadsRewrite },
      ],
    };
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com"
      : "'self' 'unsafe-inline' https://www.googletagmanager.com";
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* http://*.localhost:* ws://*.localhost:* wss://*.localhost:* https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://stats.g.doubleclick.net",
      // Permite video del hero desde el API local (puerto 3001) y same-origin /api.
      "media-src 'self' blob: https: http://localhost:* http://127.0.0.1:* http://*.localhost:*",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
      {
        // Service worker: sin caché agresiva para que los clientes reciban actualizaciones;
        // en producción el sitio debe ser HTTPS (requisito del navegador para SW y push).
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Origin-Agent-Cluster', value: '?1' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },


};

module.exports = nextConfig;
