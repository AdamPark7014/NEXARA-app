import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ClaudeService } from '../../ai/claude/claude.service.js';
import { CATALOGO_CONUEE_2023 } from './conuee-2023.js';
import {
  CONFIG_LECTURA,
  ESQUEMA_TABLERO,
  ESQUEMA_TICKET,
  MODELO_TABLERO,
  MINIMO_TEXTO_MANUAL,
  PROMPT_TABLERO,
  PROMPT_TICKET,
  filasConuee,
  limpiarConuee,
  limpiarManual,
  limpiarTablero,
  limpiarTicket,
  paginasUtiles,
  peticionConuee,
  peticionManual,
  type ManualLeido,
  type TableroLeido,
  type TicketLeido,
} from './lectura-ia.js';

const ejecutar = promisify(execFile);

/** Hasta 64 MB de texto: un manual de mil páginas no llega ni a 5. */
const TOPE_SALIDA_PDFTOTEXT = 64 * 1024 * 1024;
const ANCHO_FOTO = 1400;

/** `sharp` se carga al usarse: si su binario faltara, el resto de la API arranca igual. */
function cargarSharp(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('sharp');
  return mod?.default ?? mod;
}

export type ResultadoManual = ManualLeido & {
  paginas: number;
  /** El PDF es una imagen: no tiene texto que leer. */
  escaneado: boolean;
};

@Injectable()
export class LecturaVehiculoService {
  private readonly logger = new Logger('LecturaVehiculo');

  constructor(private readonly claude: ClaudeService) {}

  disponible(): boolean {
    return this.claude.disponible();
  }

  /** Texto del PDF, página por página. `pdftotext` no carga el archivo entero en memoria. */
  async textoDePdf(ruta: string): Promise<string[]> {
    try {
      const { stdout } = await ejecutar('pdftotext', ['-enc', 'UTF-8', '-layout', ruta, '-'], {
        maxBuffer: TOPE_SALIDA_PDFTOTEXT,
        timeout: 120_000,
      });
      return stdout.split('\f');
    } catch (error) {
      this.logger.warn(`pdftotext falló: ${(error as Error).message.slice(0, 200)}`);
      throw new BadRequestException('No se pudo leer ese PDF. Revisa que no esté dañado o protegido con contraseña.');
    }
  }

  async leerManual(companyId: number, ruta: string, pista?: string | null): Promise<ResultadoManual> {
    const paginas = await this.textoDePdf(ruta);
    const totalTexto = paginas.reduce((a, p) => a + p.trim().length, 0);
    const vacio: ResultadoManual = { campos: {}, servicios: [], paginas: paginas.length, escaneado: totalTexto < MINIMO_TEXTO_MANUAL };
    if (vacio.escaneado) return vacio;

    const utiles = paginasUtiles(paginas);
    if (!utiles.length) return vacio;
    const { datos } = await this.claude.json<Record<string, any>>({
      ...peticionManual(utiles, pista),
      proceso: 'vehiculo-manual',
      companyId,
    });
    return { ...limpiarManual(datos, utiles), paginas: paginas.length, escaneado: false };
  }

  /** Rendimiento oficial de un modelo, si aparece en el catálogo. Sin coincidencia ni siquiera se pregunta. */
  async rendimientoOficial(
    companyId: number,
    vehiculo: { marca?: string | null; modelo?: string | null; anio?: number | null; version?: string | null; transmision?: string | null; combustible?: string | null },
  ) {
    const filas = filasConuee(vehiculo.marca, vehiculo.modelo, CATALOGO_CONUEE_2023);
    if (!filas.length || !this.disponible()) return null;
    const { datos } = await this.claude.json<{ renglon?: unknown }>({
      ...peticionConuee(vehiculo, filas),
      proceso: 'vehiculo-conuee',
      companyId,
    });
    return limpiarConuee(datos, filas);
  }

  /** La foto, chica y derecha: la puerta acepta 2 MB por petición y un teléfono saca 8. */
  private async imagenParaIa(buffer: Buffer | undefined) {
    if (!buffer?.length) throw new BadRequestException('Falta la foto.');
    let salida: Buffer;
    try {
      salida = await cargarSharp()(buffer)
        .rotate()
        .resize({ width: ANCHO_FOTO, height: ANCHO_FOTO, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Esa foto no se pudo abrir: usa JPG, PNG o WebP.');
    }
    return { mediaType: 'image/jpeg' as const, base64: salida.toString('base64') };
  }

  private exigirIa() {
    if (!this.disponible()) throw new ServiceUnavailableException('La lectura de fotos no está disponible: captura los datos a mano.');
  }

  async leerTablero(companyId: number, foto: Buffer | undefined, odometroPrevio?: number | null): Promise<TableroLeido> {
    this.exigirIa();
    const imagen = await this.imagenParaIa(foto);
    const { datos } = await this.claude.json<Record<string, unknown>>({
      proceso: 'vehiculo-tablero',
      companyId,
      sistema: [PROMPT_TABLERO],
      usuario: 'Lee este tablero.',
      imagenes: [imagen],
      esquema: ESQUEMA_TABLERO,
      modelo: MODELO_TABLERO,
      esfuerzo: CONFIG_LECTURA.esfuerzo,
      pensar: CONFIG_LECTURA.pensar,
      maxTokens: 120,
      timeoutMs: 30_000,
      reintentos: 1,
    });
    return limpiarTablero(datos, odometroPrevio);
  }

  async leerTicket(companyId: number, foto: Buffer | undefined): Promise<TicketLeido> {
    this.exigirIa();
    const imagen = await this.imagenParaIa(foto);
    const { datos } = await this.claude.json<Record<string, unknown>>({
      proceso: 'vehiculo-ticket',
      companyId,
      sistema: [PROMPT_TICKET],
      usuario: 'Lee este ticket.',
      imagenes: [imagen],
      esquema: ESQUEMA_TICKET,
      modelo: CONFIG_LECTURA.modelo,
      esfuerzo: CONFIG_LECTURA.esfuerzo,
      pensar: CONFIG_LECTURA.pensar,
      maxTokens: 160,
      timeoutMs: 30_000,
      reintentos: 1,
    });
    return limpiarTicket(datos);
  }
}
