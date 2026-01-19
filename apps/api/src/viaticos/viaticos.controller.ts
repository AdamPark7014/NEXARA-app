import type { Response } from 'express';
import { Controller, Get, Post, Param, Res, UploadedFile, UseInterceptors, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
// import { ViaticosService } from './viaticos.service';

@Controller('viatics')
export class ViaticosController {
  // constructor(private readonly viaticosService: ViaticosService) {}

  // Endpoint para obtener todos los viáticos
  @Get()
  async findAll() {
    return [];
  }

  // Exportar viáticos (CSV o JSON)
  @Get('export/:format')
  async export(@Param('format') format: string, @Res() res: Response) {
    const data: any[] = [];
    if (format === 'csv') {
      res.header('Content-Type', 'text/csv');
      res.attachment('viaticos.csv');
      return res.send('');
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment('viaticos.json');
      return res.send(JSON.stringify(data, null, 2));
    }
  }

  // Importar viáticos desde archivo JSON
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any, @Res() res: Response) {
    if (!file) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Archivo requerido' });
    }
    try {
      JSON.parse(file.buffer.toString());
      // importMany removed
      return res.json({ message: 'Importación no implementada', count: 0 });
    } catch (e) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Archivo inválido o error de importación' });
    }
  }
}

