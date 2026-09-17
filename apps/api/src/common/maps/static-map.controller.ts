/**
 * `GET /api/static-map` — imagen estática de un punto, servida desde caché.
 *
 * Antes cada `<img>` del ERP y del portal de tickets apuntaba directamente a
 * `maps.googleapis.com/maps/api/staticmap?...&key=<clave pública>`: una
 * petición facturada por vista y la clave a la vista de cualquiera en el bundle.
 * Ahora el navegador pide aquí, la clave se queda en el servidor y la imagen se
 * reutiliza entre usuarios (ver `static-map-cache.ts`).
 *
 * No lleva guardia de sesión a propósito: el portal de clientes autentica con
 * `Authorization` y un `<img>` no manda cabeceras. El gasto lo limitan el
 * presupuesto diario del módulo de caché y el cubo por IP de aquí.
 */

import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createInMemoryRateLimiter } from '../security/security.utils.js';
import { getStaticMapImage, isUsableCoordinate, budgetStatus } from './static-map-cache.js';

/** Cubo por IP: 60 mapas por minuto bastan para la vista más cargada. */
const rateLimit = createInMemoryRateLimiter({
  maxHits: 60,
  windowMs: 60_000,
  keyGenerator: (ip) => `static-map:${ip}`,
});

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

/** `lat,lng|lat,lng|…` — el formato con el que la web manda un recorrido. */
export const parsePathParam = (raw: unknown): Array<{ lat: number; lng: number }> => {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw.split('|')
    .map((pair) => {
      const [lat, lng] = pair.split(',').map((part) => num(part.trim()));
      return { lat: lat as number, lng: lng as number };
    })
    .filter((point) => isUsableCoordinate(point.lat, point.lng));
};

@Controller('static-map')
export class StaticMapController {
  @Get()
  @ApiExcludeEndpoint()
  async get(
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const lat = num(query['lat']);
    const lng = num(query['lng']);
    if (!isUsableCoordinate(lat, lng)) {
      res.status(400).json({ statusCode: 400, message: 'Coordenadas inválidas' });
      return;
    }

    const ip = (req.ip || req.socket?.remoteAddress || 'desconocida').toString();
    const quota = rateLimit(ip, '/static-map');
    if (!quota.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(quota.retryAfterMs / 1000)));
      res.status(429).json({ statusCode: 429, message: 'Demasiadas solicitudes de mapa' });
      return;
    }

    const image = await getStaticMapImage({
      lat,
      lng,
      zoom: num(query['zoom']),
      width: num(query['w']),
      height: num(query['h']),
      scale: num(query['scale']) === 2 ? 2 : 1,
      mapType: (query['type'] as 'roadmap' | 'hybrid' | 'satellite' | 'terrain') || 'roadmap',
      path: parsePathParam(query['path']),
    });

    if (!image) {
      const budget = budgetStatus();
      res.status(503).json({
        statusCode: 503,
        message: budget.spent >= budget.limit
          ? 'Presupuesto diario de mapas agotado'
          : 'Mapa no disponible',
      });
      return;
    }

    res.setHeader('Content-Type', image.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Un mes en el navegador: la imagen es inmutable para esa clave.
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('ETag', `"${image.cacheKey}"`);
    res.setHeader('X-Static-Map-Source', image.source);
    res.status(200).end(image.buffer);
  }
}
