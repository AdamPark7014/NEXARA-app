import { camposDeElementos } from './elementos.js';

describe('camposDeElementos', () => {
  it('expande 4 cámaras del plan IA con 3 momentos en proyecto', () => {
    const c = camposDeElementos({ titulo: 'x', elementos: [{ nombre: 'Cámara', cantidad: 4 }] }, 'proyecto', null);
    expect(c).toHaveLength(4);
    expect(c[0]).toEqual({ nombre: 'Cámara 1', momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'] });
    expect(c[3].nombre).toBe('Cámara 4');
  });

  it('respaldo por título sin elem', () => {
    const c = camposDeElementos({ titulo: 'Instalar 4 cámaras en IPADE' }, 'proyecto', null);
    expect(c.map((x) => x.nombre)).toEqual(['Cámara 1', 'Cámara 2', 'Cámara 3', 'Cámara 4']);
  });

  it('tope 40: 45 cámaras un solo campo', () => {
    const c = camposDeElementos({ elementos: [{ nombre: 'Cámara', cantidad: 45 }] }, 'obra', null);
    expect(c).toEqual([{ nombre: 'Cámaras (45)', momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'] }]);
  });

  it('mantenimiento preventivo: ANTES y DESPUES', () => {
    const c = camposDeElementos({ elementos: [{ nombre: 'NVR', cantidad: 1 }] }, 'tarea', 'Mantenimiento preventivo');
    expect(c).toEqual([{ nombre: 'NVR', momentos: ['ANTES', 'DESPUES'] }]);
  });

  it('junta sin campos', () => {
    expect(camposDeElementos({ titulo: 'Junta con cliente', elementos: [{ nombre: 'Cámara', cantidad: 2 }] }, 'tarea', 'Junta')).toEqual([]);
  });
});
describe('elementosDelTexto', () => {
  it('lee varios equipos, en número o palabra, y suma repetidos', () => {
    expect(camposDeElementos({ titulo: 'Instalar dos lectoras y un torniquete' }, 'proyecto', null).map((c) => c.nombre)).toEqual([
      'Lector 1',
      'Lector 2',
      'Torniquete',
    ]);
  });
  it('servicio correctivo: antes y después', () => {
    expect(camposDeElementos({ titulo: 'Revisar 1 NVR' }, 'servicio', 'CORRECTIVO')).toEqual([{ nombre: 'NVR', momentos: ['ANTES', 'DESPUES'] }]);
  });
});
