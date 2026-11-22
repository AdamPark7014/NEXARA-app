import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ValidacionEnEspanolPipe, mensajeDeValidacionEnEspanol } from './validacion-es.js';

class RenglonDto {
  @IsInt()
  quantity!: number;
}

/**
 * Un DTO con las reglas que más usa la API, sin mensaje propio salvo donde se indica.
 * Con `stopAtFirstError` gana la regla más pegada al campo: por eso la más básica va a la derecha.
 */
class PruebaDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNotEmpty() description?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsPositive() @IsNumber() amount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) score?: number;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsString() @MaxLength(3) code?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsIn(['ALTA', 'BAJA']) status?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString({ each: true }) @ArrayMaxSize(3) @ArrayMinSize(2) @IsArray() tags?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RenglonDto) items?: RenglonDto[];
  @IsOptional() @IsString({ message: 'Escribe el motivo del rechazo' }) motivo?: string;
  @IsOptional() @IsString() satProductKey?: string;
}

/** Las mismas opciones que `main.ts`; solo así se prueba lo que de verdad contesta el servidor. */
const pipe = new ValidacionEnEspanolPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  // Sin conversión implícita: aquí se prueba el texto de cada regla, no la coerción de tipos.
  stopAtFirstError: true,
});

async function mensajes(cuerpo: Record<string, unknown>): Promise<string[]> {
  try {
    await pipe.transform(cuerpo, { type: 'body', metatype: PruebaDto });
  } catch (e) {
    if (!(e instanceof BadRequestException)) throw e;
    const respuesta = e.getResponse() as { statusCode: number; message: string[]; error: string };
    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.error).toBe('Bad Request');
    return respuesta.message;
  }
  return [];
}

describe('validación en español', () => {
  it('un cuerpo válido pasa sin mensajes', async () => {
    expect(await mensajes({ name: 'Cámara', amount: 10 })).toEqual([]);
  });

  it('traduce las reglas por defecto de la librería, con el nombre del campo como se dice', async () => {
    expect(await mensajes({ name: 5 })).toEqual(['El nombre debe ser texto']);
    expect(await mensajes({ description: '' })).toEqual(['Falta la descripción']);
    expect(await mensajes({ email: 'no-es-correo' })).toEqual(['El correo no es un correo válido']);
    expect(await mensajes({ amount: 'x' })).toEqual(['El monto debe ser un número']);
    expect(await mensajes({ amount: -3 })).toEqual(['El monto debe ser mayor que cero']);
    expect(await mensajes({ score: 1.5 })).toEqual(['La calificación debe ser un número entero']);
    expect(await mensajes({ score: 0 })).toEqual(['La calificación no puede ser menor que 1']);
    expect(await mensajes({ score: 9 })).toEqual(['La calificación no puede ser mayor que 5']);
    expect(await mensajes({ password: 'corta' })).toEqual(['La contraseña debe tener al menos 8 caracteres']);
    expect(await mensajes({ code: 'ABCD' })).toEqual(['El código admite hasta 3 caracteres']);
    expect(await mensajes({ isActive: 'quizá' })).toEqual(['El campo «isActive» debe ser sí o no']);
    expect(await mensajes({ startDate: 'ayer' })).toEqual(['La fecha de inicio no es una fecha válida']);
    expect(await mensajes({ status: 'OTRA' })).toEqual(['El estado debe ser una de estas opciones: ALTA, BAJA']);
    expect(await mensajes({ currency: 'pesos' })).toEqual(['La moneda no tiene el formato esperado']);
  });

  it('listas y renglones', async () => {
    expect(await mensajes({ tags: 'una' })).toEqual(['Las etiquetas deben ser una lista']);
    expect(await mensajes({ tags: ['a'] })).toEqual(['Las etiquetas deben traer al menos 2 elementos']);
    expect(await mensajes({ tags: ['a', 'b', 'c', 'd'] })).toEqual(['Las etiquetas admiten hasta 3 elementos']);
    expect(await mensajes({ tags: ['a', 7] })).toEqual(['Cada elemento de las etiquetas debe ser texto']);
    expect(await mensajes({ items: [{ quantity: 1 }, { quantity: 'dos' }] })).toEqual([
      'La cantidad del renglón 2 debe ser un número entero',
    ]);
  });

  it('un campo que el servidor no conoce se nombra tal cual, entre comillas', async () => {
    expect(await mensajes({ stock: 5 })).toEqual(['El campo «stock» no se admite aquí']);
    expect(await mensajes({ satProductKey: 5 })).toEqual(['El campo «satProductKey» debe ser texto']);
  });

  it('el mensaje propio de un DTO y lo que no se reconoce pasan intactos', async () => {
    expect(await mensajes({ motivo: 5 })).toEqual(['Escribe el motivo del rechazo']);
    expect(mensajeDeValidacionEnEspanol('El folio ya se usó')).toBe('El folio ya se usó');
    expect(mensajeDeValidacionEnEspanol('amount must be a currency')).toBe('amount must be a currency');
    expect(mensajeDeValidacionEnEspanol('each value in tags should not be empty')).toBe(
      'Ningún elemento de las etiquetas puede ir vacío',
    );
    expect(mensajeDeValidacionEnEspanol('each value in name must be a string')).toBe(
      'Cada elemento del nombre debe ser texto',
    );
  });
});
