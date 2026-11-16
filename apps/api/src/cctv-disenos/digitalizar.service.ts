import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClaudeService } from '../ai/claude/claude.service.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { CROQUIS_SUBDIR } from './croquis-imagen.js';
import { CONFIG_DIGITALIZAR, limpiarLectura, peticionDigitalizar, type LecturaPlano } from './digitalizar-ia.js';

export type ResultadoDigitalizar = { lectura: LecturaPlano; anchoPx: number; altoPx: number; ms: number };

/** `sharp` se carga al usarse, como en `croquis-imagen.ts`. */
function cargarSharp(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('sharp');
  return mod?.default ?? mod;
}

/**
 * Lee con IA un croquis ya subido al diseño (`POST :id/croquis`) y propone muros, áreas y cámaras.
 * Solo lee: la web lo muestra para revisar y lo agrega al plano al confirmar.
 */
@Injectable()
export class DigitalizarCctvService {
  private readonly logger = new Logger('DigitalizarCctv');

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /** Solo croquis de ESTE diseño, por su nombre (`<id>-<ms>-<hex>.<ext>`): nada de rutas arbitrarias. */
  rutaDelCroquis(id: number, url: unknown): string {
    const nombre = typeof url === 'string' ? url.split('?')[0]!.split('/').pop() ?? '' : '';
    if (!new RegExp(`^${id}-\\d+-[0-9a-f]{16}\\.(png|jpg|webp)$`).test(nombre)) {
      throw new BadRequestException('Ese croquis no es de este diseño: súbelo de nuevo.');
    }
    return path.join(getUploadSubdir(__dirname, CROQUIS_SUBDIR), nombre);
  }

  async digitalizar(id: number, companyId: number | null, cuerpo: { url?: unknown; nota?: unknown }): Promise<ResultadoDigitalizar> {
    const empresa = requireCompanyId(companyId);
    const diseno = await this.prisma.cctvDiseno.findFirst({ where: { id, companyId: empresa, archivadoAt: null }, select: { id: true } });
    if (!diseno) throw new NotFoundException('Diseño no encontrado');
    if (!this.claude.disponible()) throw new ServiceUnavailableException('La IA no está disponible: dibuja el plano a mano sobre el croquis.');
    const ruta = this.rutaDelCroquis(id, cuerpo?.url);
    const original = await fs.readFile(ruta).catch(() => {
      throw new NotFoundException('No encontré ese croquis: súbelo de nuevo.');
    });
    const sharp = cargarSharp();
    const meta = await sharp(original).metadata();
    const anchoPx = Number(meta.width) || 0;
    const altoPx = Number(meta.height) || 0;
    if (!anchoPx || !altoPx) throw new BadRequestException('No se pudo leer el croquis.');
    // Más chico para la IA (cuesta por píxel); las coordenadas regresan normalizadas, así que no importa.
    const reducida: Buffer = await sharp(original)
      .resize({ width: CONFIG_DIGITALIZAR.ladoMaximoPx, height: CONFIG_DIGITALIZAR.ladoMaximoPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const inicio = Date.now();
    const nota = typeof cuerpo?.nota === 'string' ? cuerpo.nota : null;
    const { datos } = await this.claude.json<Record<string, unknown>>({
      ...peticionDigitalizar({ mediaType: 'image/jpeg', base64: reducida.toString('base64') }, nota),
      proceso: 'cctv-digitalizar',
      companyId: empresa,
    });
    const lectura = limpiarLectura(datos, anchoPx, altoPx);
    this.logger.log(`Diseño ${id}: ${lectura.muros.length} muros, ${lectura.areas.length} áreas, ${lectura.camaras.length} cámaras`);
    return { lectura, anchoPx, altoPx, ms: Date.now() - inicio };
  }
}
