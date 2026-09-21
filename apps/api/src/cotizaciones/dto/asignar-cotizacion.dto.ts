import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MAX_NOTA } from '../envio-interno.js';

/**
 * «Enviar a un compañero»: la cotización pasa a otra persona que también cotiza.
 *
 * No confundir con `SendCotizacionDto`, que es el envío al **cliente** por correo.
 */
export class AsignarCotizacionDto {
  /** A quién se la pasas. Que pueda cotizar lo comprueba el servicio contra su clave de rol. */
  @IsInt()
  @Min(1)
  destinatarioId!: number;

  /** Por qué se la pasas («falta el precio del NVR»). Opcional: a veces basta con pasarla. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTA)
  nota?: string;
}
