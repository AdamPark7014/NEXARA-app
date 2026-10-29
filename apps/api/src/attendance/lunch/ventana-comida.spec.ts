import { horarioDePersona } from '../../me/kpis-equipo';
import {
  aMinutos,
  avisoDeComidaQueToca,
  minutoDelAvisoDeComida,
  regresoLimite,
  salidaATiempo,
  textoAvisoDeComida,
  ultimaSalida,
  ventanaDeComida,
} from './ventana-comida';

const m = (hm: string) => aMinutos(hm);
const OFICINA = ventanaDeComida(horarioDePersona('office_hours', null));
const CUADRILLA = ventanaDeComida(horarioDePersona('contractor', { horaEntrada: '08:00', horaSalida: '17:00', dias: [1, 2, 3, 4, 5] }));

describe('ventana de comida según el horario', () => {
  it('oficina: fija de 3 a 4 p.m., regreso a más tardar 4:05', () => {
    expect(OFICINA).toEqual({ tipo: 'fija', desde: '15:00', hasta: '16:00', minutos: 60, texto: '3:00 a 4:00 p.m.' });
    expect(salidaATiempo(OFICINA, m('14:59'))).toBe(false);
    expect(salidaATiempo(OFICINA, m('15:00'))).toBe(true);
    expect(salidaATiempo(OFICINA, m('16:00'))).toBe(true);
    expect(salidaATiempo(OFICINA, m('16:01'))).toBe(false);
    expect(regresoLimite(OFICINA, m('15:20'))).toBe(m('16:05'));
    expect(minutoDelAvisoDeComida(OFICINA)).toBe(m('14:50'));
    // Sin horario (dirección) o sin datos: la de oficina.
    expect(ventanaDeComida(null).tipo).toBe('fija');
  });

  it('cuadrilla (08:00 a 17:00): una hora libre entre 1 y 5 p.m.', () => {
    expect(CUADRILLA).toEqual({ tipo: 'libre', desde: '13:00', hasta: '17:00', minutos: 60, texto: 'una hora entre 1:00 y 5:00 p.m.' });
    expect(salidaATiempo(CUADRILLA, m('12:59'))).toBe(false);
    expect(salidaATiempo(CUADRILLA, m('13:00'))).toBe(true);
    expect(salidaATiempo(CUADRILLA, m('16:00'))).toBe(true);
    // Después de las 4 ya no cabe la hora completa antes de las 5.
    expect(salidaATiempo(CUADRILLA, m('16:01'))).toBe(false);
    expect(ultimaSalida(CUADRILLA)).toBe(m('16:00'));
    // Regresa una hora después de salir, con 5 min de tolerancia; nunca después de las 5:05.
    expect(regresoLimite(CUADRILLA, m('13:10'))).toBe(m('14:15'));
    expect(regresoLimite(CUADRILLA, m('16:30'))).toBe(m('17:05'));
    expect(minutoDelAvisoDeComida(CUADRILLA)).toBe(m('12:50'));
  });

  it('el aviso «por salir» sale una vez, de 10 min antes a que abra su ventana', () => {
    const base = { ventana: OFICINA, salida: null, regreso: null, yaAvisadoSalida: false, yaAvisadoRegreso: false };
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:49') })).toBeNull();
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:50') })).toBe('por-salir');
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:59') })).toBe('por-salir');
    expect(avisoDeComidaQueToca({ ...base, minuto: m('15:00') })).toBeNull();
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:55'), yaAvisadoSalida: true })).toBeNull();
    expect(avisoDeComidaQueToca({ ...base, ventana: CUADRILLA, minuto: m('12:50') })).toBe('por-salir');
  });

  it('el aviso «regresa» sale al pasar su hora de regreso, si no ha vuelto', () => {
    const base = { ventana: CUADRILLA, salida: m('13:10'), regreso: null, yaAvisadoSalida: true, yaAvisadoRegreso: false };
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:14') })).toBeNull();
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:15') })).toBe('regresa');
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:20'), regreso: m('14:10') })).toBeNull();
    expect(avisoDeComidaQueToca({ ...base, minuto: m('14:20'), yaAvisadoRegreso: true })).toBeNull();
    expect(avisoDeComidaQueToca({ ...base, ventana: OFICINA, salida: m('15:10'), minuto: m('16:05') })).toBe('regresa');
  });

  it('textos', () => {
    expect(textoAvisoDeComida('por-salir', OFICINA)).toEqual({
      title: 'Tu hora de comida empieza en 10 minutos',
      message: 'Registra tu salida a comer con foto desde la app',
    });
    expect(textoAvisoDeComida('por-salir', CUADRILLA).message).toBe(
      'Registra tu salida a comer con foto desde la app. Tienes una hora entre 1:00 y 5:00 p.m.',
    );
    expect(textoAvisoDeComida('regresa', CUADRILLA).title).toBe('Tu hora de comida terminó');
  });
});
