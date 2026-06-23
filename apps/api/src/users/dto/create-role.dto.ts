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

  // === ERP Industrial ===
  @IsBoolean()
  @IsOptional()
  accesoInventario?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoCompras?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoManufactura?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoCalidad?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoMantenimiento?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoSeguridad?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoDocumentos?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoWorkflow?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoAuditoria?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoBI?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoBanca?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoMultas?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoClientes?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoLunchBreaks?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoRRHH?: boolean = false;

  @IsBoolean()
  @IsOptional()
  accesoCatalogo?: boolean = false;

  @IsOptional()
  @IsString()
  orgRoleKey?: string;

  @IsOptional()
  nivelAutoridad?: number;
}


