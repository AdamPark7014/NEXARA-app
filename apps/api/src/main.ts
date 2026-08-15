import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import cluster = require('cluster');
import * as os from 'os';

import {
  createInMemoryIpBanList,
  createInMemoryRateLimiter,
  getClientIpFromRequestMeta,
  hasSuspiciousInputPayload,
  hasPrototypePollutionPayload,
  isAllowedContentType,
  isHoneypotPath,
  isHostAllowed,
  isMethodAllowed,
  isMutatingMethod,
  isOriginAllowed,
  isPathSuspicious,
  isRateLimitExemptPath,
  isSafeFetchSite,
  resolveCorsOrigin,
} from './common/security/security.utils';
import { isPublicUploadPath, readUploadToken } from './common/security/uploads-access';

const toPositiveInt = (rawValue: string | undefined, fallback: number): number => {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const readPositiveIntEnv = (name: string, fallback: number): number => {
  return toPositiveInt(process.env[name], fallback);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const httpServer = app.getHttpAdapter().getInstance();
  app.enableShutdownHooks();

  httpServer.disable('x-powered-by');
  httpServer.set('trust proxy', 1);

  // Límite de payload para fotos base64
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-DNS-Prefetch-Control', 'off');
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.setHeader('Origin-Agent-Cluster', '?1');
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });

  // Handle common internet probe paths early to reduce noisy exception logs.
  httpServer.all('/', (_request: express.Request, response: express.Response) => {
    response.status(404).json({ statusCode: 404, message: 'Not Found' });
  });

  httpServer.get('/robots.txt', (_request: express.Request, response: express.Response) => {
    response.type('text/plain').status(200).send('User-agent: *\nDisallow: /\n');
  });

  httpServer.get('/favicon.ico', (_request: express.Request, response: express.Response) => {
    response.status(204).end();
  });

  httpServer.get('/appsettings.Production.json', (_request: express.Request, response: express.Response) => {
    response.status(404).json({ statusCode: 404, message: 'Not Found' });
  });

  const maxConcurrentRequests = readPositiveIntEnv('MAX_CONCURRENT_REQUESTS', 5000);
  let activeRequests = 0;

  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    if (activeRequests >= maxConcurrentRequests) {
      response.setHeader('Retry-After', '2');
      response.status(503).json({
        statusCode: 503,
        message: 'Server is busy, please retry',
      });
      return;
    }

    activeRequests += 1;
    let released = false;

    const release = () => {
      if (released) {
        return;
      }
      released = true;
      activeRequests = Math.max(0, activeRequests - 1);
    };

    response.on('finish', release);
    response.on('close', release);
    next();
  });

  const appRequestTimeoutMs = readPositiveIntEnv('APP_REQUEST_TIMEOUT_MS', 120_000);
  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    const requestIdHeader = request.headers['x-request-id'];
    const requestId = Array.isArray(requestIdHeader)
      ? requestIdHeader[0]
      : typeof requestIdHeader === 'string'
        ? requestIdHeader
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    response.setHeader('X-Request-Id', requestId);

    const timeoutRef = setTimeout(() => {
      if (response.headersSent) {
        response.end();
        return;
      }

      response.status(408).json({
        statusCode: 408,
        message: 'Request timeout',
        requestId,
      });
    }, appRequestTimeoutMs);

    response.on('finish', () => clearTimeout(timeoutRef));
    response.on('close', () => clearTimeout(timeoutRef));
    next();
  });

  const ipPenaltyBox = createInMemoryIpBanList({
    maxStrikes: readPositiveIntEnv('IP_BAN_MAX_STRIKES', 6),
    banWindowMs: readPositiveIntEnv('IP_BAN_WINDOW_MS', 60 * 60_000),
  });

  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    const ip = getClientIpFromRequestMeta(request.headers['x-forwarded-for'], request.ip);

    if (ipPenaltyBox.isBanned(ip)) {
      const retrySeconds = Math.max(1, Math.ceil(ipPenaltyBox.retryAfterMs(ip) / 1000));
      response.setHeader('Retry-After', `${retrySeconds}`);
      response.status(403).json({
        statusCode: 403,
        message: 'IP temporarily blocked',
      });
      return;
    }

    if (!isMethodAllowed(request.method)) {
      ipPenaltyBox.addStrike(ip, 2);
      response.status(405).json({
        statusCode: 405,
        message: 'Method not allowed',
      });
      return;
    }

    const host = request.headers.host;
    if (!isHostAllowed(host)) {
      ipPenaltyBox.addStrike(ip, 2);
      response.status(400).json({
        statusCode: 400,
        message: 'Invalid host header',
      });
      return;
    }

    const fullPath = `${request.originalUrl || request.url || ''}`;
    if (isHoneypotPath(fullPath)) {
      ipPenaltyBox.addStrike(ip, 5);
      response.status(404).json({
        statusCode: 404,
        message: 'Not found',
      });
      return;
    }

    if (isPathSuspicious(fullPath)) {
      ipPenaltyBox.addStrike(ip, 3);
      response.status(400).json({
        statusCode: 400,
        message: 'Suspicious request path',
      });
      return;
    }

    const hasRequestBody = (() => {
      const contentLengthHeader = request.headers['content-length'];
      const transferEncodingHeader = request.headers['transfer-encoding'];

      const contentLength = Array.isArray(contentLengthHeader)
        ? Number(contentLengthHeader[0])
        : Number(contentLengthHeader || 0);

      const transferEncoding = Array.isArray(transferEncodingHeader)
        ? transferEncodingHeader[0]
        : transferEncodingHeader;

      return Number.isFinite(contentLength) && contentLength > 0
        ? true
        : Boolean((transferEncoding || '').toLowerCase().includes('chunked'));
    })();

    if (
      isMutatingMethod(request.method) &&
      hasRequestBody &&
      !isAllowedContentType(request.headers['content-type'])
    ) {
      ipPenaltyBox.addStrike(ip, 1);
      response.status(415).json({
        statusCode: 415,
        message: 'Unsupported content type',
      });
      return;
    }

    if (isMutatingMethod(request.method)) {
      const fetchSite = typeof request.headers['sec-fetch-site'] === 'string' ? request.headers['sec-fetch-site'] : undefined;
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
      const originAllowed = !origin || isOriginAllowed(origin);

      if (!isSafeFetchSite(fetchSite) && !originAllowed) {
        ipPenaltyBox.addStrike(ip, 3);
        response.status(403).json({
          statusCode: 403,
          message: 'Cross-site request blocked',
        });
        return;
      }

      if (origin && !isOriginAllowed(origin)) {
        ipPenaltyBox.addStrike(ip, 2);
        response.status(403).json({
          statusCode: 403,
          message: 'Invalid origin',
        });
        return;
      }
    }

    if (hasPrototypePollutionPayload(request.body, request.query, request.params)) {
      ipPenaltyBox.addStrike(ip, 4);
      response.status(400).json({
        statusCode: 400,
        message: 'Malformed payload',
      });
      return;
    }

    if (hasSuspiciousInputPayload(request.body, request.query, request.params, request.headers['user-agent'])) {
      ipPenaltyBox.addStrike(ip, 3);
      response.status(400).json({
        statusCode: 400,
        message: 'Suspicious input detected',
      });
      return;
    }

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: true,
    }),
  );

  const globalRateLimitMax = readPositiveIntEnv('GLOBAL_RATE_LIMIT_MAX', 1200);
  const globalRateLimitWindowMs = readPositiveIntEnv('GLOBAL_RATE_LIMIT_WINDOW_MS', 60_000);

  const globalLimiter = createInMemoryRateLimiter({
    maxHits: globalRateLimitMax,
    windowMs: globalRateLimitWindowMs,
    keyGenerator: (ip) => `global:${ip}`,
  });

  const authLimiter = createInMemoryRateLimiter({
    maxHits: readPositiveIntEnv('AUTH_RATE_LIMIT_MAX', 25),
    windowMs: readPositiveIntEnv('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60_000),
    keyGenerator: (ip, path) => `auth:${ip}:${path}`,
  });

  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    const ip = getClientIpFromRequestMeta(request.headers['x-forwarded-for'], request.ip);

    const pathname = request.path || request.url || '/';
    if (isRateLimitExemptPath(pathname)) {
      next();
      return;
    }

    const isAuthPath = /^\/api\/(auth|client-auth|branch-auth|portal)\b/i.test(pathname);
    const limiterResult = isAuthPath ? authLimiter(ip, pathname) : globalLimiter(ip, pathname);

    response.setHeader('X-RateLimit-Limit', `${isAuthPath ? readPositiveIntEnv('AUTH_RATE_LIMIT_MAX', 25) : globalRateLimitMax}`);
    response.setHeader('X-RateLimit-Remaining', `${limiterResult.remaining}`);
    response.setHeader('X-RateLimit-Reset', `${Math.ceil(Date.now() / 1000) + Math.ceil(limiterResult.retryAfterMs / 1000)}`);

    if (!limiterResult.allowed) {
      // Auth rate-limit should return 429 only; escalating to IP ban causes
      // long lockouts for legitimate users after repeated login attempts.
      const retrySeconds = Math.max(1, Math.ceil(limiterResult.retryAfterMs / 1000));
      response.setHeader('Retry-After', `${retrySeconds}`);
      response.status(429).json({
        statusCode: 429,
        message: 'Too many requests',
      });
      return;
    }

    next();
  });

  // Configurar CORS
  app.enableCors({
    origin: (origin, callback) => {
      resolveCorsOrigin(origin, callback);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Device-Id',
      'X-Device-Name',
      'X-Device-Model',
      'X-Device-Serial',
      'X-Device-Browser',
      'Sec-CH-UA-Model',
      'Sec-CH-UA-Platform',
    ],
  });

  // Servir archivos estáticos desde uploads (en raíz del proyecto)
  
  // Helper para resolver la raíz del proyecto tomando como referencia el folder "apps"
  const resolveProjectRoot = () => {
    const segments = __dirname.split(path.sep);
    const appsIndex = segments.lastIndexOf('apps');
    if (appsIndex > 0) {
      const root = segments.slice(0, appsIndex).join(path.sep) || path.sep;
      return root;
    }
    return path.resolve(__dirname, '../../..');
  };

  const projectRoot = resolveProjectRoot();

  const uploadsPath = path.join(projectRoot, 'uploads');
  const legacyUploadsPath = path.join(projectRoot, 'apps', 'api', 'uploads');
  const clientsPath = path.join(uploadsPath, 'clients');
  const cvsPath = path.join(uploadsPath, 'cvs');
  
  try {
    // Asegurar que el directorio uploads existe
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }
    
    // Asegurar que el subdirectorio clients existe
    if (!fs.existsSync(clientsPath)) {
      fs.mkdirSync(clientsPath, { recursive: true });
    }

    // Asegurar que el subdirectorio cvs existe
    if (!fs.existsSync(cvsPath)) {
      fs.mkdirSync(cvsPath, { recursive: true });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error setting up uploads directory: ${errorMsg}`);
  }
  
  // Proteger /uploads con autenticación JWT (lecturas incluidas)
  app.use('/uploads', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method.toUpperCase() === 'OPTIONS') {
      next();
      return;
    }

    const isRead = ['GET', 'HEAD'].includes(req.method.toUpperCase());
    if (isRead && isPublicUploadPath(req.path || req.url || '')) {
      next();
      return;
    }

    const token = readUploadToken(req.headers);
    if (!token) {
      res.status(401).json({ statusCode: 401, message: 'Authentication required' });
      return;
    }
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      res.status(500).json({ statusCode: 500, message: 'Server configuration error' });
      return;
    }
    try {
      require('jsonwebtoken').verify(token, secret);
      next();
    } catch {
      res.status(401).json({ statusCode: 401, message: 'Invalid or expired token' });
    }
  });

  // Contenido subido por usuarios: nunca debe interpretarse como HTML/script.
  // Mantenemos nosniff siempre; los avatares antiguos guardados sin extensión
  // se fijan como imagen para que sigan renderizando sin permitir sniffing.
  const setUploadHeaders = (res: express.Response, filePath: string) => {
    if (!path.extname(filePath)) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  };

  const uploadStaticOptions: Parameters<typeof express.static>[1] = {
    index: false,
    dotfiles: 'deny',
    fallthrough: true,
    etag: true,
    maxAge: '1d',
    setHeaders: setUploadHeaders,
  };

  app.use('/uploads', express.static(uploadsPath, uploadStaticOptions));

  app.use('/uploads', express.static(legacyUploadsPath, uploadStaticOptions));

  // ── Swagger / OpenAPI (solo fuera de producción, o con ENABLE_SWAGGER=true) ──
  const enableSwagger =
    process.env['ENABLE_SWAGGER'] === 'true' ||
    process.env['NODE_ENV'] !== 'production';

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NEXARA ERP Servicios IT/CCTV')
      .setDescription('API del sistema ERP NEXARA orientado a venta y servicios de cómputo, tech y CCTV — operaciones, RRHH, finanzas, inventario, mantenimiento, helpdesk y más.')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .addTag('auth', 'Autenticación y tokens')
      .addTag('users', 'Gestión de usuarios y roles')
      .addTag('operations', 'Actividades, evidencias, viáticos, vehículos, GPS')
      .addTag('hr', 'Asistencia, breaks, multas, nómina, CVs')
      .addTag('commercial', 'Clientes, cotizaciones, ventas')
      .addTag('inventory', 'Almacenes, stock, compras')
      .addTag('service', 'Helpdesk, órdenes de servicio, mantenimiento, contratos')
      .addTag('finance', 'Contabilidad, facturación, banca')
      .addTag('compliance', 'Documentos, auditoría, BI')
      .addTag('system', 'Configuración, health, notificaciones')
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        tagsSorter: 'alpha',
      },
    });
  }

  // Prefijo global '/api' para todas las rutas, pero excluir la ruta de uploads
  app.setGlobalPrefix('api', {
    exclude: ['/uploads', '/uploads/(.*)']
  });

  app.useWebSocketAdapter(new IoAdapter(app));
  const port = process.env['PORT'] || 3001;
  const server = await app.listen(port);

  const requestTimeoutMs = readPositiveIntEnv('HTTP_REQUEST_TIMEOUT_MS', 30_000);
  const keepAliveTimeoutMs = readPositiveIntEnv('HTTP_KEEPALIVE_TIMEOUT_MS', 65_000);
  const headersTimeoutMs = readPositiveIntEnv('HTTP_HEADERS_TIMEOUT_MS', 66_000);

  if (server && typeof (server as any).setTimeout === 'function') {
    (server as any).setTimeout(requestTimeoutMs);
  }
  if (server && typeof (server as any).keepAliveTimeout === 'number') {
    (server as any).keepAliveTimeout = keepAliveTimeoutMs;
  }
  if (server && typeof (server as any).headersTimeout === 'number') {
    (server as any).headersTimeout = headersTimeoutMs;
  }

  let isShuttingDown = false;
  const shutdownGraceMs = readPositiveIntEnv('SHUTDOWN_GRACE_MS', 15_000);
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.error(`[shutdown] signal received: ${signal}`);

    const forceExitRef = setTimeout(() => {
      console.error('[shutdown] force exit after timeout');
      process.exit(1);
    }, shutdownGraceMs);

    server.close((error?: Error) => {
      clearTimeout(forceExitRef);
      if (error) {
        console.error('[shutdown] close error:', error);
        process.exit(1);
        return;
      }
      console.error('[shutdown] server closed gracefully');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[process] unhandledRejection:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[process] uncaughtException:', error);
    gracefulShutdown('uncaughtException');
  });

  console.log(`🚀 API running on http://localhost:${port}/api`);
}

