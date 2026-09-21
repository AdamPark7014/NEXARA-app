import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Asignación de viático a **varias** personas en una sola captura.
 *
 * Nace de cómo se asigna de verdad en campo: una cuadrilla sale el lunes a
 * cubrir las actividades de la semana y se le da gasolina y casetas a los
 * cuatro de golpe. Con el endpoint de uno en uno había que repetir la misma
 * captura cuatro veces, y cada repetición es una oportunidad de equivocarse en
 * el monto.
 *
 * El reparto entre varias actividades ya existía (`ViaticoReparto`); lo que
 * faltaba era el otro eje, el de los beneficiarios, y poder decir «esta semana»
 * sin colgarlo de una actividad concreta.
 */
export class AssignViaticoLoteDto {
  /** Beneficiarios. Uno por viático: el monto es POR PERSONA, no el total. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  usuarioIds!: number[];

  /**
   * Actividades que cubre el viático. Con una, el viático queda colgado de ella
   * como siempre. Con varias, se reparte el costo entre todas en partes
   * iguales al centavo, que es lo que hace honesto el P&L por proyecto.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @Type(() => Number)
  @IsInt({ each: true })
  actividadIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vehicleId?: number | null;

  /** COMBUSTIBLE | CASETA | HOSPEDAJE | ALIMENTACION | TRANSPORTE | OTROS */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoria?: string;

  /** Lo que recibe CADA beneficiario. */
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  montoPorPersona!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;

  /** Periodo que cubre — para el viático semanal. Sólo enriquece el motivo. */
  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;
}
