import { BadRequestException } from '@nestjs/common';

/**
 * Catálogo de equipos del Diseñador: lo que cada empresa agrega además de la lista base que vive en
 * `apps/web/lib/cctv/catalogo.ts`. Guarda solo la ficha técnica; las existencias salen de Almacén.
 * `familia` y `tipo` deciden el modelo 3D y el comportamiento, así que solo valen los conocidos.
 */
export const TIPOS_POR_FAMILIA: Readonly<Record<string, readonly string[]>> = {
  camaras: ['domo', 'bala', 'turret', 'ptz', 'panoramica', 'ojo-de-pez'],
  grabacion: ['nvr'],
  acceso: ['terminal', 'barrera'],
  alarmas: ['sirena', 'sismica', 'panel'],
  red: ['switch'],
  servidores: ['servidor'],
  infraestructura: ['ups', 'gabinete'],
  otros: ['generico'],
};

const FUENTES = ['manual', 'ficha'] as const;

/** Los números de `datos` y `medidas`: ni negativos ni absurdos. */
const NUMERO_MAX = 1_000_000;
export const DATOS_MAX_CARACTERES = 8_000;
const CARACTERISTICAS_MAX = 20;

export type EquipoCatalogo = {
  familia: string;
  tipo: string;
  marca: string;
  modelo: string;
  descripcion: string;
  datos: Record<string, unknown>;
  medidas: Record<string, number> | null;
  caracteristicas: string[];
  fuente: string;
  verificado: boolean;
  productId: number | null;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function texto(v: unknown, etiqueta: string, max: number, obligatorio = false): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (obligatorio && !t) throw new BadRequestException(`Falta ${etiqueta}`);
  if (t.length > max) throw new BadRequestException(`${etiqueta} admite hasta ${max} caracteres`);
  return t;
}

function numeroValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= NUMERO_MAX;
}

/** Solo números (o null, «no lo dice la ficha») y, en cámaras, su óptica como objeto de números. */
function validarDatos(v: unknown, familia: string): Record<string, unknown> {
  if (v == null) {
    if (familia === 'camaras') throw new BadRequestException('A la cámara le falta su óptica');
    return {};
  }
  if (!esObjeto(v)) throw new BadRequestException('Los datos del equipo no son válidos');
  if (JSON.stringify(v).length > DATOS_MAX_CARACTERES) throw new BadRequestException('Los datos del equipo son demasiado grandes');
  const salida: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === 'optica') {
      if (!esObjeto(x)) throw new BadRequestException('La óptica de la cámara no es válida');
      for (const [ko, xo] of Object.entries(x)) {
        if (xo != null && !numeroValido(xo) && typeof xo !== 'string') throw new BadRequestException(`El dato ${ko} de la óptica no es válido`);
      }
      salida.optica = x;
      continue;
    }
    if (x != null && !numeroValido(x)) throw new BadRequestException(`El dato ${k} debe ser un número`);
    salida[k] = x ?? null;
  }
  if (familia === 'camaras') {
    const o = salida.optica as Record<string, unknown> | undefined;
    if (!o || !numeroValido(o.pxHoriz) || !numeroValido(o.pxVert) || !numeroValido(o.focalMm) || !o.pxHoriz || !o.pxVert || !o.focalMm) {
      throw new BadRequestException('A la cámara le falta su resolución o su lente');
    }
  }
  return salida;
}

function validarMedidas(v: unknown): Record<string, number> | null {
  if (v == null) return null;
  if (!esObjeto(v)) throw new BadRequestException('Las medidas no son válidas');
  const salida: Record<string, number> = {};
  for (const k of ['diametroMm', 'anchoMm', 'altoMm', 'fondoMm']) {
    const x = v[k];
    if (x == null) continue;
    if (!numeroValido(x) || x === 0) throw new BadRequestException('Las medidas van en milímetros y mayores a cero');
    salida[k] = x;
  }
  return Object.keys(salida).length ? salida : null;
}

function validarCaracteristicas(v: unknown): string[] {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > CARACTERISTICAS_MAX) throw new BadRequestException(`Hasta ${CARACTERISTICAS_MAX} características`);
  return v.map((x) => texto(x, 'La característica', 160)).filter(Boolean);
}

/** Valida y limpia lo que llega de la pantalla. Lanza 400 con el motivo. */
export function validarEquipoCatalogo(cuerpo: unknown): EquipoCatalogo {
  if (!esObjeto(cuerpo)) throw new BadRequestException('Equipo no válido');
  const familia = texto(cuerpo.familia, 'la familia', 24, true);
  const tipos = TIPOS_POR_FAMILIA[familia];
  if (!tipos) throw new BadRequestException('Esa familia de equipos no existe');
  const tipo = texto(cuerpo.tipo, 'el tipo', 24, true);
  if (!tipos.includes(tipo)) throw new BadRequestException('Ese tipo no corresponde a la familia');
  const fuente = cuerpo.fuente == null ? 'manual' : texto(cuerpo.fuente, 'la fuente', 12);
  if (!(FUENTES as readonly string[]).includes(fuente)) throw new BadRequestException('Fuente no válida');
  const productId = cuerpo.productId == null ? null : Number(cuerpo.productId);
  if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) throw new BadRequestException('Producto no válido');
  return {
    familia,
    tipo,
    marca: texto(cuerpo.marca, 'La marca', 80),
    modelo: texto(cuerpo.modelo, 'el modelo', 120, true),
    descripcion: texto(cuerpo.descripcion, 'La descripción', 300),
    datos: validarDatos(cuerpo.datos, familia),
    medidas: validarMedidas(cuerpo.medidas),
    caracteristicas: validarCaracteristicas(cuerpo.caracteristicas),
    fuente,
    verificado: cuerpo.verificado === true,
    productId,
  };
}
