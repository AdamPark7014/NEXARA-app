import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CODIGOS_CHECADA,
  FRASES_QUE_LAS_APPS_LEEN,
  MENSAJE_COMIDA_REGRESO_YA_REGISTRADO,
  MENSAJE_COMIDA_SIN_SALIDA,
  MENSAJE_COMIDA_YA_COMPLETADA,
  MENSAJE_ENTRADA_YA_REGISTRADA,
  MENSAJE_SALIDA_YA_REGISTRADA,
  rechazoComidaRegresoYaRegistrado,
  rechazoEntradaYaRegistrada,
  rechazoSalidaYaRegistrada,
} from './mensajes-checada';

const TODOS = [
  MENSAJE_ENTRADA_YA_REGISTRADA,
  MENSAJE_SALIDA_YA_REGISTRADA,
  MENSAJE_COMIDA_YA_COMPLETADA,
  MENSAJE_COMIDA_REGRESO_YA_REGISTRADO,
  MENSAJE_COMIDA_SIN_SALIDA,
];

describe('mensajes de checada y comida repetidas', () => {
  it('las checadas conservan el texto de antes como prefijo (las apps publicadas lo conocen)', () => {
    expect(MENSAJE_ENTRADA_YA_REGISTRADA.startsWith('Ya existe una entrada registrada para hoy')).toBe(true);
    expect(MENSAJE_SALIDA_YA_REGISTRADA.startsWith('Ya existe una salida registrada para hoy')).toBe(true);
  });

  it('ningún texto contiene las palabras con que las apps eligen pantalla', () => {
    for (const texto of TODOS) {
      const plano = texto.toLowerCase();
      for (const frase of FRASES_QUE_LAS_APPS_LEEN) {
        expect(plano).not.toContain(frase);
      }
    }
  });

  it('cada texto termina en punto, es corto y dice que no hay que repetir o qué va primero', () => {
    for (const texto of TODOS) {
      expect(texto.endsWith('.')).toBe(true);
      expect(texto.length).toBeLessThanOrEqual(140);
      expect(texto).toMatch(/No necesitas|Primero /);
    }
  });

  it('el regreso de comida ya no habla de «salida» (la persona estaba registrando el regreso)', () => {
    expect(MENSAJE_COMIDA_REGRESO_YA_REGISTRADO).toContain('regreso');
    expect(MENSAJE_COMIDA_REGRESO_YA_REGISTRADO).not.toContain('salida');
  });

  it('cada rechazo lleva su código estable y no se repiten', () => {
    expect(rechazoEntradaYaRegistrada().code).toBe('CHECADA_ENTRADA_YA_REGISTRADA');
    expect(rechazoSalidaYaRegistrada().code).toBe('CHECADA_SALIDA_YA_REGISTRADA');
    expect(rechazoComidaRegresoYaRegistrado().code).toBe('COMIDA_REGRESO_YA_REGISTRADO');
    expect(new Set(Object.values(CODIGOS_CHECADA)).size).toBe(Object.keys(CODIGOS_CHECADA).length);
  });

  it('el texto de fin de semana sigue intacto: la web lo compara por igualdad', () => {
    const fuente = readFileSync(resolve(__dirname, '../guardias/guardias-reglas.ts'), 'utf8');
    expect(fuente).toContain(
      "'Hoy es fin de semana: solo quien tiene guardia puede checar. Pide a tu encargado que te programe.'",
    );
  });
});
