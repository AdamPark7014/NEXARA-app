import { idsTrabajandoSinJornada, listarTrabajandoSinJornada } from './trabajando-sin-jornada.js';

describe('trabajando sin jornada (consulta solo lectura)', () => {
  it('lista quien tiene sesión abierta y no checó entrada', () => {
    const ids = idsTrabajandoSinJornada(
      [{ userId: 7 }, { userId: 7 }, { userId: 3 }, { userId: 9 }],
      [{ userId: 3 }, { userId: 1 }],
    );
    expect(ids).toEqual([7, 9]);
  });

  it('nombra a la gente; sin nombre usa #id', () => {
    const nombres = new Map<number, string | null | undefined>([
      [7, 'Luis Ejemplo'],
      [9, '  '],
    ]);
    expect(
      listarTrabajandoSinJornada([{ userId: 7 }, { userId: 9 }], [{ userId: 1 }], nombres),
    ).toEqual([
      { userId: 7, nombre: 'Luis Ejemplo' },
      { userId: 9, nombre: '#9' },
    ]);
  });

  it('sin sesiones abiertas no hay nadie', () => {
    expect(idsTrabajandoSinJornada([], [{ userId: 1 }])).toEqual([]);
    expect(listarTrabajandoSinJornada([], [], new Map())).toEqual([]);
  });
});
