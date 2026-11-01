import { Controller, Get, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service.js';
import { sessionTokenFromHeaders } from '../common/security/session-cookie.js';
import { decidirAccesoGo2rtc, secretoGo2rtc } from './go2rtc-autorizacion';

/**
 * `forwardAuth` de Traefik para `/go2rtc/*` (ver `deploy/traefik/nexara.yml`, router integra-go2rtc).
 * Responde 204 (pasa), 401 o 403; Traefik solo deja seguir los 2xx. Sin guardas de Nest a propósito:
 * la firma por stream tiene que funcionar sin sesión (HLS desde otro subdominio no manda cookies).
 */
@Controller('integra/media')
export class IntegraGo2rtcAuthzController {
  private readonly logger = new Logger(IntegraGo2rtcAuthzController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('authz')
  async authz(@Req() req: Request, @Res() res: Response) {
    let decision: ReturnType<typeof decidirAccesoGo2rtc>;
    try {
      decision = decidirAccesoGo2rtc(String(req.headers['x-forwarded-uri'] ?? ''), secretoGo2rtc());
    } catch (e) {
      this.logger.error(`authz go2rtc sin secreto: ${(e as Error).message}`);
      return res.status(503).end();
    }
    if (decision === 'permitir') return res.status(204).end();
    if (decision === 'denegar') return res.status(403).end();

    const token = sessionTokenFromHeaders(req.headers ?? {});
    const secreto = process.env.JWT_SECRET;
    if (!token || !secreto) return res.status(401).end();
    let claims: { sub?: number | string; jti?: string; isClient?: boolean; isBranchUser?: boolean };
    try {
      claims = jwt.verify(token, secreto) as typeof claims;
    } catch {
      return res.status(401).end();
    }
    // Las cámaras son del personal: los portales de clientes no entran por aquí.
    if (claims.isClient || claims.isBranchUser || !claims.sub) return res.status(403).end();
    const userId = Number(claims.sub);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!user || user.isActive === false) return res.status(401).end();
    if (claims.jti) {
      const sesion = await this.prisma.userSession.findUnique({
        where: { jti: claims.jti },
        select: { userId: true, revokedAt: true, expiresAt: true },
      });
      if (!sesion || sesion.userId !== userId || sesion.revokedAt || sesion.expiresAt.getTime() < Date.now()) {
        return res.status(401).end();
      }
    }
    return res.status(204).end();
  }
}
