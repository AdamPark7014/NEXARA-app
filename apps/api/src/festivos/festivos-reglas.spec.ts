import {
  avisoDelFestivo,
  comoLeToca,
  diaDelFestivo,
  festivoDeLey,
  festivosDeLeyDelAnio,
  festivosDelRango,
  mensajeFestivoSinLaborar,
  minutosDeHorario,
  normalizaFestivo,
  sumaDiasFecha,
  type FilaFestivo,
} from './festivos-reglas';

// Datos ficticios: ninguna persona real.
const fila = (over: Partial<FilaFestivo> = {}): FilaFestivo => ({
  fecha: '2026-11-16',
  nombre: 'cualquiera',
  origen: 'LEY',
  modo: 'NO_SE_LABORA',
  horaEntrada: null,
  horaSalida: null,
  personas: [],
  pagoDoble: true,
  avisar: true,
  nota: null,
  ...over,
});

describe('festivos: los de ley', () => {
  it('2026 y 2027 según la LFT art. 74', () => {
    expect(festivosDeLeyDelAnio(2026).map((f) => f.fecha)).toEqual([
      '2026-01-01',
      '2026-02-02',
      '2026-03-16',
      '2026-05-01',
      '2026-09-16',
      '2026-11-16',
      '2026-12-25',
    ]);
    expect(festivosDeLeyDelAnio(2027).map((f) => f.fecha)).toEqual([
      '2027-01-01',
      '2027-02-01',
      '2027-03-15',
      '2027-05-01',
      '2027-09-16',
      '2027-11-15',
      '2027-12-25',
    ]);
  });

  it('el 1 de octubre solo cada seis años, cuando cambia el Ejecutivo', () => {
    expect(festivoDeLey('2030-10-01')?.fraccion).toBe('VII');
    expect(festivoDeLey('2026-10-01')).toBeNull();
    expect(festivoDeLey('2026-11-02')).toBeNull();
    expect(festivoDeLey('no-es-fecha')).toBeNull();
    expect(festivoDeLey('2026-11-16')).toEqual({ fecha: '2026-11-16', nombre: 'Día de la Revolución', fraccion: 'VI' });
  });
});

describe('festivos: el calendario', () => {
  it('mezcla los de ley con lo que dirección cambió y con los de la empresa', () => {
    const lista = festivosDelRango('2026-10-29', '2027-01-31', [
      fila({ fecha: '2026-11-02', nombre: 'Día de Muertos', origen: 'EMPRESA' }),
      fila({ fecha: '2026-11-16', modo: 'HORARIO', horaEntrada: '10:00', horaSalida: '14:00', personas: [7, 8] }),
      // Fuera del rango: no aparece.
      fila({ fecha: '2027-03-15' }),
    ]);
    expect(lista.map((f) => [f.fecha, f.origen, f.modo, f.guardado])).toEqual([
      ['2026-11-02', 'EMPRESA', 'NO_SE_LABORA', true],
      ['2026-11-16', 'LEY', 'HORARIO', true],
      ['2026-12-25', 'LEY', 'NO_SE_LABORA', false],
      ['2027-01-01', 'LEY', 'NO_SE_LABORA', false],
    ]);
    // Un día de ley conserva su nombre aunque la fila diga otro.
    expect(lista[1].nombre).toBe('Día de la Revolución');
    expect(lista[1].fraccion).toBe('VI');
  });

  it('marca los que caen en fin de semana', () => {
    const [mayo] = festivosDelRango('2027-05-01', '2027-05-01', []);
    expect(mayo.finDeSemana).toBe(true);
    expect(festivosDelRango('2027-05-02', '2027-05-01', [])).toEqual([]);
  });
});

describe('festivos: cómo le toca a cada quien', () => {
  const [revolucion] = festivosDelRango('2026-11-16', '2026-11-16', []);

  it('de ley sin tocar: nadie trabaja', () => {
    expect(comoLeToca(revolucion, { userId: 1 })).toEqual({ trabaja: false, horario: null, pagoDoble: false });
  });

  it('con horario propio y lista: trabajan los de la lista, con pago doble; el resto descansa', () => {
    const [f] = festivosDelRango('2026-11-16', '2026-11-16', [
      fila({ modo: 'HORARIO', horaEntrada: '10:00', horaSalida: '14:00', personas: [7, 8] }),
    ]);
    expect(comoLeToca(f, { userId: 7 })).toEqual({ trabaja: true, horario: { entrada: '10:00', salida: '14:00' }, pagoDoble: true });
    expect(comoLeToca(f, { userId: 9 })).toEqual({ trabaja: false, horario: null, pagoDoble: false });
  });

  it('jornada completa para todos y sin pago doble si dirección lo quitó', () => {
    const [f] = festivosDelRango('2026-11-16', '2026-11-16', [fila({ modo: 'COMPLETA', pagoDoble: false })]);
    expect(comoLeToca(f, { userId: 3 })).toEqual({ trabaja: true, horario: null, pagoDoble: false });
  });

  it('en fin de semana solo trabaja quien tiene guardia', () => {
    const [mayo] = festivosDelRango('2027-05-01', '2027-05-01', []);
    expect(comoLeToca(mayo, { userId: 1 }).trabaja).toBe(false);
    expect(comoLeToca(mayo, { userId: 1, conGuardia: true })).toEqual({ trabaja: true, horario: null, pagoDoble: true });
  });
});

