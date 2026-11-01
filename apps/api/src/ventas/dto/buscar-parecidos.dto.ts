import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** «¿Ya existe este cliente?»: lo que se quiere dar de alta, para compararlo con el padrón. */
export class BuscarParecidosDto {
  @IsString()
  @MaxLength(220)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  rfc?: string;

  /** Al editar: el mismo cliente no se avisa contra sí mismo. */
  @IsOptional()
  @IsInt()
  excluirId?: number;

  /** Sin IA: para revisar mientras se escribe. */
  @IsOptional()
  @IsBoolean()
  soloCodigo?: boolean;
}
