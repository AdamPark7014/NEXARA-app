import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsNotEmpty()
  @IsString()
  nombre!: string;

  @IsBoolean()
  @IsOptional()
  accesoConsole?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoConsoleAdmin?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoActividades?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoEvidencias?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoViaticos?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoVehiculos?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoAsistencia?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoGps?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoGestionUsuarios?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoGestionTienda?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoGestionWeb?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoGestionCvs?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoPanelVentas?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoContabilidad?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoCotizaciones?: boolean = false;
}


