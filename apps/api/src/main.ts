import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configurar CORS
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] || 'http://localhost:3000',
    credentials: true,
  });

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
