import { enteroDeEntorno, interruptorEncendido } from './integra-automatizacion.env';

/**
 * El interruptor de una tarea que corre sola contra el parque de un cliente.
 *
 * Lo que se prueba aquí no es parsear cadenas: es que apagar sea EXPLÍCITO y
 * que una errata no deje la consola sin automatizar en silencio, ni al revés.
 */
describe('interruptorEncendido', () => {
  it('sin variable, encendido', () => {
    expect(interruptorEncendido(undefined)).toBe(true);
    expect(interruptorEncendido(null)).toBe(true);
    expect(interruptorEncendido('')).toBe(true);
    expect(interruptorEncendido('   ')).toBe(true);
  });

  it('apaga con las formas que un operador escribiría de verdad', () => {
    for (const v of ['0', 'false', 'off', 'no', 'FALSE', ' Off ']) {
      expect(interruptorEncendido(v)).toBe(false);
    }
  });

  it('enciende explícitamente', () => {
    for (const v of ['1', 'true', 'on', 'yes', 'sí', 'SI']) {
      expect(interruptorEncendido(v)).toBe(true);
    }
  });

  it('un valor con errata NO apaga: cae en el defecto', () => {
    // `INTEGRA_WARMUP_ENABLED=flase` no puede dejar el muro frío sin avisar.
    expect(interruptorEncendido('flase')).toBe(true);
    expect(interruptorEncendido('flase', false)).toBe(false);
  });

  it('respeta un defecto apagado', () => {
    expect(interruptorEncendido(undefined, false)).toBe(false);
    expect(interruptorEncendido('1', false)).toBe(true);
  });
});

describe('enteroDeEntorno', () => {
  it('sin valor o con basura, el defecto', () => {
    expect(enteroDeEntorno(undefined, 400, 0, 30_000)).toBe(400);
    expect(enteroDeEntorno('ochocientos', 400, 0, 30_000)).toBe(400);
    expect(enteroDeEntorno('', 400, 0, 30_000)).toBe(400);
  });

  it('recorta contra el techo y el suelo', () => {
    // Un escalonado de un día entre cámaras deja la automatización inservible.
    expect(enteroDeEntorno('86400000', 400, 0, 30_000)).toBe(30_000);
    expect(enteroDeEntorno('-5', 400, 0, 30_000)).toBe(0);
  });

  it('acepta el valor cuando está en rango', () => {
    expect(enteroDeEntorno('1200', 400, 0, 30_000)).toBe(1200);
    expect(enteroDeEntorno('1200.9', 400, 0, 30_000)).toBe(1200);
  });
});
