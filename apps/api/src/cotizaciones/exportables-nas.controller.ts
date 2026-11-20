import { Controller, Get, Param, ParseIntPipe, Query, Req, Res, UseGuards } from '@nestjs/common';
import { NasExportGuard } from '../common/nas-export.guard.js';
import { ExportablesNasService } from './exportables-nas.service.js';
import { Response } from 'express';

/**
 * Controlador para la gestión de exportación de cotizaciones vía hilo NAS.
 * 
 * Contrato del hilo de exportación:
 * - Variables requeridas en el header/contexto:
 *   * NAS_EXPORT_TOKEN: Token de autenticación (mínimo 32 caracteres).
 *   * NAS_EXPORT_COMPANY_ID: ID de la empresa (valor por defecto 1 si no se provee).
 * 
 * - Encabezados HTTP necesarios:
 *   * X-Nas-Token: Contiene el valor de NAS_EXPORT_TOKEN.
 * 
 * - Rutas disponibles:
 *   * GET /api/cotizaciones/exportables?desde=&limite=&soloConProyecto=
 *     Parámetros de consulta opcionales:
 *       * desde: Límite inferior de paginación.
 *       * limite: Cantidad de registros a retornar.
 *       * soloConProyecto: Filtro para incluir solo proyectos (true por defecto).
 *     Respuesta esperada: Lista de items con las siguientes propiedades:
 *       * operationalProjectId: Identificador único del proyecto operativo.
 *       * nombreArchivo: Nombre del archivo PDF con formato <folio> <cliente> <AAAA-MM-DD>.pdf.
 *       * siguienteDesde: Token para la siguiente paginación.
 *   * GET /api/cotizaciones/exportables/:id/pdf
 *     Genera y devuelve el contenido binario del PDF en base64 o stream directo.
 * 
 * - Restricciones de seguridad:
 *   * No se permite escritura directa en el sistema NAS desde este controlador.
 *   * La carpeta destino de los archivos es determinada exclusivamente por la lógica del hilo NAS.
 *   * Se requiere autenticación mediante NasExportGuard.
 */

@Controller('cotizaciones/exportables')
@UseGuards(NasExportGuard)
export class ExportablesNasController {
  constructor(private readonly exportables: ExportablesNasService) {}

  @Get()
  listar(
    @Req() req: any,
    @Query('desde') desde?: string | null,
    @Query('limite') limite?: string | null,
    @Query('soloConProyecto') soloConProyecto?: string | null,
  ) {
    const companyId = Number(req.nasExportCompanyId ?? req.companyId ?? 1);
    return this.exportables.listar(companyId, { desde: desde ?? undefined, limite: limite ?? undefined, soloConProyecto: soloConProyecto ?? undefined });
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const companyId = Number(req.nasExportCompanyId ?? req.companyId ?? 1);
    const { buffer, nombreArchivo } = await this.exportables.pdf(id, companyId);
    
    // Establecer tipos de contenido y disposición para descarga forzada del PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition', 
      `attachment; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`
    );
    
    // Enviar el buffer con el archivo
    res.send(buffer);
  }
}