const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Habilitar SWC para compilación más rápida
  swcMinify: true,
  
  // Permitir subdominios en desarrollo
  allowedDevOrigins: [
    'consola.localhost:3000',
    'ventas.localhost:3000',
    'web.localhost:3000',
    'contabilidad.localhost:3000',
    'tickets.localhost:3000',
    'ingenieros.localhost:3000',
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


};

module.exports = nextConfig;
