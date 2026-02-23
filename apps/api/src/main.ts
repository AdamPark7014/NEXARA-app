import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as express from 'express';
import * as path from 'path';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Aumentar límite de payload para fotos base64
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
      
      // Permitir subdominios específicos de localhost:3000 (desarrollo)
      const subdomainPattern = new RegExp(
        `^http:\\/\\/(${allowedSubdomains.join('|')})\\.localhost:3000$`
      );
      if (origin.match(subdomainPattern)) {
        console.log(`✓ CORS: Permitido ${origin}`);
        return callback(null, true);
      }
      
      // Permitir subdominios específicos de nexara.com.mx (producción)
      const prodSubdomainPattern = new RegExp(
        `^https:\\/\\/(${allowedSubdomains.join('|')})\\.nexara\\.com\\.mx$`
      );
      if (origin.match(prodSubdomainPattern)) {
        console.log(`✓ CORS: Permitido ${origin}`);
        return callback(null, true);
      }
      
      // Permitir dominio principal de producción
      if (origin === 'https://nexara.com.mx' || origin === 'https://www.nexara.com.mx') {
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

  // Servir archivos estáticos desde uploads (en raíz del proyecto)
  const fs = require('fs');
  const uploadsPath = path.join(process.cwd(), 'uploads');
  
  // Asegurar que el directorio uploads existe
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
    console.log(`📁 Created uploads directory: ${uploadsPath}`);
  }
  if (!fs.existsSync(path.join(uploadsPath, 'clients'))) {
    fs.mkdirSync(path.join(uploadsPath, 'clients'), { recursive: true });
    console.log(`📁 Created uploads/clients directory: ${path.join(uploadsPath, 'clients')}`);
  }
  
  app.use('/uploads', express.static(uploadsPath));
  console.log(`📁 Serving static files from: ${uploadsPath}`);

  // Prefijo global '/api' para todas las rutas
  app.setGlobalPrefix('api');

  app.useWebSocketAdapter(new IoAdapter(app));
  const port = process.env['PORT'] || 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api`);
}
bootstrap().catch((err) => {
  console.error('Error starting the server:', err);
  process.exit(1);
});
