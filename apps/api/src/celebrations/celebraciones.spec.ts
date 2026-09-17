import {
  aniosDesde,
  avisoParaElEquipo,
  avisoParaQuienCelebra,
  diaDeClave,
  esBisiesto,
  primerNombre,
  tocaHoy,
} from './celebraciones';

// Datos ficticios: ninguna persona real.
const utc = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h));

describe('celebraciones', () => {
  it('reconoce el día y mes sin importar el año ni la hora guardada', () => {
    const hoy = diaDeClave('2026-09-17');
    expect(tocaHoy(utc(1990, 9, 17), hoy)).toBe(true);
    expect(tocaHoy(utc(2021, 9, 17, 12), hoy)).toBe(true);
    expect(tocaHoy(utc(1990, 9, 18), hoy)).toBe(false);
    expect(tocaHoy(utc(1990, 10, 17), hoy)).toBe(false);
    expect(tocaHoy(null, hoy)).toBe(false);
  });

  it('quien nació un 29 de febrero celebra el 28 en años no bisiestos', () => {
    const nacio = utc(1996, 2, 29);
    expect(esBisiesto(2027)).toBe(false);
    expect(tocaHoy(nacio, diaDeClave('2027-02-28'))).toBe(true);
    expect(tocaHoy(nacio, diaDeClave('2028-02-28'))).toBe(false);
    expect(tocaHoy(nacio, diaDeClave('2028-02-29'))).toBe(true);
  });

  it('cuenta los años de antigüedad', () => {
    expect(aniosDesde(utc(2024, 9, 17, 12), diaDeClave('2026-09-17'))).toBe(2);
  });

  it('saluda con el primer nombre y nunca dice la edad', () => {
    expect(primerNombre('mónica  Pérez Luna')).toBe('Mónica');
    const propio = avisoParaQuienCelebra('cumpleanos', 'Óscar Iván Pérez', 34);
    expect(propio.titulo).toBe('¡Feliz cumpleaños, Óscar! 🎂');
    expect(`${propio.titulo} ${propio.mensaje}`).not.toMatch(/34/);
    const equipo = avisoParaElEquipo('cumpleanos', 'Óscar Iván Pérez', 34);
    expect(equipo.titulo).toBe('Hoy es cumpleaños de Óscar Iván Pérez 🎂');
    expect(`${equipo.titulo} ${equipo.mensaje}`).not.toMatch(/34/);
  });

  it('el aniversario sí dice cuántos años lleva en la empresa', () => {
    expect(avisoParaQuienCelebra('aniversario', 'Érika Núñez', 1).mensaje).toContain('1 año en NEXARA');
    expect(avisoParaElEquipo('aniversario', 'Érika Núñez', 3).titulo).toBe('Érika Núñez cumple 3 años en NEXARA 🎉');
  });
});