const bootstrapWithCluster = async () => {
  const clusterEnabled = process.env['ENABLE_CLUSTER_MODE'] === 'true';
  if (!clusterEnabled) {
    await bootstrap();
    return;
  }

  const clusterApi = cluster as any;

  if (clusterApi.isPrimary) {
    const availableCpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
    const defaultWorkers = Math.max(1, availableCpus - 1);
    const workerCount = readPositiveIntEnv('CLUSTER_WORKERS', defaultWorkers);
    const maxRestartsPerMinute = readPositiveIntEnv('CLUSTER_MAX_RESTARTS_PER_MIN', workerCount * 4);
    const recentRestarts: number[] = [];

    for (let index = 0; index < workerCount; index += 1) {
      clusterApi.fork();
    }

    clusterApi.on('exit', () => {
      const now = Date.now();
      while (recentRestarts.length > 0 && now - recentRestarts[0] > 60_000) {
        recentRestarts.shift();
      }

      if (recentRestarts.length >= maxRestartsPerMinute) {
        console.error('[cluster] restart limit reached; skipping worker respawn to avoid crash loop');
        return;
      }

      recentRestarts.push(now);
      clusterApi.fork();
    });

    console.log(`🚀 Cluster mode enabled with ${workerCount} workers`);
    return;
  }

  await bootstrap();
};

bootstrapWithCluster().catch((err) => {
  console.error('Error starting the server:', err);
  process.exit(1);
});
