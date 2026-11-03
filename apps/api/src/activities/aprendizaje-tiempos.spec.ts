import {
  claveConTitulo,
  historialDeMuestras,
  palabrasDelTitulo,
  parecidoDeTitulos,
  personaTipoDeMuestras,
  type MuestraTiempo,
} from './aprendizaje-tiempos';

const m = (titulo: string, minutos: number, userId = 1, clave = 'tarea:Instalación'): MuestraTiempo => ({ titulo, minutos, userId, clave });

describe('aprendizaje de tiempos', () => {
  it('las palabras con sentido, sin vacías, números ni acentos', () => {
    expect(palabrasDelTitulo('Cableado de la Biblioteca 2')).toEqual(['cableado', 'biblioteca']);
    expect(parecidoDeTitulos(['cableado', 'biblioteca'], ['cableado', 'biblioteca', 'tlaxcala'])).toBeCloseTo(2 / 3);
    expect(parecidoDeTitulos([], ['cableado'])).toBe(0);
  });

  it('título igual: primero las veces de la persona, sin mayúsculas ni acentos', () => {
    const muestras = [m('Apoyo Biblioteca', 100, 1), m('apoyo biblioteca', 120, 1), m('APOYO BIBLIOTECA', 500, 2)];
    expect(historialDeMuestras(muestras, 'Apoyo biblioteca', 1)).toEqual({ minutos: 110, veces: 2, propio: true });
    // Quien no tiene 2 propias usa las de todos.
    expect(historialDeMuestras(muestras, 'Apoyo biblioteca', 3)).toEqual({ minutos: 120, veces: 3, propio: false });
  });

  it('sin 2 iguales usa títulos parecidos, y lo dice', () => {
    const muestras = [m('Cableado biblioteca Tlaxcala', 400), m('Cableado de biblioteca', 500, 2), m('Facturas de octubre', 30)];
    expect(historialDeMuestras(muestras, 'Cableado biblioteca', 9)).toEqual({ minutos: 450, veces: 2, propio: false, parecidos: true });
  });

  it('dos títulos no se parecen solo por palabras que no dicen qué trabajo es', () => {
    const muestras = [m('Apoyo general', 400), m('Revisar apoyo', 500), m('Apoyo varios', 300)];
    expect(historialDeMuestras(muestras, 'Apoyo', 1)).toBeNull();
    expect(historialDeMuestras(muestras, 'Revisar apoyo general', 1)).toBeNull();
  });

  it('una sola vez no alcanza para creerle a un título', () => {
    expect(historialDeMuestras([m('Cableado biblioteca', 400)], 'Cableado biblioteca', 1)).toBeNull();
    expect(historialDeMuestras([m('Cableado biblioteca', 400)], 'x', 1)).toBeNull();
  });

  it('persona y tipo: desde 3 veces, y solo de esa persona en ese tipo', () => {
    const muestras = [m('a', 60), m('b', 90), m('c', 600), m('d', 500, 2), m('e', 500, 1, 'comercial')];
    expect(personaTipoDeMuestras(muestras, 'tarea:Instalación', 1)).toEqual({ minutos: 90, veces: 3 });
    expect(personaTipoDeMuestras(muestras, 'tarea:Instalación', 2)).toBeNull();
    expect(personaTipoDeMuestras(muestras, 'comercial', 1)).toBeNull();
    expect(personaTipoDeMuestras(muestras, 'tarea:Instalación', null)).toBeNull();
  });

  it('aprende con el tipo que dice el título, no con uno que no cuadra', () => {
    expect(claveConTitulo({ coreKind: 'tarea', ticketTypeCustom: 'Preparación de equipo', titulo: 'Tendido de tubería' })).toBe('tarea:Cableado y canalización');
    expect(claveConTitulo({ coreKind: 'comercial', titulo: 'Cotizar tubería' })).toBe('comercial');
    expect(claveConTitulo({ titulo: 'Algo sin tipo' })).toBe('sin-tipo');
  });
});
