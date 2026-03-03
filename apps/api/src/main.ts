import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
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
  isSafeFetchSite,
  resolveCorsOrigin,
} from './common/security/security.utils';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpServer = app.getHttpAdapter().getInstance();

  httpServer.disable('x-powered-by');
  httpServer.set('trust proxy', 1);

  // Aumentar límite de payload para fotos base64
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
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

  const maxConcurrentRequests = Number(process.env['MAX_CONCURRENT_REQUESTS'] || 5000);
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

  const ipPenaltyBox = createInMemoryIpBanList({
    maxStrikes: Number(process.env['IP_BAN_MAX_STRIKES'] || 6),
    banWindowMs: Number(process.env['IP_BAN_WINDOW_MS'] || 60 * 60_000),
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

    if (isMutatingMethod(request.method) && !isAllowedContentType(request.headers['content-type'])) {
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

  const globalLimiter = createInMemoryRateLimiter({
    maxHits: Number(process.env['GLOBAL_RATE_LIMIT_MAX'] || 300),
    windowMs: Number(process.env['GLOBAL_RATE_LIMIT_WINDOW_MS'] || 60_000),
    keyGenerator: (ip) => `global:${ip}`,
  });

  const authLimiter = createInMemoryRateLimiter({
    maxHits: Number(process.env['AUTH_RATE_LIMIT_MAX'] || 25),
    windowMs: Number(process.env['AUTH_RATE_LIMIT_WINDOW_MS'] || 15 * 60_000),
    keyGenerator: (ip, path) => `auth:${ip}:${path}`,
  });

  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    const ip = getClientIpFromRequestMeta(request.headers['x-forwarded-for'], request.ip);

    const pathname = request.path || request.url || '/';
    const isAuthPath = /^\/api\/(auth|client-auth|branch-auth)\b/i.test(pathname);
    const limiterResult = isAuthPath ? authLimiter(ip, pathname) : globalLimiter(ip, pathname);

    response.setHeader('X-RateLimit-Limit', `${isAuthPath ? Number(process.env['AUTH_RATE_LIMIT_MAX'] || 25) : Number(process.env['GLOBAL_RATE_LIMIT_MAX'] || 300)}`);
    response.setHeader('X-RateLimit-Remaining', `${limiterResult.remaining}`);
    response.setHeader('X-RateLimit-Reset', `${Math.ceil(Date.now() / 1000) + Math.ceil(limiterResult.retryAfterMs / 1000)}`);

    if (!limiterResult.allowed) {
      if (isAuthPath) {
        ipPenaltyBox.addStrike(ip, 2);
      }
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
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With'],
  });

  // Servir archivos estáticos desde uploads (en raíz del proyecto)
  const fs = require('fs');
  
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

  // Log __dirname para debugging
  console.error(`[DEBUG] __dirname: ${__dirname}`);
  const projectRoot = resolveProjectRoot();
  console.error(`[DEBUG] Project root resolved: ${projectRoot}`);

  const uploadsPath = path.join(projectRoot, 'uploads');
  const clientsPath = path.join(uploadsPath, 'clients');
  const cvsPath = path.join(uploadsPath, 'cvs');
  
  console.error(`[DEBUG] Calculated uploads path: ${uploadsPath}`);
  console.error(`[DEBUG] Calculated clients path: ${clientsPath}`);
  console.error(`[DEBUG] Calculated cvs path: ${cvsPath}`);
  
  try {
    // Asegurar que el directorio uploads existe
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
      console.error(`✅ Created uploads directory: ${uploadsPath}`);
    } else {
      console.error(`✅ Uploads directory exists: ${uploadsPath}`);
    }
    
    // Asegurar que el subdirectorio clients existe
    if (!fs.existsSync(clientsPath)) {
      fs.mkdirSync(clientsPath, { recursive: true });
      console.error(`✅ Created clients directory: ${clientsPath}`);
    } else {
      console.error(`✅ Clients directory exists: ${clientsPath}`);
    }

    // Asegurar que el subdirectorio cvs existe
    if (!fs.existsSync(cvsPath)) {
      fs.mkdirSync(cvsPath, { recursive: true });
      console.error(`✅ Created cvs directory: ${cvsPath}`);
    } else {
      console.error(`✅ Cvs directory exists: ${cvsPath}`);
    }
    
    // Verificar que realmente existe antes de servir
    const stats = fs.statSync(uploadsPath);
    console.error(`✅ Uploads directory is accessible (isDirectory: ${stats.isDirectory()})`);
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`❌ ERROR setting up uploads directory: ${errorMsg}`);
    console.error(err);
  }
  
  app.use(
    '/uploads',
    express.static(uploadsPath, {
      index: false,
      dotfiles: 'deny',
      fallthrough: false,
      etag: true,
      maxAge: '1d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      },
    }),
  );
  console.error(`✅ Express static middleware registered for /uploads -> ${uploadsPath}`);

  // Prefijo global '/api' para todas las rutas, pero excluir la ruta de uploads
  app.setGlobalPrefix('api', {
    exclude: ['/uploads', '/uploads/(.*)']
  });

  app.useWebSocketAdapter(new IoAdapter(app));
  const port = process.env['PORT'] || 3001;
  const server = await app.listen(port);

  const requestTimeoutMs = Number(process.env['HTTP_REQUEST_TIMEOUT_MS'] || 30_000);
  const keepAliveTimeoutMs = Number(process.env['HTTP_KEEPALIVE_TIMEOUT_MS'] || 65_000);
  const headersTimeoutMs = Number(process.env['HTTP_HEADERS_TIMEOUT_MS'] || 66_000);

  if (server && typeof (server as any).setTimeout === 'function') {
    (server as any).setTimeout(requestTimeoutMs);
  }
  if (server && typeof (server as any).keepAliveTimeout === 'number') {
    (server as any).keepAliveTimeout = keepAliveTimeoutMs;
  }
  if (server && typeof (server as any).headersTimeout === 'number') {
    (server as any).headersTimeout = headersTimeoutMs;
  }

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
    const workerCount = Math.max(1, Number(process.env['CLUSTER_WORKERS'] || defaultWorkers));

    for (let index = 0; index < workerCount; index += 1) {
      clusterApi.fork();
    }

    clusterApi.on('exit', () => {
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
