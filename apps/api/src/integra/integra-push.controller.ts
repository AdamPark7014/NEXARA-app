import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { parseXml } from '../hikvision-isapi/xml';
import { IntegraPushService } from './integra-push.service';
import { boundaryOf, normalizeAlert, splitMultipart } from './integra-push.parse';

/**
 * Buzón de eventos de los equipos.
 *
 * Sin `RbacGuard` a propósito: quien llama es una cámara o un terminal, que no
 * tiene sesión de nadie y cuyo firmware solo sabe poner un token en la URL
 * (`urlLen max=128`). La autenticación es ese token, y el sitio va en la ruta
 * para no tener que adivinarlo por la IP de origen —que detrás del router de
 * la oficina es la misma para los diecisiete equipos—.
 *
 * Siempre responde 200. Un equipo Hikvision que recibe un error deshabilita el
 * host de notificación y deja de mandar: es preferible tragar un evento raro
 * que quedarse sordo hasta que alguien se dé cuenta.
 */
@ApiTags('Integra · eventos de equipo')
@Controller('integra/hik')
export class IntegraPushController {
  constructor(private readonly push: IntegraPushService) {}

  @Post(':siteId/:token')
  @Put(':siteId/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recibe el aviso que empuja una cámara o un terminal' })
  async receive(
    @Param('siteId', ParseIntPipe) siteId: number,
    @Param('token') token: string,
    @Req() req: Request,
  ) {
    const site = await this.push.siteForToken(siteId, token).catch(() => null);
    if (!site) return { ok: false };

    const contentType = String(req.headers['content-type'] || '');
    const raw = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    let payloadText: string | null = null;
    let image: Buffer | null = null;

    const boundary = contentType.includes('multipart') ? boundaryOf(contentType) : null;
    if (boundary) {
      for (const part of splitMultipart(raw, boundary)) {
        if (part.contentType.includes('image')) {
          if (!image) image = part.body;
        } else if (!payloadText) {
          payloadText = part.body.toString('utf8');
        }
      }
    } else {
      payloadText = raw.toString('utf8');
    }
    if (!payloadText) return { ok: true, ignored: 'sin cuerpo' };

    const body = decodePayload(payloadText);
    if (!body) return { ok: true, ignored: 'ilegible' };

    const ev = normalizeAlert(body, req.ip || '');
    if (!ev) return { ok: true, ignored: 'sin eventType' };

    await this.push.ingest({ id: site.id, companyId: site.companyId }, ev, image);
    return { ok: true };
  }
}

/** El terminal manda JSON y la cámara XML. Se prueba por la forma, no por la cabecera. */
function decodePayload(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    return parseXml(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}
