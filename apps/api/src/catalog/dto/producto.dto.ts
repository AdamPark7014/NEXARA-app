import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LARGO_MAXIMO_EMPAQUE, MENSAJE_TIPO_INVALIDO, TIPOS_ARTICULO, type TipoArticulo } from '../tipo-articulo.js';

/**
 * Cuerpos de `POST/PATCH catalog/products`. Son clases (no `type`) para que el
 * `ValidationPipe` global (whitelist + forbidNonWhitelisted) los revise: antes el cuerpo
 * entraba sin revisar y un `price: "abc"` llegaba hasta Prisma.
 *
 * Los nombres de campo son los que ya mandaba la web; se suman `tipoArticulo` y `empaque`
 * (tipado de almacén, 07-10-2026). Que el empaque cuadre con el tipo lo decide
 * `validarEmpaqueDeTipo` en el servicio, porque al editar el tipo puede venir de la base.
 *
 * Ojo con el orden: class-validator corre los decoradores de abajo hacia arriba y el pipe
 * para en el primer error (`stopAtFirstError`). Por eso la revisión de tipo va al final: a
 * un nombre que no llegó se le dice «Escribe el nombre», no «no puede pasar de 255».
 */

/** «consumible», « Consumible » → 'CONSUMIBLE'; «» → null (sin tipo). Lo demás, tal cual. */
function tipoEnMayusculas({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const limpio = value.trim().toUpperCase();
  return limpio || null;
}

/** El empaque de un consumible («Bote» de 100 pz) o la presentación de lo que va por medida. */
export class EmpaqueArticuloDto {
  @MaxLength(LARGO_MAXIMO_EMPAQUE, {
    message: `El nombre del empaque no puede pasar de ${LARGO_MAXIMO_EMPAQUE} caracteres`,
  })
  @IsNotEmpty({ message: 'Escribe el empaque (Bote, Bolsa, Caja…) o la presentación (Bobina, Rollo…)' })
  @IsString({ message: 'Escribe el empaque (Bote, Bolsa, Caja…) o la presentación (Bobina, Rollo…)' })
  nombre!: string;

  /** Cuántas piezas (o metros, si es por medida) trae cada empaque. */
  @Max(9_999_999_999, { message: 'Lo que trae el empaque es demasiado grande' })
  @IsPositive({ message: 'Lo que trae el empaque debe ser mayor a cero' })
  @IsNumber({}, { message: 'Indica cuántas piezas o metros trae el empaque' })
  capacidad!: number;
}

class CamposProductoDto {
  @IsOptional()
  @MaxLength(200, { message: 'La categoría no puede pasar de 200 caracteres' })
  @IsString()
  category?: string;

  @IsOptional()
  @MaxLength(200, { message: 'La subcategoría no puede pasar de 200 caracteres' })
  @IsString()
  subcategory?: string;

  @IsOptional()
  @Min(0, { message: 'El precio no puede ser negativo' })
  @IsNumber({}, { message: 'El precio debe ser un número' })
  price?: number;

  @IsOptional()
  @MaxLength(10, { message: 'La moneda no puede pasar de 10 caracteres' })
  @IsString()
  currency?: string;

  @IsOptional()
  @MaxLength(50, { message: 'La unidad no puede pasar de 50 caracteres' })
  @IsString()
  unit?: string;

  @IsOptional()
  @MaxLength(1000, { message: 'La URL de la imagen no puede pasar de 1000 caracteres' })
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @MaxLength(5000, { message: 'La descripción no puede pasar de 5000 caracteres' })
  @IsString()
  description?: string;

  @IsOptional()
  @MaxLength(10, { message: 'La clave SAT de producto no puede pasar de 10 caracteres' })
  @IsString()
  satProductKey?: string;

  @IsOptional()
  @MaxLength(5, { message: 'La clave SAT de unidad no puede pasar de 5 caracteres' })
  @IsString()
  satUnitKey?: string;

  @IsOptional()
  @MaxLength(50, { message: 'La unidad no puede pasar de 50 caracteres' })
  @IsString()
  unitName?: string;

  /**
   * EQUIPO, CONSUMIBLE o MEDIDA. Acepta minúsculas. `null` al editar = «Sin tipo».
   * HERRAMIENTA no: las herramientas no son productos (Almacén → Herramientas).
   */
  @IsOptional()
  @Transform(tipoEnMayusculas)
  @IsIn(TIPOS_ARTICULO as unknown as string[], { message: MENSAJE_TIPO_INVALIDO })
  tipoArticulo?: TipoArticulo | null;

  /** Solo consumible y por medida. Queda como la presentación por defecto de compra. */
  @IsOptional()
  @IsObject({ message: 'El empaque debe traer nombre y capacidad' })
  @ValidateNested()
  @Type(() => EmpaqueArticuloDto)
  empaque?: EmpaqueArticuloDto;
}

export class CrearProductoDto extends CamposProductoDto {
  @IsOptional()
  @MaxLength(100, { message: 'El SKU no puede pasar de 100 caracteres' })
  @IsString()
  sku?: string;

  @MaxLength(255, { message: 'El nombre no puede pasar de 255 caracteres' })
  @IsNotEmpty({ message: 'Escribe el nombre del artículo' })
  @IsString({ message: 'Escribe el nombre del artículo' })
  name!: string;
}

export class EditarProductoDto extends CamposProductoDto {
  /** El formulario de artículo manda el SKU también al editar: si cambia, se revisa que no choque. */
  @IsOptional()
  @MaxLength(100, { message: 'El SKU no puede pasar de 100 caracteres' })
  @IsString()
  sku?: string;

  @IsOptional()
  @MaxLength(255, { message: 'El nombre no puede pasar de 255 caracteres' })
  @IsNotEmpty({ message: 'Escribe el nombre del artículo' })
  @IsString({ message: 'Escribe el nombre del artículo' })
  name?: string;
}
