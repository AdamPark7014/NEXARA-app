/**
 * 409 de la concurrencia optimista: otra persona guardó el diseño después de que se abrió.
 *
 * El filtro global (`AllExceptionsFilter`) responde solo `statusCode`, `errorCode` y `message`, y
 * además registra el cuerpo de la petición (un plano puede pesar 2 MB). Este filtro, solo del
 * controlador de diseños, responde también `versionActual` —la web la usa para ofrecer recargar—
 * y no copia el plano al registro.
 */
import { ArgumentsHost, Catch, ConflictException, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

export const MENSAJE_CONFLICTO_VERSION =
  'Otra persona guardó este diseño mientras lo editabas. Recarga para ver su versión.';

export class ConflictoVersionDiseno extends ConflictException {
  constructor(readonly versionActual: number) {
    super({ statusCode: 409, message: MENSAJE_CONFLICTO_VERSION, error: 'CONFLICT', versionActual });
  }
}

@Catch(ConflictoVersionDiseno)
export class ConflictoVersionFilter implements ExceptionFilter {
  catch(exception: ConflictoVersionDiseno, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(409).json({
      statusCode: 409,
      errorCode: 'CONFLICT',
      message: MENSAJE_CONFLICTO_VERSION,
      versionActual: exception.versionActual,
    });
  }
}
