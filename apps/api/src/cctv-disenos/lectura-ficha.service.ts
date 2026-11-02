import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ClaudeService } from '../ai/claude/claude.service.js';
import { hojasParaImagen, limpiarFicha, MINIMO_TEXTO_FICHA, peticionFicha, type FichaLeida } from './ficha-ia.js';
import { conPdfTemporal, esPdf, imagenesDeHojas, textoDeHojas } from './ficha-pdf.js';
import { completarAreas, limpiarSitio, MAX_FRASE_DISENO, MIN_FRASE_DISENO, peticionDescripcion, peticionSitio, type SitioLeido } from './sitio-ia.js';

/** Las memorias técnicas de un fabricante rara vez pasan de 10 MB; 30 alcanza y corta lo que no es una ficha. */
export const FICHA_MAX_BYTES = 30 * 1024 * 1024;

export type ResultadoFicha = FichaLeida & {
  archivo: string;
  hojas: number;
  /** El PDF no trae texto: se leyó de las imágenes de sus primeras hojas. */
  escaneado: boolean;
  ms: number;
};

/** Multer entrega el nombre como latin1 aunque venga en UTF-8. */
function nombreDe(original: unknown): string {
  const crudo = typeof original === 'string' ? original : '';
  return Buffer.from(crudo, 'latin1').toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 160) || 'ficha.pdf';
}

/** Lee la memoria técnica de un equipo. No guarda el PDF ni escribe nada: quien la sube revisa y guarda. */
@Injectable()
export class LecturaFichaService {
  private readonly logger = new Logger('LecturaFicha');

  constructor(private readonly claude: ClaudeService) {}

  private exigirFrase(frase: unknown): string {
    const texto = typeof frase === 'string' ? frase.trim() : '';
    if (texto.length < MIN_FRASE_DISENO) throw new BadRequestException('Cuéntame un poco más: qué es y qué lleva.');
    if (texto.length > MAX_FRASE_DISENO) throw new BadRequestException(`Hasta ${MAX_FRASE_DISENO} caracteres.`);
    if (!this.claude.disponible()) {
      throw new ServiceUnavailableException('La IA no está disponible en este momento: usa una plantilla o captúralo a mano.');
    }
    return texto;
  }

  /** De una frase a los datos del sitio. El diseño lo arma la web: aquí no se escribe nada. */
  async sitioDesdeFrase(companyId: number, frase: unknown): Promise<SitioLeido> {
    const texto = this.exigirFrase(frase);
    const { datos } = await this.claude.json<Record<string, unknown>>({ ...peticionSitio(texto), proceso: 'cctv-sitio', companyId });
    return completarAreas(limpiarSitio(datos), texto);
  }

  /** Sin su PDF: lo que la persona dice del equipo. Queda para revisar, igual que una ficha leída. */
  async equipoDesdeFrase(companyId: number, frase: unknown): Promise<ResultadoFicha> {
    const texto = this.exigirFrase(frase);
    const inicio = Date.now();
    const { datos } = await this.claude.json<Record<string, unknown>>({ ...peticionDescripcion(texto), proceso: 'cctv-equipo', companyId });
    return { ...limpiarFicha(datos, 0), archivo: '', hojas: 0, escaneado: false, ms: Date.now() - inicio };
  }

  async leer(companyId: number, archivo: { buffer?: Buffer; originalname?: string } | undefined): Promise<ResultadoFicha> {
    if (!archivo?.buffer?.length) throw new BadRequestException('Falta el PDF de la memoria técnica.');
    if (archivo.buffer.length > FICHA_MAX_BYTES) throw new BadRequestException('El PDF pasa de 30 MB.');
    if (!esPdf(archivo.buffer)) throw new BadRequestException('Eso no es un PDF: sube la memoria técnica en PDF.');
    if (!this.claude.disponible()) {
      throw new ServiceUnavailableException('La lectura automática no está disponible: captura los datos a mano.');
    }
    const inicio = Date.now();
    return conPdfTemporal(archivo.buffer, async (ruta, carpeta) => {
      let paginas: string[];
      try {
        paginas = await textoDeHojas(ruta);
      } catch (error) {
        this.logger.warn(`pdftotext falló: ${(error as Error).message.slice(0, 200)}`);
        throw new BadRequestException('No se pudo leer ese PDF. Revisa que no esté dañado o protegido con contraseña.');
      }
      if (!paginas.length) throw new BadRequestException('Ese PDF no tiene hojas.');
      const imagenes = await imagenesDeHojas(ruta, hojasParaImagen(paginas), carpeta).catch((error) => {
        this.logger.warn(`pdftoppm falló: ${(error as Error).message.slice(0, 200)}`);
        return [];
      });
      const escaneado = paginas.reduce((a, p) => a + p.trim().length, 0) < MINIMO_TEXTO_FICHA;
      if (escaneado && !imagenes.length) throw new BadRequestException('Ese PDF no trae texto y sus hojas no se pudieron abrir.');
      const { datos } = await this.claude.json<Record<string, unknown>>({
        ...peticionFicha(paginas, imagenes.map((i) => i.hoja)),
        proceso: 'cctv-ficha',
        companyId,
        imagenes: imagenes.map(({ mediaType, base64 }) => ({ mediaType, base64 })),
      });
      return { ...limpiarFicha(datos, paginas.length), archivo: nombreDe(archivo.originalname), hojas: paginas.length, escaneado, ms: Date.now() - inicio };
    });
  }
}
