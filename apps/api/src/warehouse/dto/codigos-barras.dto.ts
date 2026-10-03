import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LARGO_MAXIMO_CODIGO } from '../codigo-barras.js';

/**
 * Cuerpos del lector de códigos (web y apps). Son clases, no `type`, para que el
 * `ValidationPipe` global (whitelist + forbidNonWhitelisted) sí los revise: antes un
 * `notes: 123` tiraba 500 en `.trim()` y un `sku` de mil caracteres llegaba a la base.
 *
 * Los nombres de campo son los que ya mandan las apps móviles y la web: no cambiarlos.
 */

const MENSAJE_CODIGO_LARGO = `El código es demasiado largo (máximo ${LARGO_MAXIMO_CODIGO} caracteres)`;

/** Tipos que acepta el movimiento por código; `IN`/`OUT` son los alias de las apps. */
export const TIPOS_MOVIMIENTO_POR_CODIGO = [
  'RECEIPT',
  'DISPATCH',
  'TRANSFER',
  'ADJUSTMENT',
  'RETURN',
  'IN',
  'OUT',
] as const;

export class AltaPorCodigoDto {
  @IsString()
  @IsNotEmpty({ message: 'Escanea o escribe un código de barras' })
  @MaxLength(LARGO_MAXIMO_CODIGO, { message: MENSAJE_CODIGO_LARGO })
  codigo!: string;

  @IsString()
  @IsNotEmpty({ message: 'Escribe el nombre del producto' })
  @MaxLength(255, { message: 'El nombre no puede pasar de 255 caracteres' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La clave no puede pasar de 100 caracteres' })
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La marca no puede pasar de 200 caracteres' })
  marca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El modelo no puede pasar de 120 caracteres' })
  modelo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La descripción no puede pasar de 2000 caracteres' })
  descripcion?: string;

  /** Solo se guarda si es https (lo decide el servicio); aquí solo se acota el largo. */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La URL de la imagen no puede pasar de 500 caracteres' })
  imagenUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'La categoría no puede pasar de 120 caracteres' })
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'La unidad no puede pasar de 50 caracteres' })
  unidad?: string;
}

export class MovimientoPorCodigoDto {
  @IsString()
  @IsNotEmpty({ message: 'Escanea o escribe un código de barras' })
  @MaxLength(LARGO_MAXIMO_CODIGO, { message: MENSAJE_CODIGO_LARGO })
  codigo!: string;

  /** RECEIPT | DISPATCH | TRANSFER | ADJUSTMENT | RETURN (o IN / OUT). */
  @IsIn(TIPOS_MOVIMIENTO_POR_CODIGO, { message: 'Indica el tipo de movimiento' })
  type!: string;

  /** En la unidad de lo escaneado: cajas si el código es de una caja, piezas si no. */
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Indica una cantidad mayor a cero' })
  @IsPositive({ message: 'Indica una cantidad mayor a cero' })
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  fromWarehouseId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  toWarehouseId?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las notas no pueden pasar de 2000 caracteres' })
  notes?: string;

  /** Columna `reference` de StockMovement: VarChar(200). */
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La referencia no puede pasar de 200 caracteres' })
  reference?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  activityId?: number;
}
