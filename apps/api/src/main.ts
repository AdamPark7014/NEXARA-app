import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as express from 'express';
import * as path from 'path';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configurar CORS
  const corsEnv = process.env['CORS_ORIGIN'];
  const corsOrigins = corsEnv
    ? corsEnv.split(',').map((origin) => origin.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  
  // Lista explícita de subdominios permitidos
  const allowedSubdomains = [
    'consola',
    'ventas', 
    'web',
    'contabilidad',
    'tickets'
  ];
  
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (como Postman)
      if (!origin) {
        return callback(null, true);
      }
      
      // Permitir orígenes configurados
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Permitir subdominios específicos de localhost:3000
      const subdomainPattern = new RegExp(
        `^http:\\/\\/(${allowedSubdomains.join('|')})\\.localhost:3000$`
      );
      if (origin.match(subdomainPattern)) {
        console.log(`✓ CORS: Permitido ${origin}`);
        return callback(null, true);
      }
      
      // Permitir cualquier otro subdominio de localhost (desarrollo)
      if (origin.match(/^http:\/\/[a-z0-9-]+\.localhost:\d+$/)) {
        console.log(`⚠ CORS: Permitido (wildcard) ${origin}`);
        return callback(null, true);
      }
      
      console.error(`✗ CORS: Rechazado ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  // Prefijo global '/api' para todas las rutas
  app.setGlobalPrefix('api');

  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.useWebSocketAdapter(new IoAdapter(app));
  const port = process.env['PORT'] || 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api`);
}
bootstrap().catch((err) => {
  console.error('Error starting the server:', err);
  process.exit(1);
});
