import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateGpsDto } from './update-gps.dto.js';

/**
 * Reproduce el `ValidationPipe` global de `main.ts`: mismas opciones de
 * transformación y validación, para que lo que aquí pasa sea lo que pasa en
 * producción y no una aproximación.
 */
function validar(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateGpsDto, payload, { enableImplicitConversion: true });
  const errores = validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
  });
  return { dto, errores };
}

const propiedades = (errores: ReturnType<typeof validateSync>) => errores.map((e) => e.property);

describe('UpdateGpsDto', () => {
  it('acepta un cuerpo vacío: toda actualización es parcial', () => {
    expect(validar({}).errores).toHaveLength(0);
  });

  it('acepta una actualización de un solo campo', () => {
    const { dto, errores } = validar({ latitud: 25.6866 });
    expect(errores).toHaveLength(0);
    expect(dto.latitud).toBe(25.6866);
  });

  it('acepta el juego completo de campos actualizables', () => {
    const { dto, errores } = validar({
      actividadId: 12,
      latitud: 25.6866,
      longitud: -100.3161,
      velocidadKmh: 42.5,
      estaActivo: false,
      ultimaActualizacion: '2026-08-27T15:00:00.000Z',
    });
    expect(errores).toHaveLength(0);
    expect(dto.ultimaActualizacion).toBeInstanceOf(Date);
    expect(dto.estaActivo).toBe(false);
  });

  it('convierte las coordenadas que llegan como texto', () => {
    // El cliente móvil las manda como string dentro de un multipart.
    const { dto, errores } = validar({ latitud: '25.6866', longitud: '-100.3161' });
    expect(errores).toHaveLength(0);
    expect(dto.latitud).toBe(25.6866);
    expect(dto.longitud).toBe(-100.3161);
  });

  it('rechaza coordenadas que no son numéricas', () => {
    const { errores } = validar({ latitud: 'norte', longitud: {} });
    expect(propiedades(errores)).toEqual(expect.arrayContaining(['latitud', 'longitud']));
  });

  it('rechaza una fecha inválida en ultimaActualizacion', () => {
    expect(propiedades(validar({ ultimaActualizacion: 'ayer por la tarde' }).errores)).toContain(
      'ultimaActualizacion',
    );
  });

  it('rechaza un actividadId no numérico', () => {
    expect(propiedades(validar({ actividadId: 'doce' }).errores)).toContain('actividadId');
  });

  it('conserva los mensajes de error en español heredados del alta', () => {
    const [error] = validar({ latitud: 'norte' }).errores;
    expect(Object.values(error.constraints ?? {}).join(' ')).toMatch(/latitud debe ser un número/);
  });

  it('NO acepta usuarioId: un ping no se reasigna a otro usuario', () => {
    // `GpsController.create()` prohíbe registrar la ubicación de un tercero; si
    // la actualización admitiese usuarioId se saltaría esa comprobación por la
    // puerta de atrás. Con `forbidNonWhitelisted` el campo no se ignora: rompe.
    const { errores } = validar({ usuarioId: 999, latitud: 25.6866 });
    expect(propiedades(errores)).toContain('usuarioId');
  });

  it('NO acepta companyId: el tenant lo pone el servidor', () => {
    const { errores } = validar({ companyId: 7, latitud: 25.6866 });
    expect(propiedades(errores)).toContain('companyId');
  });

  it('rechaza cualquier campo que no esté en el contrato', () => {
    expect(propiedades(validar({ campoInventado: 'x' }).errores)).toContain('campoInventado');
  });
});
