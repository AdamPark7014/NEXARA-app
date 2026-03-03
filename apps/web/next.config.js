const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
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
    'tickets.localhost',
    'ingenieros.localhost',
    'http://consola.localhost:3000',
    'http://console.localhost:3000',
    'http://ventas.localhost:3000',
    'http://web.localhost:3000',
    'http://contabilidad.localhost:3000',
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
  
  async rewrites() {
    return {
      fallback: [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3001/api/:path*',
        },
      ],
    };
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* http://*.localhost:* ws://*.localhost:* wss://*.localhost:*",
      "media-src 'self' blob: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
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
