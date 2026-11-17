import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor, FileInterceptor } from '../common/files/interceptores-subida.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { GestionViaticosService } from './gestion-viaticos.service.js';

@Controller('gestion-viaticos')
@UseGuards(AuthGuard('jwt'), UrlAccessGuard)
export class GestionViaticosController {
  constructor(private readonly service: GestionViaticosService) {}

  @Get('bandeja')
  bandeja(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.bandeja(user, companyId);
  }

  @Get('mis-tickets')
  misTickets(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.misTickets(user, companyId);
  }

  @Get('por-facturar')
  porFacturar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.porFacturar(user, companyId);
  }

  @Post('tickets')
  @UseInterceptors(FileInterceptor('foto', { dest: getUploadSubdir(__dirname, 'viatico-tickets'),
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(/^image\/(jpeg|png|webp)$/.test(file.mimetype) ? null : new BadRequestException('Sube una imagen JPG, PNG o WebP.'), /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
  }))
  crearTicket(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: any,
    @UploadedFile() file?: { filename?: string },
  ) {
    const fotoUrl = file?.filename ? `/uploads/viatico-tickets/${file.filename}` : '';
    if (!fotoUrl) throw new BadRequestException('Sube la foto del ticket.');
    return this.service.crearTicket(user, companyId, body ?? {}, fotoUrl);
  }

  @Post('tickets/:id/revisar')
  revisar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { accion?: 'aprobar' | 'rechazar'; motivo?: string },
  ) {
    if (!body || !['aprobar', 'rechazar'].includes(body.accion ?? '')) throw new BadRequestException('Elige aprobar o rechazar.');
    const accion = body.accion!;
    return this.service.revisarTicket(user, companyId, id, { accion, motivo: body?.motivo });
  }

  @Post('tickets/:id/facturar')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'facturaXml', maxCount: 1 },
        { name: 'facturaPdf', maxCount: 1 },
      ],
      { dest: getUploadSubdir(__dirname, 'viatico-tickets'), limits: { fileSize: 12 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          const valido = file.fieldname === 'facturaXml'
            ? /^(application|text)\/xml$/.test(file.mimetype) && /\.xml$/i.test(file.originalname)
            : file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname);
          cb(valido ? null : new BadRequestException('Adjunta un archivo XML o PDF válido.'), valido);
        },
      },
    ),
  )
  facturar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      accion?: 'facturado' | 'no_facturable';
      notas?: string;
      facturaXmlUrl?: string;
      facturaPdfUrl?: string;
    },
    @UploadedFiles()
    files?: { facturaXml?: Array<{ filename?: string }>; facturaPdf?: Array<{ filename?: string }> },
  ) {
    const xml =
      files?.facturaXml?.[0]?.filename
        ? `/uploads/viatico-tickets/${files.facturaXml[0].filename}`
        : undefined;
    const pdf =
      files?.facturaPdf?.[0]?.filename
        ? `/uploads/viatico-tickets/${files.facturaPdf[0].filename}`
        : undefined;
    if (!body || !['facturado', 'no_facturable'].includes(body.accion ?? '')) throw new BadRequestException('Elige facturado o no facturable.');
    const accion = body.accion!;
    return this.service.facturarTicket(user, companyId, id, {
      accion,
      notas: body?.notas,
      facturaXmlUrl: xml,
      facturaPdfUrl: pdf,
    });
  }

  @Post('leer-ticket')
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: 12 * 1024 * 1024 } }))
  leerTicket(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @UploadedFile() file?: { buffer?: Buffer },
  ) {
    return this.service.leerTicketIa(user, companyId, file?.buffer);
  }
}
