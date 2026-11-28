import winston from 'winston';
const { createLogger, format, transports } = winston;

export const appLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'api-service' },
  transports: [
    new transports.Console(),
    // Con rotación: sin ella combined.log crecía sin tope dentro del contenedor (3.7 MB en 33 h);
    // la salida estándar ya la rota docker. Quedan hasta 3 archivos de 10 MB por transporte.
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
    new transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});
