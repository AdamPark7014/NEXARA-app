import { Controller, Get, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service.js';
import { sessionTokenFromHeaders } from '../common/security/session-cookie.js';
import { decidirAccesoNas, listaNasDesdeEntorno, urlLoginNas } from './nas-portal-acceso';

/**
 * `forwardAuth` de Traefik para `nas.nexara.com.mx` (router `nas-portal`, `/opt/traefik/config/nas.yml`).
 * 204 = pasa; 302 al login si no hay sesión; 403 si la persona no está en la lista del portal.
 * Sin guardas de Nest a propósito (igual que `integra/media/authz`): la decisión completa vive aquí.
 */
@Controller('nas-portal')
export class NasPortalAuthzController {
  private readonly logger = new Logger(NasPortalAuthzController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('authz')
  async authz(@Req() req: Request, @Res() res: Response) {
    const sinSesion = () => res.redirect(302, urlLoginNas());
    const token = sessionTokenFromHeaders(req.headers ?? {});
    const secreto = process.env.JWT_SECRET;
    if (!secreto) {
      this.logger.error('authz NAS sin JWT_SECRET');
      return res.status(503).end();
    }
    if (!token) return sinSesion();

    let claims: { sub?: number | string; jti?: string; isClient?: boolean; isBranchUser?: boolean };
    try {
      claims = jwt.verify(token, secreto) as typeof claims;
    } catch {
      return sinSesion();
    }
    // El NAS es del personal: los portales de clientes y sucursales no entran.
    if (claims.isClient || claims.isBranchUser || !claims.sub) return res.status(403).end();

    const userId = Number(claims.sub);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, roleKey: true },
    });
    if (!user || user.isActive === false) return sinSesion();
    if (claims.jti) {
      const sesion = await this.prisma.userSession.findUnique({
        where: { jti: claims.jti },
        select: { userId: true, revokedAt: true, expiresAt: true },
      });
      if (!sesion || sesion.userId !== userId || sesion.revokedAt || sesion.expiresAt.getTime() < Date.now()) {
        return sinSesion();
      }
    }

    if (decidirAccesoNas(user, listaNasDesdeEntorno()) !== 'permitir') {
      this.logger.warn(`NAS: acceso negado al usuario ${userId}`);
      return res.status(403).end();
    }
    res.setHeader('X-Nexara-User', String(userId));
    return res.status(204).end();
  }
}
