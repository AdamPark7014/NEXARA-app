import { armarEstadoJornada } from './estado-jornada.js';
import { MENSAJE_JORNADA_NO_ABIERTA } from './candado-jornada.js';

const tecnico = { id: 7, email: 'tecnico@ejemplo.test', roleKey: 'tecnico' };
const sinWeb = { abierta: false, hasta: null as string | null };

describe('estado-jornada: barrera proactiva del candado', () => {
  it('pide barrera si debe checar y no tiene jornada abierta', () => {
    const e = armarEstadoJornada({ usuario: tecnico, jornadaAbierta: false, webCheckin: sinWeb, env: {} });
    expect(e.debeChecar).toBe(true);
    expect(e.pideBarrera).toBe(true);
    expect(e.mensaje).toBe(MENSAJE_JORNADA_NO_ABIERTA);
  });

  it('no pide barrera con jornada abierta', () => {
    const e = armarEstadoJornada({ usuario: tecnico, jornadaAbierta: true, webCheckin: sinWeb, env: {} });
    expect(e.debeChecar).toBe(true);
    expect(e.pideBarrera).toBe(false);
    expect(e.mensaje).toBeNull();
  });

  it('dirección y RH no checan', () => {
    const dir = armarEstadoJornada({
      usuario: { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' },
      jornadaAbierta: false,
      webCheckin: sinWeb,
      env: {},
    });
    const rh = armarEstadoJornada({
      usuario: { id: 2, email: 'rh@ejemplo.test', roleKey: 'rh' },
      jornadaAbierta: false,
      webCheckin: sinWeb,
      env: {},
    });
    expect(dir.debeChecar).toBe(false);
    expect(dir.pideBarrera).toBe(false);
    expect(rh.debeChecar).toBe(false);
  });

  it('se apaga con JORNADA_OBLIGATORIA=0 o exento temporal', () => {
    expect(
      armarEstadoJornada({
        usuario: tecnico,
        jornadaAbierta: false,
        webCheckin: sinWeb,
        env: { JORNADA_OBLIGATORIA: '0' },
      }).debeChecar,
    ).toBe(false);
    expect(
      armarEstadoJornada({
        usuario: tecnico,
        jornadaAbierta: false,
        webCheckin: sinWeb,
        env: { JORNADA_EXENTOS: '7,9' },
      }).debeChecar,
    ).toBe(false);
  });

  it('expone la ventana de checada web en ISO', () => {
    const hasta = new Date('2026-12-01T18:00:00.000Z');
    const e = armarEstadoJornada({
      usuario: tecnico,
      jornadaAbierta: false,
      webCheckin: { abierta: true, hasta },
      env: {},
    });
    expect(e.webCheckinAbierta).toBe(true);
    expect(e.webCheckinHasta).toBe(hasta.toISOString());
    expect(e.pideBarrera).toBe(true);
  });
});
