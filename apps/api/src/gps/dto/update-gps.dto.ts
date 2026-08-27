import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateGpsDto } from './create-gps.dto.js';

/**
 * Actualización parcial de un punto de `LocationTracking`.
 *
 * Se deriva de `CreateGpsDto` —igual que el resto de DTOs de actualización del
 * proyecto— pero **omitiendo `usuarioId`**: un ping de GPS pertenece a quien lo
 * emitió y reasignarlo a otro usuario falsearía el recorrido y la asistencia de
 * ambos. `GpsController.create()` ya rechaza un `usuarioId` ajeno; dejarlo
 * actualizable habría abierto por la puerta de atrás lo que el alta cierra.
 *
 * `companyId` tampoco aparece aquí: el tenant lo resuelve el servidor desde la
 * cabecera `X-Company-Id` (`resolveRequiredCompanyId`), nunca el cliente.
 *
 * Campos actualizables: `actividadId`, `latitud`, `longitud`, `velocidadKmh`,
 * `estaActivo` y `ultimaActualizacion` — todos opcionales, con las mismas
 * validaciones y transformaciones que en el alta.
 */
export class UpdateGpsDto extends PartialType(
  OmitType(CreateGpsDto, ['usuarioId'] as const),
) {}