describe('festivos: el formulario', () => {
  it('un día de la empresa necesita nombre; uno de ley conserva el suyo', () => {
    expect(normalizaFestivo('2026-11-02', { modo: 'NO_SE_LABORA' })).toEqual({ ok: false, error: 'Escribe el nombre del día.' });
    const ok = normalizaFestivo('2026-11-02', { nombre: '  Día   de Muertos ', modo: 'NO_SE_LABORA', personas: [3] });
    expect(ok).toEqual({
      ok: true,
      datos: {
        nombre: 'Día de Muertos',
        origen: 'EMPRESA',
        modo: 'NO_SE_LABORA',
        horaEntrada: null,
        horaSalida: null,
        personas: [],
        pagoDoble: true,
        avisar: true,
        nota: null,
      },
    });
    const ley = normalizaFestivo('2026-11-16', { nombre: 'Otro', modo: 'HORARIO', horaEntrada: '10:00', horaSalida: '14:00', personas: [7, 7, 8] });
    expect(ley.ok && ley.datos).toMatchObject({ nombre: 'Día de la Revolución', origen: 'LEY', personas: [7, 8] });
  });

  it('rechaza horarios inválidos, fin de semana laborable y datos raros', () => {
    expect(normalizaFestivo('2026-11-16', { modo: 'HORARIO', horaEntrada: '14:00', horaSalida: '10:00' })).toEqual({
      ok: false,
      error: 'La salida tiene que ser después de la entrada.',
    });
    expect(normalizaFestivo('2026-11-16', { modo: 'HORARIO', horaEntrada: '9:00', horaSalida: '14:00' }).ok).toBe(false);
    expect(normalizaFestivo('2027-05-01', { modo: 'COMPLETA' }).ok).toBe(false);
    expect(normalizaFestivo('2026-11-16', { modo: 'OTRO' }).ok).toBe(false);
    expect(normalizaFestivo('2026-11-16', { modo: 'COMPLETA', personas: [0] }).ok).toBe(false);
    expect(normalizaFestivo('2026-02-30', { modo: 'NO_SE_LABORA' }).ok).toBe(false);
    expect(normalizaFestivo('2026-11-16', { modo: 'NO_SE_LABORA', nota: 'x'.repeat(301) }).ok).toBe(false);
  });
});

describe('festivos: textos y utilidades', () => {
  const [base] = festivosDelRango('2026-11-16', '2026-11-16', [
    fila({ modo: 'HORARIO', horaEntrada: '10:00', horaSalida: '14:00', personas: [7], nota: 'Cubre la obra del CEDIS.' }),
  ]);

  it('aviso de 3 días antes, según le toque', () => {
    expect(avisoDelFestivo(base, comoLeToca(base, { userId: 7 }))).toEqual({
      title: 'El lunes 16 te toca de 10:00 a 14:00',
      message: 'Día de la Revolución. Festivo trabajado: se paga doble. Cubre la obra del CEDIS.',
    });
    expect(avisoDelFestivo(base, comoLeToca(base, { userId: 9 }))).toEqual({
      title: 'El lunes 16 no se labora',
      message: 'Día de la Revolución. Descanso pagado.',
    });
  });

  it('checada rechazada, duración y fechas', () => {
    expect(mensajeFestivoSinLaborar('Navidad')).toBe(
      'Hoy es Navidad: no se labora. Si te toca trabajar, pide a dirección que te agregue en Días festivos.',
    );
    expect(minutosDeHorario('10:00', '14:00')).toBe(240);
    expect(minutosDeHorario('14:00', '10:00')).toBeNull();
    expect(sumaDiasFecha('2026-11-13', 3)).toBe('2026-11-16');
    expect(sumaDiasFecha('2026-12-30', 3)).toBe('2027-01-02');
    expect(diaDelFestivo('2026-12-25')).toBe('el viernes 25');
  });
});
