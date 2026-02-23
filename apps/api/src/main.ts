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
  
  // Log __dirname para debugging
  console.error(`[DEBUG] __dirname: ${__dirname}`);
  
  // En desarrollo: /workspace/apps/api/dist
  // En producción: /var/www/nexara-app/apps/api/dist
  // Necesitamos subir a la raíz del proyecto (3 niveles arriba)
  const uploadsPath = path.join(__dirname, '../../..', 'uploads');
  const clientsPath = path.join(uploadsPath, 'clients');
  
  console.error(`[DEBUG] Calculated uploads path: ${uploadsPath}`);
  console.error(`[DEBUG] Calculated clients path: ${clientsPath}`);
  
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
    
    // Verificar que realmente existe antes de servir
    const stats = fs.statSync(uploadsPath);
    console.error(`✅ Uploads directory is accessible (isDirectory: ${stats.isDirectory()})`);
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`❌ ERROR setting up uploads directory: ${errorMsg}`);
    console.error(err);
  }
  
  app.use('/uploads', express.static(uploadsPath));
  console.error(`✅ Express static middleware registered for /uploads -> ${uploadsPath}`);

  // Prefijo global '/api' para todas las rutas, pero excluir la ruta de uploads
  app.setGlobalPrefix('api', {
    exclude: ['/uploads', '/uploads/(.*)']
  });

  app.useWebSocketAdapter(new IoAdapter(app));
  const port = process.env['PORT'] || 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api`);
}
bootstrap().catch((err) => {
  console.error('Error starting the server:', err);
  process.exit(1);
});
